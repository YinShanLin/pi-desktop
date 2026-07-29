import type { ConnectionStatus } from "../types";

type Props = {
  status: ConnectionStatus;
  cwd: string;
  modelLabel: string;
  thinkingLevel: string;
  tokenEstimate: string;
};

function statusText(s: ConnectionStatus): string {
  if (s === "disconnected") return "disconnected";
  if (s === "error") return "error";
  if (s === "busy") return "running";
  return "ready";
}

export function StatusBar({
  status,
  cwd,
  modelLabel,
  thinkingLevel,
  tokenEstimate,
}: Props) {
  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        <span className={`statusbar-status status-${status}`}>
          {statusText(status)}
        </span>
        <Sep />
        <span className="statusbar-cwd" title={cwd}>{cwd}</span>
        <Sep />
        <span className="statusbar-model">
          {modelLabel}
          {thinkingLevel && (
            <span className="statusbar-thinking">· {thinkingLevel}</span>
          )}
        </span>
      </div>

      <div className="statusbar-right">
        <span className="statusbar-tokens">{tokenEstimate} tokens</span>
      </div>
    </footer>
  );
}

function Sep() {
  return <span className="statusbar-sep">·</span>;
}
