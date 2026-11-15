// The loading screen (see LoadingScreen): black, with a wheel spinning in
// the middle. It covers the page whenever anything holds it, and lifts once
// nothing does:
//
// - the first load holds it until the sign font and every page's code are in,
//   and the page's scene (if it has one) has mounted and taken its own hold;
// - a page with a 3D scene holds it until the scene's first frame is drawn,
//   so its sky gradient is never seen on its own;
// - leaving a page through its signs holds it from the fade out until the
//   next page is in.
//
// A page with nothing to load never holds it, so it never shows there.

// Nothing should hold it longer than this; if something does, lift anyway
// rather than leave the visitor on a black screen.
const MAX_HOLD_MS = 20000;

type Screen = {
  // Fade to black over `fadeMs` (0 covers at once).
  cover: (fadeMs: number) => void;
  lift: () => void;
};

let screen: Screen | null = null;
let holds = 0;
// The server renders the screen covering the page, for the first load.
let covered = true;

// Keeps the screen up until the returned release is called. Releasing more
// than once is harmless.
export function holdScreen({ fadeMs = 0, maxMs = MAX_HOLD_MS } = {}) {
  holds++;
  if (!covered) {
    covered = true;
    screen?.cover(fadeMs);
  }
  let released = false;
  const timer = setTimeout(release, maxMs);
  function release() {
    if (released) return;
    released = true;
    clearTimeout(timer);
    holds--;
    // A scene torn down and rebuilt in the same commit (on a route change,
    // or React's strict mode) releases and holds again straight away, so
    // let that settle before deciding nothing is left to wait for.
    queueMicrotask(settle);
  }
  return release;
}

function settle() {
  if (holds > 0 || !covered) return;
  covered = false;
  screen?.lift();
}

// A scene's container carries this attribute in the server's HTML, and the
// scene removes it in the same layout effect that takes its hold. While it is
// on the page, a scene is there but hasn't mounted yet: React hydrates the
// page after the root layout, sometimes several tasks later (long enough to
// see on slower machines), so without this the first load's hold could let
// go in that gap and the screen would start to lift, then snap back.
export const SCENE_PENDING = "data-scene-pending";

// Resolves once no scene on the page is waiting to mount.
export function scenesMounted() {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (document.querySelector(`[${SCENE_PENDING}]`)) requestAnimationFrame(check);
      else resolve();
    };
    check();
  });
}

// For LoadingScreen, once mounted.
export function connectScreen(next: Screen) {
  screen = next;
  queueMicrotask(settle);
  return () => {
    if (screen === next) screen = null;
  };
}
