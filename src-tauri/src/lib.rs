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
}

impl PiBackend {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(PiBackendInner {
                child: None,
                stdin: None,
                cwd: None,
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
) -> Result<BackendStatus, String> {
    eprintln!("[pi-desktop] start_pi called: cwd={}", cwd);
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
        .arg("--no-session")
        .current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

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
                    // Protocol drift is always worth logging, but keep the
                    // preview cheap: no O(n) char count on the full line.
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
            respond_extension_ui,
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
            // Ensure main window is shown.
            if let Some(window) = app.get_webview_window("main") {
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
