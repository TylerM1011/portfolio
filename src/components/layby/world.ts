import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { createCar } from "../road/car";
import { createForest } from "../road/forest";
import { createPhone } from "../road/phone";
import type { Palette } from "../road/palette";
import { createRoad, ROAD, wildness } from "../road/road";
import { day, dusk } from "./palette";
import { createRouteSign, type RouteSignArt } from "./sign";
import { createMeadow } from "../road/meadow";
import { meadowGround } from "../road/world";
import { createAtmosphere } from "../scene/atmosphere";
import { ink } from "../scene/style";
import { canvasTexture, matte, rng } from "../scene/util";

// The lay-by off the home page's dual carriageway (see road/road.ts), where
// the car pulled in. Same world units: 0.44 to the metre, x lateral, y up,
// the road running away down -z. The camera stands out on the carriageway
// and looks straight across the lay-by at the verge, side on, so the road
// itself stays out of shot: the parked car, the emergency phone, the bin, the
// route sign, and the trees behind.
const M = ROAD.metre;
const GROUND_Y = -0.02;
const KERB = ROAD.layby.back - 0.125 * M;

export const EYE = new THREE.Vector3(0.4, 0.75, -14.3);
export const LOOK = new THREE.Vector3(-6, 0.65, -14.5);

// Along the verge, just behind the kerb, left to right on screen (down -z):
// the route sign standing back on the bank, the emergency telephone near
// the middle of the shot, the litter bin, then the parked car. `bottom` is
// the sign's lower edge, about 1.8 m up.
export const ROUTE_SIGN = { x: -4.5, z: -11.8, bottom: 0.78 };
const PHONE = { x: KERB - 0.35, z: -13.4 };
const BIN = { x: KERB - 0.45, z: -14.9 };
const PARKED_Z = -16.3;
// The woods behind the verge.
const WOODS = { x: [-15, -6] as [number, number], z: [-4, -26] as [number, number], count: 150 };

// The bin's wrap: dark green steel, gold bands and the word LITTER, centred
// on the back of the texture (the body is turned to bring it round).
function binTexture() {
  return canvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = "#213c2f";
    ctx.fillRect(0, 0, 512, 256);
    for (let x = 0; x < 512; x += 32) {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(x, 0, 3, 256);
    }
    ctx.fillStyle = "#b8963e";
    ctx.fillRect(0, 26, 512, 8);
    ctx.fillRect(0, 222, 512, 8);
    ctx.font = "700 44px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("LITTER", 256, 128);
    // Grime splashed up from the verge.
    const grime = ctx.createLinearGradient(0, 150, 0, 256);
    grime.addColorStop(0, "rgba(70,55,35,0)");
    grime.addColorStop(1, "rgba(70,55,35,0.45)");
    ctx.fillStyle = grime;
    ctx.fillRect(0, 0, 512, 256);
  });
}

function shadowed<T extends THREE.Object3D>(object: T) {
  object.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;
  });
  return object;
}

// A council litter bin on a concrete pad, overflowing as lay-by bins do: a
// bag dumped beside it and a can in the grass.
function createBin(rand: () => number) {
  const group = new THREE.Group();
  const R = 0.27 * M;
  const H = 0.85 * M;
  const green = matte({ color: 0x213c2f, roughness: 0.6, metalness: 0.3 });
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.8 * M, 0.06 * M, 0.8 * M).translate(0, 0.03 * M, 0), matte({ color: 0xa9a59c })));
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R * 0.92, H, 28, 1, true).translate(0, H / 2 + 0.06 * M, 0),
    ink({ map: binTexture(), roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }),
  );
  body.rotation.y = Math.PI;
  group.add(body);
  // A domed hood over an opening at the front.
  const top = H + 0.06 * M;
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.05 * M, 28).translate(0, top + 0.18 * M, 0), green));
  group.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 28, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1).translate(0, top + 0.2 * M, 0), green));
  for (const a of [-1.15, 1.15, Math.PI]) {
    group.add(
      new THREE.Mesh(new THREE.BoxGeometry(0.06 * M, 0.2 * M, 0.04 * M).translate(Math.sin(a) * R * 0.98, top + 0.09 * M, Math.cos(a) * R * 0.98), green),
    );
  }
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.98, R * 0.98, 0.012, 28).translate(0, top, 0), matte({ color: 0x0b0c0b })));
  // Rubbish poking up out of the opening.
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.16 * M, 0.06 * M, 0.12 * M).rotateZ(0.3).translate(0.05 * M, top + 0.04 * M, 0.05 * M), matte({ color: 0xd8d2c0 })));

  // A black bag, slumped against the bin.
  const bag = mergeVertices(new THREE.IcosahedronGeometry(1, 3).deleteAttribute("uv").deleteAttribute("normal"));
  const p = new THREE.Vector3();
  const position = bag.attributes.position;
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const bulge = 1 + 0.12 * Math.sin(p.x * 5 + p.y * 3) + 0.06 * (rand() - 0.5);
    position.setXYZ(i, p.x * bulge, Math.max(p.y, -0.85) * (p.y > 0.6 ? 1 - (p.y - 0.6) * 0.8 : 1), p.z * bulge);
  }
  bag.computeVertexNormals();
  const plastic = ink({ color: 0x151517, roughness: 0.32, metalness: 0.1 });
  const sack = new THREE.Mesh(bag, plastic);
  sack.scale.set(0.22 * M, 0.3 * M, 0.2 * M);
  sack.position.set(R + 0.18 * M, 0.25 * M, 0.12 * M);
  sack.rotation.set(0.1, 0.4, -0.25);
  group.add(sack);
  group.add(new THREE.Mesh(new THREE.ConeGeometry(0.035 * M, 0.12 * M, 8).translate(R + 0.24 * M, 0.58 * M, 0.12 * M), plastic));

  const can = new THREE.Mesh(
    new THREE.CylinderGeometry(0.033 * M, 0.033 * M, 0.12 * M, 14).rotateZ(Math.PI / 2),
    ink({ color: 0xc8202a, roughness: 0.3, metalness: 0.7 }),
  );
  can.position.set(-0.5 * M, 0.033 * M, 0.45 * M);
  can.rotation.y = 0.7;
  group.add(can);
  return shadowed(group);
}

export type Layby = ReturnType<typeof buildLayby>;

export function buildLayby({
  anisotropy,
  detail,
  routeSign: art,
  font,
}: {
  anisotropy: number;
  detail: number;
  routeSign: RouteSignArt;
  font: string;
}) {
  const scene = new THREE.Scene();
  const rand = rng(31);
  const wind = { value: 0 };

  const mats = {
    ground: meadowGround(anisotropy),
    // As on the road's gantry: dull galvanised steel.
    galvanised: ink({ color: 0xa4adb7, metalness: 0.3, roughness: 0.55 }),
  };

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, GROUND_Y, -1000);
  ground.receiveShadow = true;
  scene.add(ground);

  const road = createRoad({ anisotropy });
  scene.add(road.group);

  // Everything on the verge turns to face the camera, the phone a little
  // further so it shows its side.
  const facing = (x: number, z: number) => Math.atan2(EYE.x - x, EYE.z - z);
  const phone = createPhone({ post: mats.galvanised });
  phone.group.position.set(PHONE.x, GROUND_Y, PHONE.z);
  // A touch over life size, so it holds its own in the shot.
  phone.group.scale.setScalar(1.25);
  phone.group.rotation.y = facing(PHONE.x, PHONE.z) + 0.35;
  scene.add(phone.group);
  const bin = createBin(rand);
  bin.position.set(BIN.x, GROUND_Y, BIN.z);
  bin.rotation.y = facing(BIN.x, BIN.z);
  scene.add(bin);

  // The route sign, back on the bank, square to the camera.
  const sign = createRouteSign(art, { font, bottom: ROUTE_SIGN.bottom, z: 0.12, anisotropy });
  sign.group.position.set(ROUTE_SIGN.x, GROUND_Y, ROUTE_SIGN.z);
  sign.group.rotation.y = facing(ROUTE_SIGN.x, ROUTE_SIGN.z);
  scene.add(sign.group);

  // Clear of the things on the verge, and of the camera's feet.
  const footprints = [
    [PHONE.x, PHONE.z, 0.2],
    [BIN.x, BIN.z, 0.35],
    [ROUTE_SIGN.x - 0.45, ROUTE_SIGN.z, 0.12],
    [ROUTE_SIGN.x + 0.45, ROUTE_SIGN.z, 0.12],
  ];
  const clear = (x: number, z: number) => footprints.some(([fx, fz, r]) => Math.hypot(x - fx, z - fz) < r);

  // The meadow on the verge and the bank, as on the road (see meadow.ts):
  // mown by the lay-by, wilder up the bank, with flowers in the drifts.
  const meadow = createMeadow({
    detail,
    rand,
    groundY: GROUND_Y,
    area: { x: [-16, 1], z: [EYE.z + 12, EYE.z - 16] },
    clear: (x, z) => road.isPaved(x, z, 0.06) || clear(x, z),
    wildness,
    wind,
  });
  scene.add(meadow.group);

  // Pines on the bank behind the verge, held back from the road, and none
  // behind the camera (nor on the line to the sun).
  const sunAzimuth = day.sunAzimuth;
  const sunElevation = Math.min(day.sunElevation, dusk.sunElevation);
  const forest = createForest({
    detail,
    rand,
    groundY: GROUND_Y,
    woods: WOODS,
    // The camera stands at the trees' feet here; smaller trees keep the
    // sign, the phone and the sky in the shot, as a print would.
    scale: 0.5,
    keepClear: (x, z, height) => {
      if (road.isPaved(x, z, 3)) return true;
      if (x > 0) return true;
      const distance = Math.hypot(x - EYE.x, EYE.z - z);
      const azimuth = THREE.MathUtils.radToDeg(Math.atan2(x - EYE.x, EYE.z - z));
      const spread = THREE.MathUtils.radToDeg(Math.atan2(3, distance));
      const top = THREE.MathUtils.radToDeg(Math.atan2(height - EYE.y, distance));
      return Math.abs(azimuth - sunAzimuth) < 4 + spread && top > sunElevation - 2;
    },
  });
  scene.add(forest.group);
  // With the sun this low and off to the side, the groves' shadows would
  // fall right across the carriageway and the lay-by; keep it in the light.
  forest.group.traverse((object) => {
    object.castShadow = false;
  });

  // The sky, clouds, dust, hills and light (see scene/atmosphere.ts). The
  // camera barely moves, so the shadow map sits still over the lay-by.
  const atmosphere = createAtmosphere(scene, {
    rand,
    time: wind,
    // Spread across the shot, which looks out along -x.
    clouds: { facing: -90 },
    dust: { count: Math.round(420 * detail), x: [-7, 1], y: [0.1, 2.7], z: [EYE.z + 7, EYE.z - 7] },
    shadow: { extent: 14, distance: 60, far: 140, mapSize: detail < 1 ? 1024 : 2048 },
    fog: [30, 560],
    hills: {
      far: { z: -440, depth: 280, base: 10, amp: 46, seed: 1.3 },
      near: { z: -250, depth: 130, base: 3, amp: 18, seed: 4.1 },
      valley: true,
    },
  });
  atmosphere.aimSun(new THREE.Vector3(-3, 0, EYE.z));

  // The car from the home page, pulled in, side on to the camera, hazards
  // on.
  const parked = createCar();
  parked.group.position.set(ROAD.layby.x, 0, PARKED_Z);
  // The flashers are sized for the home page's view from well behind.
  for (const blinker of parked.blinkers) blinker.scale.setScalar(0.06);
  scene.add(parked.group);

  function apply(p: Palette) {
    atmosphere.apply(p);
    mats.ground.color.set(p.meadow);
    meadow.setColor(p.meadow);
    road.setMeadow(p.meadow);
    // The camera stands among them here, where they would only be a blur
    // of colour at the foot of the shot: they stay unlit.
    road.setStuds(0);
    mats.galvanised.color.set(p.gantry);
    // Lit from the front here, so its sheeting needs little help.
    sign.setColors(p.sign, p.signGlow * 0.3);

    // Parked with the engine off: no headlights.
    parked.applyPalette({ ...p, headlights: 0 });
  }

  function update(time: number) {
    // Hazard lights, about 90 flashes a minute. Only the near side's: from
    // here the far lamp is round the car's rear corner, so its glow would
    // hang in the air past the bodywork.
    const [far, near] = parked.blinkers;
    far.visible = false;
    near.visible = Math.floor(time * 3) % 2 === 0;
  }

  const ready = Promise.allSettled([parked.ready, forest.ready, sign.ready]);

  function dispose() {
    parked.dispose();
    forest.dispose();
  }

  return { scene, atmosphere, ready, car: parked, apply, update, sign, phone, dispose };
}
