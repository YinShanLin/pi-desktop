import { useCallback, useEffect, useState } from "react";

export type FontChoice = "system" | "rounded" | "serif";

const STORAGE_KEY = "pi.font";
const FONT_ATTR = "data-font";
const DEFAULT: FontChoice = "system";

const VALID: ReadonlyArray<FontChoice> = ["system", "rounded", "serif"];

function getStoredFont(): FontChoice | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && (VALID as ReadonlyArray<string>).includes(v)) return v as FontChoice;
  } catch {}
  return null;
}

function applyFont(choice: FontChoice) {
  document.documentElement.setAttribute(FONT_ATTR, choice);
}

export function useFont() {
  const [choice, setChoiceState] = useState<FontChoice>(() => {
    return getStoredFont() ?? DEFAULT;
  });

  useEffect(() => {
    applyFont(choice);
  }, [choice]);

  const setFont = useCallback((c: FontChoice) => {
    setChoiceState(c);
    try { localStorage.setItem(STORAGE_KEY, c); } catch {}
  }, []);

  return { font: choice, setFont };
}
