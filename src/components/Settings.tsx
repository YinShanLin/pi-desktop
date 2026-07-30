import { Moon, Plus, Sun, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ModelOption } from "../types";

type Props = {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  font: string;
  availableFonts: string[];
  onSetFont: (f: string) => void;
  userModels: ModelOption[];
  onAddModel: (m: ModelOption) => void;
  onRemoveModel: (provider: string, id: string) => void;
  onClose: () => void;
};

export function Settings({ theme, onToggleTheme, font, availableFonts, onSetFont, userModels, onAddModel, onRemoveModel, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const fontListRef = useRef<HTMLDivElement | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState("");
  const [newModelId, setNewModelId] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showAddForm) { setShowAddForm(false); return; }
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, showAddForm]);

  useEffect(() => {
    if (!fontListRef.current) return;
    const active = fontListRef.current.querySelector(".active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }, [font]);

  const handleAdd = () => {
    const provider = newProvider.trim();
    const id = newModelId.trim();
    if (!provider || !id) return;
    onAddModel({ provider, id, name: newName.trim() || undefined });
    setNewProvider("");
    setNewModelId("");
    setNewName("");
    setShowAddForm(false);
  };

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
            <div className="font-picker" ref={fontListRef} role="listbox" aria-label="Font family">
              {availableFonts.map((f) => (
                <button
                  key={f}
                  className={`font-pick ${font === f ? "active" : ""}`}
                  onClick={() => onSetFont(f)}
                  role="option"
                  aria-selected={font === f}
                >
                  <span className="font-pick-preview" style={{ fontFamily: f }}>Aa</span>
                  <span className="font-pick-name">{f}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-label">Models</div>
            <div className="model-list">
              {userModels.length === 0 && (
                <div className="model-empty">No custom models configured.</div>
              )}
              {userModels.map((m) => (
                <div key={`${m.provider}/${m.id}`} className="model-row">
                  <div className="model-row-info">
                    <span className="model-row-name">{m.name ?? m.id}</span>
                    <span className="model-row-provider">{m.provider}/{m.id}</span>
                  </div>
                  <button className="model-row-remove" onClick={() => onRemoveModel(m.provider, m.id)} aria-label="Remove model">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            {showAddForm ? (
              <div className="model-add-form">
                <input className="model-input" placeholder="Provider (e.g. openai)" value={newProvider} onChange={(e) => setNewProvider(e.target.value)} />
                <input className="model-input" placeholder="Model ID (e.g. gpt-4o)" value={newModelId} onChange={(e) => setNewModelId(e.target.value)} />
                <input className="model-input" placeholder="Display name (optional)" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <div className="model-add-actions">
                  <button className="btn small ghost" onClick={() => setShowAddForm(false)}>Cancel</button>
                  <button className="btn small" onClick={handleAdd} disabled={!newProvider.trim() || !newModelId.trim()}>Add</button>
                </div>
              </div>
            ) : (
              <button className="btn small ghost model-add-btn" onClick={() => setShowAddForm(true)}>
                <Plus size={12} /> Add model
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
