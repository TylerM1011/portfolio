import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createAtmosphere } from "../scene/atmosphere";
import { ink } from "../scene/style";
import { groundTexture, rng } from "../scene/util";
import { createCar } from "./car";
import { createForest } from "./forest";
import { createMeadow } from "./meadow";
import { createRoad, ROAD, wildness } from "./road";
import { createGantrySign, panelArt, SW, type GantryPanel, type SignItem } from "./sign";
import { day, dusk, type Palette } from "./palette";

// World units: the eye sits about 1 unit above the road and a metre is 0.44
// units (the car is a true-scale Polo). x is lateral, y is height, and the
// road runs away from the camera down -z. The road is a British dual
// carriageway (see road.ts): the car starts in the left lane on x = 0, the
// overtaking lane is to its right, and a side road joins from the left.
// The verges sit just below the asphalt.
const GROUND_Y = -0.02;

export const GANTRY_Z = -3;
// Posts on the nearside verge and in the central reservation.
const GANTRY_POSTS = ROAD.gantryPosts;
const GANTRY_TOP = 2.1;
// The truss's two chords; the signs are centred on them, faces this far in
// front of the truss.
const CHORD_Y = [GANTRY_TOP - 0.17, GANTRY_TOP - 0.02];
const TRUSS_MIDDLE = (CHORD_Y[0] + CHORD_Y[1]) / 2;
const SIGN_FACE = 0.157;

// Lays out the gantry's UK direction signs (see sign.ts), one per
// destination: a lane drop sign centred over each lane and covering at least
// three quarters of it (TSM 7, 9.1.4), and the lay-by exit off to their
// left. Each is centred on the truss. x is left to right; the invisible CSS
// sign spans the lot, flush on the faces.
export function layoutGantry<T extends SignItem>(items: readonly T[]) {
  const gap = 10 * SW;
  const panels: GantryPanel<T>[] = [];
  const top = (art: { height: number }) => TRUSS_MIDDLE + (art.height * SW) / 2;
  items
    .filter((item) => item.lateral >= 0)
    .forEach((item, lane) => {
      const art = panelArt(item, (0.75 * ROAD.lane) / SW);
      const x = lane * ROAD.lane;
      const half = (art.width * SW) / 2;
      panels.push({ item, art, left: x - half, right: x + half, top: top(art) });
    });
  for (const item of items.filter((item) => item.lateral < 0).reverse()) {
    const art = panelArt(item);
    const right = (panels[0]?.left ?? 0) - gap;
    panels.unshift({ item, art, left: right - art.width * SW, right, top: top(art) });
  }
  return {
    panels,
    left: panels[0].left,
    right: panels[panels.length - 1].right,
    top: Math.max(...panels.map((panel) => panel.top)),
    bottom: Math.min(...panels.map((panel) => panel.top - panel.art.height * SW)),
    z: GANTRY_Z + SIGN_FACE,
  };
}

export type GantryLayout = ReturnType<typeof layoutGantry<SignItem>>;

export const CAR_Z = -1.9;

// Shared helpers, kept importable from here for the other scenes.
export { canvasTexture, matte, radialTexture, rng } from "../scene/util";

// The meadow ground, shared by every scene: painted in broad swathes of
// one green (the palette's meadow ink, see palette.ts). What grows on it is
// in meadow.ts.
export function meadowGround(anisotropy: number) {
  const swathes = groundTexture(rng(5), { base: "#e4e4e4", light: "255,250,225", dark: "170,190,175" }, 0);
  swathes.wrapS = swathes.wrapT = THREE.RepeatWrapping;
  // One tile every 24 units: broad enough never to read as a pattern.
  swathes.repeat.set(4000 / 24, 4000 / 24);
  swathes.anisotropy = anisotropy;
  return ink({ map: swathes });
}

export type World = ReturnType<typeof buildWorld>;

export function buildWorld({
  anisotropy,
  detail,
  gantry: layout,
  font,
}: {
  anisotropy: number;
  detail: number;
  gantry: GantryLayout;
  font: string;
}) {
  const scene = new THREE.Scene();
  const rand = rng(11);
  const wind = { value: 0 };

  const mats = {
    ground: meadowGround(anisotropy),
    // Galvanised steel, gone dull: it takes the light like paint.
    gantry: ink({ color: 0xffffff }),
  };

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, GROUND_Y, -1000);
  ground.receiveShadow = true;
  scene.add(ground);

  const road = createRoad({ anisotropy });
  scene.add(road.group);

  // The meadow on the verges and out either side (see meadow.ts).
  const meadow = createMeadow({
    detail,
    rand,
    groundY: GROUND_Y,
    area: { x: [-18, 24], z: [8, -60] },
    clear: (x, z) => road.isPaved(x, z, 0.06),
    wildness,
    wind,
  });
  scene.add(meadow.group);

  // Gantry: two posts carrying a box truss, with the sign panels hung from
  // its front.
  const gantry = new THREE.Group();
  gantry.position.z = GANTRY_Z;
  for (const x of GANTRY_POSTS) {
    const post = new THREE.Mesh(new RoundedBoxGeometry(0.12, GANTRY_TOP, 0.12, 2, 0.025), mats.gantry);
    post.position.set(x, GANTRY_TOP / 2, 0);
    gantry.add(post);
    const foot = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.08, 0.3, 2, 0.02), mats.gantry);
    foot.position.set(x, 0.04, 0);
    gantry.add(foot);
  }
  // The truss runs past whichever is wider, the posts or the signs.
  const trussEnds = [Math.min(GANTRY_POSTS[0], layout.left) - 0.15, Math.max(GANTRY_POSTS[1], layout.right) + 0.15];
  const span = trussEnds[1] - trussEnds[0];
  const middle = (trussEnds[0] + trussEnds[1]) / 2;
  const chordY = CHORD_Y;
  for (const y of chordY) {
    for (const z of [-0.08, 0.08]) {
      const chord = new THREE.Mesh(new THREE.BoxGeometry(span, 0.04, 0.04), mats.gantry);
      chord.position.set(middle, y, z);
      gantry.add(chord);
    }
  }
  const bays = Math.round(span / 0.25);
  const bay = span / bays;
  const rise = chordY[1] - chordY[0];
  const brace = new THREE.BoxGeometry(Math.hypot(bay, rise), 0.018, 0.018);
  for (let i = 0; i < bays; i++) {
    for (const z of [-0.08, 0.08]) {
      const diagonal = new THREE.Mesh(brace, mats.gantry);
      diagonal.position.set(middle - span / 2 + (i + 0.5) * bay, (chordY[0] + chordY[1]) / 2, z);
      diagonal.rotation.z = (i % 2 === 0 ? 1 : -1) * Math.atan2(rise, bay);
      gantry.add(diagonal);
    }
  }
  gantry.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });
  const signs = createGantrySign(layout.panels, {
    font,
    z: SIGN_FACE - 0.001,
    metal: mats.gantry,
    anisotropy,
  });
  gantry.add(signs.group);
  scene.add(gantry);

  // The gantry's signs stand against clear sky: no tree near enough to
  // rise above their top edge, as seen from the resting camera, stands
  // behind them (allowing for the width of its crown).
  const eye = new THREE.Vector3(0, 0.9, 2.2);
  const signTop = Math.atan2(layout.top - eye.y, eye.z - layout.z);
  const signSpan = [Math.atan2(layout.left, eye.z - layout.z), Math.atan2(layout.right, eye.z - layout.z)];
  const behindSigns = (x: number, z: number, height: number) => {
    const distance = Math.hypot(x - eye.x, eye.z - z);
    const azimuth = Math.atan2(x - eye.x, eye.z - z);
    const crown = Math.atan2(height * 0.25, distance);
    return azimuth + crown > signSpan[0] && azimuth - crown < signSpan[1] && Math.atan2(height - eye.y, distance) > signTop - 0.03;
  };

  // Keep trees back from the road and side road, and out of the line between
  // the resting camera and the sun at its lowest.
  const sunAzimuth = day.sunAzimuth;
  const sunElevation = Math.min(day.sunElevation, dusk.sunElevation);
  const forest = createForest({
    detail,
    rand,
    groundY: GROUND_Y,
    keepClear: (x, z, height) => {
      if (road.isPaved(x, z, 3)) return true;
      if (behindSigns(x, z, height)) return true;
      const distance = Math.hypot(x, 2.2 - z);
      const azimuth = THREE.MathUtils.radToDeg(Math.atan2(x, 2.2 - z));
      const spread = THREE.MathUtils.radToDeg(Math.atan2(3, distance));
      const top = THREE.MathUtils.radToDeg(Math.atan2(height - 0.9, distance));
      return Math.abs(azimuth - sunAzimuth) < 4 + spread && top > sunElevation - 2;
    },
  });
  scene.add(forest.group);

  // The sky, clouds, dust, hills and light (see scene/atmosphere.ts). The
  // sun's shadow map is kept centred just ahead of the camera (see engine.ts).
  const atmosphere = createAtmosphere(scene, {
    rand,
    time: wind,
    clouds: { facing: 0 },
    dust: { count: Math.round(520 * detail), x: [-6, 6], y: [0.1, 3.2], z: [6, -30] },
    shadow: { extent: 14, distance: 60, far: 140, mapSize: 2048 },
    fog: [30, 560],
    hills: {
      far: { z: -440, depth: 280, base: 10, amp: 46, seed: 1.3 },
      near: { z: -250, depth: 130, base: 3, amp: 18, seed: 4.1 },
      valley: true,
    },
  });

  const car = createCar();
  car.group.position.z = CAR_Z;
  scene.add(car.group);

  function apply(p: Palette) {
    atmosphere.apply(p);
    mats.ground.color.set(p.meadow);
    meadow.setColor(p.meadow);
    road.setMeadow(p.meadow);
    road.setStuds(p.studs);
    mats.gantry.color.set(p.gantry);
    signs.setColors(p.sign, p.signGlow);
    car.applyPalette(p);
  }

  // Everything loaded asynchronously, settled (loaded or failed).
  const ready = Promise.allSettled([car.ready, forest.ready, signs.ready]);

  function dispose() {
    car.dispose();
    forest.dispose();
  }

  return { scene, atmosphere, ready, road, forest, wind, car, sign: signs, apply, dispose };
}
