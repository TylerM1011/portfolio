import * as THREE from "three";
import { disposeTree } from "../road/car";
import { createPost } from "../road/post";
import { day, dusk } from "./palette";
import { buildYard, EYE, LOOK } from "./world";

// The yard is a backdrop: the page scrolls over it, so the camera only
// drifts. The lens keeps about this much of the site across the screen, and
// widens on narrow screens until the crane fits.
const FOV_ACROSS = 74;
const MIN_FOV = 36;
const MAX_FOV = 72;

export type YardElements = { container: HTMLElement; stage: HTMLElement };
export type YardOptions = { dark: boolean; reducedMotion: boolean };
export type YardEngine = { setDark: (dark: boolean) => void; dispose: () => void };

function fitFov(aspect: number) {
  const half = Math.tan(THREE.MathUtils.degToRad(FOV_ACROSS / 2)) / aspect;
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(half)), MIN_FOV, MAX_FOV);
}

export function createYardEngine(el: YardElements, options: YardOptions): YardEngine | null {
  // As on the road scene, the engine owns its canvas so it can release the
  // GL context on dispose.
  const canvas = document.createElement("canvas");
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  canvas.className = "absolute inset-0 h-full w-full opacity-0 transition-opacity duration-1200";
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  el.stage.append(canvas);

  const compact = el.container.clientWidth < 700;
  const world = buildYard({ anisotropy: renderer.capabilities.getMaxAnisotropy(), detail: compact ? 0.45 : 1 });
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

  let height = 1;
  function resize() {
    const width = Math.max(1, el.container.clientWidth);
    height = Math.max(1, el.container.clientHeight);
    const ratio = Math.min(window.devicePixelRatio, width < 700 ? 1.5 : 1.75);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.fov = fitFov(camera.aspect);
    camera.updateProjectionMatrix();
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
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  let rise = 0;
  let shown = false;
  // Hold the first frame until the trees and meadow are in place.
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
    // Scrolling down the page lifts the camera a little, as if climbing the
    // bank for a view over the fence.
    const scrolled = Math.min(1, window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight));
    rise += (scrolled - rise) * (1 - Math.exp(-dt * 3));

    // A slow handheld drift, leaning toward the pointer.
    const handX = (Math.sin(time * 0.4) * 0.7 + Math.sin(time * 1.1 + 1.3) * 0.3) * 0.03;
    const handY = (Math.sin(time * 0.5 + 0.4) * 0.7 + Math.sin(time * 1.3) * 0.3) * 0.015;
    eye.set(EYE.x + (pointer.smoothX * 0.6 + handX) * motion, EYE.y + (-pointer.smoothY * 0.15 + handY + rise * 1.2) * motion, EYE.z);
    look.set(LOOK.x + pointer.smoothX * 1.2 * motion, LOOK.y - rise * 0.6 * motion, LOOK.z);
    camera.position.copy(eye);
    camera.lookAt(look);
    camera.updateMatrixWorld();

    world.update(time, motion);
    world.sky.position.copy(camera.position);
    world.clouds.position.x = Math.sin(time * 0.006) * 25 * motion;
    world.dust.uniforms.uScale.value =
      (height * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));

    grade.uTime.value = time;
    grade.uBlur.value = 0;
    grade.uAberration.value = 0.0015;
    grade.uVignette.value = 0.45;
    composer.render(dt);

    if (!shown) {
      shown = true;
      canvas.style.opacity = "1";
    }
  }

  return {
    setDark,
    dispose() {
      cancelAnimationFrame(frame);
      resizer.disconnect();
      window.removeEventListener("pointermove", onPointer);
      world.forest.dispose();
      disposeTree(scene);
      environment?.dispose();
      pmrem.dispose();
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
