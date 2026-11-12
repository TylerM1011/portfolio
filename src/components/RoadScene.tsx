"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { holdScreen } from "@/lib/loading";
import { site } from "@/lib/site";
import { createRoadEngine, type RoadEngine } from "./road/engine";
import { fadeToPage } from "./LoadingScreen";
import { signFont } from "./road/font";
import { LAYBY_BLUE, LEGEND_FONT_SIZE, ROUTE_YELLOW, SW } from "./road/sign";
import { layoutGantry } from "./road/world";

// The establishing shot plays once per session.
const INTRO_KEY = "road-intro-seen";

const destinations = site.nav
  .filter((item) => item.href !== "/")
  .map((item, i) => ({
    ...item,
    // The first destination pulls into the lay-by (-1). The rest take the
    // lanes in order, matching the gantry (see layoutGantry): 0 is straight
    // on in the car's own lane, 1 the next lane to the right, and so on.
    lateral: i === 0 ? -1 : i - 1,
  }));

// UK direction signs on the gantry, one per destination (see road/sign.ts
// and layoutGantry). Before the engine starts, or without WebGL, the signs
// sit centered over a plain sky, drawn as SVG from the same art the scene
// paints. The engine then places them in 3D, where they turn invisible over
// the modelled signs and stay on as the links. Sizes are in em, one stroke
// width, so the engine can set a single font size.
const gantry = layoutGantry(destinations);
const signWidth = (gantry.right - gantry.left) / SW + 0.8;
const signHeight = (gantry.top - gantry.bottom) / SW + 0.8;
const fallbackSign = {
  left: "50%",
  top: "42%",
  transform: "translate(-50%, -50%)",
  fontSize: `clamp(2px, ${83 / signWidth}vw, ${1050 / signWidth}px)`,
  width: `${signWidth}em`,
  height: `${signHeight}em`,
};
const fills = { white: "#ffffff", green: "var(--sign)", blue: LAYBY_BLUE, yellow: ROUTE_YELLOW };

export default function RoadScene() {
  const [destination, setDestination] = useState<{ href: string; lateral: number } | null>(null);
  const engineRef = useRef<RoadEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const signRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);

  // Next.js keeps this page alive (hidden) after navigating away, which runs
  // this cleanup; the engine is rebuilt at rest when the visitor returns.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const stage = stageRef.current;
    const camera = cameraRef.current;
    const sign = signRef.current;
    const fade = fadeRef.current;
    if (!container || !stage || !camera || !sign || !fade) return;

    // The loading screen stays up until the first frame is drawn, so the
    // sky gradient behind the scene is never seen on its own.
    const release = holdScreen();
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    let intro = false;
    try {
      intro = !sessionStorage.getItem(INTRO_KEY);
    } catch {}

    const engine = createRoadEngine(
      { container, stage, camera, sign, fade },
      {
        dark: scheme.matches,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        intro,
        sign: { font: signFont.style.fontFamily, gantry },
        onReady: release,
        onIntroEnd: () => {
          try {
            sessionStorage.setItem(INTRO_KEY, "1");
          } catch {}
        },
      },
    );
    if (!engine) {
      // No WebGL: the gradient is all there is.
      release();
      return;
    }
    engineRef.current = engine;
    const onScheme = (event: MediaQueryListEvent) => engine.setDark(event.matches);
    scheme.addEventListener("change", onScheme);

    return () => {
      release();
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
    // The drive ends on black; the loading screen takes over from there
    // until the next page is in.
    const arrive = () => {
      if (!fadeToPage(href, 0)) window.location.assign(href);
    };
    if (engine.drive(lateral, arrive)) setDestination({ href, lateral });
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

  return (
    <div
      ref={containerRef}
      className="road-scene absolute inset-0 isolate overflow-hidden bg-linear-to-b from-(--sky-top) to-(--sky-horizon)"
    >
      <div ref={stageRef} aria-hidden className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div ref={cameraRef} className="absolute top-0 left-0 h-full w-full transform-3d">
          {/* The transparent padding keeps the panels' edges inside the
              element: browsers don't antialias the outer edge of a
              3D-transformed element, which would leave them jagged. */}
          <div ref={signRef} className="pointer-events-auto absolute p-[0.4em]" style={fallbackSign}>
            <nav aria-label="Destinations" className={`${signFont.className} relative h-full w-full`}>
              {gantry.panels.map(({ item, art, left, top }) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    {...linkProps(item)}
                    style={{
                      left: `${(left - gantry.left) / SW}em`,
                      top: `${(gantry.top - top) / SW}em`,
                      width: `${art.width}em`,
                      height: `${art.height}em`,
                    }}
                    className="road-sign absolute rounded-[3em] after:absolute after:inset-[1.5em] after:rounded-[1.5em] after:transition-colors hover:after:bg-white/10 focus-visible:outline-[0.6em] focus-visible:outline-offset-[-2.2em] focus-visible:outline-[#ffd200] data-active:after:bg-white/15"
                  >
                    <svg aria-hidden viewBox={`0 0 ${art.width} ${art.height}`} className="absolute inset-0 h-full w-full">
                      {art.shapes.map(({ d, fill }) => (
                        <path key={d} d={d} fill={fills[fill]} />
                      ))}
                      {art.texts.map(({ text, x, y, anchor, fill }) => (
                        <text key={text} x={x} y={y} textAnchor={anchor} fontSize={LEGEND_FONT_SIZE} fill={fills[fill]}>
                          {text}
                        </text>
                      ))}
                    </svg>
                    <span className="sr-only">{item.label}</span>
                  </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>

      <div ref={fadeRef} className="pointer-events-none absolute inset-0 bg-[#15162a] opacity-0" />
    </div>
  );
}
