import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pi from "./pi";
import type {
  AssistantMessage,
  AssistantMessageEvent,
  ConnectionStatus,
  ExtensionUiRequest,
  Message,
  ToolMessage,
} from "./types";

let _uid = 0;
const uid = () => `m_${Date.now().toString(36)}_${(_uid++).toString(36)}`;

function defaultCwd(): string {
  // The Rust side resolves HOME; mirror it for the input default.
  // We cannot import the OS module easily, so this is just a placeholder
  // until the user clicks "Change folder". Most users will accept it.
  return "/Users/" + (window.navigator.userAgent.includes("Mac") ? "" : "you");
}

function prettyArgs(args: Record<string, unknown>): string {
  if (!args) return "";
  if (typeof args.command === "string") return args.command;
  if (typeof args.path === "string") return args.path;
  if (typeof args.filePath === "string") return args.filePath;
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function extractText(result: unknown): string {
  if (!result) return "";
  const r = result as { content?: Array<{ type: string; text?: string }>; output?: string };
  if (Array.isArray(r.content)) {
    return r.content
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("\n");
  }
  if (typeof r.output === "string") return r.output;
  return JSON.stringify(result, null, 2);
}

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [cwd, setCwd] = useState<string>(defaultCwd());
  const [pid, setPid] = useState<number | null>(null);
  const [modelLabel, setModelLabel] = useState<string>("(no model)");
  const [thinkingLevel, setThinkingLevel] = useState<string>("");
  const [availableModels, setAvailableModels] = useState<Array<{
    provider: string;
    id: string;
    name?: string;
    reasoning?: boolean;
    contextWindow?: number;
  }>>([]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // The set of thinking levels to cycle through. xhigh/max are exposed only
  // when supported by the model, but we still list them so the cycle stays
  // consistent.
  const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [pendingDialog, setPendingDialog] = useState<ExtensionUiRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesRef = useRef<Message[]>([]);
  // Always-fresh ref so the event handler (attached once) sees latest state.
  messagesRef.current = messages;

  // Track the currently-streaming assistant message so message_update events
  // (which carry NO top-level message.id) can find their target. RPC emits
  // `responseId` on the message but not a stable `id` we can correlate by.
  const currentAssistantIdRef = useRef<string | null>(null);
  // Side-channel for tool inserts produced inside message_update.
  const pendingToolInserts = useRef<ToolMessage[]>([]);

  // Monotonic counter for state-refresh RPCs (get_state, get_available_models).
  // Bumped on every user-initiated change that would trigger a refresh
  // (switchModel, connect, pickCwd). Responses with a stale version are
  // (Already declared above.)

  // Auto-scroll on new content.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Initial status probe + subscribe to pi events for the whole app lifetime.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    // Guard: if the component unmounts before the async onPiEvent() resolves,
    // the cleanup function has no fn to call, and the subscription leaks.
    // The .then() will later install a listener that nobody ever cancels.
    // When the component remounts (HMR page reload) a SECOND subscription
    // is added, causing every text_delta to fire twice → word duplication.
    let mounted = true;

    pi.getStatus()
      .then((s) => {
        if (!mounted) return;
        if (s.running) {
          setStatus("ready");
          setCwd(s.cwd ?? cwd);
          setPid(s.pid);
        }
      })
      .catch((e) => setError(String(e)));

    pi.onPiEvent((event) => {
      handleEvent(event);
    }).then((fn) => {
      if (!mounted) {
        // Component unmounted before the subscription was ready —
        // cancel it immediately to prevent a leak.
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      mounted = false;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEvent = useCallback((event: any) => {
    if (!event || typeof event.type !== "string") return;
    const type = event.type as string;

    switch (type) {
      case "agent_start":
        setStatus("busy");
        return;
      case "agent_settled":
        setStatus("ready");
        return;
      case "pi_exit":
        setStatus("disconnected");
        setPid(null);
        return;

      case "message_start": {
        const msg = event.message;
        if (!msg) return;
        if (msg.role === "user") {
          // Most user messages we already pushed client-side, ignore echoes.
          return;
        }
        if (msg.role === "assistant") {
          // Guard: if we are already tracking a streaming assistant message,
          // ignore this start (likely a duplicate event after HMR reload).
          if (currentAssistantIdRef.current) {
            return;
          }
          const id = uid();
          currentAssistantIdRef.current = id;
          setMessages((prev) => {
            if (prev.some((m) => m.kind === "assistant" && m.id === id)) return prev;
            const next: AssistantMessage = {
              id,
              kind: "assistant",
              text: "",
              thinking: "",
              isStreaming: true,
              at: Date.now(),
            };
            return [...prev, next];
          });
        }
        return;
      }

      case "message_update": {
        const ame = event.assistantMessageEvent as AssistantMessageEvent | undefined;
        if (!ame) return;
        const targetId = currentAssistantIdRef.current;
        if (!targetId) return;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.kind !== "assistant" || m.id !== targetId) return m;
            if (ame.type === "text_delta" && typeof ame.delta === "string") {
              return { ...m, text: m.text + ame.delta };
            }
            if (ame.type === "thinking_delta" && typeof ame.delta === "string") {
              return { ...m, thinking: m.thinking + ame.delta };
            }
            if (ame.type === "toolcall_end" && ame.toolCall) {
              const toolId = String(ame.toolCall.id);
              const toolMsg: ToolMessage = {
                id: `t_${toolId}`,
                kind: "tool",
                toolCallId: toolId,
                name: ame.toolCall.name,
                args: ame.toolCall.arguments ?? {},
                at: Date.now(),
              };
              // Defer insertion via outer state — just stash on a side-effect.
              pendingToolInserts.current.push(toolMsg);
              // Flush on next microtask to keep state updates batched.
              queueMicrotask(() => {
                if (pendingToolInserts.current.length === 0) return;
                const additions = pendingToolInserts.current.splice(0);
                setMessages((p) => {
                  const known = new Set(p.map((x) => (x.kind === "tool" ? x.toolCallId : null)));
                  const fresh = additions.filter((a) => !known.has(a.toolCallId));
                  return fresh.length ? [...p, ...fresh] : p;
                });
              });
            }
            return m;
          }),
        );
        return;
      }

      case "message_end": {
        const id = currentAssistantIdRef.current;
        if (id) {
          setMessages((prev) =>
            prev.map((m) =>
              m.kind === "assistant" && m.id === id ? { ...m, isStreaming: false } : m,
            ),
          );
          currentAssistantIdRef.current = null;
        }
        return;
      }

      case "tool_execution_end": {
        const toolCallId = String(event.toolCallId ?? "");
        if (!toolCallId) return;
        const result = event.result;
        const isError = Boolean(event.isError);
        setMessages((prev) =>
          prev.map((m) =>
            m.kind === "tool" && m.toolCallId === toolCallId
              ? { ...m, result, isError }
              : m,
          ),
        );
        return;
      }

      case "extension_ui_request": {
        const req = event as ExtensionUiRequest;
        if (req.method === "select" || req.method === "confirm" || req.method === "input" || req.method === "editor") {
          setPendingDialog(req);
        } else if (req.method === "notify") {
          const kind = req.notifyType ?? "info";
          setNotice(`[${kind}] ${req.message ?? req.title ?? ""}`);
          setTimeout(() => setNotice(null), 4000);
        }
        return;
      }

      case "response": {
        // Command responses.
        if (event.success && event.data) {
          const data = event.data as {
            model?: { provider?: string; id?: string; name?: string; reasoning?: boolean };
            thinkingLevel?: string;
            models?: Array<{
              provider: string;
              id: string;
              name?: string;
              reasoning?: boolean;
              contextWindow?: number;
            }>;
          };

          if (event.command === "get_state") {
            if (data.model && (data.model.provider || data.model.id)) {
              const m2 = data.model;
              const label = `${m2.provider ?? ""}/${m2.id ?? m2.name ?? ""}`;
              setModelLabel(label);
              if (typeof data.thinkingLevel === "string") {
                setThinkingLevel(data.thinkingLevel);
              }
              setNotice(`ready · ${label}${data.thinkingLevel ? ` · ${data.thinkingLevel}` : ""}`);
              setTimeout(() => setNotice(null), 3000);
            }
          }
          // NOTE: set_model response is intentionally NOT used to update
          // the topbar. Its `data` shape differs from get_state.

          if (event.command === "get_available_models") {
            if (Array.isArray(data.models)) {
              setAvailableModels(data.models);
              if (data.models.length > 0) {
                setNotice(`${data.models.length} model(s) available`);
                setTimeout(() => setNotice(null), 2500);
              }
            }
          }
        }
        if (!event.success && event.error) {
          setError(String(event.error));
          setTimeout(() => setError(null), 5000);
        }
        return;
      }

      default:
        // Other events (turn_*, queue_*, compaction_*, etc.) are ignored for now.
        return;
    }
  }, []);

  // Side-channel for tool inserts produced inside message_update.
  // (Already declared above.)

  // Close the model dropdown when clicking outside of it.
  useEffect(() => {
    if (!modelMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (dropdownRef.current && t && !dropdownRef.current.contains(t)) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelMenuOpen]);


  const connect = useCallback(async () => {
    setError(null);
    try {
      const s = await pi.startPi(cwd);
      setStatus("ready");
      setPid(s.pid);
      pi.getState().catch(() => {});
      pi.getAvailableModels().catch(() => {});
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setStatus("error");
    }
  }, [cwd]);

  const switchModel = useCallback(async (provider: string, modelId: string) => {
    setModelMenuOpen(false);
    setModelLabel(`${provider}/${modelId}`);
    try {
      await pi.setModel(provider, modelId);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }, []);

  const pickCwd = useCallback(async () => {
    const dir = await pi.pickDirectory();
    if (!dir) return;
    pi.frontendLog("info", `[cwd] picked: ${dir}`);
    setCwd(dir);
    // If pi is currently running, restart it with the new cwd.
    // This drops the in-memory session; disk-persisted sessions are unaffected.
    if (status === "ready" || status === "busy") {
      try {
        await pi.stopPi();
      } catch (e) {
        pi.frontendLog("warn", `[cwd] stopPi before restart failed: ${String(e)}`);
      }
      // Clear session-bound state but keep the user's choice of cwd.
      setMessages([]);
      setModelLabel("(no model)");
      setThinkingLevel("");
      setAvailableModels([]);
      setStatus("disconnected");
      setPid(null);
      setNotice(`cwd changed to ${dir} — click Start pi`);
      setTimeout(() => setNotice(null), 4000);
    }
  }, [status]);

  const disconnect = useCallback(async () => {
    try {
      await pi.stopPi();
    } finally {
      setStatus("disconnected");
      setPid(null);
    }
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    pi.frontendLog("info", `[send] clicked: status=${status} text.len=${text.length}`);
    if (!text) {
      pi.frontendLog("warn", "[send] abort: empty text");
      return;
    }
    if (status !== "ready") {
      pi.frontendLog("warn", `[send] abort: status is "${status}", not "ready"`);
      return;
    }
    const userMsg: Message = {
      id: uid(),
      kind: "user",
      text,
      at: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStatus("busy");
    try {
      pi.frontendLog("info", "[send] invoking send_prompt");
      await pi.sendPrompt(text);
      pi.frontendLog("info", "[send] send_prompt resolved");
    } catch (e: any) {
      pi.frontendLog("error", `[send] send_prompt threw: ${String(e?.message ?? e)}`);
      setError(String(e?.message ?? e));
      setStatus("ready");
    }
  }, [input, status]);

  const abort = useCallback(async () => {
    try {
      await pi.sendAbort();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send],
  );

  const statusColor = useMemo(() => {
    switch (status) {
      case "ready":
        return "#34c759";
      case "busy":
        return "#0a84ff";
      case "error":
        return "#ff3b30";
      default:
        return "#8e8e93";
    }
  }, [status]);

  return (
    <div className="app">
      <header className="titlebar">
        <div className="titlebar-left">
          <span className="status-dot" style={{ background: statusColor }} />
          <span className="title">Pi Desktop</span>
          <span className="status-text">
            {status === "disconnected" ? "disconnected" : status}
            {pid ? ` · pid ${pid}` : ""}
            {" · "}
            <code className="path">{cwd}</code>
            <button
              className="cwd-button"
              onClick={pickCwd}
              title="Change working directory"
            >
              📁
            </button>
          </span>
        </div>
        <div className="titlebar-right">
          <div className="dropdown" ref={dropdownRef}>
            <button
              className="model-pill-button"
              onClick={() => setModelMenuOpen((v) => !v)}
              disabled={status === "disconnected" || status === "error"}
            >
              <span className="model-pill-label">{modelLabel}</span>
              {thinkingLevel && (
                <span className="thinking-pill-inline">· {thinkingLevel}</span>
              )}
              {availableModels.length > 0 && (
                <span className="model-count-inline">({availableModels.length})</span>
              )}
              <span className="caret">▾</span>
            </button>
            {modelMenuOpen && (
              <div className="dropdown-menu">
                <div className="dropdown-section-label">Model</div>
                {availableModels.length === 0 ? (
                  <div className="dropdown-empty">
                    {status === "ready"
                      ? "loading…"
                      : "start pi to load models"}
                  </div>
                ) : (
                  availableModels.map((m) => {
                    const label = `${m.provider}/${m.id}`;
                    const isCurrent = modelLabel === label;
                    return (
                      <button
                        key={`${m.provider}/${m.id}`}
                        className={`dropdown-item ${isCurrent ? "current" : ""}`}
                        onClick={() => switchModel(m.provider, m.id)}
                      >
                        <span className="dropdown-check">{isCurrent ? "✓" : ""}</span>
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
                      className={`thinking-chip ${lvl === thinkingLevel ? "current" : ""}`}
                      onClick={async () => {
                        try {
                          await pi.setThinkingLevel(lvl);
                          setThinkingLevel(lvl);
                          setModelMenuOpen(false);
                        } catch (e: any) {
                          setError(String(e?.message ?? e));
                        }
                      }}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {status === "disconnected" || status === "error" ? (
            <button className="btn primary" onClick={connect} disabled={status === "error"}>
              Start pi
            </button>
          ) : (
            <button className="btn" onClick={disconnect}>
              Stop
            </button>
          )}
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}
      {notice && <div className="banner notice">{notice}</div>}

      <main className="messages" ref={scrollerRef}>
        {messages.length === 0 && (
          <div className="empty">
            <h2>Start a conversation</h2>
            <p>
              pi is a coding agent. Ask it to read files, run shell commands, search the web, or
              edit code. Click <strong>Start pi</strong> in the top-right to begin.
            </p>
            <p className="hint">
              Set <code>ANTHROPIC_API_KEY</code> (or another provider key) in your shell before
              launching Pi Desktop.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
      </main>

      <footer className="composer">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder={
            status === "ready"
              ? "Ask pi anything. Enter to send, Shift+Enter for newline."
              : status === "busy"
              ? "Working… press Abort to interrupt."
              : "Click Start pi to begin."
          }
          disabled={status === "disconnected" || status === "error"}
          rows={3}
        />
        <div className="composer-actions">
          <button
            className="btn"
            onClick={abort}
            disabled={status !== "busy"}
            title="Abort current operation"
          >
            Abort
          </button>
          <button
            className="btn primary"
            onClick={send}
            disabled={status !== "ready" || !input.trim()}
          >
            Send
          </button>
        </div>
      </footer>

      {pendingDialog && (
        <ExtensionDialog
          request={pendingDialog}
          onResolve={async (response) => {
            setPendingDialog(null);
            try {
              await pi.respondExtensionUi(pendingDialog.id, response);
            } catch (e: any) {
              setError(String(e?.message ?? e));
            }
          }}
        />
      )}
    </div>
  );
}

function MessageRow({ message }: { message: Message }) {
  if (message.kind === "user") {
    return (
      <div className="row user">
        <div className="bubble user-bubble">{message.text}</div>
      </div>
    );
  }
  if (message.kind === "assistant") {
    return (
      <div className="row assistant">
        <div className="bubble assistant-bubble">
          {message.thinking && (
            <details className="thinking" open={false}>
              <summary>thinking</summary>
              <pre>{message.thinking}</pre>
            </details>
          )}
          <div className="text">
            {message.text || (message.isStreaming ? "…" : "")}
            {message.isStreaming && <span className="cursor" />}
          </div>
        </div>
      </div>
    );
  }
  // tool
  return <ToolRow tool={message} />;
}

function ToolRow({ tool }: { tool: ToolMessage }) {
  const [open, setOpen] = useState(false);
  const argStr = prettyArgs(tool.args);
  const resultStr = tool.result !== undefined ? extractText(tool.result) : null;
  return (
    <div className={`row tool ${tool.isError ? "err" : ""}`}>
      <div className="bubble tool-bubble">
        <button className="tool-header" onClick={() => setOpen((v) => !v)}>
          <span className="tool-name">{tool.name}</span>
          <span className="tool-arg">{argStr.slice(0, 120)}</span>
          <span className="tool-state">
            {tool.result === undefined ? "running…" : tool.isError ? "error" : "done"}
          </span>
        </button>
        {open && (
          <div className="tool-body">
            <div className="tool-section">
              <div className="tool-label">arguments</div>
              <pre>{argStr}</pre>
            </div>
            {resultStr !== null && (
              <div className="tool-section">
                <div className="tool-label">result</div>
                <pre>{resultStr}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ExtensionDialog({
  request,
  onResolve,
}: {
  request: ExtensionUiRequest;
  onResolve: (response: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState<string>(request.prefill ?? "");

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-title">{request.title ?? request.method}</div>
        {request.message && <div className="modal-message">{request.message}</div>}

        {request.method === "select" && request.options && (
          <div className="modal-options">
            {request.options.map((opt) => (
              <button key={opt} className="btn" onClick={() => onResolve({ value: opt })}>
                {opt}
              </button>
            ))}
          </div>
        )}

        {request.method === "confirm" && (
          <div className="modal-options">
            <button className="btn" onClick={() => onResolve({ confirmed: false })}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={() => onResolve({ confirmed: true })}
            >
              Confirm
            </button>
          </div>
        )}

        {(request.method === "input" || request.method === "editor") && (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              placeholder={request.placeholder}
              rows={request.method === "editor" ? 8 : 3}
              autoFocus
            />
            <div className="modal-options">
              <button className="btn" onClick={() => onResolve({ cancelled: true })}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => onResolve({ value: text })}
              >
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
