"use client";

import { useCallback, useRef, useState, type CSSProperties, type RefObject } from "react";

// What a scene's engine does with its emergency phone (see road/phone.ts).
export type PhoneControls = {
  hoverPhone: (on: boolean) => void;
  openDial: (on: boolean) => void;
  callPhone: () => void;
};

// The state shared by a scene's phone button and its dial (PhoneDial): the
// button picks the phone up, the dial hangs it up again, and both tell the
// engine, if there is one.
export function useEmergencyPhone(engine: RefObject<PhoneControls | null>) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  const pickUp = useCallback(() => {
    const box = ref.current?.getBoundingClientRect();
    if (box) setOrigin({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    setOpen(true);
    engine.current?.openDial(true);
  }, [engine]);
  const hangUp = useCallback(() => {
    setOpen(false);
    engine.current?.openDial(false);
    ref.current?.focus({ preventScroll: true });
  }, [engine]);
  const dialled = useCallback(() => engine.current?.callPhone(), [engine]);
  const hover = useCallback((on: boolean) => engine.current?.hoverPhone(on), [engine]);
  // For when the scene goes away.
  const reset = useCallback(() => setOpen(false), []);

  return {
    ref,
    reset,
    button: { ref, open, onPickUp: pickUp, onHover: hover },
    dial: { open, origin, onClose: hangUp, onDial: dialled },
  };
}

type ButtonProps = {
  ref: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onPickUp: () => void;
  onHover: (on: boolean) => void;
  // Where it stands before the engine starts, or without WebGL.
  fallback: CSSProperties;
};

// The button over the phone. The engine keeps it fitted over the phone on
// screen, showing only its focus ring (see road/phone.ts); before then, or
// without WebGL, a flat drawing of the phone box stands in.
export function PhoneButton({ ref, open, onPickUp, onHover, fallback }: ButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Emergency phone: dial for my CV, LinkedIn or GitHub"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onPickUp}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      style={{ aspectRatio: "70 / 150", ...fallback }}
      className="emergency-phone pointer-events-auto absolute cursor-pointer rounded-md focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#ffd200]"
    >
      <svg aria-hidden viewBox="0 0 70 150" className="absolute inset-0 h-full w-full">
        <rect x="31" y="58" width="8" height="86" fill="#8f949a" />
        <rect x="22" y="142" width="26" height="8" fill="#a9a59c" />
        <rect x="4" y="0" width="62" height="7" rx="1" fill="#c9661a" />
        <rect x="8" y="6" width="54" height="60" rx="2" fill="#ec7a1c" />
        <rect x="15" y="12" width="40" height="13" rx="2" fill="#f7f4ec" />
        <text x="35" y="22.5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#151515">
          SOS
        </text>
        <rect x="13" y="34" width="3" height="10" fill="#2b2b2b" />
      </svg>
    </button>
  );
}
