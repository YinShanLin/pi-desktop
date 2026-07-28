# Pi Desktop

A native macOS client for the [pi coding agent](https://pi.dev). Built with
Tauri 2 + React + TypeScript. Runs pi in a child process and brokers
JSON-RPC traffic over its `pi --mode rpc` stdio interface.

> **Status:** MVP / proof-of-concept. Stream chat, tool call cards, and
> permission dialogs work. Persistence, settings UI, and file explorer
> are next.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Renderer (React, WebKit WebView)                             │
│   Chat UI, tool cards, extension UI dialogs                  │
└──────────────────────────┬───────────────────────────────────┘
                           │ Tauri IPC (invoke / emit)
┌──────────────────────────┴───────────────────────────────────┐
│ Main process (Rust)                                          │
│   PiBackend: owns `pi --mode rpc` child, parses JSONL,       │
│              forwards events to renderer via emit("pi:event")│
└──────────────────────────┬───────────────────────────────────┘
                           │ stdio JSONL
┌──────────────────────────┴───────────────────────────────────┐
│ `pi --mode rpc` (Node.js child process)                      │
└──────────────────────────────────────────────────────────────┘
```

The `pi.ts` renderer-side facade is the seam where we will later swap
RPC for the in-process Node SDK if we need features that RPC cannot
express (dynamic tool registration, runtime message mutation, sub-agents).

## Requirements

- macOS 12+
- Node.js 20+ and pnpm
- Rust toolchain (stable)
- `pi` CLI on `PATH`. Install with one of:
  ```bash
  npm i -g --ignore-scripts @earendil-works/pi-coding-agent
  # or
  curl -fsSL https://pi.dev/install.sh | sh
  ```
- A provider credential in your shell environment, e.g.
  `export ANTHROPIC_API_KEY=sk-ant-...`

## Development

```bash
pnpm install
pnpm tauri dev      # launches the Mac app in debug mode
```

`pnpm tauri dev` runs Vite on `localhost:1420` and opens a WebView
window that loads it. The Rust process spawns `pi --mode rpc` as a
child when you click **Start pi** in the UI.

## Production build

```bash
pnpm tauri build    # produces .app and .dmg in src-tauri/target/release/bundle/
```

## Features (current)

- [x] Spawn and stop `pi --mode rpc` from the UI
- [x] Stream assistant text and thinking deltas
- [x] Tool call cards (read, edit, bash, write, etc.) with args and results
- [x] Abort running operations
- [x] Extension UI dialogs (select / confirm / input / editor)
- [x] Notifications (`notify`), status, title, editor prefills
- [x] macOS-styled dark theme

## Roadmap

- [ ] Pick working directory via native folder picker
- [ ] Session sidebar (new / switch / fork / clone)
- [ ] Model + thinking level selector
- [ ] xterm.js terminal panel
- [ ] Monaco-based file viewer with diff for `edit` calls
- [ ] Settings (provider credentials via macOS Keychain)
- [ ] Global hotkey (Raycast-style)
- [ ] Menu bar widget
- [ ] Auto-update via `tauri-plugin-updater`

## Project layout

```
pi-desktop/
├── src/                   # React renderer
│   ├── App.tsx            # Main UI, event handler, state
│   ├── pi.ts              # Tauri IPC facade
│   ├── types.ts           # Shared message / event types
│   ├── main.tsx           # React entry
│   └── styles.css         # macOS dark theme
├── src-tauri/             # Rust main process
│   ├── src/
│   │   ├── main.rs        # entry (delegates to lib::run)
│   │   └── lib.rs         # PiBackend + Tauri commands
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/
│       └── default.json   # permission set
├── index.html
├── package.json
├── pnpm-workspace.yaml    # pnpm 11+ allowBuilds
├── vite.config.ts
└── tsconfig.json
```

## License

MIT
