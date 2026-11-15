"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from "react";
import { holdScreen, SCENE_PENDING } from "@/lib/loading";
import { createAboutEngine, type AboutEngine, type Focus, type Spot } from "./about/engine";
import Clipboard from "./Clipboard";
import { fadeToPage } from "./LoadingScreen";
import PhoneDial from "./PhoneDial";
import TvBio from "./TvBio";

// Before the engine starts, or without WebGL, flat drawings of each thing
// stand in for it: the door in the middle and the car to the right, then
// inside, the telly at the
// top with the poster beside it, the clipboard on the coffee table below
// it, the keys on the mantelpiece to the left and the phone on the side
// table low on the right.
const fallback: Record<Spot, CSSProperties> = {
  car: { right: "2%", bottom: "16%", width: "clamp(6rem, 16vw, 10rem)", aspectRatio: "2 / 1" },
  door: { left: "50%", bottom: "14%", width: "clamp(5rem, 13vw, 8rem)", transform: "translateX(-50%)", aspectRatio: "4 / 7" },
  tv: { left: "50%", top: "16%", width: "clamp(9rem, 30vw, 16rem)", transform: "translateX(-50%)", aspectRatio: "4 / 3" },
  phone: { right: "26%", bottom: "16%", width: "clamp(5rem, 12vw, 7rem)", aspectRatio: "1" },
  keys: { left: "12%", bottom: "36%", width: "clamp(4rem, 9vw, 5.5rem)", aspectRatio: "1" },
  clipboard: { left: "50%", bottom: "30%", width: "clamp(4rem, 9vw, 5.5rem)", transform: "translateX(-50%)", aspectRatio: "3 / 4" },
  poster: { left: "18%", top: "8%", width: "clamp(4rem, 10vw, 6rem)", aspectRatio: "3 / 4" },
};

// The poster's link home fades out as the signs' links do (see
// LoadingScreen), unless it's opened in a new tab or motion is reduced.
function goHome(event: MouseEvent<HTMLAnchorElement>) {
  const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  if (modified || event.button !== 0) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (fadeToPage("/")) event.preventDefault();
}

// A link home over one of the things in the scene (the car outside, the
// poster inside), fitted to it like the buttons are.
function SpotLink({ ref, spot, label, hidden, onHover, children }: Omit<SpotProps, "ref" | "expanded" | "onPick"> & { ref: RefObject<HTMLAnchorElement | null> }) {
  return (
    <Link
      ref={ref}
      href="/"
      onClick={goHome}
      aria-label={label}
      hidden={hidden}
      onPointerEnter={() => onHover(spot)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(spot)}
      onBlur={() => onHover(null)}
      style={fallback[spot]}
      className="about-spot pointer-events-auto absolute cursor-pointer rounded-md focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#ffd200]"
    >
      {children}
    </Link>
  );
}

type SpotProps = {
  ref: RefObject<HTMLButtonElement | null>;
  spot: Spot;
  label: string;
  hidden: boolean;
  expanded?: boolean;
  onPick: () => void;
  onHover: (spot: Spot | null) => void;
  children: ReactNode;
};

// A button over one of the things to click. The engine keeps it fitted
// over the thing on screen, showing only its focus ring (see globals.css).
function SpotButton({ ref, spot, label, hidden, expanded, onPick, onHover, children }: SpotProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-haspopup={expanded === undefined ? undefined : "dialog"}
      aria-expanded={expanded}
      hidden={hidden}
      onClick={onPick}
      onPointerEnter={() => onHover(spot)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(spot)}
      onBlur={() => onHover(null)}
      style={fallback[spot]}
      className="about-spot pointer-events-auto absolute cursor-pointer rounded-md focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#ffd200]"
    >
      {children}
    </button>
  );
}

// The about page: the front of a Victorian terrace, its door ajar (see
// about/world.ts). Through the door is the front room, where the telly
// reads out a bio (TvBio), the landline on the side table dials the CV,
// LinkedIn and GitHub (PhoneDial, as a house phone), the clipboard on the
// coffee table holds the projects' blueprints (Clipboard), and the car keys
// take the visitor back out to the street, where the parked car is the way
// home. The road poster over the telly is a shortcut home as well.
export default function AboutScene() {
  const [inside, setInside] = useState(false);
  const [open, setOpen] = useState<Focus | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const engineRef = useRef<AboutEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const doorRef = useRef<HTMLButtonElement>(null);
  const tvRef = useRef<HTMLButtonElement>(null);
  const phoneRef = useRef<HTMLButtonElement>(null);
  const keysRef = useRef<HTMLButtonElement>(null);
  const clipboardRef = useRef<HTMLButtonElement>(null);
  const posterRef = useRef<HTMLAnchorElement>(null);
  const carRef = useRef<HTMLAnchorElement>(null);
  // On the way in or out through the door: nothing can be picked until the
  // camera gets there.
  const [walking, setWalking] = useState(false);
  const spotRefs: Record<Focus, RefObject<HTMLButtonElement | null>> = { tv: tvRef, phone: phoneRef, clipboard: clipboardRef };

  // Next.js keeps this page alive (hidden) after navigating away, which runs
  // this cleanup; the engine is rebuilt, back outside, when the visitor
  // returns.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const stage = stageRef.current;
    const door = doorRef.current;
    const tv = tvRef.current;
    const phone = phoneRef.current;
    const keys = keysRef.current;
    const clipboard = clipboardRef.current;
    const poster = posterRef.current;
    const car = carRef.current;
    if (!container || !stage || !door || !tv || !phone || !keys || !clipboard || !poster || !car) return;

    // The loading screen stays up until the scene's first frame is drawn
    // (see lib/loading.ts).
    const release = holdScreen();
    container.removeAttribute(SCENE_PENDING);
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const engine = createAboutEngine(
      { container, stage, spots: { door, car, tv, phone, keys, clipboard, poster } },
      {
        dark: scheme.matches,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        onReady: release,
        onInside: () => {
          setWalking(false);
          setInside(true);
        },
        onOutside: () => setWalking(false),
      },
    );
    if (!engine) {
      // No WebGL: the drawings are all there is.
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
      setInside(false);
      setWalking(false);
      setOpen(null);
    };
  }, []);

  function enter() {
    const engine = engineRef.current;
    if (!engine) return setInside(true);
    if (engine.enter()) setWalking(true);
    // Out of the way while the camera walks in; focus moves to the room
    // once there (see below).
    doorRef.current?.blur();
  }

  // The car keys: back out of the front door to the street, where the car
  // is. The room's things are put away while the camera walks out, and
  // focus comes back to the door once there.
  function leave() {
    const engine = engineRef.current;
    if (!engine) return setInside(false);
    if (!engine.leave()) return;
    keysRef.current?.blur();
    setWalking(true);
    setInside(false);
  }

  // Once inside, keyboard focus goes to the telly; once back out in the
  // street, to the front door.
  const arrived = useRef(false);
  useLayoutEffect(() => {
    if (inside && !arrived.current) tvRef.current?.focus({ preventScroll: true });
    arrived.current = inside;
  }, [inside]);
  const leaving = useRef(false);
  useLayoutEffect(() => {
    if (walking && !inside) leaving.current = true;
    else if (leaving.current && !walking) {
      leaving.current = false;
      doorRef.current?.focus({ preventScroll: true });
    }
  }, [walking, inside]);

  function pick(spot: Focus) {
    const box = spotRefs[spot].current?.getBoundingClientRect();
    if (box) setOrigin({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    setOpen(spot);
    engineRef.current?.focus(spot);
  }

  const close = useCallback(() => {
    setOpen((current) => {
      if (current) spotRefs[current].current?.focus({ preventScroll: true });
      return null;
    });
    engineRef.current?.focus(null);
    // The refs never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dialled = useCallback(() => engineRef.current?.call(), []);
  const hover = (spot: Spot | null) => engineRef.current?.hover(spot);

  return (
    <>
      <div
        ref={containerRef}
        // Until the scene mounts (see SCENE_PENDING).
        data-scene-pending=""
        className="about-scene pointer-events-none fixed inset-0 overflow-hidden bg-linear-to-b from-(--sky-top) via-(--sky-horizon) via-60% to-[#9c4a36]"
      >
        <div ref={stageRef} aria-hidden className="absolute inset-0" />

        <SpotButton ref={doorRef} spot="door" label="The front door is open: come in" hidden={inside || walking} onPick={enter} onHover={hover}>
          <svg aria-hidden viewBox="0 0 40 70" className="absolute inset-0 h-full w-full">
            <rect x="0" y="0" width="40" height="70" fill="#f2efe6" />
            <rect x="3" y="3" width="34" height="12" fill="#1d2430" />
            <text x="20" y="12.5" textAnchor="middle" fontSize="8" fontStyle="italic" fill="#e3b955">
              11
            </text>
            <rect x="3" y="17" width="34" height="53" fill="#ffd9a0" />
            <path d="M3 17h28l-6 3v47l6 3H3z" fill="#c25a1c" />
            <rect x="9" y="40" width="12" height="2.5" fill="#c9a14a" />
          </svg>
        </SpotButton>

        {/* The car parked in the street: back on the road. */}
        <SpotLink ref={carRef} spot="car" label="The car: back on the road to the home page" hidden={inside || walking} onHover={hover}>
          <svg aria-hidden viewBox="0 0 100 50" className="absolute inset-0 h-full w-full">
            <path d="M8 36V26l10-3 12-12h34l14 12 14 3v10z" fill="#d8322b" />
            <path d="M33 14h14v10H23z M51 14h12l10 10H51z" fill="#bfe0f0" />
            <circle cx="26" cy="38" r="7" fill="#1d1d20" />
            <circle cx="76" cy="38" r="7" fill="#1d1d20" />
          </svg>
        </SpotLink>

        <SpotButton ref={tvRef} spot="tv" label="The telly says READ ME: turn it on" hidden={!inside} expanded={open === "tv"} onPick={() => pick("tv")} onHover={hover}>
          <svg aria-hidden viewBox="0 0 120 90" className="absolute inset-0 h-full w-full">
            <rect width="120" height="90" rx="10" fill="#2b2c30" />
            <rect x="8" y="8" width="88" height="66" rx="8" fill="#050505" />
            <rect x="8" y="28" width="88" height="24" fill="#1a2fd0" />
            <text x="52" y="45" textAnchor="middle" fontSize="13" fontWeight="800" fill="#ffff3a" className="font-mono">
              READ ME
            </text>
          </svg>
        </SpotButton>

        <SpotButton
          ref={clipboardRef}
          spot="clipboard"
          label="A clipboard of blueprints: my projects"
          hidden={!inside}
          expanded={open === "clipboard"}
          onPick={() => pick("clipboard")}
          onHover={hover}
        >
          <svg aria-hidden viewBox="0 0 60 80" className="absolute inset-0 h-full w-full">
            <rect x="2" y="6" width="56" height="72" rx="5" fill="#9a6a3e" />
            <rect x="7" y="14" width="46" height="60" fill="#2b6199" />
            <path d="M13 24h34v26H13z M30 24v12 M13 38h10" fill="none" stroke="#eef1ea" strokeWidth="1.5" />
            <path d="M30 58h17v12H30z" fill="none" stroke="#eef1ea" strokeWidth="1.2" />
            <rect x="18" y="3" width="24" height="12" rx="3" fill="#b9bec4" />
          </svg>
        </SpotButton>

        <SpotButton
          ref={phoneRef}
          spot="phone"
          label="The landline: dial for my CV, LinkedIn or GitHub"
          hidden={!inside}
          expanded={open === "phone"}
          onPick={() => pick("phone")}
          onHover={hover}
        >
          <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
            <path d="M14 86l10-46h52l10 46z" fill="#e9e0c8" />
            <rect x="8" y="22" width="84" height="16" rx="8" fill="#e9e0c8" stroke="#b9ad90" strokeWidth="2" />
            <circle cx="50" cy="64" r="16" fill="#d6cbb0" stroke="#b9ad90" strokeWidth="2" />
            <circle cx="50" cy="64" r="6" fill="#fbf8f0" />
          </svg>
          {/* Ring marks either side while it rings (see globals.css). */}
          <span aria-hidden className="phone-ring">
            <svg viewBox="0 0 170 100" fill="none" stroke="#f7f4ec" strokeWidth="5" strokeLinecap="round">
              <path className="phone-ring-arc" d="M31.3 19 A62 62 0 0 0 31.3 81 M138.7 19 A62 62 0 0 1 138.7 81" />
              <path className="phone-ring-arc phone-ring-arc-outer" d="M19.2 12 A76 76 0 0 0 19.2 88 M150.8 12 A76 76 0 0 1 150.8 88" />
            </svg>
          </span>
        </SpotButton>

        <SpotButton
          ref={keysRef}
          spot="keys"
          label="The car keys: head back outside"
          hidden={!inside}
          onPick={leave}
          onHover={hover}
        >
          <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" fill="none" strokeWidth="5" strokeLinecap="round">
            <circle cx="34" cy="38" r="14" stroke="#b8bcc2" />
            <path d="M46 46l30 26M62 60l6-6M70 67l6-6" stroke="#c9a14a" />
            <rect x="12" y="56" width="20" height="30" rx="7" fill="#1d1d20" stroke="none" />
          </svg>
          {/* While they jingle (see globals.css): marks either side that
              shake outward with each jingle, and glints twinkling round the
              bunch. */}
          <span aria-hidden className="phone-ring key-jingle">
            <svg viewBox="0 0 170 100" fill="none" stroke="#f7f4ec" strokeWidth="6" strokeLinecap="round">
              <path className="phone-ring-arc key-jingle-left" d="M30 30l-12-8M26 50h-15M30 70l-12 8" />
              <path className="phone-ring-arc key-jingle-right" d="M140 30l12-8M144 50h15M140 70l12 8" />
              <g fill="#fff6d8" stroke="none">
                <path className="key-glint" d="M58 14l2.5 7.5 7.5 2.5-7.5 2.5-2.5 7.5-2.5-7.5-7.5-2.5 7.5-2.5z" />
                <path className="key-glint key-glint-2" d="M116 40l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
                <path className="key-glint key-glint-3" d="M66 74l1.8 5.2 5.2 1.8-5.2 1.8-1.8 5.2-1.8-5.2-5.2-1.8 5.2-1.8z" />
              </g>
            </svg>
          </span>
        </SpotButton>

        {/* The poster over the telly: the open road, the way home. */}
        <SpotLink ref={posterRef} spot="poster" label="The road poster: back to the home page" hidden={!inside} onHover={hover}>
          <svg aria-hidden viewBox="0 0 60 80" className="absolute inset-0 h-full w-full">
            <rect width="60" height="80" rx="2" fill="#7a4e2f" />
            <rect x="4" y="4" width="52" height="72" fill="#a8774a" />
            <rect x="5" y="5" width="50" height="70" fill="#8fb4cf" />
            <path d="M5 44h50v31H5z" fill="#6f8f4a" />
            <path d="M24 44h12l13 31H11z" fill="#3a3a3f" />
            <path d="M30 47v4M30 55v5M30 63v4M30 70v5" stroke="#f2efe6" strokeWidth="1.5" />
            <rect x="18" y="26" width="24" height="11" fill="#00703c" stroke="#fff" strokeWidth="0.8" />
            <text x="30" y="33.8" textAnchor="middle" fontSize="6" fontWeight="800" fill="#fff" className="font-sans">
              HOME
            </text>
          </svg>
        </SpotLink>
      </div>

      <TvBio open={open === "tv"} origin={origin} onClose={close} />
      <PhoneDial variant="home" open={open === "phone"} origin={origin} onClose={close} onDial={dialled} />
      <Clipboard open={open === "clipboard"} origin={origin} onClose={close} />
    </>
  );
}
