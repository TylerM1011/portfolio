import * as THREE from "three";
import { cameraCSS, objectCSS } from "../road/engine";
import { createPhoneRig } from "../road/phone";
import { SW } from "../road/sign";
import { GRADE } from "../scene/post";
import { createStage } from "../scene/stage";
import { day, dusk } from "./palette";
import { buildYard, EYE, LOOK, SIGNPOST, type SignpostLayout } from "./world";

// The yard is a backdrop under the page, so the camera only drifts. The lens
// keeps about this much of the site across the screen, and widens on narrow
// screens until the crane fits.
const FOV_ACROSS = 74;
const MIN_FOV = 36;
const MAX_FOV = 72;

// The signpost's HTML links are laid out in em, one stroke width (see
// road/sign.ts), at 400px to a world unit, as on the road scene.
const SIGN_PX_PER_UNIT = 400;

export type YardElements = {
  container: HTMLElement;
  stage: HTMLElement;
  camera: HTMLElement;
  sign: HTMLElement;
  phone: HTMLElement;
};
export type YardOptions = {
  dark: boolean;
  reducedMotion: boolean;
  sign: { font: string; layout: SignpostLayout };
  // Called once the first frame is on screen.
  onReady?: () => void;
};
export type YardEngine = {
  // Holds the chosen panel lit while the page fades out (see LoadingScreen).
  leave: (lateral: number) => boolean;
  hint: (lateral: number | null) => void;
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

export function createYardEngine(el: YardElements, options: YardOptions): YardEngine | null {
  const layout = options.sign.layout;
  const stage = createStage(el, {
    build: ({ anisotropy, detail }) => buildYard({ anisotropy, detail, signpost: layout, font: options.sign.font }),
    palettes: { day, dusk },
    dark: options.dark,
    fov: fitFov(16 / 9),
  });
  if (!stage) return null;
  const { world, camera, grade } = stage;

  // The signpost stands still in the yard; the scene draws it, and the HTML
  // sign is laid over it in 3D as the links, showing only their focus rings
  // (see globals.css).
  const signStyle = el.sign.style.cssText;
  const cameraStyle = el.camera.style.cssText;
  const signFrame = new THREE.Matrix4().compose(
    new THREE.Vector3((layout.left + layout.right) / 2, (layout.top + layout.bottom) / 2, layout.z),
    new THREE.Quaternion(),
    new THREE.Vector3().setScalar(1 / SIGN_PX_PER_UNIT),
  );
  const signMatrix = new THREE.Matrix4();
  Object.assign(el.sign.style, { left: "0", top: "0", fontSize: `${SW * SIGN_PX_PER_UNIT}px` });
  el.sign.setAttribute("data-modelled", "");
  // The phone's button is a plain box over the phone, refitted every frame.
  const phone = createPhoneRig(world.phone, { element: el.phone, reducedMotion: options.reducedMotion });
  // Out to the side, 70% of the way to the edge of the shot at its depth,
  // clear of the sheets but still in view on narrow screens.
  function placeSign() {
    const reach = (EYE.z - SIGNPOST.z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    world.placeSignpost(reach * 0.7);
    signMatrix.multiplyMatrices(world.signpost.matrixWorld, signFrame);
    el.sign.style.transform = objectCSS(signMatrix);
  }

  let width = 1;
  let height = 1;
  function resize() {
    ({ width, height } = stage!.resize());
    camera.fov = fitFov(camera.aspect);
    camera.updateProjectionMatrix();
    el.camera.style.width = `${width}px`;
    el.camera.style.height = `${height}px`;
    placeSign();
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
  let leaving: { lateral: number } | null = null;
  let hint: number | null = null;
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  // Hold the first frame until the trees and meadow are in place.
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
    // A slow handheld drift, leaning toward the pointer. Up close to the
    // phone, only a trace of it is left.
    const k = phone.step(time, dt);
    const drift = motion * (1 - 0.9 * k);
    const handX = (Math.sin(time * 0.4) * 0.7 + Math.sin(time * 1.1 + 1.3) * 0.3) * 0.03;
    const handY = (Math.sin(time * 0.5 + 0.4) * 0.7 + Math.sin(time * 1.3) * 0.3) * 0.015;
    eye.set(EYE.x + (pointer.smoothX * 0.6 + handX) * drift, EYE.y + (-pointer.smoothY * 0.15 + handY) * drift, EYE.z);
    look.set(LOOK.x + pointer.smoothX * 1.2 * drift, LOOK.y, LOOK.z);
    phone.frame(eye, look, k, camera.fov);
    camera.position.copy(eye);
    camera.lookAt(look);
    camera.updateMatrixWorld();

    // Hovering a destination lights its panel, a little more once chosen.
    world.sign.setHighlight(leaving ? leaving.lateral : hint, !!leaving);

    world.update(time, motion);

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
    leave(lateral) {
      if (leaving) return false;
      leaving = { lateral };
      return true;
    },
    hint(lateral) {
      hint = lateral;
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
