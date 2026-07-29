# Pi Desktop

A native macOS client for the [pi coding agent](https://pi.dev). Built with
Tauri 2 + React 19 + TypeScript. Runs `pi` in a child process and brokers
JSON-RPC traffic over its `pi --mode rpc` stdio interface.

The UI is a minimal, WorkBuddy-inspired product shell: a single window with
a collapsible left panel for sessions, a focused conversation area, a
context rail on the right, and a ⌘K command palette for everything else.

```
┌─────────────────────────────────────────────────────────────────────┐
│ ●●● ⎋  π●   Session · refactor-imports ⌄        +   ⌘K   ⚙         │
├──────────┬──────────────────────────────────────────┬───────────────┤
│ sessions │  user:  refactor src/imports.ts          │  current file │
│  • refa… │  assistant:  …                          │  changes      │
│  • feat… │                                          │  tokens       │
│          │  ⌘───────────────────────────────────    │  tools        │
│          │  📁 pi-desktop  minimax/M3 · medium ⌄   │               │
│          │  Ask anything…                            │               │
└──────────┴──────────────────────────────────────────┴───────────────┘
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Renderer (React 19, WebKit WebView)                          │
│   Chat UI · tool cards · session list · ⌘K palette · rail    │
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

## Performance posture

- **rAF batched streaming.** `text_delta` and `thinking_delta` events are
  coalesced into a single `setState` per animation frame, so a fast model
  does not flood React with renders. Streamed text append is O(1) per
  token; the `MessageRow` is `React.memo` so off-screen rows never
  re-render.
- **Hot path is clean.** The Rust stdout reader uses a 64 KB buffered
  `read_line` (no `chars().count()` scans, no per-line `eprintln!` in
  release) and emits a single IPC event per JSONL line.
- **Compositor friendly.** The five always-on chrome surfaces (titlebar,
  sidebar, rail, status bar, composer) use solid colors only. Backdrop
  blur is reserved for transient overlays (modals, dropdowns) where it
  is paid for exactly once.
- **Lean bundle.** `@monaco-editor/react`, `@xterm/xterm`, and `fuse.js`
  were dropped — none were wired in. Vite splits `vendor-react` and
  targets `esnext`; dead code is gone.

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

## Features

### Agent

- [x] Spawn and stop `pi --mode rpc` from the UI
- [x] Stream assistant text and thinking deltas (rAF batched)
- [x] Tool call cards (read, edit, bash, write, etc.) with args and results
- [x] Abort running operations
- [x] Extension UI dialogs (select / confirm / input / editor)
- [x] Notifications (`notify`), status, title, editor prefills
- [x] Working directory picker (native folder dialog)

### Sessions

- [x] Session sidebar (new, switch, archive, delete)
- [x] Session search and quick switch
- [x] Per-session message persistence (localStorage)
- [x] Per-session token estimate
- [x] Model selector with provider list
- [x] Thinking level selector
- [x] ⌘K command palette (commands + sessions, fuzzy)

### Shell

- [x] Collapsible left panel (hover-expand, ⌘\\ to lock)
- [x] Context rail on the right (files, changes, tools, tokens)
- [x] Status bar (only visible on error / progress)
- [x] Dark + light theme
- [x] ⌘N new chat · ⌘. abort · ⌘, settings · ⌘[ / ⌘] cycle sessions
- [x] macOS window chrome with bright traffic lights
- [x] π brand icon set (.icns, .ico, 17 PNGs)

## Roadmap

- [ ] xterm.js terminal panel
- [ ] Monaco-based file viewer with diff for `edit` calls
- [ ] Settings (provider credentials via macOS Keychain)
- [ ] Global hotkey (Raycast-style)
- [ ] Menu bar widget
- [ ] Auto-update via `tauri-plugin-updater`
- [ ] Files & Models categories in ⌘K

## Project layout

```
pi-desktop/
├── src/                       # React renderer
│   ├── App.tsx                # Main UI, event handler, state
│   ├── main.tsx               # React entry
│   ├── pi.ts                  # Tauri IPC facade
│   ├── types.ts               # Shared message / event types
│   ├── styles.css             # Design tokens + all CSS
│   ├── components/            # Titlebar, Sidebar, Composer, …
│   ├── hooks/                 # useResizable, useShortcuts, useTheme
│   ├── lib/shortcuts.ts       # Centralized shortcut table
│   └── data/                  # Message / session / change stores
├── src-tauri/                 # Rust main process
│   ├── src/
│   │   ├── main.rs            # entry (delegates to lib::run)
│   │   └── lib.rs             # PiBackend + Tauri commands
│   ├── icons/                 # π brand icon set
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/
│       └── default.json       # permission set
├── scripts/
│   └── generate-icon.py       # Regenerate the π icon set
├── docs/                      # Design proposals / mockups
├── index.html
├── package.json
├── pnpm-workspace.yaml
├── vite.config.ts
└── tsconfig.json
```

## Regenerating the app icon

```bash
python3 scripts/generate-icon.py
```

Renders a 22% rounded square with a blue→indigo gradient, a top sheen,
and a white italic **π**. Writes `icon.png` (1024×1024 master) plus
`.icns`, `.ico`, and all `Square*NxN*Logo.png` / `StoreLogo.png`
variants Tauri needs for bundle builds. Tweak `BG_TOP`, `BG_BOTTOM`,
and `font_size` in the script to restyle.

## License

MIT
