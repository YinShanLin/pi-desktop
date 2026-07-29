import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "../data/sessions";
import { SHORTCUTS, isMac, formatCombo } from "../lib/shortcuts";

type Item = {
  id: string;
  group: "Commands" | "Sessions" | "Models";
  label: string;
  hint?: string;
  shortcut?: string;
  run: () => void;
};

type Props = {
  sessions: Session[];
  onClose: () => void;
  onNewChat: () => void;
  onToggleFiles: () => void;
  onToggleTerminal: () => void;
  onToggleRail: () => void;
  onOpenSettings: () => void;
  onSelectSession: (id: string) => void;
};

function score(haystack: string, needle: string): number {
  if (!needle) return 1;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (h === n) return 0;
  if (h.startsWith(n)) return 1;
  const idx = h.indexOf(n);
  if (idx < 0) return Infinity;
  return idx + 2;
}

export function CommandPalette({
  sessions,
  onClose,
  onNewChat,
  onToggleFiles,
  onToggleTerminal,
  onToggleRail,
  onOpenSettings,
  onSelectSession,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = useMemo<Item[]>(() => {
    const cmds: Item[] = [
      { id: "cmd:new", group: "Commands", label: "New chat", shortcut: formatCombo(SHORTCUTS.newChat), run: onNewChat },
      { id: "cmd:files", group: "Commands", label: "Toggle files panel", shortcut: formatCombo(SHORTCUTS.toggleFiles), run: onToggleFiles },
      { id: "cmd:terminal", group: "Commands", label: "Toggle terminal panel", shortcut: formatCombo(SHORTCUTS.toggleTerminal), run: onToggleTerminal },
      { id: "cmd:rail", group: "Commands", label: "Toggle right rail", shortcut: formatCombo(SHORTCUTS.toggleRail), run: onToggleRail },
      { id: "cmd:settings", group: "Commands", label: "Settings", shortcut: formatCombo(SHORTCUTS.settings), run: onOpenSettings },
    ];
    const sess: Item[] = sessions
      .filter((s) => s.status === "active")
      .slice(0, 12)
      .map((s) => ({
        id: `s:${s.id}`,
        group: "Sessions",
        label: s.title,
        hint: s.cwd,
        run: () => onSelectSession(s.id),
      }));
    return [...cmds, ...sess];
  }, [sessions, onNewChat, onToggleFiles, onToggleTerminal, onToggleRail, onOpenSettings, onSelectSession]);

  const filtered = useMemo(() => {
    const q = query.trim();
    const scored = items.map((it) => ({
      it,
      s: Math.min(
        score(it.label, q),
        it.hint ? score(it.hint, q) + 0.5 : Infinity,
      ),
    }));
    scored.sort((a, b) => a.s - b.s);
    return scored.filter((x) => x.s !== Infinity).slice(0, 12).map((x) => x.it);
  }, [items, query]);

  useEffect(() => {
    if (selectedIdx >= filtered.length) setSelectedIdx(0);
  }, [filtered, selectedIdx]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[selectedIdx];
      if (item) {
        item.run();
        onClose();
      }
    }
  };

  // Group filtered items by category, preserving order.
  const grouped = useMemo(() => {
    const groups: Array<{ name: string; items: Item[] }> = [];
    for (const it of filtered) {
      const last = groups[groups.length - 1];
      if (last && last.name === it.group) {
        last.items.push(it);
      } else {
        groups.push({ name: it.group, items: [it] });
      }
    }
    return groups;
  }, [filtered]);

  let runningIdx = -1;

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Type a command or search…"
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setSelectedIdx(0);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list">
          {filtered.length === 0 ? (
            <div className="palette-empty">No matches</div>
          ) : (
            grouped.map((g) => (
              <div key={g.name}>
                <div className="palette-group-label">{g.name}</div>
                {g.items.map((it) => {
                  runningIdx += 1;
                  const idx = runningIdx;
                  return (
                    <button
                      key={it.id}
                      className={`palette-item ${idx === selectedIdx ? "selected" : ""}`}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      onClick={() => {
                        it.run();
                        onClose();
                      }}
                    >
                      <span className="palette-item-label">{it.label}</span>
                      {it.hint && <span className="palette-item-hint">{it.hint}</span>}
                      {it.shortcut && <kbd className="palette-item-kbd">{it.shortcut}</kbd>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="palette-footer">
          <span><kbd className="palette-key">↑↓</kbd>navigate</span>
          <span><kbd className="palette-key">⏎</kbd>select</span>
          <span><kbd className="palette-key">esc</kbd>close</span>
          <span style={{ marginLeft: "auto" }}>{isMac ? "⌘K" : "Ctrl+K"}</span>
        </div>
      </div>
    </div>
  );
}