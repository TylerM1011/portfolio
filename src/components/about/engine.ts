import * as THREE from "three";
import { GRADE } from "../scene/post";
import { createStage } from "../scene/stage";
import { day, dusk } from "./palette";
import { buildAbout, DOOR_AJAR, DOOR_HOVER, DOOR_OPEN, ENTRY, INSIDE, OUTSIDE } from "./world";

// The about page's camera: across the street at first, looking at the
// house; then, once the door is chosen, up the path, through the door and
// round to face the front room. Inside, the telly, the landline and the
// clipboard on the coffee table each draw the camera in close when chosen;
// the car keys take the camera back out to the street, the way it came;
// and the poster over the telly, and the car parked in the street, are
// links home.

export type Spot = "door" | "car" | "tv" | "phone" | "keys" | "clipboard" | "poster";
export type Focus = Exclude<Spot, "door" | "car" | "keys" | "poster">;

export type AboutElements = {
  container: HTMLElement;
  stage: HTMLElement;
  // The buttons laid over each thing to click, kept fitted to it on screen.
  spots: Record<Spot, HTMLElement>;
};
export type AboutOptions = {
  dark: boolean;
  reducedMotion: boolean;
  // Called once the first frame is on screen, and once the camera has come
  // to rest inside.
  onReady?: () => void;
  onInside?: () => void;
  // Called once the camera is back out in the street.
  onOutside?: () => void;
};
export type AboutEngine = {
  // Goes in through the front door. Returns false if already on the way.
  enter: () => boolean;
  // Goes back out to the street, the way it came in. Returns false unless
  // inside.
  leave: () => boolean;
  hover: (spot: Spot | null) => void;
  // Draws the camera in on one of the room's things, or back (null).
  focus: (spot: Focus | null) => void;
  // A number was dialled on the landline.
  call: () => void;
  setDark: (dark: boolean) => void;
  dispose: () => void;
};

// The lens for each shot: on a wide screen it keeps `across` degrees of the
// scene across the screen, but no more than `cap` degrees up it; on a
// narrow one it keeps at least `need` across (the front door and the car
// outside, the telly to the side table inside), however tall that makes it.
const LENS = {
  outside: { across: 66, need: 34, cap: 50 },
  inside: { across: 84, need: 44, cap: 62 },
};
const MIN_FOV = 38;
const MAX_FOV = 84;
// On portrait screens the camera inside steps over to the room's front
// right-hand corner, back against the front wall, and looks across the
// room (in world units), so the keys on the mantelpiece, the telly and the
// phone on the side table all fit the narrow frame.
const PORTRAIT_SHIFT = { eyeX: 0.65, eyeZ: 0.1, lookX: -0.56 };
// And outside, it steps a little to the right, so the front door and the
// car parked past it share the frame.
const PORTRAIT_STREET = { eyeX: 0.3, lookX: 0.35 };
const ENTER_MS = 3400;
// The landline first rings FIRST_RING seconds after the visitor comes in,
// then for RING_FOR seconds every RING_EVERY seconds, until they pick it
// up. It holds off while the pointer is on it or something else is open,
// and lifts its handset for CALL_HOLD seconds after a call.
const FIRST_RING = 1;
const RING_EVERY = 5;
const RING_FOR = 1.5;
const CALL_HOLD = 5;
// The keys on their hook give a jingle of their own, in the quiet between
// two rings, until the visitor has picked them up (holding off, like the
// phone, while something else is open).
const JINGLE_AT = 2.9;
const JINGLE_FOR = 1;
// How much of the screen's height each close-up fills, and how long the
// camera takes to push in or pull back (eased at both ends).
const FILL: Record<Focus, number> = { tv: 0.5, phone: 0.5, clipboard: 0.45 };
const ZOOM_TIME = 0.95;
// The pointer tilts the camera, no more than this far (radians) either
// way, with a hint of sideways lean (world units) for depth; and how
// quickly it follows (per second, through two easings, so it starts and
// stops gently).
const TILT = { yaw: 0.02, pitch: 0.012, lean: 0.012, follow: 2.2 };
// How far the camera glances toward whatever is under the pointer, and
// how quickly.
const GLANCE = { reach: 0.035, rate: 2.5 };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const approach = (value: number, target: number, rate: number, dt: number) => value + (target - value) * (1 - Math.exp(-dt * rate));

// The vertical field of view that keeps `across` degrees across the screen.
function fitFov(aspect: number, across: number) {
  const half = Math.tan(THREE.MathUtils.degToRad(across / 2)) / aspect;
  return THREE.MathUtils.radToDeg(2 * Math.atan(half));
}

function lensFov(aspect: number, { across, need, cap }: (typeof LENS)["outside"]) {
  const fov = Math.max(fitFov(aspect, need), Math.min(fitFov(aspect, across), cap));
  return THREE.MathUtils.clamp(fov, MIN_FOV, MAX_FOV);
}

const corners = (box: THREE.Box3) =>
  Array.from({ length: 8 }, (_, i) => new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));

export function createAboutEngine(el: AboutElements, options: AboutOptions): AboutEngine | null {
  const stage = createStage(el, {
    build: ({ anisotropy, detail }) => buildAbout({ anisotropy, detail }),
    palettes: { day, dusk },
    dark: options.dark,
    fov: lensFov(16 / 9, LENS.outside),
  });
  if (!stage) return null;
  const { world, camera, grade } = stage;
  const motion = options.reducedMotion ? 0 : 1;
  const instant = options.reducedMotion ? 1e3 : 1;

  const eyePath = new THREE.CatmullRomCurve3(ENTRY.eye, false, "centripetal");
  const lookPath = new THREE.CatmullRomCurve3(ENTRY.look, false, "centripetal");

  // What each button covers on screen, and what each close-up frames.
  const targets: Record<Spot, THREE.Box3> = {
    door: world.door.bounds,
    car: world.car.bounds,
    tv: world.tv.bounds.clone().expandByScalar(0.02),
    phone: world.phone.bounds.clone().expandByScalar(0.008),
    keys: world.keys.bounds.clone().expandByScalar(0.012),
    clipboard: world.clipboard.bounds.clone().expandByScalar(0.01),
    poster: world.poster.bounds,
  };
  const shots: Record<Focus, THREE.Box3> = {
    tv: world.tv.bounds.clone().expandByScalar(0.05),
    phone: world.phone.bounds.clone().expandByScalar(0.02),
    clipboard: world.clipboard.bounds.clone().expandByScalar(0.02),
  };
  const spotCorners = Object.fromEntries(Object.entries(targets).map(([spot, box]) => [spot, corners(box)])) as Record<Spot, THREE.Vector3[]>;
  const spotStyles = Object.fromEntries(Object.entries(el.spots).map(([spot, element]) => [spot, element.style.cssText])) as Record<Spot, string>;
  for (const element of Object.values(el.spots)) {
    Object.assign(element.style, { left: "0", top: "0", right: "auto", bottom: "auto", transform: "none" });
    element.setAttribute("data-modelled", "");
  }

  let width = 1;
  let height = 1;
  function resize() {
    ({ width, height } = stage!.resize());
  }
  let resized = false;
  const resizer = new ResizeObserver(() => {
    resized = true;
  });
  resizer.observe(el.container);
  resize();

  const pointer = { x: 0, y: 0, midX: 0, midY: 0, smoothX: 0, smoothY: 0 };
  const onPointer = (event: PointerEvent) => {
    pointer.x = THREE.MathUtils.clamp((event.clientX / window.innerWidth) * 2 - 1, -1, 1);
    pointer.y = THREE.MathUtils.clamp((event.clientY / window.innerHeight) * 2 - 1, -1, 1);
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  // Walking in plays the path from the street to the room; walking out
  // plays it backwards.
  let phase: "outside" | "entering" | "inside" | "leaving" = "outside";
  let enterStart = -1;
  let hovered: Spot | null = null;
  let focused: Focus | null = null;
  // The last close-up, held while the camera pulls back out of it.
  let framing: Focus = "tv";
  let zoom = 0;
  let zoomSpeed = 0;
  // How much the pointer and the hand move the camera: eased down while it
  // walks in, rather than switched.
  let sway = 1;
  let glance = 0;
  const glanceAt = new THREE.Vector3();
  let door = DOOR_AJAR;
  let tvGlow = 0;
  let posterGlow = 0;
  let clipboardGlow = 0;
  let rev = 0;
  let jiggle = 0;
  const landline = { lift: 0, ring: 0 };
  let used = false;
  let keysUsed = false;
  let wasJingling = false;
  let insideAt = 0;
  let calledAt = -Infinity;
  let wasRinging = false;

  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const size = new THREE.Vector3();
  const close = new THREE.Vector3();
  const toward = new THREE.Vector3();
  const corner = new THREE.Vector3();

  let loaded = false;
  void stage.ready.then(() => {
    loaded = true;
  });
  let last = performance.now();
  let frame = requestAnimationFrame(tick);

  // Draws the eye and aim toward a close-up of `box` by k, coming at it
  // from where the eye stands, a little from above.
  function frameShot(box: THREE.Box3, fill: number, k: number, fov: number, front: THREE.Vector3 | null) {
    if (k <= 0) return;
    box.getCenter(centre);
    box.getSize(size);
    const tall = Math.max(size.y, size.x / camera.aspect, size.z / camera.aspect);
    const distance = tall / fill / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    if (front) toward.copy(front);
    else toward.subVectors(eye, centre).normalize().setY(0.9).normalize();
    close.copy(centre).addScaledVector(toward, distance);
    eye.lerp(close, k);
    look.lerp(centre, k);
  }

  const tvFront = new THREE.Vector3(0, 0.12, 1).normalize();

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    if (!loaded) {
      last = now;
      return;
    }
    if (resized) {
      resized = false;
      resize();
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = now / 1000;

    pointer.midX = approach(pointer.midX, pointer.x, TILT.follow, dt);
    pointer.midY = approach(pointer.midY, pointer.y, TILT.follow, dt);
    pointer.smoothX = approach(pointer.smoothX, pointer.midX, TILT.follow, dt);
    pointer.smoothY = approach(pointer.smoothY, pointer.midY, TILT.follow, dt);

    // Where the camera stands: one of the two resting shots, or on the way
    // between them.
    let progress = phase === "outside" ? 0 : 1;
    const walking = phase === "entering" || phase === "leaving";
    if (walking) {
      if (enterStart < 0) enterStart = now;
      const along = options.reducedMotion ? 1 : clamp01((now - enterStart) / ENTER_MS);
      progress = phase === "entering" ? along : 1 - along;
      if (along >= 1 && phase === "entering") {
        phase = "inside";
        insideAt = time;
        options.onInside?.();
      } else if (along >= 1) {
        phase = "outside";
        options.onOutside?.();
      }
    }
    const walk = easeInOut(progress);
    if (walking) {
      eyePath.getPoint(walk, eye);
      lookPath.getPoint(walk, look);
    } else {
      const shot = phase === "inside" ? INSIDE : OUTSIDE;
      eye.copy(shot.eye);
      look.copy(shot.look);
    }
    const aspect = camera.aspect;
    let fov = THREE.MathUtils.lerp(lensFov(aspect, LENS.outside), lensFov(aspect, LENS.inside), walk);
    const upright = clamp01((1.2 - aspect) / 0.74);
    const portrait = upright * walk;
    eye.x += PORTRAIT_SHIFT.eyeX * portrait + PORTRAIT_STREET.eyeX * (upright - portrait);
    eye.z += PORTRAIT_SHIFT.eyeZ * portrait;
    look.x += PORTRAIT_SHIFT.lookX * portrait + PORTRAIT_STREET.lookX * (upright - portrait);

    // A slow handheld drift, a gentle tilt toward the pointer, and a glance
    // toward whatever is under it. Up close, only a trace of it is left.
    const from = zoom;
    zoom = THREE.MathUtils.clamp(zoom + (focused ? 1 : -1) * (dt / ZOOM_TIME) * instant, 0, 1);
    const k = easeInOut(zoom);
    zoomSpeed = Math.abs(k - easeInOut(from)) / Math.max(dt, 1e-3);
    sway = approach(sway, walking ? 0.3 : 1, 2, dt);
    const drift = motion * (1 - 0.85 * k) * sway;
    const handX = (Math.sin(time * 0.4) * 0.7 + Math.sin(time * 1.1 + 1.3) * 0.3) * 0.004;
    const handY = (Math.sin(time * 0.5 + 0.4) * 0.7 + Math.sin(time * 1.3) * 0.3) * 0.002;
    const reach = eye.distanceTo(look);
    eye.x += (pointer.smoothX * TILT.lean + handX) * drift;
    eye.y += handY * drift;
    look.x += pointer.smoothX * TILT.yaw * reach * drift;
    look.y -= pointer.smoothY * TILT.pitch * reach * drift;
    const glancing = !!hovered && !focused && !walking;
    if (glancing) {
      targets[hovered!].getCenter(centre);
      if (glance < 0.01) glanceAt.copy(centre);
      else glanceAt.lerp(centre, 1 - Math.exp(-dt * GLANCE.rate));
    }
    glance = approach(glance, glancing ? 1 : 0, GLANCE.rate, dt);
    look.lerp(glanceAt, GLANCE.reach * glance * motion);
    if (focused) framing = focused;
    frameShot(shots[framing], FILL[framing], k, fov, framing === "tv" ? tvFront : null);
    fov = THREE.MathUtils.lerp(fov, Math.min(fov, 50), k);

    camera.position.copy(eye);
    camera.lookAt(look);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // The door eases wider under the pointer, and swings wide as the
    // camera reaches it; on the way out it stays open until the camera is
    // through, then is pulled to, ajar as it was.
    const doorTarget =
      phase === "outside"
        ? hovered === "door"
          ? DOOR_HOVER
          : DOOR_AJAR
        : phase === "leaving"
          ? Math.max(DOOR_AJAR, DOOR_OPEN * clamp01((progress - 0.05) / 0.3))
          : DOOR_OPEN * clamp01((progress - 0.15) / 0.35);
    door = phase === "entering" && !options.reducedMotion ? Math.max(door, doorTarget) : approach(door, doorTarget, 6 * instant, dt);
    world.door.setOpen(door);

    tvGlow = approach(tvGlow, hovered === "tv" || focused === "tv" ? 1 : 0, 8, dt);
    world.tv.setGlow(tvGlow * (0.85 + 0.15 * Math.sin(time * 40) * motion));
    posterGlow = approach(posterGlow, hovered === "poster" ? 1 : 0, 8, dt);
    world.poster.setGlow(posterGlow);
    world.car.setLit(hovered === "car" && phase === "outside");
    // The parked car ticks over in the street, revving under the pointer.
    rev = approach(rev, hovered === "car" && phase === "outside" ? 1 : 0, 4, dt);
    if (phase !== "inside") world.car.idle(time, motion, rev * motion);
    clipboardGlow = approach(clipboardGlow, hovered === "clipboard" || focused === "clipboard" ? 1 : 0, 8, dt);
    world.clipboard.setGlow(clipboardGlow);
    const cycle = time - insideAt - FIRST_RING;
    const since = ((cycle % RING_EVERY) + RING_EVERY) % RING_EVERY;
    const calling = phase === "inside" && !focused && motion > 0 && cycle >= 0;
    const jingling = calling && !keysUsed && since >= JINGLE_AT && since < JINGLE_AT + JINGLE_FOR;
    jiggle = approach(jiggle, (hovered === "keys" && phase === "inside") || jingling ? 1 : 0, 10, dt);
    world.keys.update(time, jiggle * motion);
    if (jingling !== wasJingling) el.spots.keys.toggleAttribute("data-jingling", (wasJingling = jingling));
    const onCall = time - calledAt < CALL_HOLD;
    const ringing = calling && !used && hovered !== "phone" && since < RING_FOR;
    landline.lift = approach(landline.lift, onCall ? 1 : hovered === "phone" ? 0.25 : 0, 7 * instant, dt);
    landline.ring = approach(landline.ring, ringing ? 1 : 0, 18, dt);
    world.phone.update(time, landline);
    if (ringing !== wasRinging) el.spots.phone.toggleAttribute("data-ringing", (wasRinging = ringing));

    world.atmosphere.aimSun(centre.set(0, 0, phase === "outside" ? 0.8 : -0.6));
    grade.uBlur.value = Math.min(0.4, zoomSpeed * 0.12 * motion);
    grade.uVignette.value = GRADE.vignette + 0.06 * walk;
    shots[framing].getCenter(corner).project(camera);
    grade.uCenter.value.set(corner.x * 0.5 + 0.5, corner.y * 0.5 + 0.5);
    const first = stage!.render(dt, time, motion);

    for (const spot of Object.keys(el.spots) as Spot[]) fit(spot);
    if (first) options.onReady?.();
  }

  // Fits a button over its thing on screen, at least a finger's width.
  function fit(spot: Spot) {
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const point of spotCorners[spot]) {
      corner.copy(point).project(camera);
      const x = ((corner.x + 1) / 2) * width;
      const y = ((1 - corner.y) / 2) * height;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    const min = 44;
    const grow = (a: number, b: number) => Math.max(0, (min - (b - a)) / 2);
    const gx = grow(left, right) + 4;
    const gy = grow(top, bottom) + 4;
    const element = el.spots[spot];
    element.style.transform = `translate(${left - gx}px,${top - gy}px)`;
    element.style.width = `${right - left + 2 * gx}px`;
    element.style.height = `${bottom - top + 2 * gy}px`;
  }

  return {
    enter() {
      if (phase !== "outside") return false;
      phase = "entering";
      enterStart = -1;
      hovered = null;
      return true;
    },
    hover(spot) {
      hovered = spot;
    },
    leave() {
      if (phase !== "inside") return false;
      phase = "leaving";
      enterStart = -1;
      hovered = null;
      focused = null;
      keysUsed = true;
      return true;
    },
    focus(spot) {
      focused = spot;
      if (spot === "phone") used = true;
    },
    call() {
      used = true;
      calledAt = performance.now() / 1000;
    },
    setDark: stage.setDark,
    dispose() {
      cancelAnimationFrame(frame);
      resizer.disconnect();
      window.removeEventListener("pointermove", onPointer);
      stage!.dispose();
      for (const [spot, element] of Object.entries(el.spots) as [Spot, HTMLElement][]) {
        element.style.cssText = spotStyles[spot];
        element.removeAttribute("data-modelled");
        element.removeAttribute("data-ringing");
        element.removeAttribute("data-jingling");
      }
    },
  };
}
