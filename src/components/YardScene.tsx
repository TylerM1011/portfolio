"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { holdScreen } from "@/lib/loading";
import { site } from "@/lib/site";
import { PhoneButton, useEmergencyPhone } from "./EmergencyPhone";
import { fadeToPage } from "./LoadingScreen";
import PhoneDial from "./PhoneDial";
import { signFont } from "./road/font";
import { LAYBY_BLUE, LEGEND_FONT_SIZE, ROUTE_YELLOW, SW } from "./road/sign";
import { createYardEngine, type YardEngine } from "./yard/engine";
import { layoutSignpost } from "./yard/world";

// Everywhere but here, top to bottom on the signpost, except the contact
// page: from here, the emergency phone beside the signpost is the way to get
// in touch. The panels carry no arrows; `lateral` (-1 to 1) just tells the
// scene which panel to light.
const destinations = site.nav
  .filter((item) => item.href !== "/projects" && item.href !== "/contact")
  .map((item, i, all) => ({
    ...item,
    lateral: all.length === 1 ? 0 : -1 + (2 * i) / (all.length - 1),
  }));

// The signpost by the gate is the page's navigation. As on the
// road scene, the scene paints it and the HTML sign, laid over it in 3D,
// stays on as the links. Before the engine starts, or without WebGL, the
// sign stands low down to the right, clear of the sheets along the top,
// drawn as SVG from the same art.
// Sizes are in em, one stroke width.
const signpost = layoutSignpost(destinations);
const signWidth = (signpost.right - signpost.left) / SW + 0.8;
const signHeight = (signpost.top - signpost.bottom) / SW + 0.8;
const fallbackSign = {
  left: "72%",
  bottom: "12rem",
  transform: "translateX(-50%)",
  fontSize: `clamp(2px, ${40 / signWidth}vw, ${260 / signWidth}px)`,
  width: `${signWidth}em`,
  height: `${signHeight}em`,
};
// Without WebGL, the SOS marker sign stands in for the phone, left of the
// signpost.
const fallbackPhone = {
  left: "56%",
  bottom: "12rem",
  width: "clamp(3.5rem, 8vw, 6rem)",
};
const fills = { white: "#ffffff", green: "var(--sign)", blue: LAYBY_BLUE, yellow: ROUTE_YELLOW };


// The projects page backdrop: a construction site rendered with the same
// three.js setup as the home page's road scene (see yard/world.ts). It sits
// fixed behind the page. Beside the signpost, a battered emergency phone
// dials the CV, LinkedIn and GitHub (see PhoneDial). Before the engine
// starts, or without WebGL, a sky-to-dirt gradient stands in.
export default function YardScene() {
  const [destination, setDestination] = useState<string | null>(null);
  const engineRef = useRef<YardEngine | null>(null);
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
    const engine = createYardEngine(
      { container, stage, camera, sign, phone: phoneButton },
      {
        dark: scheme.matches,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        sign: { font: signFont.style.fontFamily, layout: signpost },
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

  function leave(event: MouseEvent<HTMLAnchorElement>, href: string, lateral: number) {
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (modified || event.button !== 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Fade to black, then on to the next page (see LoadingScreen).
    if (destination) return event.preventDefault();
    if (!fadeToPage(href)) return;
    event.preventDefault();
    engineRef.current?.leave(lateral);
    setDestination(href);
  }

  const hint = (lateral: number | null) => engineRef.current?.hint(lateral);

  return (
    <>
      <div
        ref={containerRef}
        className="yard-scene pointer-events-none fixed inset-0 overflow-hidden bg-linear-to-b from-[#4f8fcf] via-[#f2dfbf] via-55% to-[#9a7652] dark:from-[#1c1f4d] dark:via-[#f08a5d] dark:to-[#4a3828]"
      >
        <div ref={stageRef} aria-hidden className="absolute inset-0" />
        {/* A scrim keeps the footer legible over the dirt. It stays put
            whether the footer is up or not, so the page looks the same. */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-background/75 to-transparent" />

        <div className="absolute inset-0 overflow-hidden">
          <div ref={cameraRef} className="absolute top-0 left-0 h-full w-full transform-3d">
            {/* The transparent padding keeps the panels' edges inside the
                element, so the browser antialiases them (see RoadScene). */}
            <div ref={signRef} className="pointer-events-auto absolute p-[0.4em]" style={fallbackSign}>
              <nav aria-label="Destinations" className={`${signFont.className} relative h-full w-full`}>
                {signpost.panels.map(({ item, art, left, top, tilt = 0 }) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={(event) => leave(event, item.href, item.lateral)}
                    onPointerEnter={() => hint(item.lateral)}
                    onPointerLeave={() => hint(null)}
                    onFocus={() => hint(item.lateral)}
                    onBlur={() => hint(null)}
                    data-active={destination === item.href || undefined}
                    style={{
                      left: `${(left - signpost.left) / SW}em`,
                      top: `${(signpost.top - top) / SW}em`,
                      width: `${art.width}em`,
                      height: `${art.height}em`,
                      // Matches the panel's lean in the scene (CSS turns
                      // the other way, with y pointing down).
                      transform: `rotate(${-tilt}rad)`,
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

        <PhoneButton {...phone.button} fallback={fallbackPhone} />
      </div>

      <PhoneDial {...phone.dial} />
    </>
  );
}
