"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { projects } from "@/lib/projects";
import Blueprint from "./Blueprint";

type Props = {
  open: boolean;
  // Where the clipboard is on screen, for it to be picked up from.
  origin: { x: number; y: number } | null;
  onClose: () => void;
};

// The clipboard off the about page's coffee table, held up: the same
// blueprints as the projects page (see lib/projects.ts), one per project,
// under a steel clip. The top sheet is the one showing; the next ones peek
// out beneath it, and a sheet that's been read flips up over the clip;
// after the last, they all come back down. The arrow keys (or the buttons)
// turn the sheets, and Escape puts it down.
export default function Clipboard({ open, origin, onClose }: Props) {
  const [sheet, setSheet] = useState(0);
  const firstRef = useRef<HTMLButtonElement>(null);
  const total = projects.length;

  useEffect(() => {
    if (!open) return;
    const focus = window.setTimeout(() => firstRef.current?.focus({ preventScroll: true }), 50);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight") {
        setSheet((s) => (s + 1) % total);
      } else if (event.key === "ArrowLeft") {
        setSheet((s) => (s + total - 1) % total);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focus);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, total]);

  const from: CSSProperties = origin
    ? ({
        "--from-x": `${origin.x - window.innerWidth / 2}px`,
        "--from-y": `${origin.y - window.innerHeight / 2}px`,
      } as CSSProperties)
    : {};

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Projects: blueprints on a clipboard"
      inert={!open}
      data-open={open || undefined}
      className="scene-dialog group/clip fixed inset-0 z-50 grid place-items-center overflow-y-auto p-3 sm:p-4"
    >
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-[#15162a]/45 opacity-0 backdrop-blur-[3px] transition-opacity duration-500 group-data-open/clip:opacity-100 group-data-open/clip:delay-200"
      />

      <div style={from} className="scene-dialog-panel relative w-[min(94vw,40rem)]">
        <div className="clipboard-board">
          <ol className="clipboard-sheets" aria-label="Project sheets">
            {projects.map((project, i) => (
              <li
                key={project.name}
                inert={i !== sheet}
                aria-hidden={i !== sheet}
                data-place={i < sheet ? "read" : i === sheet ? "top" : "under"}
                style={{ "--under": i - sheet } as CSSProperties}
                className="clipboard-sheet"
              >
                <Blueprint project={project} index={i} total={total} />
              </li>
            ))}
          </ol>
          {/* The clip, over the sheets' top edge. */}
          <span aria-hidden className="clipboard-clip" />

          <nav aria-label="Sheets" className="clipboard-controls">
            <button type="button" onClick={() => setSheet((s) => (s + total - 1) % total)} className="clipboard-button">
              &larr; Back
            </button>
            <span aria-live="polite" className="clipboard-count">
              Sheet {sheet + 1} of {total}
            </span>
            <button ref={firstRef} type="button" onClick={() => setSheet((s) => (s + 1) % total)} className="clipboard-button">
              Next &rarr;
            </button>
          </nav>
          <button type="button" onClick={onClose} className="clipboard-button clipboard-close">
            Put it down <span className="opacity-60">(Esc)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
