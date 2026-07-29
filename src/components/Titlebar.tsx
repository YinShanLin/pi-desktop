import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import { useCallback } from "react";
import type { ConnectionStatus } from "../types";

type Props = {
  status: ConnectionStatus;
  /** Sidebar lock state. */
  sidebarLocked: boolean;
  onToggleSidebar: () => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
};

function statusColor(s: ConnectionStatus): string {
  switch (s) {
    case "ready":
      return "#30d158";
    case "busy":
      return "#0a84ff";
    case "error":
      return "#ff453a";
    default:
      return "#8e8e93";
  }
}

export function Titlebar({
  status,
  sidebarLocked,
  onToggleSidebar,
  onOpenPalette,
  onOpenSettings,
}: Props) {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest("textarea") ||
      target.closest(".dropdown") ||
      target.closest(".window-controls") ||
      target.closest(".window-control")
    ) {
      return;
    }
    getCurrentWindow().startDragging();
  }, []);

  return (
    <header className="titlebar" onMouseDown={handleMouseDown}>
      <div className="titlebar-left">
        <div className="window-controls">
          <button className="window-control close" onClick={() => getCurrentWindow().close()} aria-label="Close" title="Close (hides to Dock)">
            <X size={7} strokeWidth={3} />
          </button>
          <button className="window-control min" onClick={() => getCurrentWindow().minimize()} aria-label="Minimize" title="Minimize">
            <Minus size={7} strokeWidth={3} />
          </button>
          <button className="window-control max" onClick={() => getCurrentWindow().toggleMaximize()} aria-label="Maximize" title="Maximize">
            <Plus size={7} strokeWidth={3} />
          </button>
        </div>
        <button
          className="titlebar-icon-btn"
          onClick={onToggleSidebar}
          title={`${sidebarLocked ? "Collapse" : "Expand"} sidebar`}
          aria-label="Toggle sidebar"
        >
          {sidebarLocked ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
        <div className="titlebar-brand">
          <span
            className="status-dot"
            style={{ background: statusColor(status) }}
            title={status}
          />
          <span className="titlebar-logo">π</span>
        </div>
      </div>

      <div className="titlebar-center" />

      <div className="titlebar-right">
        <button className="titlebar-icon-btn" onClick={onOpenPalette} title="Command palette" aria-label="Command palette">
          <Search size={14} />
        </button>
        <button className="titlebar-icon-btn" onClick={onOpenSettings} title="Settings" aria-label="Settings">
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
}