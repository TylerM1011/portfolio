"use client";

import Link from "next/link";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { site } from "@/lib/site";
import { createRoadEngine, type RoadEngine } from "./road/engine";

// UK road signs are set in Transport, which isn't on Google Fonts; this is
// the closest stand-in.
const signFont = Atkinson_Hyperlegible_Next({ subsets: ["latin"], weight: ["500", "700"] });


// The establishing shot plays once per session.
const INTRO_KEY = "road-intro-seen";

const destinations = site.nav
  .filter((item) => item.href !== "/")
  .map((item, i, all) => ({
    ...item,
    // -1 is a hard left, 0 straight on, 1 a hard right. The leftmost
    // destination pulls into the lay-by; right changes lane.
    lateral: all.length === 1 ? 0 : -1 + (2 * i) / (all.length - 1),
  }));

// Styled as a UK motorway gantry: the leftmost destination is signed off to
// the lay-by, and the rest sit over the lanes they keep to.
const exits = destinations.filter((item) => item.lateral < 0);
const lanes = destinations.filter((item) => item.lateral >= 0);

// A UK sign arrow: a straight shaft with a broad triangular head.
function Arrow({ rotate, className = "" }: { rotate: number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`shrink-0 ${className}`} style={{ rotate: `${rotate}deg` }}>
      <path d="M12 1.5 21.5 11.5H15.2V22.5H8.8V11.5H2.5Z" fill="currentColor" />
    </svg>
  );
}

// Before the engine starts, or without WebGL, the sign sits centered over a
// plain sky. The engine then places it in 3D on the gantry; sign sizes are
// in em so it can set one font size (20px, 400px to a world unit). The two
// panels' widths match SIGN_PANELS in road/world.ts, which puts each down
// arrow over the centre of its lane.
const fallbackSign = {
  left: "50%",
  top: "42%",
  transform: "translate(-50%, -50%)",
  fontSize: "clamp(3px, 0.95vw, 12px)",
};

export default function RoadScene() {
  const router = useRouter();
  const [destination, setDestination] = useState<{ href: string; lateral: number } | null>(null);
  const engineRef = useRef<RoadEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const signRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);

  // Next.js keeps this page alive (hidden) after navigating away, which runs
  // this cleanup; the engine is rebuilt at rest when the visitor returns.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const stage = stageRef.current;
    const camera = cameraRef.current;
    const sign = signRef.current;
    const fade = fadeRef.current;
    const bars = barsRef.current;
    if (!container || !stage || !camera || !sign || !fade || !bars) return;

    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    let intro = false;
    try {
      intro = !sessionStorage.getItem(INTRO_KEY);
    } catch {}

    const engine = createRoadEngine(
      { container, stage, camera, sign, fade, bars },
      {
        dark: scheme.matches,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        intro,
        onIntroEnd: () => {
          try {
            sessionStorage.setItem(INTRO_KEY, "1");
          } catch {}
        },
      },
    );
    if (!engine) return;
    engineRef.current = engine;
    const onScheme = (event: MediaQueryListEvent) => engine.setDark(event.matches);
    scheme.addEventListener("change", onScheme);

    return () => {
      scheme.removeEventListener("change", onScheme);
      engine.dispose();
      engineRef.current = null;
      setDestination(null);
    };
  }, []);

  function drive(event: MouseEvent<HTMLAnchorElement>, href: string, lateral: number) {
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (modified || event.button !== 0) return;
    const engine = engineRef.current;
    if (!engine || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    event.preventDefault();
    if (engine.drive(lateral, () => router.push(href))) setDestination({ href, lateral });
  }

  const hint = (lateral: number | null) => engineRef.current?.hint(lateral);

  const linkProps = (item: (typeof destinations)[number]) => ({
    onClick: (event: MouseEvent<HTMLAnchorElement>) => drive(event, item.href, item.lateral),
    onPointerEnter: () => hint(item.lateral),
    onPointerLeave: () => hint(null),
    onFocus: () => hint(item.lateral),
    onBlur: () => hint(null),
    "data-active": destination?.href === item.href || undefined,
  });
  const linkClass =
    "flex leading-none transition-colors hover:bg-white/10 focus-visible:outline-[0.1em] focus-visible:outline-offset-[-0.2em] focus-visible:outline-[#ffd200] data-active:bg-white/15";

  return (
    <div
      ref={containerRef}
      className="road-scene relative isolate min-h-[28rem] flex-1 overflow-hidden bg-linear-to-b from-[#4f8fcf] to-[#f2dfbf] dark:from-[#1c1f4d] dark:to-[#f08a5d]"
    >
      <div ref={stageRef} aria-hidden className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div ref={cameraRef} className="absolute top-0 left-0 h-full w-full transform-3d">
          {/* The transparent padding keeps the panels' edges inside the
              element: browsers don't antialias the outer edge of a
              3D-transformed element, which would leave them jagged. */}
          <div ref={signRef} className="pointer-events-auto absolute h-[15.2em] w-[87.4em] p-[0.4em]" style={fallbackSign}>
            <nav aria-label="Destinations" className={`${signFont.className} flex h-full w-full gap-[1.6em] font-medium text-white`}>
              <div className="road-sign relative flex w-[23em] shrink-0 rounded-[0.5em] border-[0.22em] border-white bg-(--sign)">
                {exits.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    {...linkProps(item)}
                    className={`${linkClass} flex-1 items-start gap-[0.3em] px-[0.45em] pt-[0.45em] text-[1.8em]`}
                  >
                    <Arrow rotate={-45} className="mt-[0.05em] size-[1.3em]" />
                    {item.label}
                  </Link>
                ))}
                {/* The lay-by symbol: a white square with a blue P. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute bottom-[0.7em] left-[0.9em] flex size-[1.45em] items-center justify-center rounded-[0.1em] bg-white text-[1.6em] leading-none font-bold text-(--sign)"
                >
                  P
                </span>
              </div>
              <div className="road-sign flex flex-1 divide-x-[0.15em] divide-white rounded-[0.5em] border-[0.22em] border-white bg-(--sign)">
                {lanes.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    {...linkProps(item)}
                    className={`${linkClass} flex-1 flex-col items-center justify-center gap-[0.3em] text-[1.8em]`}
                  >
                    {item.label}
                    <Arrow rotate={180} className="size-[1.1em]" />
                  </Link>
                ))}
              </div>
            </nav>
          </div>
        </div>
      </div>

      {/* Letterbox bars slide in for the establishing shot and the drive. */}
      <div ref={barsRef} aria-hidden className="group pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[11%] origin-top scale-y-0 bg-black transition-transform duration-900 ease-[cubic-bezier(0.7,0,0.2,1)] group-data-on:scale-y-100" />
        <div className="absolute inset-x-0 bottom-0 h-[11%] origin-bottom scale-y-0 bg-black transition-transform duration-900 ease-[cubic-bezier(0.7,0,0.2,1)] group-data-on:scale-y-100" />
      </div>

      <div ref={fadeRef} className="pointer-events-none absolute inset-0 bg-background opacity-0" />
    </div>
  );
}
