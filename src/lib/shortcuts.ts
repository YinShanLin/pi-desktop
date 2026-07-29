// Keyboard shortcut catalog + helpers.
//
// One central place so:
//   - status bar can render the hints
//   - useShortcuts can match a global event
//   - components can format labels with ⌘ / ⇧ / ⌥ on macOS, Ctrl on others

export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

export type KeyCombo = {
  key: string; // 'n', 'b', 'j', 'k', 'ArrowLeft', '[' …
  metaKey?: boolean; // ⌘
  shiftKey?: boolean; // ⇧
  altKey?: boolean; // ⌥
  ctrlKey?: boolean;
};

export type Shortcut = KeyCombo & {
  id: string;
  description: string;
};

/** Match a KeyboardEvent against a KeyCombo. */
export function matchesCombo(e: KeyboardEvent, c: KeyCombo): boolean {
  if (e.key.toLowerCase() !== c.key.toLowerCase()) return false;
  const need = {
    metaKey: !!c.metaKey,
    shiftKey: !!c.shiftKey,
    altKey: !!c.altKey,
    ctrlKey: !!c.ctrlKey,
  };
  return (
    e.metaKey === need.metaKey &&
    e.shiftKey === need.shiftKey &&
    e.altKey === need.altKey &&
    e.ctrlKey === need.ctrlKey
  );
}

/** Format a KeyCombo for display: "⌘N", "⌘⇧P", "Ctrl+B" on Win/Linux. */
export function formatCombo(c: KeyCombo): string {
  const parts: string[] = [];
  if (c.metaKey) parts.push(isMac ? "⌘" : "Ctrl");
  if (c.ctrlKey) parts.push(isMac ? "⌃" : "Ctrl");
  if (c.altKey) parts.push(isMac ? "⌥" : "Alt");
  if (c.shiftKey) parts.push(isMac ? "⇧" : "Shift");
  // Normalize common punctuation keys.
  const key =
    c.key === "ArrowLeft"
      ? "←"
      : c.key === "ArrowRight"
        ? "→"
        : c.key === "ArrowUp"
          ? "↑"
          : c.key === "ArrowDown"
            ? "↓"
            : c.key.toUpperCase();
  parts.push(key);
  return parts.join(isMac ? "" : "+");
}

// ---- The Phase 1 shortcut catalog ----------------------------------------

export const SHORTCUTS = {
  newChat: {
    id: "newChat",
    description: "New chat",
    key: "n",
    metaKey: true,
  },
  toggleFiles: {
    id: "toggleFiles",
    description: "Toggle files panel",
    key: "b",
    metaKey: true,
  },
  toggleTerminal: {
    id: "toggleTerminal",
    description: "Toggle terminal panel",
    key: "j",
    metaKey: true,
  },
  toggleRail: {
    id: "toggleRail",
    description: "Toggle right rail",
    key: ".",
    metaKey: true,
  },
  commandPalette: {
    id: "commandPalette",
    description: "Command palette",
    key: "k",
    metaKey: true,
  },
  toggleSidebar: {
    id: "toggleSidebar",
    description: "Toggle sidebar lock",
    key: "\\",
    metaKey: true,
  },
  prevSession: {
    id: "prevSession",
    description: "Previous session",
    key: "[",
    metaKey: true,
  },
  nextSession: {
    id: "nextSession",
    description: "Next session",
    key: "]",
    metaKey: true,
  },
  settings: {
    id: "settings",
    description: "Settings",
    key: ",",
    metaKey: true,
  },
} as const satisfies Record<string, Shortcut>;
