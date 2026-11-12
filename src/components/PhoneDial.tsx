"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { site } from "@/lib/site";

// What each number on the emergency phone's dial reaches. The directory
// card beside the dial (and the card inside the phone's door, in
// layby/world.ts) lists the same.
const LINES = [
  { digit: 0, name: "CV", detail: "My CV, as a PDF", href: site.cv },
  { digit: 1, name: "LinkedIn", detail: "Connect with me", href: site.linkedin },
  { digit: 2, name: "GitHub", detail: "See what I'm building", href: site.github },
] as const;
const lineFor = (digit: number) => LINES.find((line) => line.digit === digit);

// A rotary dial, in degrees clockwise from twelve o'clock. The finger stop
// sits at about four o'clock; 1 is the first hole above it and the rest run
// round anticlockwise, 30° apart, ending with 0 at the bottom. Dialling a
// number turns the wheel clockwise until the finger meets the stop, so 1
// travels least and 0 most.
const STOP = 132;
const FIRST = 52;
const SPACING = 30;
// The finger, in the hole, meets the stop a little short of it.
const SHORT = 14;
const HOLE_RING = 106;
const HOLE = 21;
const WHEEL = 140;
const HUB = 62;
// The wheel goes round under the finger, then the spring brings it back at
// the governor's steady pace. In degrees a second.
const TURN_SPEED = 520;
const RETURN_SPEED = 380;

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
const step = (digit: number) => (digit === 0 ? 10 : digit) - 1;
const holeAngle = (digit: number) => STOP - FIRST - step(digit) * SPACING;
const travel = (digit: number) => FIRST - SHORT + step(digit) * SPACING;
const at = (angle: number, radius: number) => {
  const a = (angle * Math.PI) / 180;
  return { x: radius * Math.sin(a), y: -radius * Math.cos(a) };
};

// The finger plate: a ring with the ten holes cut out of it.
const circle = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const wheelPath = [
  circle(0, 0, WHEEL),
  circle(0, 0, HUB),
  ...DIGITS.map((digit) => {
    const { x, y } = at(holeAngle(digit), HOLE_RING);
    return circle(x, y, HOLE);
  }),
].join("");

const GREETING = "Put a finger in a hole and dial.";

type Props = {
  open: boolean;
  // Where the phone is on screen, for the dial to grow out of.
  origin: { x: number; y: number } | null;
  onClose: () => void;
  // A number was dialled (whether or not it goes anywhere).
  onDial: () => void;
};

// The emergency phone's dial, brought up when the phone on the contact page
// is picked up (see LaybyScene): 0 for the CV, 1 for LinkedIn, 2 for GitHub,
// each opened in a new tab once the wheel reaches the stop. Each wired hole
// is a real link, so it still works without the animation; the number keys
// dial too, and Escape hangs up.
export default function PhoneDial({ open, origin, onClose, onDial }: Props) {
  const wheelRef = useRef<SVGGElement>(null);
  const firstRef = useRef<HTMLAnchorElement>(null);
  const busy = useRef(false);
  const frame = useRef(0);
  const [status, setStatus] = useState(GREETING);
  const [dialling, setDialling] = useState<number | null>(null);

  function turnTo(from: number, to: number, speed: number) {
    return new Promise<void>((resolve) => {
      const wheel = wheelRef.current;
      const duration = (Math.abs(to - from) / speed) * 1000;
      if (!wheel || duration === 0) return resolve();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        // The finger eases in and pulls up against the stop; the spring
        // returns at an even pace.
        const eased = to > from ? 1 - (1 - t) * (1 - t) * (1 - t) * 0.6 - (1 - t) * 0.4 : t;
        wheel.setAttribute("transform", `rotate(${from + (to - from) * eased})`);
        if (t < 1) frame.current = requestAnimationFrame(tick);
        else resolve();
      };
      frame.current = requestAnimationFrame(tick);
    });
  }

  async function dial(digit: number) {
    if (busy.current) return;
    busy.current = true;
    setDialling(digit);
    onDial();
    const line = lineFor(digit);
    setStatus(line ? `Dialling ${digit}… connecting you to ${line.name}.` : `Dialling ${digit}…`);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const angle = travel(digit);
    if (!still) await turnTo(0, angle, TURN_SPEED);

    // At the stop, the call goes through. Opened here, well inside the
    // click's grace period, so pop-up blockers let it by; if one doesn't,
    // the page itself goes there.
    if (line) {
      const tab = window.open(line.href, "_blank");
      if (tab) tab.opener = null;
      else window.location.assign(line.href);
      setStatus(`${line.name} opened in a new tab. Dial again, or hang up.`);
    } else {
      setStatus(`The number you have dialled has not been recognised. Try 0, 1 or 2.`);
    }

    if (!still) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      await turnTo(angle, 0, RETURN_SPEED);
    }
    busy.current = false;
    setDialling(null);
  }

  function dialLink(event: MouseEvent<HTMLAnchorElement>, digit: number) {
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (modified || event.button !== 0) return;
    event.preventDefault();
    void dial(digit);
  }

  // While the dial is up: focus goes to it, the number keys dial and
  // Escape hangs up.
  useEffect(() => {
    if (!open) return;
    const focus = window.setTimeout(() => firstRef.current?.focus({ preventScroll: true }), 50);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (/^[0-9]$/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        void dial(Number(event.key));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focus);
      window.removeEventListener("keydown", onKey);
    };
    // `dial` only reads refs and sets state, so the first one will do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Grows out of the phone, after the camera has started to push in.
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
      aria-label="Emergency phone"
      inert={!open}
      data-open={open || undefined}
      className="phone-dial group/dial fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4"
    >
      {/* Clicking off the phone hangs up. */}
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/35 opacity-0 backdrop-blur-[3px] transition-opacity duration-500 group-data-open/dial:opacity-100 group-data-open/dial:delay-200"
      />

      <div
        style={from}
        className="phone-dial-panel relative flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8"
      >
        {/* The phone's housing, round the dial. */}
        <div className="relative rounded-[2.25rem] bg-[#ec7a1c] p-3 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6),inset_0_-6px_0_rgba(0,0,0,0.18)] sm:p-4">
          <div className="rounded-[1.75rem] bg-[#1e2024] p-3 shadow-[inset_0_4px_12px_rgba(0,0,0,0.6)] sm:p-4">
            <svg
              viewBox="-160 -160 320 320"
              className="block w-[min(76vw,44vh,21rem)] touch-manipulation select-none"
              role="group"
              aria-label="Rotary dial"
            >
              <defs>
                <radialGradient id="dial-plate" cx="0.4" cy="0.35" r="0.8">
                  <stop offset="0" stopColor="#3a3c40" />
                  <stop offset="1" stopColor="#141518" />
                </radialGradient>
                <linearGradient id="dial-chrome" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#fbfbf9" />
                  <stop offset="0.45" stopColor="#c9ccd0" />
                  <stop offset="0.55" stopColor="#b3b7bc" />
                  <stop offset="1" stopColor="#eceeef" />
                </linearGradient>
              </defs>

              {/* The number ring, under the wheel, showing through the
                  holes. The wired numbers are yellow. */}
              <circle r="154" fill="url(#dial-plate)" stroke="#0b0b0c" strokeWidth="3" />
              {DIGITS.map((digit) => {
                const { x, y } = at(holeAngle(digit), HOLE_RING);
                const wired = !!lineFor(digit);
                return (
                  <g key={digit} aria-hidden>
                    <circle cx={x} cy={y} r={HOLE - 2} fill={wired ? "#f2b417" : "#f6f3ea"} />
                    <text
                      x={x}
                      y={y}
                      dy="0.36em"
                      textAnchor="middle"
                      fontSize="22"
                      fontWeight="800"
                      fill="#151515"
                      className="font-sans"
                    >
                      {digit}
                    </text>
                  </g>
                );
              })}

              {/* The finger plate, which turns. Each hole is its own
                  target: a link for the wired numbers, a dead line for
                  the rest. */}
              <g ref={wheelRef}>
                <path
                  d={wheelPath}
                  fillRule="evenodd"
                  fill="url(#dial-chrome)"
                  stroke="#6f7378"
                  strokeWidth="2"
                  style={{ filter: "drop-shadow(0 4px 4px rgba(0,0,0,0.45))" }}
                />
                {DIGITS.map((digit) => {
                  const { x, y } = at(holeAngle(digit), HOLE_RING);
                  const line = lineFor(digit);
                  const hole = (
                    <>
                      <circle cx={x} cy={y} r={HOLE} fill="transparent" />
                      <circle cx={x} cy={y} r={HOLE + 3} fill="none" strokeWidth="4" className="dial-ring" />
                    </>
                  );
                  return line ? (
                    <a
                      key={digit}
                      ref={digit === 0 ? firstRef : undefined}
                      href={line.href}
                      target="_blank"
                      rel="noopener"
                      aria-label={`Dial ${digit}: ${line.name}`}
                      onClick={(event) => dialLink(event, digit)}
                      data-active={dialling === digit || undefined}
                      className="dial-hole cursor-pointer outline-none"
                    >
                      {hole}
                    </a>
                  ) : (
                    <g key={digit} aria-hidden onClick={() => void dial(digit)} className="dial-hole cursor-pointer">
                      {hole}
                    </g>
                  );
                })}
              </g>

              {/* The finger stop, over the wheel at four o'clock. */}
              <g transform={`rotate(${STOP})`} aria-hidden>
                <path d="M-7 -158h14l-3 44h-8z" fill="#d9dbde" stroke="#5d6166" strokeWidth="2" strokeLinejoin="round" />
              </g>

              {/* The hub, which stays put. */}
              <g aria-hidden>
                <circle r={HUB - 6} fill="#f6f3ea" stroke="#151515" strokeWidth="2" />
                <text y="-8" textAnchor="middle" fontSize="26" fontWeight="800" fill="#d4312a" className="font-sans">
                  SOS
                </text>
                <text y="18" textAnchor="middle" fontSize="11" fontWeight="700" letterSpacing="1.5" fill="#151515" className="font-sans">
                  LAY-BY T1
                </text>
              </g>
            </svg>
          </div>
        </div>

        {/* The directory card: which number goes where. */}
        <div className="w-[min(76vw,18rem)] rotate-[-1.5deg] rounded-md bg-[#f6f3ea] p-5 text-[#151515] shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)] sm:w-64">
          <p className="border-b-[3px] border-[#151515] pb-2 text-sm font-extrabold tracking-[0.2em] uppercase">Dial</p>
          <ul className="mt-3 space-y-2.5">
            {LINES.map((line) => (
              <li
                key={line.digit}
                data-active={dialling === line.digit || undefined}
                className="flex items-center gap-3 rounded-md transition-colors data-active:bg-[#f2b417]/35"
              >
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f2b417] text-lg font-extrabold ring-2 ring-[#151515]"
                >
                  {line.digit}
                </span>
                <span>
                  <span className="block font-bold">
                    <span className="sr-only">{line.digit}: </span>
                    {line.name}
                  </span>
                  <span className="block text-xs text-[#151515]/65">{line.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p aria-live="polite" className="mt-4 min-h-[2.5em] text-xs leading-snug text-[#151515]/75">
            {status}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full rounded-full bg-[#151515] px-4 py-2 text-sm font-semibold text-[#f6f3ea] transition-colors hover:bg-[#d4312a] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#ffd200]"
          >
            Hang up <span className="font-normal opacity-60">(Esc)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
