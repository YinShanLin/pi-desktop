import {
  Activity, ChevronDown, ChevronRight, Clipboard, Cpu,
  FolderTree, Plus, Pencil, Search, Terminal, Trash2, X, PanelRightClose,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { relativeTime, type Session } from "../data/sessions";

type Props = {
  sessions: Session[];
  activeId: string | null;
  query: string;
  onQueryChange: (q: string) => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onOpenPalette: () => void;
  onToggleRail: () => void;
};

type QuickAction = {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
};

type ContextMenu = {
  x: number;
  y: number;
  session: Session;
};

const GROUP_LABELS: Record<Session["group"], string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

export function SessionSidebar({
  sessions,
  activeId,
  query,
  onQueryChange,
  onSelect,
  onNewChat,
  onArchive,
  onDelete,
  onRename,
  onOpenPalette,
  onToggleRail,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused || query.trim()) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (searchRef.current && t && !searchRef.current.contains(t)) setFocused(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [focused, query]);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (ctxRef.current && t && !ctxRef.current.contains(t)) setContextMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener("scroll", handler, true);
    return () => document.removeEventListener("scroll", handler, true);
  }, [contextMenu]);

  const toggleCollapse = (g: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  };

  const showQuickActions = focused && !query.trim();

  const quickActions: QuickAction[] = [
    { id: "new-chat", label: "New chat", icon: <Plus size={13} />, action: onNewChat },
    { id: "toggle-rail", label: "Toggle Right Rail", icon: <PanelRightClose size={13} />, action: onToggleRail },
  ];

  const filtered = query.trim()
    ? sessions.filter((s) => s.title.toLowerCase().includes(query.trim().toLowerCase()))
    : sessions;

  const groups: Array<Session["group"]> = ["today", "yesterday", "earlier"];
  const byGroup = (g: Session["group"]) => filtered.filter((s) => s.group === g);
  const active = sessions.filter((s) => s.status === "active");
  const archived = sessions.filter((s) => s.status === "archived");

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button className="new-chat-button" onClick={onNewChat} title="New chat">
          <Plus size={14} />
          <span>New chat</span>
        </button>
        <div className="sidebar-search" ref={searchRef}>
          <Search size={13} className="sidebar-search-icon" />
          <input
            type="text"
            placeholder={showQuickActions ? "" : "Search sessions…"}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => setFocused(true)}
          />
          {showQuickActions && (
            <div className="quick-actions">
              {quickActions.map((qa) => (
                <button key={qa.id} className="quick-action-item" onClick={() => { qa.action(); setFocused(false); }}>
                  {qa.icon}
                  <span className="quick-action-label">{qa.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sidebar-scroll">
        {filtered.length === 0 ? (
          <div className="sidebar-empty">{query.trim() ? `No sessions match "${query}"` : "No sessions yet"}</div>
        ) : (
          groups.map((g) => {
            const items = byGroup(g);
            if (items.length === 0) return null;
            const isCollapsed = collapsed.has(g);
            return (
              <div key={g} className="sidebar-group">
                <div className="sidebar-group-label" onClick={() => toggleCollapse(g)} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") toggleCollapse(g); }}
                >
                  <span className="sidebar-group-label-left">
                    <span className="sidebar-group-caret">
                      {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                    </span>
                    {GROUP_LABELS[g]}
                  </span>
                  <span className="sidebar-group-count">{items.length}</span>
                </div>
                {!isCollapsed && items.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    isActive={activeId === s.id}
                    isRenaming={renamingId === s.id}
                    onSelect={() => { setRenamingId(null); onSelect(s.id); }}
                    onArchive={() => onArchive(s.id)}
                    onDelete={() => onDelete(s.id)}
                    onRenameConfirm={(title) => { onRename(s.id, title); setRenamingId(null); }}
                    onRenameCancel={() => setRenamingId(null)}
                    onContextMenu={(e) => { e.preventDefault(); setRenamingId(null); setContextMenu({ x: e.clientX, y: e.clientY, session: s }); }}
                  />
                ))}
              </div>
            );
          })
        )}

        {archived.length > 0 && query.trim() === "" && !showQuickActions && (
          <div className="sidebar-group">
            <div className="sidebar-group-label">
              <span className="sidebar-group-label-left">Archive</span>
              <span className="sidebar-group-count">{archived.length}</span>
            </div>
            {archived.slice(0, 3).map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                isActive={activeId === s.id}
                isRenaming={renamingId === s.id}
                onSelect={() => { setRenamingId(null); onSelect(s.id); }}
                onArchive={() => onArchive(s.id)}
                onDelete={() => onDelete(s.id)}
                onRenameConfirm={(title) => { onRename(s.id, title); setRenamingId(null); }}
                onRenameCancel={() => setRenamingId(null)}
                onContextMenu={(e) => { e.preventDefault(); setRenamingId(null); setContextMenu({ x: e.clientX, y: e.clientY, session: s }); }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-palette-button" onClick={onOpenPalette} title="Command palette">
          <span className="palette-dot" />
          <span className="palette-hint">Type a command…</span>
        </button>
      </div>

      <div className="sidebar-summary" aria-hidden>
        <SummaryCell icon={<Activity size={11} />} label="active" value={String(active.length)} />
        <SummaryCell icon={<Cpu size={11} />} label="tokens" value="1.2k" />
      </div>

      {contextMenu && (
        <div ref={ctxRef} className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button className="context-menu-item" onClick={() => { onArchive(contextMenu.session.id); setContextMenu(null); }}>
            <FolderTree size={12} />
            <span>{contextMenu.session.status === "active" ? "Archive" : "Restore"}</span>
          </button>
          <button className="context-menu-item" onClick={() => { setRenamingId(contextMenu.session.id); setContextMenu(null); }}>
            <Pencil size={12} />
            <span>Rename</span>
          </button>
          <button className="context-menu-item danger" onClick={() => { onDelete(contextMenu.session.id); setContextMenu(null); }}>
            <Trash2 size={12} />
            <span>Delete</span>
          </button>
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={() => { navigator.clipboard.writeText(contextMenu.session.title); setContextMenu(null); }}>
            <Clipboard size={12} />
            <span>Copy title</span>
          </button>
        </div>
      )}
    </aside>
  );
}

function SummaryCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="summary-cell">
      {icon}<span className="summary-value">{value}</span><span className="summary-label">{label}</span>
    </div>
  );
}

function SessionRow({ session, isActive, isRenaming, onSelect, onArchive, onDelete, onRenameConfirm, onRenameCancel, onContextMenu }: {
  session: Session; isActive: boolean; isRenaming: boolean;
  onSelect: () => void; onArchive: () => void; onDelete: () => void;
  onRenameConfirm: (title: string) => void; onRenameCancel: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [editValue, setEditValue] = useState(session.title);

  useEffect(() => {
    if (isRenaming) {
      setEditValue(session.title);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [isRenaming, session.title]);

  if (isRenaming) {
    return (
      <div className="session-row" onContextMenu={onContextMenu}>
        <div className="session-row-main">
          <input
            ref={inputRef}
            className="session-rename-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onRenameConfirm(editValue.trim() || session.title); }
              if (e.key === "Escape") { e.preventDefault(); onRenameCancel(); }
            }}
            onBlur={() => onRenameConfirm(editValue.trim() || session.title)}
            autoFocus
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`session-row ${isActive ? "active" : ""}`} onClick={onSelect} onContextMenu={onContextMenu}
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
    >
      <div className="session-row-main">
        <div className="session-row-title">
          {session.unread && <span className="unread-dot" />}
          {session.title}
        </div>
        <div className="session-row-meta">
          <span className={`status-dot-mini ${session.status === "active" ? "running" : ""}`} />
          <span className="session-row-time">{relativeTime(session.updatedAt)}</span>
          <span className="session-row-sep">·</span>
          <span className="session-row-msgs">{session.messageCount}</span>
          {session.diffStats && (
            <>
              <span className="session-row-sep">·</span>
              <span className="session-row-diff">
                <span className="diff-add">+{session.diffStats.added}</span>
                <span className="diff-rem">-{session.diffStats.removed}</span>
              </span>
            </>
          )}
        </div>
      </div>
      <div className="session-row-actions" onClick={(e) => e.stopPropagation()}>
        {session.status === "active" ? (
          <button className="row-action" onClick={onArchive} title="Archive" aria-label="Archive"><FolderTree size={11} /></button>
        ) : (
          <button className="row-action" onClick={onArchive} title="Restore" aria-label="Restore"><Terminal size={11} /></button>
        )}
        <button className="row-action danger" onClick={onDelete} title="Delete" aria-label="Delete"><X size={11} /></button>
      </div>
    </div>
  );
}
