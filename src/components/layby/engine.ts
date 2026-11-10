import * as THREE from "three";
import { disposeTree } from "../road/car";
import { cameraCSS, objectCSS } from "../road/engine";
import { day, dusk } from "./palette";
import { createPost } from "../road/post";
import { SW } from "../road/sign";
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

// The phone rings for this long every RING_EVERY seconds, until the visitor
// has had a go at it. The door stays open this long after a call.
const RING_EVERY = 7;
const RING_FOR = 1.1;
const CALL_HOLD = 6;

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
  // The pointer or focus is on the phone: the door eases ajar.
  hoverPhone: (on: boolean) => void;
  // The phone was used: the door swings open and the handset comes off.
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

const approach = (value: number, target: number, rate: number, dt: number) => value + (target - value) * (1 - Math.exp(-dt * rate));

export function createLaybyEngine(el: LaybyElements, options: LaybyOptions): LaybyEngine | null {
  const canvas = document.createElement("canvas");
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  canvas.className = "absolute inset-0 h-full w-full opacity-0";
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  el.stage.append(canvas);

  const compact = el.container.clientWidth < 700;
  const world = buildLayby({
    anisotropy: renderer.capabilities.getMaxAnisotropy(),
    detail: compact ? 0.45 : 1,
    routeSign: options.sign.art,
    font: options.sign.font,
  });
  const { scene } = world;
  const camera = new THREE.PerspectiveCamera(fitFov(16 / 9), 1, 0.1, 3000);
  const { composer, grade } = createPost(renderer, scene, camera);

  const pmrem = new THREE.PMREMGenerator(renderer);
  let environment: THREE.WebGLRenderTarget | null = null;
  function setDark(dark: boolean) {
    const palette = dark ? dusk : day;
    world.apply(palette);
    renderer.toneMappingExposure = palette.exposure;
    environment?.dispose();
    environment = world.withDimSun(() => pmrem.fromScene(world.skyScene, 0.04, 0.1, 3000));
    scene.environment = environment.texture;
  }
  setDark(options.dark);

  // The scene draws the route sign; its HTML links are laid over it in 3D,
  // showing only their focus rings (see globals.css). It stands still, so
  // they are placed once.
  const signStyle = el.sign.style.cssText;
  const cameraStyle = el.camera.style.cssText;
  const phoneStyle = el.phone.style.cssText;
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
  // The phone's link is a plain box over the phone, refitted every frame.
  Object.assign(el.phone.style, { left: "0", top: "0", right: "auto", bottom: "auto", transform: "none", aspectRatio: "auto" });
  el.phone.setAttribute("data-modelled", "");

  const eyeAt = EYE.clone();
  const aim = LOOK.clone();

  let width = 1;
  let height = 1;
  function resize() {
    width = Math.max(1, el.container.clientWidth);
    height = Math.max(1, el.container.clientHeight);
    const ratio = Math.min(window.devicePixelRatio, width < 700 ? 1.5 : 1.75);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    camera.aspect = width / height;
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

  // The corners of the phone housing, door shut, for fitting its link.
  const phoneBox = new THREE.Box3().setFromObject(world.phone);
  const phoneCorners = Array.from({ length: 8 }, (_, i) =>
    new THREE.Vector3(
      i & 1 ? phoneBox.max.x : phoneBox.min.x,
      i & 2 ? phoneBox.max.y : phoneBox.min.y,
      i & 4 ? phoneBox.max.z : phoneBox.min.z,
    ),
  );
  const corner = new THREE.Vector3();
  function fitPhone() {
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const point of phoneCorners) {
      corner.copy(point).project(camera);
      const x = ((corner.x + 1) / 2) * width;
      const y = ((1 - corner.y) / 2) * height;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    // A little slack round the box, so it is easy to hit.
    const pad = 6;
    el.phone.style.transform = `translate(${left - pad}px,${top - pad}px)`;
    el.phone.style.width = `${right - left + 2 * pad}px`;
    el.phone.style.height = `${bottom - top + 2 * pad}px`;
  }

  const pointer = { x: 0, y: 0, smoothX: 0, smoothY: 0 };
  const onPointer = (event: PointerEvent) => {
    pointer.x = THREE.MathUtils.clamp((event.clientX / window.innerWidth) * 2 - 1, -1, 1);
    pointer.y = THREE.MathUtils.clamp((event.clientY / window.innerHeight) * 2 - 1, -1, 1);
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  const motion = options.reducedMotion ? 0 : 1;
  let leaving: string | null = null;
  let hint: string | null = null;
  let hovering = false;
  let calledAt = -Infinity;
  let used = false;
  const phone = { open: 0, lift: 0, ring: 0 };
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  let shown = false;
  let loaded = false;
  void world.ready.then(() => {
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
    world.wind.value = time * motion;

    const settle = 1 - Math.exp(-dt * 2.5);
    pointer.smoothX += (pointer.x - pointer.smoothX) * settle;
    pointer.smoothY += (pointer.y - pointer.smoothY) * settle;
    // A slow handheld drift, leaning toward the pointer. Kept small: the
    // phone is close, so it swings across the screen more than the rest.
    const handX = (Math.sin(time * 0.4) * 0.7 + Math.sin(time * 1.1 + 1.3) * 0.3) * 0.012;
    const handY = (Math.sin(time * 0.5 + 0.4) * 0.7 + Math.sin(time * 1.3) * 0.3) * 0.006;
    // Looking out along -x, the screen's right is -z.
    eye.set(eyeAt.x, eyeAt.y + (-pointer.smoothY * 0.04 + handY) * motion, eyeAt.z - (pointer.smoothX * 0.12 + handX) * motion);
    look.set(aim.x, aim.y - pointer.smoothY * 0.15 * motion, aim.z - pointer.smoothX * 0.6 * motion);
    camera.position.copy(eye);
    camera.lookAt(look);
    camera.updateMatrixWorld();

    // The phone: ajar while hovered, wide open with the handset off the
    // hook for a while after a call, and otherwise ringing now and then
    // until it has been touched.
    const calling = time - calledAt < CALL_HOLD;
    const ringing = !used && !hovering && motion > 0 && time % RING_EVERY < RING_FOR;
    const instant = motion === 0 ? 1e3 : 1;
    phone.open = approach(phone.open, calling ? 1 : hovering ? 0.22 : 0, (calling ? 5 : 7) * instant, dt);
    phone.lift = approach(phone.lift, calling && phone.open > 0.7 ? 1 : 0, 6 * instant, dt);
    phone.ring = approach(phone.ring, ringing ? 1 : 0, 18, dt);
    world.update(time, phone);

    world.sign.setHighlight(leaving ?? hint, !!leaving);
    world.sky.position.copy(camera.position);
    world.clouds.position.x = Math.sin(time * 0.006) * 25 * motion;
    world.dust.uniforms.uScale.value =
      (height * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));

    grade.uTime.value = time;
    grade.uBlur.value = 0;
    grade.uAberration.value = 0.0015;
    grade.uVignette.value = 0.45;
    composer.render(dt);

    const focal = camera.projectionMatrix.elements[5] * (height / 2);
    el.camera.style.transform = `perspective(${focal}px) translateZ(${focal}px)${cameraCSS(camera.matrixWorldInverse)} translate(${width / 2}px,${height / 2}px)`;
    el.sign.style.pointerEvents = leaving ? "none" : "";
    fitPhone();

    if (!shown) {
      shown = true;
      canvas.style.opacity = "1";
      options.onReady?.();
    }
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
    hoverPhone(on) {
      hovering = on;
      if (on) used = true;
    },
    callPhone() {
      used = true;
      calledAt = performance.now() / 1000;
    },
    setDark,
    dispose() {
      cancelAnimationFrame(frame);
      resizer.disconnect();
      window.removeEventListener("pointermove", onPointer);
      world.car.dispose();
      world.forest.dispose();
      disposeTree(scene);
      environment?.dispose();
      pmrem.dispose();
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      el.sign.style.cssText = signStyle;
      el.sign.removeAttribute("data-modelled");
      el.phone.style.cssText = phoneStyle;
      el.phone.removeAttribute("data-modelled");
      el.camera.style.cssText = cameraStyle;
    },
  };
}
