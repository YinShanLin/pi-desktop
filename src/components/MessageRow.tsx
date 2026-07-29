import { marked } from "marked";
import { memo, useMemo, useState } from "react";
import type { Message, ToolMessage } from "../types";

function prettyArgs(args: Record<string, unknown>): string {
  if (!args) return "";
  if (typeof args.command === "string") return args.command;
  if (typeof args.path === "string") return args.path;
  if (typeof args.filePath === "string") return args.filePath;
  if (typeof args.query === "string") return args.query;
  try {
    return JSON.stringify(args);
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
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

export const MessageRow = memo(function MessageRow({ message }: { message: Message }) {
  if (message.kind === "user") {
    return (
      <div className="row user">
        <div className="bubble user-bubble">{message.text}</div>
      </div>
    );
  }
  if (message.kind === "assistant") {
    const html = useMemo(() => {
      if (!message.text) return "";
      try {
        return marked.parse(message.text, { async: false }) as string;
      } catch {
        return message.text;
      }
    }, [message.text]);

    return (
      <div className="row assistant">
        <div className="bubble assistant-bubble">
          <div className="msg-meta">
            <span className="role">pi</span>
            <span>·</span>
            <span>{message.isStreaming ? "streaming…" : "done"}</span>
            {message.thinking && (
              <>
                <span>·</span>
                <span style={{ color: "var(--accent)" }}>thinking ▸</span>
              </>
            )}
          </div>
          {message.thinking && (
            <details className="thinking" open={false}>
              <summary>thinking</summary>
              <pre>{message.thinking}</pre>
            </details>
          )}
          <div className="text markdown-body">
            {html ? (
              <div dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              message.isStreaming ? "…" : ""
            )}
            {message.isStreaming && <span className="cursor" />}
          </div>
        </div>
      </div>
    );
  }
  return <ToolRow tool={message} />;
});

function ToolRow({ tool }: { tool: ToolMessage }) {
  const [open, setOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const argStr = prettyArgs(tool.args);
  const resultStr = tool.result !== undefined ? extractText(tool.result) : null;
  const isRunning = tool.result === undefined;

  return (
    <div className={`row tool ${tool.isError ? "err" : ""}`}>
      <div className="bubble tool-bubble">
        <button className="tool-header" onClick={() => setOpen((v) => !v)}>
          <span className={`tool-pulse ${isRunning ? "pending" : ""}`} />
          <span className="tool-name">{tool.name}</span>
          <span className="tool-arg">{argStr.slice(0, 140)}</span>
          <span className="tool-time">
            {isRunning
              ? "running…"
              : tool.isError
                ? "error"
                : "done"}
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
            <div className="tool-actions">
              <button
                className="btn small ghost"
                onClick={() => setShowDetails((v) => !v)}
                title="TODO: open inline diff in Phase 3"
              >
                {showDetails ? "Hide diff" : "Show diff"}
              </button>
              <button
                className="btn small ghost"
                title="TODO: copy raw JSON"
                onClick={() => navigator.clipboard?.writeText(argStr)}
              >
                Copy args
              </button>
            </div>
            {showDetails && (
              <div className="tool-section">
                <div className="tool-label">diff preview · TODO</div>
                <pre className="diff-placeholder">
                  // Phase 3 will render monaco diff editor here
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
