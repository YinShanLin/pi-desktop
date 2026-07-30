import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "pi.font";

const FONT_CANDIDATES = [
  "-apple-system", "BlinkMacSystemFont",
  "SF Pro", "SF Pro Display", "SF Pro Text",
  "SF Mono", "SF Compact",
  "Helvetica Neue", "Helvetica",
  "Arial",
  "Georgia", "Times New Roman", "Garamond", "Baskerville",
  "Courier New", "Menlo", "Monaco", "Consolas",
  "Verdana", "Trebuchet MS", "Lucida Grande", "Tahoma",
  "Palatino", "Optima", "Futura", "Gill Sans", "Didot",
  "Calibri", "Cambria", "Candara", "Corbel",
  "PingFang SC", "PingFang TC", "PingFang HK",
  "Hiragino Sans GB", "Hiragino Mincho ProN",
  "STHeiti", "STKaiti", "STSong",
  "Noto Sans SC", "Noto Serif SC",
  "Apple Color Emoji",
] as const;

function isFontAvailable(font: string): boolean {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) return false;
  const text = "abcdefghijklmnopqrstuvwxyz0123456789";
  ctx.font = `72px monospace`;
  const w = ctx.measureText(text).width;
  ctx.font = `72px "${font}", monospace`;
  return ctx.measureText(text).width !== w;
}

function detectFonts(): string[] {
  const detected = FONT_CANDIDATES.filter(isFontAvailable);
  const always = ["system-ui", "sans-serif", "serif", "monospace"];
  return [...new Set([...detected, ...always])];
}

const fallback = `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`;

export function useFont() {
  const [font, setFontState] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return stored;
    } catch {}
    return fallback;
  });

  const [available] = useState<string[]>(() => detectFonts());

  useEffect(() => {
    document.documentElement.style.setProperty("--font-custom", font);
  }, [font]);

  useEffect(() => {
    available.forEach((f) => {
      document.fonts?.load?.(`1em "${f}"`).catch(() => {});
    });
  }, [available]);

  const setFont = useCallback((f: string) => {
    setFontState(f);
    try { localStorage.setItem(STORAGE_KEY, f); } catch {}
  }, []);

  return { font, available, setFont };
}
