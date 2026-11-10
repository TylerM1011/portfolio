"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type CSSProperties } from "react";
import { preloadAssets } from "@/lib/assets";
import { connectScreen, holdScreen } from "@/lib/loading";
import { site } from "@/lib/site";
import { signFont } from "./road/font";

// How long the screen takes to go black when leaving a page, and to clear.
const FADE_IN_MS = 500;
const LIFT_MS = 700;
// The black covers every load, but the wheel only shows once a load is
// taking longer than expected: after this long, it fades in.
const WHEEL_DELAY_MS = 1000;
const WHEEL_FADE_MS = 300;
// Kept a little dim against the black.
const WHEEL_OPACITY = 0.75;

const SPOKES = [0, 72, 144, 216, 288];

// The screen's layout is inline, not in globals.css, so it covers the first
// paint and hides again even if the stylesheet is late or stale. The wheel's
// spin and entrance are inline too, for the same reason.
const screenStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200,
  display: "grid",
  placeItems: "center",
  background: "#000",
};

let navigate: ((href: string, fadeMs: number) => void) | null = null;

// Fades to the loading screen, navigates once it is black, and keeps it up
// until the next page is in (and its scene, if it has one, is drawn).
// Returns false if the screen isn't mounted, so the caller can let the link
// navigate as usual.
export function fadeToPage(href: string, fadeMs = FADE_IN_MS) {
  if (!navigate) return false;
  navigate(href, fadeMs);
  return true;
}

// Mounted once in the root layout, so it stays on screen across route
// changes. On the first load it fetches everything the site uses (every
// page's code, the scenes' models and textures, the sign font) and stays up
// until all of it is in, so moving between pages never waits on the network.
// See lib/loading.ts for what else holds it.
export default function LoadingScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<SVGSVGElement>(null);
  const leaving = useRef<(() => void) | null>(null);

  // The first load (taken before the screen connects, so it can't lift
  // in between): holds the screen until everything is in.
  useEffect(() => {
    const release = holdScreen();
    for (const item of site.nav) router.prefetch(item.href);
    void Promise.all([
      preloadAssets(),
      document.fonts.load(`1em ${signFont.style.fontFamily}`).catch(() => {}),
      document.fonts.ready,
    ]).then(release);
    return release;
    // Only ever once: the root layout lives for the whole visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = ref.current;
    const wheel = wheelRef.current;
    if (!el || !wheel) return;

    let frame = 0;
    let done = 0;
    let reveal = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      clearTimeout(done);
      clearTimeout(reveal);
    };
    const disconnect = connectScreen({
      cover(fadeMs) {
        stop();
        el.style.display = "grid";
        el.style.pointerEvents = "auto";
        el.dataset.state = "covered";
        if (fadeMs > 0) {
          el.style.transition = "none";
          el.style.opacity = "0";
          void el.offsetWidth;
        }
        el.style.transition = `opacity ${fadeMs}ms ease-in-out`;
        el.style.opacity = "1";
        // Wheel out of sight, and in again only if this drags on.
        wheel.style.transition = "none";
        wheel.style.opacity = "0";
        reveal = window.setTimeout(() => {
          wheel.style.transition = `opacity ${WHEEL_FADE_MS}ms ease-out`;
          wheel.style.opacity = String(WHEEL_OPACITY);
        }, WHEEL_DELAY_MS);
      },
      lift() {
        stop();
        // A frame for the page to settle on screen, then fade.
        frame = requestAnimationFrame(() => {
          el.dataset.state = "lifting";
          el.style.pointerEvents = "none";
          el.style.transition = `opacity ${LIFT_MS}ms ease-in-out`;
          el.style.opacity = "0";
          done = window.setTimeout(() => {
            el.dataset.state = "hidden";
            el.style.display = "none";
          }, LIFT_MS);
        });
      },
    });

    navigate = (href, fadeMs) => {
      if (leaving.current) return;
      leaving.current = holdScreen({ fadeMs });
      setTimeout(() => router.push(href), fadeMs);
    };

    return () => {
      navigate = null;
      disconnect();
      stop();
    };
  }, [router]);

  // The pathname changes once the next page has committed, and its scene
  // (if any) has taken its own hold. Give it a couple of frames to paint,
  // then let go of ours.
  useEffect(() => {
    const release = leaving.current;
    if (!release) return;
    leaving.current = null;
    requestAnimationFrame(() => requestAnimationFrame(release));
  }, [pathname]);

  return (
    <div ref={ref} data-state="covered" className="loading-screen" style={screenStyle} role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <svg ref={wheelRef} aria-hidden viewBox="-50 -50 100 100" className="loading-wheel" width="72" height="72">
        <g opacity="0">
          {/* The spin, and the first load's late entrance, are part of the
              drawing (SMIL), not the stylesheet, so they run from the very
              first paint, before any script or CSS. Later loads bring the
              wheel in from script (see cover above). */}
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0" to={WHEEL_OPACITY} begin={`${WHEEL_DELAY_MS}ms`} dur={`${WHEEL_FADE_MS}ms`} fill="freeze" />
          {/* Tyre, with its tread around the edge. */}
          <circle r="45" fill="#1b1b1d" />
          <circle r="46" fill="none" stroke="#2c2c30" strokeWidth="4" strokeDasharray="4.2 3" />
          <circle r="37.5" fill="none" stroke="#2a2a2e" strokeWidth="1.5" />
          {/* Alloy rim: the barrel, the gaps between the spokes, the spokes. */}
          <circle r="33" fill="#9ea3aa" />
          <circle r="30" fill="#0c0c0d" />
          {SPOKES.map((angle) => (
            <path key={angle} d="M-4.5 -6 L-7 -30.5 L7 -30.5 L4.5 -6 Z" fill="#c7ccd2" transform={`rotate(${angle})`} />
          ))}
          {/* Hub, wheel nuts and centre cap. */}
          <circle r="10" fill="#d9dde2" />
          {SPOKES.map((angle) => (
            <circle key={angle} cx="0" cy="-6" r="1.6" fill="#6f747b" transform={`rotate(${angle + 36})`} />
          ))}
          <circle r="3.4" fill="#8b9097" />
        </g>
      </svg>
    </div>
  );
}
