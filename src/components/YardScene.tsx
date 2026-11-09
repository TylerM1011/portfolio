"use client";

import { useLayoutEffect, useRef } from "react";
import { createYardEngine } from "./yard/engine";

// The projects page backdrop: a construction site rendered with the same
// three.js setup as the home page's road scene (see yard/world.ts). It sits
// fixed behind the page, which scrolls over it. Before the engine starts, or
// without WebGL, a sky-to-dirt gradient stands in.
export default function YardScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Next.js keeps this page alive (hidden) after navigating away, which runs
  // this cleanup; the engine is rebuilt when the visitor returns.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const stage = stageRef.current;
    if (!container || !stage) return;

    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const engine = createYardEngine(
      { container, stage },
      {
        dark: scheme.matches,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      },
    );
    if (!engine) return;
    const onScheme = (event: MediaQueryListEvent) => engine.setDark(event.matches);
    scheme.addEventListener("change", onScheme);

    return () => {
      scheme.removeEventListener("change", onScheme);
      engine.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-linear-to-b from-[#4f8fcf] via-[#f2dfbf] via-55% to-[#9a7652] dark:from-[#1c1f4d] dark:via-[#f08a5d] dark:to-[#4a3828]"
    >
      <div ref={stageRef} className="absolute inset-0" />
      {/* Scrims keep the header and footer legible over the sky and dirt. */}
      <div className="absolute inset-x-0 top-0 h-28 bg-linear-to-b from-background/55 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-background/75 to-transparent" />
    </div>
  );
}
