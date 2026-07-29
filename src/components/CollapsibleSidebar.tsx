import { Command } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  /** When true, sidebar stays expanded; collapses only on explicit close. */
  locked?: boolean;
  onOpenPalette: () => void;
  children: ReactNode;
};

/**
 * Style E sidebar: collapses to a 48px icon-rail. Hovering expands to
 * 240px. When `locked` is set, stays expanded and ignores mouse events.
 */
export function CollapsibleSidebar({
  locked = false,
  onOpenPalette,
  children,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const collapseTimerRef = useRef<number | null>(null);
  const expanded = locked || hovered;

  // Clear any pending collapse when hover state flips back to true.
  useEffect(() => {
    if (hovered && collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, [hovered]);

  const scheduleCollapse = () => {
    if (collapseTimerRef.current !== null) window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = window.setTimeout(() => {
      setHovered(false);
      collapseTimerRef.current = null;
    }, 600);
  };

  return (
    <div
      className={`sidebar-shell ${expanded ? "is-expanded" : ""} ${locked ? "is-locked" : ""}`}
      onMouseEnter={() => !locked && setHovered(true)}
      onMouseLeave={() => !locked && scheduleCollapse()}
    >
      <nav className="sidebar-rail" aria-hidden={expanded}>
        <div className="rail-logo" title="Pi">π</div>
        <div className="rail-spacer" />
        <button className="rail-btn" onClick={onOpenPalette} title="Command palette">
          <Command size={14} />
        </button>
      </nav>
      <div className="sidebar-expanded" aria-hidden={!expanded}>
        {children}
      </div>
    </div>
  );
}