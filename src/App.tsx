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

  // Auto-scroll on new content.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Initial status probe + subscribe to pi events for the whole app lifetime.
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    pi.getStatus()
      .then((s) => {
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
      unlisten = fn;
    });

    return () => {
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
          const id = String(msg.id ?? uid());
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
        const msg = event.message;
        if (!ame || !msg) return;
        const id = String(msg.id);
        setMessages((prev) =>
          prev.map((m) => {
            if (m.kind !== "assistant" || m.id !== id) return m;
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
        const msg = event.message;
        if (!msg) return;
        const id = String(msg.id);
        setMessages((prev) =>
          prev.map((m) =>
            m.kind === "assistant" && m.id === id ? { ...m, isStreaming: false } : m,
          ),
        );
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
        // Command responses (e.g. set_model) - ignore for now.
        if (event.command === "set_model" && event.success && event.data) {
          const d = event.data as { model?: { provider?: string; id?: string; name?: string } };
          if (d.model) {
            setModelLabel(`${d.model.provider ?? ""}/${d.model.id ?? d.model.name ?? ""}`);
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
  const pendingToolInserts = useRef<ToolMessage[]>([]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      const s = await pi.startPi(cwd);
      setStatus("ready");
      setPid(s.pid);
      // Ask for current state (model, etc.).
      pi.getState().catch(() => {});
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setStatus("error");
    }
  }, [cwd]);

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
    if (!text || status !== "ready") return;
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
      await pi.sendPrompt(text);
    } catch (e: any) {
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
          </span>
        </div>
        <div className="titlebar-right">
          <span className="model-pill">{modelLabel}</span>
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
