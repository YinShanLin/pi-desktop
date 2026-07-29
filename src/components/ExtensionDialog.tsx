import { useState } from "react";
import type { ExtensionUiRequest } from "../types";

type Props = {
  request: ExtensionUiRequest;
  onResolve: (response: Record<string, unknown>) => void;
};

export function ExtensionDialog({ request, onResolve }: Props) {
  const [text, setText] = useState<string>(request.prefill ?? "");

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-title">{request.title ?? request.method}</div>
        {request.message && <div className="modal-message">{request.message}</div>}

        {request.method === "select" && request.options && (
          <div className="modal-options vertical">
            {request.options.map((opt) => (
              <button
                key={opt}
                className="btn"
                onClick={() => onResolve({ value: opt })}
              >
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
