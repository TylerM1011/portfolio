import * as THREE from "three";
import { GRADE } from "../scene/post";
import { createStage } from "../scene/stage";
import { day, dusk } from "./palette";
import { SW } from "./sign";
import { ROAD } from "./road";
import { buildWorld, CAR_Z, type GantryLayout } from "./world";

// The HTML sign is layered over the canvas as the links, invisible over the
// modelled signs, so it would catch the pointer over the car if the two ever
// overlapped on screen. They can't while the eye stays between the car's roof
// (CAR_HEIGHT) and the signs' lower edge (about 1.58, see layoutGantry):
// everything above the eye's horizontal plane lands on one side of the
// horizon line, and everything below it on the other, whatever the camera's
// pitch or roll.
const EYE_Y = 0.9;
const EYE_Z = 2.2;
const LOOK = new THREE.Vector3(0, 1, -12);
const BASE_FOV = 40;
const MAX_FOV = 68;
// The sign element is laid out in em, one stroke width (see sign.ts), at
// 400px to a world unit.
const SIGN_PX_PER_UNIT = 400;
const SIGN_EM_PX = SW * SIGN_PX_PER_UNIT;

const INTRO_MS = 4200;
const INTRO_FROM = new THREE.Vector3(3.4, 4.8, 10.5);
const INTRO_LOOK = new THREE.Vector3(0, 0.3, -4);

// Traffic keeps left. Right pulls out into the overtaking lane and straight
// on stays in this one; the camera gives chase down the carriageway.
const DRIVE_MS = 3400;
const LANE_SHIFT = ROAD.lane;
const CAR_TRAVEL = 48;
const CAM_TRAVEL = 20;

// Left pulls into the lay-by: the car signals, drifts across the hard strip
// into it and brakes to a stop, while the camera eases forward to watch.
const LAYBY_MS = 4200;
const LAYBY = ROAD.layby;
const LAYBY_TRAVEL = CAR_Z - LAYBY.stop;
// Progress at which the car comes to rest.
const PARKED = 0.78;
// Where (z) the drift across begins and ends.
const DRIFT = [LAYBY.entry + 1, LAYBY.start - 2] as const;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

// Distance travelled at progress t: a smooth pull away, braking to rest.
function laybyDistance(t: number) {
  const u = clamp01(t / PARKED);
  return LAYBY_TRAVEL * u * u * u * (u * (u * 6 - 15) + 10);
}

// Puts the car `distance` along the lay-by route and returns its heading.
function laybyPose(distance: number, out: THREE.Vector3) {
  const z = CAR_Z - distance;
  const span = DRIFT[0] - DRIFT[1];
  const u = clamp01((DRIFT[0] - z) / span);
  out.set(LAYBY.x * u * u * (3 - 2 * u), 0, z);
  // Sideways movement per unit forward, for the heading.
  const drift = (LAYBY.x * 6 * u * (1 - u)) / span;
  return Math.atan(-drift);
}

export type RoadElements = {
  container: HTMLElement;
  stage: HTMLElement;
  camera: HTMLElement;
  sign: HTMLElement;
  fade: HTMLElement;
};

export type RoadOptions = {
  dark: boolean;
  reducedMotion: boolean;
  intro: boolean;
  onIntroEnd: () => void;
  sign: { font: string; gantry: GantryLayout };
  // Called once the first frame is on screen.
  onReady?: () => void;
};

export type RoadEngine = {
  drive: (lateral: number, onArrive: () => void) => boolean;
  hint: (lateral: number | null) => void;
  setDark: (dark: boolean) => void;
  dispose: () => void;
};

// The same matrices CSS3DRenderer writes, flipping y because CSS y points down.
const epsilon = (n: number) => (Math.abs(n) < 1e-10 ? 0 : n);

export function cameraCSS({ elements: e }: THREE.Matrix4) {
  const values = [e[0], -e[1], e[2], e[3], e[4], -e[5], e[6], e[7], e[8], -e[9], e[10], e[11], e[12], -e[13], e[14], e[15]];
  return `matrix3d(${values.map(epsilon).join(",")})`;
}

export function objectCSS({ elements: e }: THREE.Matrix4) {
  const values = [e[0], e[1], e[2], e[3], -e[4], -e[5], -e[6], -e[7], e[8], e[9], e[10], e[11], e[12], e[13], e[14], e[15]];
  return `translate(-50%,-50%) matrix3d(${values.map(epsilon).join(",")})`;
}

// On narrow screens, widen the lens and then back the camera off until the
// signs fit across with a margin.
function fitLens(aspect: number, sign: GantryLayout) {
  const distance = EYE_Z - sign.z;
  // The signs sit a little off-centre, so fit their farther edge.
  const halfWidth = Math.max(-sign.left, sign.right) + 0.2;
  const needed = THREE.MathUtils.radToDeg(2 * Math.atan(halfWidth / distance / aspect));
  const fov = THREE.MathUtils.clamp(needed, BASE_FOV, MAX_FOV);
  const reach = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect;
  return { fov, back: Math.max(0, halfWidth / reach - distance) };
}

export function createRoadEngine(el: RoadElements, options: RoadOptions): RoadEngine | null {
  const sign = options.sign.gantry;
  const stage = createStage(el, {
    build: ({ anisotropy, detail }) => buildWorld({ anisotropy, detail, gantry: sign, font: options.sign.font }),
    palettes: { day, dusk },
    dark: options.dark,
    fov: BASE_FOV,
  });
  if (!stage) return null;
  const { world, camera, grade } = stage;
  const { car } = world;

  let width = 1;
  let height = 1;
  let lens = fitLens(1, sign);
  function resize() {
    ({ width, height } = stage!.resize());
    lens = fitLens(camera.aspect, sign);
    el.camera.style.width = `${width}px`;
    el.camera.style.height = `${height}px`;
  }
  const resizer = new ResizeObserver(resize);
  resizer.observe(el.container);
  resize();

  let onScreen = true;
  const watcher = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
  });
  watcher.observe(el.container);

  const pointer = { x: 0, y: 0, smoothX: 0, smoothY: 0 };
  const onPointer = (event: PointerEvent) => {
    const rect = el.container.getBoundingClientRect();
    pointer.x = THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    pointer.y = THREE.MathUtils.clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  // The sign is a fixed object in the world; only the camera moves around it.
  // The scene draws it, so the HTML sign hides all but its focus rings (see
  // globals.css).
  const signStyle = el.sign.style.cssText;
  const cameraStyle = el.camera.style.cssText;
  const signMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3((sign.left + sign.right) / 2, (sign.top + sign.bottom) / 2, sign.z),
    new THREE.Quaternion(),
    new THREE.Vector3().setScalar(1 / SIGN_PX_PER_UNIT),
  );
  Object.assign(el.sign.style, {
    left: "0",
    top: "0",
    fontSize: `${SIGN_EM_PX}px`,
    transform: objectCSS(signMatrix),
    opacity: "0",
  });
  el.sign.setAttribute("data-modelled", "");

  const reduced = options.reducedMotion;
  let intro = options.intro && !reduced ? { start: -1 } : null;
  let drive: { start: number; lateral: number; onArrive: () => void; arrived: boolean; distance: number } | null = null;
  let hint: number | null = null;
  let glance = 0;

  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const vanishing = new THREE.Vector3();
  // Hold the first frame (and so the intro) until the car, trees and
  // meadow textures are in place.
  let loaded = false;
  void stage.ready.then(() => {
    loaded = true;
  });
  let last = performance.now();
  let frame = requestAnimationFrame(tick);

  function endIntro() {
    intro = null;
    options.onIntroEnd();
  }

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    if (!onScreen || !loaded) {
      last = now;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = now / 1000;
    const motion = reduced ? 0 : 1;

    const settle = 1 - Math.exp(-dt * 2.5);
    pointer.smoothX += (pointer.x - pointer.smoothX) * settle;
    pointer.smoothY += (pointer.y - pointer.smoothY) * settle;
    glance += ((hint ?? 0) - glance) * (1 - Math.exp(-dt * 2));

    // Resting shot: a slow handheld drift, leaning toward the pointer and
    // glancing toward whichever destination is hovered.
    const handX = (Math.sin(time * 0.4) * 0.7 + Math.sin(time * 1.1 + 1.3) * 0.3) * 0.004;
    const handY = (Math.sin(time * 0.5 + 0.4) * 0.7 + Math.sin(time * 1.3) * 0.3) * 0.002;
    eye.set((pointer.smoothX * 0.05 + handX) * motion, EYE_Y + (-pointer.smoothY * 0.012 + handY) * motion, EYE_Z + lens.back);
    look.set((glance * 0.2 + pointer.smoothX * 0.1) * motion, LOOK.y, LOOK.z);
    let fov = lens.fov;
    let roll = 0;
    let blur = 0;
    let vignette = GRADE.vignette;
    let fade = 0;
    let signOpacity = 1;

    // Establishing shot: a crane down from high behind the car, with the
    // sign's links only taking the pointer once it has settled.
    if (intro) {
      if (intro.start < 0) intro.start = now;
      const t = clamp01((now - intro.start) / INTRO_MS);
      const e = easeInOut(t);
      eye.lerpVectors(INTRO_FROM, eye, e);
      eye.x += Math.sin(Math.PI * e) * 0.6;
      look.lerpVectors(INTRO_LOOK, look, e);
      vignette += (1 - e) * 0.4;
      signOpacity = clamp01((t - 0.82) / 0.18);
      if (t >= 1) endIntro();
    }

    if (drive?.lateral && drive.lateral < 0) {
      if (drive.start < 0) drive.start = now;
      const t = clamp01((now - drive.start) / LAYBY_MS);
      const distance = laybyDistance(t);
      const heading = laybyPose(distance, car.group.position);
      car.group.rotation.y = heading;
      // Squat pulling away, dip under braking, lean out of the drift.
      const pitch = 0.015 * Math.sin(Math.PI * clamp01(t / 0.3)) - 0.022 * Math.sin(Math.PI * clamp01((t - 0.5) / 0.32));
      car.body.rotation.set(pitch, 0, -heading * 0.25);
      for (const wheel of car.wheels) wheel.rotation.x -= (distance - drive.distance) / car.wheelRadius;
      drive.distance = distance;

      // Ease forward and turn to watch the car pull in and stop.
      eye.z -= 4 * easeInOut(clamp01(t / 0.8));
      eye.x -= 0.5 * easeInOut(clamp01(t / 0.8));
      ahead.copy(car.group.position).setY(0.4);
      look.lerp(ahead, 0.85 * easeInOut(clamp01(t / 0.45)));
      fov += 2 * t;
      vignette += 0.2 * t;
      fade = clamp01((t - 0.82) / 0.18);
      if (t >= 1 && !drive.arrived) {
        drive.arrived = true;
        drive.onArrive();
      }
    } else if (drive) {
      if (drive.start < 0) drive.start = now;
      const t = clamp01((now - drive.start) / DRIVE_MS);
      const { lateral } = drive;
      const steer = clamp01(t / 0.55);
      const swerve = Math.sin(Math.PI * steer);
      const carX = lateral * LANE_SHIFT * easeInOut(steer);
      const distance = CAR_TRAVEL * t ** 2.6;
      car.group.position.set(carX, 0, CAR_Z - distance);
      car.group.rotation.y = -lateral * 0.14 * swerve;
      // Squat on launch, lean out of the lane change.
      car.body.rotation.set(0.022 * Math.sin(Math.PI * clamp01(t / 0.4)), 0, lateral * 0.035 * swerve);
      for (const wheel of car.wheels) wheel.rotation.x -= (distance - drive.distance) / car.wheelRadius;
      drive.distance = distance;

      // The camera gives chase but falls behind, pushing wider as it speeds up.
      const speed = t * t;
      eye.z -= CAM_TRAVEL * clamp01((t - 0.04) / 0.96) ** 2.4;
      eye.x += carX * 0.7;
      eye.y += -0.07 * easeInOut(t);
      ahead.set(carX, 0.7, car.group.position.z - 10);
      look.lerp(ahead, easeInOut(clamp01(t / 0.5)));
      vanishing.set(carX, 0.6, eye.z - 60);
      roll = -lateral * 0.015 * swerve;
      fov += 8 * speed;
      blur = 0.45 * speed;
      vignette += 0.25 * speed;
      fade = clamp01((t - 0.8) / 0.2);
      if (t >= 1 && !drive.arrived) {
        drive.arrived = true;
        drive.onArrive();
      }
    } else {
      car.body.position.y = Math.sin(time * 38) * 0.0006 * motion;
    }

    camera.position.copy(eye);
    camera.lookAt(look);
    if (roll) camera.rotateZ(roll);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    world.sign.setHighlight(drive?.lateral ?? hint, !!drive);
    const signal = drive?.lateral ?? hint ?? 0;
    const blink = signal !== 0 && Math.floor(time * 2.6) % 2 === 0;
    car.blinkers[0].visible = blink && signal < 0;
    car.blinkers[1].visible = blink && signal > 0;

    // Keep the shadow map centered just ahead of the camera.
    focus.set(eye.x, 0, eye.z - 8);
    world.atmosphere.aimSun(focus);

    grade.uBlur.value = blur;
    grade.uVignette.value = vignette;
    if (blur > 0) {
      vanishing.project(camera);
      grade.uCenter.value.set(vanishing.x * 0.5 + 0.5, vanishing.y * 0.5 + 0.5);
    }
    const first = stage!.render(dt, time, motion);

    const focal = camera.projectionMatrix.elements[5] * (height / 2);
    el.camera.style.transform = `perspective(${focal}px) translateZ(${focal}px)${cameraCSS(camera.matrixWorldInverse)} translate(${width / 2}px,${height / 2}px)`;
    el.sign.style.visibility = camera.position.z - sign.z < 0.35 ? "hidden" : "visible";
    el.sign.style.opacity = String(signOpacity);
    el.sign.style.pointerEvents = signOpacity === 1 && !drive ? "auto" : "none";
    el.fade.style.opacity = String(fade);
    if (first) options.onReady?.();
  }

  return {
    drive(lateral, onArrive) {
      if (drive) return false;
      if (intro) endIntro();
      drive = { start: -1, lateral, onArrive, arrived: false, distance: 0 };
      return true;
    },
    hint(lateral) {
      hint = lateral;
    },
    setDark: stage.setDark,
    dispose() {
      cancelAnimationFrame(frame);
      resizer.disconnect();
      watcher.disconnect();
      window.removeEventListener("pointermove", onPointer);
      stage!.dispose();
      el.sign.style.cssText = signStyle;
      el.sign.removeAttribute("data-modelled");
      el.camera.style.cssText = cameraStyle;
      el.fade.style.opacity = "";
    },
  };
}
