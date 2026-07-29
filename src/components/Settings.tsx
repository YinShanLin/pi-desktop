import { Moon, Sun, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { FontChoice } from "../hooks/useFont";

type Props = {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  font: FontChoice;
  onSetFont: (f: FontChoice) => void;
  onClose: () => void;
};

const FONT_OPTIONS: Array<{ id: FontChoice; label: string; sample: string }> = [
  { id: "system", label: "System", sample: "Aa" },
  { id: "rounded", label: "Rounded", sample: "Aa" },
  { id: "serif", label: "Serif", sample: "Aa" },
];

export function Settings({ theme, onToggleTheme, font, onSetFont, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="settings-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">
            <X size={14} />
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-section">
            <div className="settings-section-label">Appearance</div>
            <button className="settings-row" onClick={onToggleTheme} role="switch" aria-checked={theme === "light"}>
              <span className="settings-row-icon">
                {theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
              </span>
              <span className="settings-row-label">Dark mode</span>
              <span className="settings-row-value">{theme === "dark" ? "On" : "Off"}</span>
              <div className={`settings-toggle ${theme === "light" ? "on" : ""}`}>
                <div className="settings-toggle-thumb" />
              </div>
            </button>
          </div>

          <div className="settings-section">
            <div className="settings-section-label">Font</div>
            <div className="font-picker" role="radiogroup" aria-label="Font family">
              {FONT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={`font-pick ${font === opt.id ? "active" : ""}`}
                  onClick={() => onSetFont(opt.id)}
                  role="radio"
                  aria-checked={font === opt.id}
                  title={opt.label}
                >
                  <span className={`font-pick-sample font-sample-${opt.id}`}>{opt.sample}</span>
                  <span className="font-pick-label">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
