"use client";

import { useEffect, useRef, type ReactNode } from "react";

// The projects page's list of blueprint sheets. On phones held upright it is
// a rolodex (see the .blueprints rules in globals.css): the list scrolls one
// card at a time, and every card stays pinned in the same place, turned by
// how far the list has scrolled past it. This feeds that in, as --p on each
// card: 0 when it is in front, 1 once it has flipped away, and -1, -2, ...
// while it waits one, two, ... cards back. Elsewhere the list lies still and
// nothing reads --p.

// When the rolodex is up (matching .blueprints in globals.css).
const ROLODEX = "(max-width: 639px)";
// The rolodex takes every scroll on the page, wherever the pointer is: the
// page itself never scrolls (see projects/page.tsx), so there is nothing
// else for a scroll to do.
//
// A wheel or trackpad flips a card once it has moved this far (px). Then it
// holds for at least WHEEL_HOLD ms, while the flip plays, and after that
// until the wheel rests for WHEEL_REST ms or is pushed again: a trackpad's
// glide after a swipe only ever slows, so a new push stands out (WHEEL_PUSH
// times the last move or more). A mouse wheel's notch (a step of WHEEL_NOTCH
// px or more, no smaller than the last, WHEEL_GAP ms or more after it, where
// a trackpad's steps come every frame) flips a card at once, however soon
// after the last. So each notch, or each swipe and its glide, flips one
// card, and a swipe made while the last one is still gliding still counts.
const WHEEL_STEP = 24;
const WHEEL_HOLD = 380;
const WHEEL_REST = 180;
const WHEEL_PUSH = 1.4;
const WHEEL_NOTCH = 60;
const WHEEL_GAP = 40;
// A finger flips a card by swiping this far (px) up or down anywhere off
// the list (on it, the list scrolls itself), more up and down than across.
const SWIPE = 40;

export default function BlueprintList({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const cards = [...list.querySelectorAll<HTMLElement>(".blueprint-card")];
    const rolodex = window.matchMedia(ROLODEX);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");

    // Each card's slot is the list's full height: one flip per slot. Its
    // laid-out height, unlike its box on screen, ignores the sheets'
    // fall-in, which scales them.
    function step() {
      const slot = cards[0]?.parentElement;
      return (slot && parseFloat(getComputedStyle(slot).height)) || 1;
    }

    function update() {
      // While the dial is open the list stops scrolling (see sheetStack.ts),
      // so its scroll reads 0 until it is put back; the cards hold still.
      if (list!.hasAttribute("data-lifted")) return;
      const size = step();
      list!.style.setProperty("--stage", `${size}px`);
      const at = list!.scrollTop / size;
      if (aim !== null && Math.abs(at - aim) < 0.01) aim = null;
      // Only the card in front can be pointed at (see globals.css).
      const front = Math.round(at);
      cards.forEach((card, i) => {
        card.style.setProperty("--p", (at - i).toFixed(4));
        card.toggleAttribute("data-front", i === front);
      });
    }

    // The card a flip is on its way to, until it gets there: a flip asked
    // for meanwhile goes on from it, not from wherever the list has got to.
    let aim: number | null = null;

    // Flips to the card `index`, as swipes on a phone would.
    function show(index: number) {
      aim = index;
      list!.scrollTo({ top: index * step(), behavior: still.matches ? "instant" : "smooth" });
    }

    // Flips to the card `by` away from the one in front, or on its way to
    // the front (or to the first or last). From the keyboard, focus goes
    // with it, so Enter opens the sheet in front rather than the one flipped
    // away.
    function flip(by: number) {
      const from = aim ?? Math.round(list!.scrollTop / step());
      const index = Math.min(Math.max(from + by, 0), cards.length - 1);
      show(index);
      if (list!.contains(document.activeElement)) cards[index].querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    }

    // Tabbing onto a sheet brings it to the front. The browser won't scroll
    // to it by itself: pinned in place, every card already looks on screen,
    // even one flipped away.
    function onFocus(event: FocusEvent) {
      if (!rolodex.matches) return;
      const index = cards.findIndex((card) => card.contains(event.target as Node));
      if (index >= 0 && index !== Math.round(list!.scrollTop / step())) show(index);
    }

    // While the dial is open the sheets are piled behind it (see
    // sheetStack.ts) and the rolodex is left alone.
    function idle() {
      return !rolodex.matches || list!.hasAttribute("data-stacked") || list!.hasAttribute("data-lifted");
    }

    // A mouse wheel or trackpad would only nudge the list (a wheel's notch
    // is far less than a card), and the snap would pull it straight back,
    // so on a desktop browser at phone size it flips a card at a time
    // instead.
    let travel = 0;
    let held = false;
    let heldAt = 0;
    let lastAt = -Infinity;
    let lastMove = 0;
    function onWheel(event: WheelEvent) {
      if (event.ctrlKey || idle()) return;
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? list!.clientHeight : 1;
      const delta = event.deltaY * scale;
      if (!delta) return;
      event.preventDefault();
      const now = event.timeStamp;
      const move = Math.abs(delta);
      const rested = now - lastAt > WHEEL_REST;
      const notch = move >= WHEEL_NOTCH && move >= lastMove && now - lastAt >= WHEEL_GAP;
      const pushed = move >= lastMove * WHEEL_PUSH + 2;
      lastAt = now;
      lastMove = move;
      if (held && (rested || notch || (pushed && now - heldAt > WHEEL_HOLD))) held = false;
      if (rested || notch) travel = 0;
      if (held) return;
      travel += delta;
      if (Math.abs(travel) < WHEEL_STEP) return;
      held = true;
      heldAt = now;
      travel = 0;
      flip(Math.sign(delta));
    }

    // On a phone, a swipe anywhere else on the page flips it too.
    let swipeFrom: { x: number; y: number } | null = null;
    function onTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      swipeFrom = event.touches.length === 1 && !list!.contains(event.target as Node) && !idle() ? { x: touch.clientX, y: touch.clientY } : null;
    }
    function onTouchEnd(event: TouchEvent) {
      const touch = event.changedTouches[0];
      if (!swipeFrom || !touch || idle()) return;
      const dx = touch.clientX - swipeFrom.x;
      const dy = touch.clientY - swipeFrom.y;
      swipeFrom = null;
      if (Math.abs(dy) >= SWIPE && Math.abs(dy) > Math.abs(dx)) flip(dy < 0 ? 1 : -1);
    }

    // And from the keyboard, a card per press, wherever focus is (but not
    // while typing, or in the dial).
    const keys: Record<string, number> = {
      ArrowDown: 1,
      ArrowUp: -1,
      PageDown: 1,
      PageUp: -1,
      Home: -Infinity,
      End: Infinity,
    };
    function onKey(event: KeyboardEvent) {
      const by = keys[event.key];
      if (!by || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || idle()) return;
      const target = event.target as HTMLElement;
      if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      event.preventDefault();
      flip(Number.isFinite(by) ? by : by * cards.length);
    }

    update();
    list.addEventListener("scroll", update, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    list.addEventListener("focusin", onFocus);
    // However the list got where it is (a flip, or a finger), it's there.
    const arrived = () => (aim = null);
    list.addEventListener("scrollend", arrived);
    const resizer = new ResizeObserver(update);
    resizer.observe(list);
    return () => {
      list.removeEventListener("scroll", update);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      list.removeEventListener("focusin", onFocus);
      list.removeEventListener("scrollend", arrived);
      resizer.disconnect();
    };
  }, []);

  return (
    <ul ref={ref} className="blueprints">
      {children}
    </ul>
  );
}
