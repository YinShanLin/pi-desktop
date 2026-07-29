import { useCallback, useRef, useState } from "react";

/**
 * Track a draggable divider's width, persist to localStorage, and clamp
 * to a [min, max] range. Returns the current width and a spread of event
 * props to attach to the drag handle element.
 */
export function useResizable(
  storageKey: string,
  initial: number,
  min: number,
  max: number,
): {
  width: number;
  setWidth: (w: number) => void;
  handleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    className: string;
  };
} {
  const [width, setWidthState] = useState<number>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const n = Number(stored);
        if (!Number.isNaN(n) && n >= min && n <= max) return n;
      }
    } catch {
      /* ignore */
    }
    return initial;
  });

  const widthRef = useRef(width);
  widthRef.current = width;

  const setWidth = useCallback(
    (w: number) => {
      const clamped = Math.max(min, Math.min(max, w));
      setWidthState(clamped);
      try {
        window.localStorage.setItem(storageKey, String(clamped));
      } catch {
        /* ignore */
      }
    },
    [storageKey, min, max],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = widthRef.current;
      // Side the divider is on: positive delta = grow, negative = shrink.
      // We pick the side from a data attribute on the handle (set via
      // handleProps). The caller decides by setting `data-side="right"` etc.
      const handle = e.currentTarget as HTMLElement;
      const side = handle.dataset.side === "left" ? -1 : 1;

      const onMove = (ev: MouseEvent) => {
        const delta = (ev.clientX - startX) * side;
        const next = startW + delta;
        setWidthState(Math.max(min, Math.min(max, next)));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        // Persist final value.
        try {
          window.localStorage.setItem(storageKey, String(widthRef.current));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [storageKey, min, max],
  );

  return {
    width,
    setWidth,
    handleProps: {
      onMouseDown,
      className: "divider",
    },
  };
}
