"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { holdScreen } from "@/lib/loading";
import { site } from "@/lib/site";
import { PhoneButton, useEmergencyPhone } from "./EmergencyPhone";
import { fadeToPage } from "./LoadingScreen";
import PhoneDial from "./PhoneDial";
import { createLaybyEngine, type LaybyEngine } from "./layby/engine";
import { routeSignArt } from "./layby/sign";
import { signFont } from "./road/font";
import { BORDER, LAYBY_BLUE, LEGEND_FONT_SIZE, ROUTE_YELLOW } from "./road/sign";

// The page's navigation is a route confirmation sign on the bank, like
// those just past a junction on an A-road: a route number, then everywhere
// but here, top to bottom. Change the route number freely.
const ROUTE = "T1";
const routeSign = routeSignArt(
  ROUTE,
  site.nav
    .filter((item) => item.href !== "/contact")
    .map((item) => ({ item })),
);
const { art } = routeSign;

// As on the projects page, the scene paints the sign and the HTML sign,
// laid over it in 3D, stays on as the links. Before the engine starts, or
// without WebGL, it stands low on the left, drawn as SVG from the same art.
// Sizes are in em, one stroke width; the padding keeps the plate's edges
// inside the element, so the browser antialiases them (see RoadScene).
const fallbackSign = {
  left: "22%",
  bottom: "9rem",
  transform: "translateX(-50%)",
  fontSize: `clamp(2px, ${26 / art.width}vw, ${300 / art.width}px)`,
  width: `${art.width + 0.8}em`,
  height: `${art.height + 0.8}em`,
};
// Without WebGL, the marker sign stands in for the phone, middle right.
const fallbackPhone = {
  left: "62%",
  bottom: "9rem",
  width: "clamp(4.5rem, 11vw, 8rem)",
};
const fills = { white: "#ffffff", green: "var(--sign)", blue: LAYBY_BLUE, yellow: ROUTE_YELLOW };


// The contact page backdrop: the lay-by the car pulled into on the home page
// (see layby/world.ts), with an emergency telephone on the verge. Picking up
// the phone zooms in on its dial, which reaches the CV, LinkedIn and GitHub
// (see PhoneDial). The scene sits fixed behind the page; before the engine
// starts, or without WebGL, a sky-to-meadow gradient stands in.
export default function LaybyScene() {
  const [destination, setDestination] = useState<string | null>(null);
  const engineRef = useRef<LaybyEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const signRef = useRef<HTMLDivElement>(null);
  const phone = useEmergencyPhone(engineRef);
  const { ref: phoneRef, reset: resetPhone } = phone;

  // Next.js keeps this page alive (hidden) after navigating away, which runs
  // this cleanup; the engine is rebuilt when the visitor returns.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const stage = stageRef.current;
    const camera = cameraRef.current;
    const sign = signRef.current;
    const phoneButton = phoneRef.current;
    if (!container || !stage || !camera || !sign || !phoneButton) return;

    // The loading screen stays up until the scene's first frame is drawn,
    // so its gradient is never seen on its own (see lib/loading.ts).
    const release = holdScreen();

    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const engine = createLaybyEngine(
      { container, stage, camera, sign, phone: phoneButton },
      {
        dark: scheme.matches,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        sign: { font: signFont.style.fontFamily, art: routeSign },
        onReady: release,
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
      resetPhone();
    };
  }, [phoneRef, resetPhone]);

  function leave(event: MouseEvent<HTMLAnchorElement>, href: string) {
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (modified || event.button !== 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Fade to black, then on to the next page (see LoadingScreen).
    if (destination) return event.preventDefault();
    if (!fadeToPage(href)) return;
    event.preventDefault();
    engineRef.current?.leave(href);
    setDestination(href);
  }

  const hint = (href: string | null) => engineRef.current?.hint(href);

  return (
    <>
      <div
        ref={containerRef}
        className="layby-scene pointer-events-none fixed inset-0 overflow-hidden bg-linear-to-b from-[#4f8fcf] via-[#f2dfbf] via-55% to-[#8f936a] dark:from-[#1c1f4d] dark:via-[#f08a5d] dark:to-[#3b3a3a]"
      >
        <div ref={stageRef} aria-hidden className="absolute inset-0" />
        {/* A scrim keeps the footer legible over the verge. It stays put
            whether the footer is up or not, so the page looks the same. */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-background/75 to-transparent" />

        <div className="absolute inset-0 overflow-hidden">
          <div ref={cameraRef} className="absolute top-0 left-0 h-full w-full transform-3d">
            <div ref={signRef} className="pointer-events-auto absolute p-[0.4em]" style={fallbackSign}>
              <nav aria-label="Destinations" className={`route-sign ${signFont.className} relative h-full w-full`}>
                <svg aria-hidden viewBox={`0 0 ${art.width} ${art.height}`} className="absolute inset-0 h-full w-full">
                  {art.shapes.map(({ d, fill }) => (
                    <path key={d} d={d} fill={fills[fill]} />
                  ))}
                  {art.texts.map(({ text, x, y, anchor, fill }) => (
                    <text key={`${text}-${x}-${y}`} x={x} y={y} textAnchor={anchor} fontSize={LEGEND_FONT_SIZE} fill={fills[fill]}>
                      {text}
                    </text>
                  ))}
                </svg>
                {/* One link per line, across the sign inside its border. */}
                {routeSign.rows.map(({ item, top, height }) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={(event) => leave(event, item.href)}
                    onPointerEnter={() => hint(item.href)}
                    onPointerLeave={() => hint(null)}
                    onFocus={() => hint(item.href)}
                    onBlur={() => hint(null)}
                    data-active={destination === item.href || undefined}
                    style={{
                      left: `${BORDER + 0.6}em`,
                      top: `${top}em`,
                      width: `${art.width - 2 * BORDER - 1.2}em`,
                      height: `${height}em`,
                    }}
                    className="route-sign-row absolute rounded-[1em] after:absolute after:inset-0 after:rounded-[1em] after:transition-colors hover:after:bg-white/10 focus-visible:outline-[0.5em] focus-visible:outline-offset-[0.2em] focus-visible:outline-[#ffd200] data-active:after:bg-white/15"
                  >
                    <span className="sr-only">{item.label}</span>
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </div>

        {/* The emergency telephone. The engine keeps this button fitted
            over the phone on screen. Picking it up opens the door, pushes
            the camera in, and brings up the dial. */}
        <PhoneButton {...phone.button} fallback={fallbackPhone} />
      </div>

      <PhoneDial {...phone.dial} />
    </>
  );
}
