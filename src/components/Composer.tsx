import { ChevronDown, Folder, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ConnectionStatus, ModelOption } from "../types";

type Props = {
  status: ConnectionStatus;
  input: string;
  onInput: (v: string) => void;
  onSend: () => void;
  onAbort: () => void;
  modelLabel: string;
  thinkingLevel: string;
  availableModels: ModelOption[];
  onSwitchModel: (provider: string, id: string) => void;
  onSetThinking: (level: string) => void;
  cwd: string;
  onPickCwd: () => void;
};

const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

function basename(p: string): string {
  if (!p) return "";
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] || p || "—";
}

export function Composer({
  status,
  input,
  onInput,
  onSend,
  onAbort,
  modelLabel,
  thinkingLevel,
  availableModels,
  onSwitchModel,
  onSetThinking,
  cwd,
  onPickCwd,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement | null>(null);
  const ready = status === "ready";
  const busy = status === "busy";
  const isRunning = ready || busy;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (menuRef.current && t && !menuRef.current.contains(t)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="composer">
      <div className="composer-inner">
        <div className="composer-caption-row">
          <button
            className="composer-cwd"
            onClick={onPickCwd}
            title={`Working directory: ${cwd}\nClick to change`}
          >
            <Folder size={11} />
            <span className="composer-cwd-name">{basename(cwd)}</span>
          </button>
          <button
            className="composer-caption"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={!isRunning}
            title="Model + thinking"
            ref={menuRef}
          >
            <span className="composer-caption-model">{modelLabel}</span>
            {thinkingLevel && (
              <>
                <span className="composer-caption-dot">·</span>
                <span className="composer-caption-thinking">{thinkingLevel}</span>
              </>
            )}
            {availableModels.length > 0 && (
              <span className="composer-caption-count">
                ({availableModels.length})
              </span>
            )}
            <ChevronDown size={10} className="composer-caption-caret" />
            {menuOpen && (
              <div className="dropdown-menu composer-menu" onClick={(e) => e.stopPropagation()}>
                <div className="dropdown-section-label">Model</div>
                {availableModels.length === 0 ? (
                  <div className="dropdown-empty">
                    {isRunning ? "loading…" : "start pi to load models"}
                  </div>
                ) : (
                  availableModels.map((m) => {
                    const label = `${m.provider}/${m.id}`;
                    const isCurrent = modelLabel === label;
                    return (
                      <button
                        key={label}
                        className={`dropdown-item ${isCurrent ? "current" : ""}`}
                        onClick={() => onSwitchModel(m.provider, m.id)}
                      >
                        <span className="dropdown-check">
                          {isCurrent ? "✓" : ""}
                        </span>
                        <span className="dropdown-item-main">
                          <span className="dropdown-item-name">
                            {m.name ?? m.id}
                          </span>
                          <span className="dropdown-item-id">{label}</span>
                        </span>
                        {m.reasoning && (
                          <span className="dropdown-badge">reasoning</span>
                        )}
                      </button>
                    );
                  })
                )}
                <div className="dropdown-divider" />
                <div className="dropdown-section-label">Thinking</div>
                <div className="thinking-cycle">
                  {THINKING_LEVELS.map((lvl) => (
                    <button
                      key={lvl}
                      className={`thinking-chip ${
                        lvl === thinkingLevel ? "current" : ""
                      }`}
                      onClick={() => onSetThinking(lvl)}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </button>
        </div>
        <textarea
          ref={inputRef}
          className="composer-input"
          value={input}
          onChange={(e) => onInput(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder={
            ready
              ? "Ask pi anything. Enter to send, Shift+Enter for newline."
              : busy
                ? "Working… Esc to interrupt."
                : "Click Start to begin."
          }
          disabled={status === "disconnected" || status === "error"}
          rows={2}
        />
        <div className="composer-meta">
          <span className="composer-meta-left">0 files attached</span>
          <span className="composer-meta-right">
            {busy ? (
              <button
                className="composer-stop-hint"
                onClick={onAbort}
                title="Abort (⌘.)"
              >
                Working · <kbd>⌘.</kbd> to stop
              </button>
            ) : (
              <button
                className="composer-send"
                onClick={onSend}
                disabled={!ready || !input.trim()}
                title="Send (Enter)"
              >
                <Send size={11} /> Send <kbd>⏎</kbd>
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}