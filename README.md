# Pi Desktop

A native macOS desktop client for the [pi coding agent](https://pi.dev). Built
with Tauri 2 + React 19 + TypeScript. Runs `pi` in a child process and brokers
JSON-RPC traffic over its `pi --mode rpc` stdio interface.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ●●●   π · ~/my-project                             ＋      ⚙        │
├──────────┬───────────────────────────────────────────┬──────────────┤
│ sessions │  user:  refactor src/imports.ts           │  Files        │
│  Today   │  assistant:  …                            │  src/         │
│  • refa… │                                           │  ├── main.ts  │
│  • feat… │  ────────────────────────────              │  ├── utils/   │
│  • add…  │  minimax/M3 · medium ⌄                    │  └── types…  │
│          │  Ask anything…                             │              │
├──────────┴───────────────────────────────────────────┴──────────────┤
│ ● ready  ~/my-project  minimax/M3  medium  1.2k tokens  12 msgs    │
└──────────────────────────────────────────────────────────────────────┘
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Renderer (React 19, WebKit WebView)                          │
│   Chat UI · tool cards · session list · file tree · rail     │
│   Settings · theme toggle · persistent sessions & messages    │
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

## Design

The app follows **Style F** (WorkBuddy-inspired) — see the full interactive
design spec at [`docs/style-f-workbuddy.html`](docs/style-f-workbuddy.html).

### Key design decisions

| Principle | Detail |
|-----------|--------|
| **Palette** | Dark base `#1a1a1f` (blue-tinted grey, not pure black). Sidebar `#232329` (~1.7% lighter than base) for one-stop depth. |
| **Typography** | 14.5px UI / 12.5px mono caption, system fonts (SF Pro). |
| **Radius** | 10px max (composer container), 4-6px elsewhere. |
| **Active state** | Accent-soft tint + accent text — never grey. One glance tells you where you are. |
| **Send button** | Solid accent background + white text + embedded ⏎ arrow chip. |
| **Composer** | Caption pills (999px radius) for cwd and model — visually consistent with session pill. |
| **Right rail** | Hidden by default; ⌘. reveals it. Context / Files / Changes tabs with real content (current file, token progress, recent edits, tool call history). |
| **Animations** | All under 200ms ease-out; rail slides in from right; pulse breathing on active session. |

Open `docs/style-f-workbuddy.html` in a browser to see three layout states
(sidebar collapsed, sidebar expanded, right rail open) with full CSS and
annotations.

## Features

### Agent
- Auto-start `pi` on app launch — no manual Start button
- Stream assistant text and thinking deltas (rAF batched)
- Tool call cards (read, edit, bash, write, etc.) with args and results
- Abort running operations
- Extension UI dialogs (select / confirm / input / editor)
- Notifications (`notify`), status, title, editor prefills
- Working directory picker (native macOS folder dialog)
- Model selector dropdown + Thinking level chips

### Sessions & Workspace
- Session sidebar: New chat, search, Quick Actions, collapsible groups
- Per-session message persistence (localStorage), auto-save on stream end
- Per-session token estimate
- Folder switching bound to sessions — switch directory switches chat
- Session rows with unread dot, relative time, message count, diff stats
- Right-click context menu (Archive / Delete / Copy title)
- Command palette placeholder (⌘K, coming in Phase 2)

### File Tree
- Real filesystem browsing via `tauri-plugin-fs` `readDir`
- Integrated in sidebar (Sessions/Files view toggle) — ZCode-inspired
- Expandable/collapsible directories with tree indicators

### UI & Shell
- Apple Design aesthetic: rounded window (12px), traffic lights, frosted glass
- Three-pane layout: sidebar · main · right rail (resizable)
- Right rail: Files / Terminal / Changes tabs (mock, real integration pending)
- Status bar: connection status, cwd, model, thinking level, tokens, messages
- Dark + Light theme via Settings dialog (localStorage persisted)
- macOS native transparent window with drag via `startDragging()`
- Spring animations, reduced-motion & reduced-transparency a11y
- Keyboard shortcuts: ⌘N new chat · ⌘B Files · ⌘J Terminal · ⌘. toggle rail
  · ⌘[ / ⌘] cycle sessions · ⌘, Settings · ⌘K palette
- π brand icon set (.icns, .ico, 17 PNGs)

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
window that loads it. The Rust process auto-spawns `pi --mode rpc` as a
child process on launch.

## Production build

```bash
pnpm tauri build    # produces .app and .dmg in src-tauri/target/release/bundle/
```

## Roadmap

- [ ] xterm.js terminal panel (real shell, shared cwd)
- [ ] Right rail: real file tree + git-aware changes tab
- [ ] Command palette (⌘K) with fuzzy search
- [ ] Tool card inline diff (Monaco)
- [ ] Settings: provider credentials via macOS Keychain
- [ ] Global hotkey (Raycast-style)
- [ ] Auto-update via `tauri-plugin-updater`
- [ ] Session RPC sync (server ↔ localStorage)

## Project layout

```
pi-desktop/
├── src/                       # React renderer
│   ├── App.tsx                # Main UI, event handler, state
│   ├── main.tsx               # React entry
│   ├── pi.ts                  # Tauri IPC facade
│   ├── types.ts               # Shared message / event types
│   ├── styles.css             # Design tokens + all CSS (dark + light)
│   ├── components/            # Titlebar, Sidebar, Composer, …
│   ├── hooks/                 # useResizable, useShortcuts, useTheme
│   ├── lib/shortcuts.ts       # Centralized shortcut table
│   └── data/                  # sessionStore, messageStore
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
│   ├── generate-icon.py       # Regenerate the π icon set
│   ├── generate-pi-icon.py    # SVG-based icon generator
│   └── icon-variants.py       # Variant icon builder
├── docs/                      # Design proposals / mockups
│   ├── style-f-workbuddy.html # Full design spec (Style F)
│   ├── layout-diagram.html    # Interactive layout diagram
│   ├── icons/                 # Icon concept art
│   └── style-e-mockup.html    # Early style mockup
├── index.html
├── package.json
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
