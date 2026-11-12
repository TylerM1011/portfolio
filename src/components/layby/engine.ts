import * as THREE from "three";
import { cameraCSS, objectCSS } from "../road/engine";
import { day, dusk } from "./palette";
import { createPhoneRig } from "../road/phone";
import { SW } from "../road/sign";
import { GRADE } from "../scene/post";
import { createStage } from "../scene/stage";
import type { RouteSignArt } from "./sign";
import { buildLayby, EYE, LOOK } from "./world";

// The lay-by is a backdrop, so the camera only drifts. The lens keeps about
// this much of it across the screen, widening on narrow screens.
const FOV_ACROSS = 84;
const MIN_FOV = 40;
const MAX_FOV = 74;

// The route sign's HTML links are laid out in em, one stroke width (see
// road/sign.ts), at 400px to a world unit, as on the other scenes.
const SIGN_PX_PER_UNIT = 400;

export type LaybyElements = {
  container: HTMLElement;
  stage: HTMLElement;
  camera: HTMLElement;
  sign: HTMLElement;
  phone: HTMLElement;
};
export type LaybyOptions = {
  dark: boolean;
  reducedMotion: boolean;
  sign: { font: string; art: RouteSignArt };
  // Called once the first frame is on screen.
  onReady?: () => void;
};
export type LaybyEngine = {
  // Holds the chosen line lit while the page fades out (see LoadingScreen).
  leave: (href: string) => boolean;
  hint: (href: string | null) => void;
  // The emergency phone (see road/phone.ts).
  hoverPhone: (on: boolean) => void;
  openDial: (on: boolean) => void;
  callPhone: () => void;
  setDark: (dark: boolean) => void;
  dispose: () => void;
};

function fitFov(aspect: number) {
  const half = Math.tan(THREE.MathUtils.degToRad(FOV_ACROSS / 2)) / aspect;
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(half)), MIN_FOV, MAX_FOV);
}

// On screens narrower than this aspect, the camera slides along the lay-by
// (by up to this far, toward +z) to keep the route sign and phone in shot,
// leaving the bin and the car out to the right.
const SLIDE_BELOW = 1.5;
const SLIDE = 1.8;

export function createLaybyEngine(el: LaybyElements, options: LaybyOptions): LaybyEngine | null {
  const stage = createStage(el, {
    build: ({ anisotropy, detail }) => buildLayby({ anisotropy, detail, routeSign: options.sign.art, font: options.sign.font }),
    palettes: { day, dusk },
    dark: options.dark,
    fov: fitFov(16 / 9),
  });
  if (!stage) return null;
  const { world, camera, grade } = stage;
  const { scene } = world;

  // The scene draws the route sign; its HTML links are laid over it in 3D,
  // showing only their focus rings (see globals.css). It stands still, so
  // they are placed once.
  const signStyle = el.sign.style.cssText;
  const cameraStyle = el.camera.style.cssText;
  scene.updateMatrixWorld(true);
  const signMatrix = new THREE.Matrix4().multiplyMatrices(
    world.sign.group.matrixWorld,
    new THREE.Matrix4().compose(world.sign.centre, new THREE.Quaternion(), new THREE.Vector3().setScalar(1 / SIGN_PX_PER_UNIT)),
  );
  Object.assign(el.sign.style, {
    left: "0",
    top: "0",
    bottom: "auto",
    fontSize: `${SW * SIGN_PX_PER_UNIT}px`,
    transform: objectCSS(signMatrix),
  });
  el.sign.setAttribute("data-modelled", "");
  // The phone's button is a plain box over the phone, refitted every frame.
  const phone = createPhoneRig(world.phone, { element: el.phone, reducedMotion: options.reducedMotion });

  const eyeAt = EYE.clone();
  const aim = LOOK.clone();

  let width = 1;
  let height = 1;
  function resize() {
    ({ width, height } = stage!.resize());
    camera.fov = fitFov(camera.aspect);
    camera.updateProjectionMatrix();
    const slide = SLIDE * THREE.MathUtils.clamp(SLIDE_BELOW - camera.aspect, 0, 1);
    eyeAt.z = EYE.z + slide;
    aim.z = LOOK.z + slide;
    el.camera.style.width = `${width}px`;
    el.camera.style.height = `${height}px`;
  }
  const resizer = new ResizeObserver(resize);
  resizer.observe(el.container);
  resize();

  const pointer = { x: 0, y: 0, smoothX: 0, smoothY: 0 };
  const onPointer = (event: PointerEvent) => {
    pointer.x = THREE.MathUtils.clamp((event.clientX / window.innerWidth) * 2 - 1, -1, 1);
    pointer.y = THREE.MathUtils.clamp((event.clientY / window.innerHeight) * 2 - 1, -1, 1);
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  const motion = options.reducedMotion ? 0 : 1;
  let leaving: string | null = null;
  let hint: string | null = null;
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  let loaded = false;
  void stage.ready.then(() => {
    loaded = true;
  });
  let last = performance.now();
  let frame = requestAnimationFrame(tick);

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    if (!loaded) {
      last = now;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = now / 1000;

    const settle = 1 - Math.exp(-dt * 2.5);
    pointer.smoothX += (pointer.x - pointer.smoothX) * settle;
    pointer.smoothY += (pointer.y - pointer.smoothY) * settle;
    // A slow handheld drift, leaning toward the pointer. Kept small: the
    // phone is close, so it swings across the screen more than the rest.
    // Up close to the phone, only a trace of the drift is left.
    const k = phone.step(time, dt);
    const drift = motion * (1 - 0.85 * k);
    const handX = (Math.sin(time * 0.4) * 0.7 + Math.sin(time * 1.1 + 1.3) * 0.3) * 0.012;
    const handY = (Math.sin(time * 0.5 + 0.4) * 0.7 + Math.sin(time * 1.3) * 0.3) * 0.006;
    // Looking out along -x, the screen's right is -z.
    eye.set(eyeAt.x, eyeAt.y + (-pointer.smoothY * 0.04 + handY) * drift, eyeAt.z - (pointer.smoothX * 0.12 + handX) * drift);
    look.set(aim.x, aim.y - pointer.smoothY * 0.15 * drift, aim.z - pointer.smoothX * 0.6 * drift);
    phone.frame(eye, look, k, camera.fov);
    camera.position.copy(eye);
    camera.lookAt(look);
    camera.updateMatrixWorld();

    world.update(time);

    world.sign.setHighlight(leaving ?? hint, !!leaving);

    grade.uBlur.value = phone.blur;
    grade.uVignette.value = GRADE.vignette;
    const first = stage!.render(dt, time, motion);

    const focal = camera.projectionMatrix.elements[5] * (height / 2);
    el.camera.style.transform = `perspective(${focal}px) translateZ(${focal}px)${cameraCSS(camera.matrixWorldInverse)} translate(${width / 2}px,${height / 2}px)`;
    el.sign.style.pointerEvents = leaving ? "none" : "";
    phone.fit(camera, width, height, grade.uCenter.value);

    if (first) options.onReady?.();
  }

  return {
    leave(href) {
      if (leaving) return false;
      leaving = href;
      return true;
    },
    hint(href) {
      hint = href;
    },
    hoverPhone: phone.hover,
    openDial: phone.openDial,
    callPhone: phone.call,
    setDark: stage.setDark,
    dispose() {
      cancelAnimationFrame(frame);
      resizer.disconnect();
      window.removeEventListener("pointermove", onPointer);
      stage!.dispose();
      el.sign.style.cssText = signStyle;
      el.sign.removeAttribute("data-modelled");
      phone.dispose();
      el.camera.style.cssText = cameraStyle;
    },
  };
}
