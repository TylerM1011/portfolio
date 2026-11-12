"use client";

import { useEffect, useState, type ReactNode } from "react";

// How far a finger has to travel, in px, before a swipe counts.
const SWIPE = 24;

const DOWN_KEYS = new Set(["ArrowDown", "PageDown", "End", " "]);
const UP_KEYS = new Set(["ArrowUp", "PageUp", "Home"]);

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

// Keeps the footer tucked below the bottom edge of the screen until the
// visitor scrolls down, and slides it away again when they scroll back up.
// The home and projects pages fit the screen and never scroll, so this
// listens for the intent to scroll (wheel, swipe, keys) as well as the page
// scrolling itself.
export default function FooterReveal({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let lastScroll = window.scrollY;
    let touchX = 0;
    let touchY = 0;

    const onWheel = (event: WheelEvent) => {
      // Sideways swipes scroll the blueprints on phones; leave them be.
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      setShown(event.deltaY > 0);
    };

    const onTouchStart = (event: TouchEvent) => {
      touchX = event.touches[0].clientX;
      touchY = event.touches[0].clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      const dx = event.touches[0].clientX - touchX;
      const dy = event.touches[0].clientY - touchY;
      if (Math.abs(dy) < SWIPE || Math.abs(dy) <= Math.abs(dx)) return;
      // A finger moving up scrolls the page down.
      setShown(dy < 0);
      touchX = event.touches[0].clientX;
      touchY = event.touches[0].clientY;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isEditable(event.target)) return;
      if (DOWN_KEYS.has(event.key)) setShown(!(event.key === " " && event.shiftKey));
      else if (UP_KEYS.has(event.key)) setShown(false);
    };

    const onScroll = () => {
      const scroll = window.scrollY;
      if (scroll !== lastScroll) setShown(scroll > lastScroll);
      lastScroll = scroll;
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <footer
      data-shown={shown || undefined}
      // Tabbing into the links brings the footer up so focus stays visible.
      onFocus={() => setShown(true)}
      // Its own tinted glass keeps it legible over any scene, so the scenes
      // need no scrim and look the same whether it is up or not.
      className="fixed inset-x-0 bottom-0 z-40 translate-y-full border-t border-white/10 bg-(--strip) text-(--strip-ink) backdrop-blur-md transition-transform duration-300 ease-out data-shown:translate-y-0 motion-reduce:transition-none"
    >
      {children}
    </footer>
  );
}
