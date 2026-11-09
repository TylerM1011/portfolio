"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// How long the screen takes to go black, and to clear again on the new page.
const FADE_IN_MS = 500;
const FADE_OUT_MS = 700;

let fadeTo: ((href: string) => void) | null = null;

// Fades the screen to black, navigates once it is fully black, and fades
// back in when the next page has rendered. Returns false if the overlay
// isn't mounted, so the caller can let the link navigate as usual.
export function fadeToPage(href: string) {
  if (!fadeTo) return false;
  fadeTo(href);
  return true;
}

// Mounted once in the root layout, so it stays on screen across the route
// change while the old page is torn down and the new one comes in.
export default function PageFade() {
  const router = useRouter();
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    fadeTo = (href) => {
      const el = ref.current;
      if (!el || pending.current) return;
      pending.current = href;
      el.style.transitionDuration = `${FADE_IN_MS}ms`;
      el.style.pointerEvents = "auto";
      el.style.opacity = "1";
      setTimeout(() => router.push(href), FADE_IN_MS);
    };
    return () => {
      fadeTo = null;
    };
  }, [router]);

  // The pathname changes once the next page has committed. Give it a couple
  // of frames to paint, then lift the black.
  useEffect(() => {
    const el = ref.current;
    if (!el || !pending.current) return;
    pending.current = null;
    // Not cancelled on cleanup: a second route change mid-way must not leave
    // the screen stuck black.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transitionDuration = `${FADE_OUT_MS}ms`;
        el.style.opacity = "0";
        el.style.pointerEvents = "";
      });
    });
  }, [pathname]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-100 bg-black opacity-0 transition-opacity ease-in-out"
    />
  );
}
