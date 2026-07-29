import { Files, GitCompare, Terminal, X } from "lucide-react";
import { useState } from "react";
import type { MockFileNode } from "../data/mockFiles";
import { mockFiles } from "../data/mockFiles";
import { mockChanges, totalStats, type MockChange } from "../data/mockChanges";

export type RailTab = "files" | "terminal" | "changes" | "context";

type Props = {
  activeTab: RailTab;
  onActiveTab: (t: RailTab) => void;
  onClose: () => void;
};

const TABS: Array<{ id: RailTab; label: string; icon: React.ReactNode }> = [
  { id: "context", label: "Context", icon: <Files size={13} /> },
  { id: "files", label: "Files", icon: <Terminal size={13} /> },
  { id: "changes", label: "Changes", icon: <GitCompare size={13} /> },
];

export function RightRail({ activeTab, onActiveTab, onClose }: Props) {
  return (
    <aside className="rail">
      <div className="rail-header">
        <div className="rail-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`rail-tab ${activeTab === t.id ? "active" : ""}`}
              onClick={() => onActiveTab(t.id)}
              title={t.label}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <button className="rail-close" onClick={onClose} title="Hide rail" aria-label="Hide rail">
          <X size={13} />
        </button>
      </div>
      <div className="rail-body">
        {activeTab === "context" && <ContextTab />}
        {activeTab === "files" && <FilesTab />}
        {activeTab === "terminal" && <TerminalTab />}
        {activeTab === "changes" && <ChangesTab />}
      </div>
    </aside>
  );
}

// ---- Context tab (Style F) ------------------------------------------------

function ContextTab() {
  return (
    <div className="context-tab">
      <div className="context-tab-header">
        <span>Context</span>
      </div>
      <div className="context-tab-body">
        <div className="rr-card">
          <div className="rr-card-head">Current file</div>
          <div className="rr-card-body">
            <div className="context-file">
              <div className="context-file-icon">TS</div>
              <div>
                <div className="cf-name">App.tsx</div>
                <div className="cf-path">src/App.tsx · 539 lines</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rr-card">
          <div className="rr-card-head">Tokens this session</div>
          <div className="rr-card-body">
            <div className="token-bar"><div className="fill" style={{ width: "62%" }} /></div>
            <div className="token-line"><span>9.3k / 15k</span><span>62%</span></div>
          </div>
        </div>

        <div className="rr-card">
          <div className="rr-card-head">Recent edits</div>
          <div className="rr-card-body">
            <div className="context-change-row">
              <span className="cc-path">src/App.tsx</span>
              <span className="cc-stats"><span className="add">+42</span> <span className="rem">-18</span></span>
            </div>
            <div className="context-change-row">
              <span className="cc-path">src-tauri/src/lib.rs</span>
              <span className="cc-stats"><span className="add">+8</span> <span className="rem">-22</span></span>
            </div>
            <div className="context-change-row">
              <span className="cc-path">src/styles.css</span>
              <span className="cc-stats"><span className="add">+12</span> <span className="rem">-4</span></span>
            </div>
          </div>
        </div>

        <div className="rr-card">
          <div className="rr-card-head">Tools · 3 calls</div>
          <div className="rr-card-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="context-tool-row">
              <span className="ct-name">read</span>
              <span className="ct-time">142ms</span>
            </div>
            <div className="context-tool-row">
              <span className="ct-name">edit</span>
              <span className="ct-time">128ms</span>
            </div>
            <div className="context-tool-row">
              <span className="ct-name ct-running">bash</span>
              <span className="ct-time ct-running">running…</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Files tab -----------------------------------------------------------

function FilesTab() {
  return (
    <div className="files-tab">
      <div className="files-tab-header">
        <span className="files-tab-path">~/AI/pi-desktop</span>
      </div>
      <div className="file-tree">
        {mockFiles.map((n) => (
          <FileTreeNode key={n.path} node={n} depth={0} />
        ))}
      </div>
      <div className="files-tab-footer">
        <span>mock data — TODO: real fs via tauri-plugin-fs</span>
      </div>
    </div>
  );
}

function FileTreeNode({ node, depth }: { node: MockFileNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const indent = { paddingLeft: 8 + depth * 12 };
  if (node.kind === "file") {
    return (
      <div className="file-row file" style={indent}>
        <span className="file-icon">·</span>
        <span className="file-name">{node.name}</span>
        {node.modified && <span className="file-marker">M</span>}
      </div>
    );
  }
  return (
    <>
      <div
        className="file-row dir"
        style={indent}
        onClick={() => setOpen((v) => !v)}
        role="button"
      >
        <span className="file-caret">{open ? "▾" : "▸"}</span>
        <span className="file-name">{node.name}</span>
      </div>
      {open && node.children?.map((c) => (
        <FileTreeNode key={c.path} node={c} depth={depth + 1} />
      ))}
    </>
  );
}

// ---- Terminal tab --------------------------------------------------------

function TerminalTab() {
  return (
    <div className="terminal-tab">
      <div className="terminal-tab-header">
        <span className="terminal-tab-title">zsh — ~/AI/pi-desktop</span>
      </div>
      <div className="terminal-mock">
        <div className="terminal-line">Last login: today at 14:22 on ttys003</div>
        <div className="terminal-line dim">
          pnpm tauri dev
        </div>
        <div className="terminal-line">
          <span className="terminal-prompt">~/AI/pi-desktop on main $</span>{" "}
          pnpm tauri dev
        </div>
        <div className="terminal-line dim">
          {"  VITE v7.0.4  ready in 234 ms"}
        </div>
        <div className="terminal-line dim">
          {"  ➜  Local:   http://localhost:1420/"}
        </div>
        <div className="terminal-line dim">
          {"  ➜  Network: use --host to expose"}
        </div>
        <div className="terminal-line">
          <span className="terminal-prompt">~/AI/pi-desktop on main $</span>{" "}
          <span className="terminal-cursor" />
        </div>
      </div>
      <div className="terminal-tab-footer">
        <span>mock — TODO: real xterm.js shell</span>
      </div>
    </div>
  );
}

// ---- Changes tab --------------------------------------------------------

function ChangesTab() {
  const stats = totalStats(mockChanges);
  return (
    <div className="changes-tab">
      <div className="changes-tab-header">
        <span className="changes-tab-stats">
          <span className="diff-add">+{stats.added}</span>
          <span className="diff-rem">-{stats.removed}</span>
        </span>
        <span className="changes-tab-hint">{mockChanges.length} files</span>
      </div>
      <div className="changes-list">
        {mockChanges.map((c) => (
          <ChangeRow key={c.id} change={c} />
        ))}
      </div>
      <div className="changes-tab-footer">
        <button className="btn small" title="TODO: git diff viewer">View diff</button>
        <button className="btn small ghost" title="TODO: git reset">Discard</button>
        <span className="changes-tab-hint-right">mock — TODO: live tracking</span>
      </div>
    </div>
  );
}

function ChangeRow({ change }: { change: MockChange }) {
  return (
    <div className={`change-row status-${change.status}`}>
      <span className={`change-status status-${change.status}`}>
        {change.status === "added" ? "A" : change.status === "modified" ? "M" : "D"}
      </span>
      <span className="change-path">{change.filePath}</span>
      <span className="change-stats">
        <span className="diff-add">+{change.added}</span>
        <span className="diff-rem">-{change.removed}</span>
      </span>
    </div>
  );
}
