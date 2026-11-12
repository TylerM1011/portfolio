import * as THREE from "three";
import type { Palette } from "../road/palette";
import type { Atmosphere } from "./atmosphere";
import { createPost } from "./post";
import { finish } from "./style";
import { disposeTree } from "./util";

// The renderer, post chain, environment light and sizing that every scene
// shares. Each engine builds its world through here and only adds its own
// camera work, so the three scenes render the same way and cannot drift
// apart: the same light, shadows, grade, pixel ratio and house style (see
// style.ts).

export type StageWorld<P extends Palette> = {
  scene: THREE.Scene;
  atmosphere: Atmosphere;
  // Everything loaded asynchronously, settled (loaded or failed).
  ready: Promise<unknown>;
  apply: (palette: P) => void;
  // Stops anything still loading from being added once the stage is gone.
  dispose?: () => void;
};

export type BuildOptions = { anisotropy: number; detail: number };

// Below this width, scenes draw less (grass, trees, dust, shadow detail) at
// a lower pixel ratio.
export const COMPACT_WIDTH = 700;

export type Stage<P extends Palette, W extends StageWorld<P>> = NonNullable<ReturnType<typeof createStage<P, W>>>;

export function createStage<P extends Palette, W extends StageWorld<P>>(
  el: { container: HTMLElement; stage: HTMLElement },
  options: { build: (options: BuildOptions) => W; palettes: { day: P; dusk: P }; dark: boolean; fov: number },
) {
  // The stage owns its canvas so it can release the GL context on dispose
  // and start clean with a new one when the page is shown again.
  const canvas = document.createElement("canvas");
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  // Shown at once with the first frame, under the loading screen.
  canvas.className = "absolute inset-0 h-full w-full opacity-0";
  // No tone mapping: the inks (see style.ts) and the light are chosen to
  // come out as they are, as a print's colours would.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  el.stage.append(canvas);

  const compact = el.container.clientWidth < COMPACT_WIDTH;
  const world = options.build({ anisotropy: renderer.capabilities.getMaxAnisotropy(), detail: compact ? 0.45 : 1 });
  const { scene } = world;
  const camera = new THREE.PerspectiveCamera(options.fov, 1, 0.1, 3000);
  const { composer, grade } = createPost(renderer, scene, camera);

  // Everything built so far, then anything added once `ready` settles.
  finish(scene);
  const ready = world.ready.then(() => finish(scene));

  // The light is the sun and the sky's fill alone: no environment map,
  // since nothing in the style reflects.
  function setDark(dark: boolean) {
    world.apply(dark ? options.palettes.dusk : options.palettes.day);
  }
  setDark(options.dark);

  const size = { width: 1, height: 1 };
  // Fits the canvas to the container; the engine then sets its lens.
  function resize() {
    size.width = Math.max(1, el.container.clientWidth);
    size.height = Math.max(1, el.container.clientHeight);
    const ratio = Math.min(window.devicePixelRatio, size.width < COMPACT_WIDTH ? 1.5 : 1.75);
    renderer.setPixelRatio(ratio);
    renderer.setSize(size.width, size.height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(size.width, size.height);
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    return size;
  }

  let shown = false;
  // Draws a frame with the camera where the engine has put it. Returns true
  // the first time, once the frame is on screen.
  function render(dt: number, seconds: number, motion: number) {
    world.atmosphere.update(camera, seconds, motion, size.height * renderer.getPixelRatio());
    grade.uTime.value = seconds;
    composer.render(dt);
    if (shown) return false;
    shown = true;
    canvas.style.opacity = "1";
    return true;
  }

  function dispose() {
    world.dispose?.();
    disposeTree(scene);
    for (const pass of composer.passes) pass.dispose();
    composer.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }

  return { renderer, world, camera, grade, size, ready, setDark, resize, render, dispose };
}
