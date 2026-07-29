import { Moon, Sun, X } from "lucide-react";
import { useEffect, useRef } from "react";

type Props = {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onClose: () => void;
};

export function Settings({ theme, onToggleTheme, onClose }: Props) {
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
        </div>
      </div>
    </div>
  );
}
