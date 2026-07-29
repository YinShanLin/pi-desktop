import { useEffect, useRef } from "react";
import { matchesCombo, type Shortcut } from "../lib/shortcuts";

export type ShortcutBinding = Shortcut & { run: () => void };

/**
 * Register a list of global keyboard shortcuts. Re-registers only when
 * the *set* of shortcut IDs changes — actions are read through a ref so
 * they always see the latest closure.
 */
export function useShortcuts(bindings: ShortcutBinding[]) {
  const ref = useRef(bindings);
  ref.current = bindings;

  useEffect(() => {
    // Only re-bind on identity change (deps array below).
    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in a textarea/input unless it's our explicit combo.
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === "TEXTAREA" ||
          (target.tagName === "INPUT" && (target as HTMLInputElement).type !== "checkbox"));
      for (const b of ref.current) {
        if (!matchesCombo(e, b)) continue;
        // Allow meta-combos even in inputs (Cmd+N, Cmd+B etc. are app-level).
        const isAppCombo = e.metaKey || e.ctrlKey;
        if (isEditable && !isAppCombo) continue;
        e.preventDefault();
        b.run();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindings.map((b) => b.id).sort().join("|")]);
}
