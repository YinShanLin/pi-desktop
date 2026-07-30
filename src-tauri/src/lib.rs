// PiDesktop - Native Mac client for the pi coding agent.
//
// Architecture:
//   Renderer (React) <--IPC--> Rust (Tauri commands + PiBackend) <--stdio JSONL--> `pi --mode rpc`
//
// The PiBackend owns a single long-lived `pi --mode rpc` child process and
// brokers JSONL traffic in both directions. Outbound commands are sent on
// stdin; inbound events are parsed line-by-line and emitted to the renderer
// via `app.emit("pi:event", ...)` so the UI can render streaming text, tool
// calls, and lifecycle changes in real time.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

/// Holds the running `pi --mode rpc` child process and its stdin handle.
pub struct PiBackend {
    inner: Mutex<PiBackendInner>,
}

struct PiBackendInner {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    cwd: Option<String>,
    session_id: Option<String>,
}

impl PiBackend {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(PiBackendInner {
                child: None,
                stdin: None,
                cwd: None,
                session_id: None,
            }),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageContent {
    #[serde(rename = "type")]
    pub kind: String, // "image"
    pub data: String, // base64
    #[serde(rename = "mimeType")]
    pub mime_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PromptArgs {
    pub message: String,
    #[serde(default)]
    pub images: Vec<ImageContent>,
    #[serde(rename = "streamingBehavior", skip_serializing_if = "Option::is_none")]
    pub streaming_behavior: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct BackendStatus {
    pub running: bool,
    pub cwd: Option<String>,
    pub pid: Option<u32>,
}

// ---------- Tauri commands ----------

#[tauri::command]
fn get_status(backend: State<'_, PiBackend>) -> BackendStatus {
    let guard = backend.inner.lock().unwrap();
    BackendStatus {
        running: guard.child.is_some(),
        cwd: guard.cwd.clone(),
        pid: guard.child.as_ref().map(|c| c.id()),
    }
}

#[tauri::command]
fn start_pi(
    backend: State<'_, PiBackend>,
    app: AppHandle,
    cwd: String,
    session_id: Option<String>,
) -> Result<BackendStatus, String> {
    eprintln!("[pi-desktop] start_pi called: cwd={} session_id={:?}", cwd, session_id);
    let mut guard = backend.inner.lock().map_err(|e| e.to_string())?;

    // If already running, stop it first (idempotent restart on cwd change).
    if let Some(mut child) = guard.child.take() {
        eprintln!("[pi-desktop] killing previous pi (pid was {})", child.id());
        let _ = child.kill();
        let _ = child.wait();
        guard.stdin = None;
    }

    // Verify `pi` is on PATH before spawning (better error than ENOENT).
    let pi_path = which_pi().ok_or_else(|| {
        "Could not find `pi` on PATH. Install it with `npm i -g --ignore-scripts @earendil-works/pi-coding-agent` or `curl -fsSL https://pi.dev/install.sh | sh`.".to_string()
    })?;
    eprintln!("[pi-desktop] using pi at: {}", pi_path);

    let mut command = Command::new(&pi_path);
    command
        .arg("--mode")
        .arg("rpc")
        .current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // If we know a session ID, resume it; otherwise start fresh.
    match &session_id {
        Some(sid) => {
            command.arg("--session-id").arg(sid);
            eprintln!("[pi-desktop] resuming session: {}", sid);
        }
        None => {
            command.arg("--no-session");
            eprintln!("[pi-desktop] starting with --no-session");
        }
    }

    // Inherit minimal env so pi can read ANTHROPIC_API_KEY etc.
    command.env_remove("RUST_LOG");
    command.env_remove("RUST_BACKTRACE");

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn `pi`: {}", e))?;

    let pid = child.id();
    eprintln!("[pi-desktop] pi spawned ok, pid={}", pid);
    let stdin = child.stdin.take().ok_or("Failed to capture pi stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to capture pi stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture pi stderr")?;

    // stderr -> log only (diagnostic, debug builds only).
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            if cfg!(debug_assertions) {
                eprintln!("[pi stderr] {}", line);
            }
        }
    });

    // stdout -> parse JSONL, emit "pi:event" for each line.
    // Hot path: during streaming this loop runs per token, so it stays
    // allocation- and log-free in release builds.
    let app_for_reader = app.clone();
    thread::spawn(move || {
        let mut reader = BufReader::with_capacity(64 * 1024, stdout);
        if cfg!(debug_assertions) {
            eprintln!("[pi-desktop] stdout reader thread started");
        }
        let mut count: u64 = 0;
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => break, // EOF: child closed stdout
                Ok(_) => {}
                Err(_) => break,
            }
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            count += 1;
            match serde_json::from_str::<serde_json::Value>(trimmed) {
                Ok(value) => {
                    if cfg!(debug_assertions) {
                        let preview: String = trimmed.chars().take(200).collect::<String>()
                            + if trimmed.len() > 200 { "…" } else { "" };
                        eprintln!("[pi:line {}] {}", count, preview);
                    }
                    if let Err(e) = app_for_reader.emit("pi:event", value) {
                        eprintln!("[pi emit error] {}", e);
                    }
                }
                Err(err) => {
                    let preview: String = trimmed.chars().take(200).collect::<String>()
                        + if trimmed.len() > 200 { "…" } else { "" };
                    eprintln!("[pi json parse error] {} :: {}", err, preview);
                }
            }
        }
        if cfg!(debug_assertions) {
            eprintln!(
                "[pi-desktop] stdout reader thread exiting after {} lines (stream closed)",
                count
            );
        }
        // Stream closed -> tell UI the agent has exited.
        let _ = app_for_reader.emit("pi:event", serde_json::json!({
            "type": "pi_exit",
        }));
    });

    guard.child = Some(child);
    guard.stdin = Some(stdin);
    guard.cwd = Some(cwd);
    guard.session_id = session_id;

    Ok(BackendStatus {
        running: true,
        cwd: guard.cwd.clone(),
        pid: Some(pid),
    })
}

#[tauri::command]
fn stop_pi(backend: State<'_, PiBackend>) -> Result<(), String> {
    let mut guard = backend.inner.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    guard.stdin = None;
    Ok(())
}

#[tauri::command]
fn send_prompt(backend: State<'_, PiBackend>, args: PromptArgs) -> Result<(), String> {
    eprintln!(
        "[pi-desktop] send_prompt called: message.len={} images={}",
        args.message.len(),
        args.images.len()
    );
    send_rpc_command(backend, serde_json::json!({
        "type": "prompt",
        "message": args.message,
        "images": args.images,
        "streamingBehavior": args.streaming_behavior,
    }))
}

#[tauri::command]
fn send_steer(backend: State<'_, PiBackend>, message: String) -> Result<(), String> {
    send_rpc_command(backend, serde_json::json!({
        "type": "steer",
        "message": message,
    }))
}

#[tauri::command]
fn send_follow_up(backend: State<'_, PiBackend>, message: String) -> Result<(), String> {
    send_rpc_command(backend, serde_json::json!({
        "type": "follow_up",
        "message": message,
    }))
}

#[tauri::command]
fn send_abort(backend: State<'_, PiBackend>) -> Result<(), String> {
    send_rpc_command(backend, serde_json::json!({ "type": "abort" }))
}

#[tauri::command]
fn set_model(
    backend: State<'_, PiBackend>,
    provider: String,
    model_id: String,
) -> Result<(), String> {
    send_rpc_command(
        backend,
        serde_json::json!({
            "type": "set_model",
            "provider": provider,
            "modelId": model_id,
        }),
    )
}

#[tauri::command]
fn get_state(backend: State<'_, PiBackend>) -> Result<(), String> {
    send_rpc_command(
        backend,
        serde_json::json!({ "type": "get_state" }),
    )
}

#[tauri::command]
fn get_available_models(backend: State<'_, PiBackend>) -> Result<(), String> {
    send_rpc_command(
        backend,
        serde_json::json!({ "type": "get_available_models" }),
    )
}

#[tauri::command]
fn new_session(backend: State<'_, PiBackend>) -> Result<(), String> {
    send_rpc_command(backend, serde_json::json!({ "type": "new_session" }))
}

#[tauri::command]
fn switch_session(backend: State<'_, PiBackend>, session_id: String) -> Result<(), String> {
    send_rpc_command(
        backend,
        serde_json::json!({
            "type": "switch_session",
            "sessionId": session_id,
        }),
    )
}

#[tauri::command]
fn get_session_messages(backend: State<'_, PiBackend>) -> Result<(), String> {
    send_rpc_command(
        backend,
        serde_json::json!({ "type": "get_session_messages" }),
    )
}

#[tauri::command]
fn get_session_id(backend: State<'_, PiBackend>) -> Result<Option<String>, String> {
    let guard = backend.inner.lock().map_err(|e| e.to_string())?;
    Ok(guard.session_id.clone())
}

#[tauri::command]
fn set_thinking_level(backend: State<'_, PiBackend>, level: String) -> Result<(), String> {
    send_rpc_command(
        backend,
        serde_json::json!({
            "type": "set_thinking_level",
            "level": level,
        }),
    )
}

#[tauri::command]
fn respond_extension_ui(
    backend: State<'_, PiBackend>,
    id: String,
    response: serde_json::Value,
) -> Result<(), String> {
    let mut payload = response;
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("type".into(), serde_json::Value::String("extension_ui_response".into()));
        obj.insert("id".into(), serde_json::Value::String(id));
    } else {
        payload = serde_json::json!({
            "type": "extension_ui_response",
            "id": id,
            "value": payload,
        });
    }
    send_rpc_command(backend, payload)
}

fn send_rpc_command(backend: State<'_, PiBackend>, command: serde_json::Value) -> Result<(), String> {
    let mut guard = backend.inner.lock().map_err(|e| e.to_string())?;
    let stdin = guard
        .stdin
        .as_mut()
        .ok_or_else(|| "pi is not running. Call start_pi first.".to_string())?;
    let serialized = serde_json::to_string(&command).map_err(|e| e.to_string())?;
    stdin
        .write_all(serialized.as_bytes())
        .map_err(|e| format!("Failed to write to pi stdin: {}", e))?;
    stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Locate the `pi` binary. Tries `which` first, then a few well-known locations.
fn which_pi() -> Option<String> {
    // 1. `which pi` via the shell.
    if let Ok(out) = Command::new("/bin/sh").arg("-c").arg("command -v pi").output() {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                return Some(s);
            }
        }
    }
    // 2. Common global install locations on macOS.
    let candidates = [
        "/opt/homebrew/bin/pi",
        "/usr/local/bin/pi",
        "/usr/bin/pi",
        &format!(
            "{}/.npm-global/bin/pi",
            std::env::var("HOME").unwrap_or_default()
        ),
        &format!(
            "{}/.volta/bin/pi",
            std::env::var("HOME").unwrap_or_default()
        ),
    ];
    for path in candidates.iter() {
        if std::path::Path::new(path).exists() {
            return Some((*path).to_string());
        }
    }
    None
}

// ---------- Session migration (Phase 3) ----------

#[derive(Debug, Deserialize)]
struct MigrateMessage {
    role: String,
    content: String,
}

/// Write (or overwrite) a Pi session JSONL file with header + messages.
/// Finds the file by scanning `~/.pi/agent/sessions/` for `<session_id>.jsonl`.
/// If not found, creates one under `~/.pi/agent/sessions/<hex-cwd>/`.
#[tauri::command]
fn migrate_session_messages(
    session_id: String,
    cwd: String,
    messages: Vec<MigrateMessage>,
) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let base = std::path::Path::new(&home).join(".pi/agent/sessions");

    // Try to find existing session file (avoids guessing the cwd encoding)
    let session_file = find_session_file(&base, &session_id).unwrap_or_else(|| {
        // Fallback: create directory using hex-encoded cwd
        let encoded = hex_encode(cwd.as_bytes());
        let dir = base.join(&encoded);
        let _ = std::fs::create_dir_all(&dir);
        dir.join(format!("{}.jsonl", session_id))
    });

    let mut file = std::fs::File::create(&session_file)
        .map_err(|e| format!("Failed to create session file: {}", e))?;

    // Session header (first line of every Pi .jsonl)
    let header = serde_json::json!({
        "type": "session",
        "version": 3,
        "id": session_id,
        "timestamp": iso_timestamp(),
        "cwd": cwd,
    });
    writeln!(file, "{}", serde_json::to_string(&header).unwrap())
        .map_err(|e| e.to_string())?;

    // Message entries — chain via parentId
    let mut parent_id: Option<String> = None;
    for msg in &messages {
        let mid = generate_id();
        let entry = serde_json::json!({
            "type": "message",
            "id": mid,
            "parentId": parent_id,
            "timestamp": iso_timestamp(),
            "message": {
                "role": msg.role,
                "content": msg.content,
            },
        });
        writeln!(file, "{}", serde_json::to_string(&entry).unwrap())
            .map_err(|e| e.to_string())?;
        parent_id = Some(mid);
    }

    eprintln!(
        "[pi-desktop] migrated {} messages to session {} at {:?}",
        messages.len(),
        session_id,
        session_file
    );
    Ok(())
}

fn find_session_file(base: &std::path::Path, session_id: &str) -> Option<std::path::PathBuf> {
    let target = format!("{}.jsonl", session_id);
    walk_for_file(base, &target)
}

fn walk_for_file(dir: &std::path::Path, target: &str) -> Option<std::path::PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries {
        let entry = entry.ok()?;
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = walk_for_file(&path, target) {
                return Some(found);
            }
        } else if path.is_file() {
            if path.file_name().map(|n| n.to_string_lossy()) == Some(target.into()) {
                return Some(path);
            }
        }
    }
    None
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn generate_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let h = format!("{:032x}", nanos);
    format!("{}-{}-{}-{}-{}", &h[0..8], &h[8..12], &h[12..16], &h[16..20], &h[20..32])
}

fn iso_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let total_secs = d.as_secs();

    // days since 1970-01-01
    let days = total_secs / 86400;
    let time_secs = total_secs % 86400;
    let hours = time_secs / 3600;
    let minutes = (time_secs % 3600) / 60;
    let seconds = time_secs % 60;

    // Gregorian calendar: year/month/day from days since epoch
    let mut y = 1970i64;
    let mut rem = days as i64;
    loop {
        let diy = if is_leap(y) { 366 } else { 365 };
        if rem < diy { break; }
        rem -= diy;
        y += 1;
    }
    let month_days = [31, if is_leap(y) { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 0usize;
    for (i, &md) in month_days.iter().enumerate() {
        if rem < md { m = i + 1; break; }
        rem -= md;
    }
    if m == 0 { m = 12; rem = 30; }
    let day = rem + 1;

    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, m, day, hours, minutes, seconds)
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

#[tauri::command]
fn frontend_log(level: String, message: String) {
    eprintln!("[frontend:{}] {}", level, message);
}

#[tauri::command]
fn show_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        Ok(())
    } else {
        Err("main window not found".into())
    }
}

// ---------- Tauri entry point ----------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(PiBackend::new())
        .invoke_handler(tauri::generate_handler![
            get_status,
            start_pi,
            stop_pi,
            send_prompt,
            send_steer,
            send_follow_up,
            send_abort,
            set_model,
            set_thinking_level,
            get_state,
            get_available_models,
            new_session,
            switch_session,
            get_session_messages,
            get_session_id,
            respond_extension_ui,
            migrate_session_messages,
            frontend_log,
            show_main_window,
        ])
        .setup(|app| {
            // Best-effort: log HOME for debugging.
            if let Ok(home) = std::env::var("HOME") {
                eprintln!("[pi-desktop] HOME = {}", home);
            }
            eprintln!("[pi-desktop] VOLC_ARK_API_KEY present: {}", std::env::var("VOLC_ARK_API_KEY").is_ok());
            eprintln!("[pi-desktop] PI_PROVIDER = {:?}", std::env::var("PI_PROVIDER").ok());
            eprintln!("[pi-desktop] tauri setup complete, ensuring main window is shown");
            // Ensure main window is shown and sized correctly.
            if let Some(window) = app.get_webview_window("main") {
                // Force window to predefined size to avoid config drift
                use tauri::Size;
                use tauri::LogicalSize;
                let _ = window.set_size(Size::Logical(LogicalSize {
                    width: 1100.0,
                    height: 750.0,
                }));
                let _ = window.set_min_size(Some(Size::Logical(LogicalSize {
                    width: 520.0,
                    height: 400.0,
                })));
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Diagnostic + UX: when user clicks X, hide the window instead of
            // exiting. This is the conventional Mac behaviour and prevents
            // accidental teardown of the pi child process. The user can
            // bring the window back via the Dock icon.
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    eprintln!(
                        "[pi-desktop] window CloseRequested for {:?} -> hiding (prevent close)",
                        window.label()
                    );
                    api.prevent_close();
                    if let Err(e) = window.hide() {
                        eprintln!("[pi-desktop] hide failed: {}", e);
                    }
                }
                tauri::WindowEvent::Destroyed => {
                    eprintln!("[pi-desktop] window Destroyed for {:?}", window.label());
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building pi-desktop")
        .run(|app_handle, event| {
            // macOS: when the user clicks the Dock icon, unhide the main window.
            if let tauri::RunEvent::Reopen { has_visible_windows, .. } = event {
                eprintln!("[pi-desktop] RunEvent::Reopen has_visible_windows={}", has_visible_windows);
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
}
