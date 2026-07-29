import { ChevronDown, Folder } from "lucide-react";
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
  onRetry: () => void;
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
  onRetry,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [thinkMenuOpen, setThinkMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLButtonElement | null>(null);
  const thinkMenuRef = useRef<HTMLButtonElement | null>(null);
  const ready = status === "ready";
  const busy = status === "busy";
  const isRunning = ready || busy;

  /* Close model menu on outside click */
  useEffect(() => {
    if (!modelMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (modelMenuRef.current && t && !modelMenuRef.current.contains(t)) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelMenuOpen]);

  /* Close thinking menu on outside click */
  useEffect(() => {
    if (!thinkMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (thinkMenuRef.current && t && !thinkMenuRef.current.contains(t)) {
        setThinkMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [thinkMenuOpen]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="composer-zone">
      <div className="composer">
        {/* Caption row: cwd pill | model + thinking pill */}
        <div className="composer-caption">
          <div className="composer-caption-left">
            <button
              className="composer-cap"
              onClick={onPickCwd}
              title={`Working directory: ${cwd}\nClick to change`}
            >
              <Folder size={11} />
              <span>{basename(cwd)}</span>
            </button>
          </div>
          <div className="composer-caption-right">
            <button
              className="composer-cap"
              onClick={() => setModelMenuOpen((v) => !v)}
              disabled={!isRunning}
              title="Switch model"
              ref={modelMenuRef}
            >
              {modelLabel}
              {availableModels.length > 0 && (
                <span className="composer-cap-count">({availableModels.length})</span>
              )}
              <ChevronDown size={10} className="composer-cap-caret" />
              {modelMenuOpen && (
                <div className="dropdown-menu composer-menu" onClick={(e) => e.stopPropagation()}>
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
                          onClick={() => { onSwitchModel(m.provider, m.id); setModelMenuOpen(false); }}
                        >
                          <span className="dropdown-check">
                            {isCurrent ? "✓" : ""}
                          </span>
                          <span className="dropdown-item-main">
                            <span className="dropdown-item-name">{m.name ?? m.id}</span>
                            <span className="dropdown-item-id">{label}</span>
                          </span>
                          {m.reasoning && (
                            <span className="dropdown-badge">reasoning</span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </button>
            <button
              className="composer-cap"
              onClick={() => setThinkMenuOpen((v) => !v)}
              disabled={!isRunning}
              title="Thinking level"
              ref={thinkMenuRef}
            >
              <span className={thinkingLevel && thinkingLevel !== "off" ? "composer-cap-thinking" : ""}>
                {thinkingLevel || "off"}
              </span>
              <ChevronDown size={10} className="composer-cap-caret" />
              {thinkMenuOpen && (
                <div className="dropdown-menu composer-menu composer-menu-right" onClick={(e) => e.stopPropagation()}>
                  <div className="thinking-cycle">
                    {THINKING_LEVELS.map((lvl) => (
                      <button
                        key={lvl}
                        className={`thinking-chip ${lvl === thinkingLevel ? "current" : ""}`}
                        onClick={() => { onSetThinking(lvl); setThinkMenuOpen(false); }}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </button>
          </div>
        </div>

        <textarea
          ref={inputRef}
          className="composer-input"
          value={input}
          onChange={(e) => onInput(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder={
            ready
              ? "Ask pi anything."
              : busy
                ? "Working…"
                : ""
          }
          disabled={status === "disconnected" || status === "error"}
          rows={2}
        />
        <div className="composer-foot">
          <span className="composer-foot-left">0 files attached</span>
          <span className="composer-foot-right">
            {status === "disconnected" || status === "error" ? (
              <button
                className="composer-send"
                onClick={onRetry}
                title="Start pi"
              >
                <span>Start pi</span>
              </button>
            ) : busy ? (
              <button
                className="composer-stop-hint"
                onClick={onAbort}
                title="Abort"
              >
                Working
              </button>
            ) : (
              <button
                className="composer-send"
                onClick={onSend}
                disabled={!ready || !input.trim()}
                title="Send"
              >
                <span>Send</span>
                <span className="arrow">⏎</span>
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
