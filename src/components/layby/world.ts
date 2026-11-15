import * as THREE from "three";
import { createCar } from "../road/car";
import { createForest } from "../road/forest";
import type { Palette } from "../road/palette";
import { createRoad, mowVerges, ROAD, wildness } from "../road/road";
import { day, dusk } from "./palette";
import { createLaybyProps, EYE, LOOK } from "./props";
import { createMeadow } from "../road/meadow";
import { meadowGround } from "../road/world";
import { createAtmosphere } from "../scene/atmosphere";
import { ink } from "../scene/style";
import { rng } from "../scene/util";

// The lay-by off the home page's dual carriageway (see road/road.ts), where
// the car pulled in. Same world units: 0.44 to the metre, x lateral, y up,
// the road running away down -z. The camera stands out on the carriageway
// and looks straight across the lay-by at the verge, side on, so the road
// itself stays out of shot: the parked car, the emergency phone, the bin, the
// route sign, and the trees behind.
const GROUND_Y = -0.02;
const PARKED_Z = -16.3;
// The woods behind the verge.
const WOODS = { x: [-15, -6] as [number, number], z: [-4, -26] as [number, number], count: 150 };

// The camera, and the props it looks at (see props.ts).
export { EYE, LOOK };

export type Layby = ReturnType<typeof buildLayby>;

export function buildLayby({
  anisotropy,
  detail,
  font,
}: {
  anisotropy: number;
  detail: number;
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

  // The mown verges are painted into the ground (see road.ts).
  mowVerges(mats.ground);
  const road = createRoad({ anisotropy });
  scene.add(road.group);

  // The route sign, the emergency phone and the bin (see props.ts).
  const props = createLaybyProps({ rand, groundY: GROUND_Y, font, anisotropy, post: mats.galvanised });
  scene.add(props.group);
  const { phone, sign } = props;

  // The meadow on the verge and the bank, as on the road (see meadow.ts):
  // mown by the lay-by, wilder up the bank, with flowers in the drifts.
  const meadow = createMeadow({
    detail,
    rand,
    groundY: GROUND_Y,
    area: { x: [-16, 1], z: [EYE.z + 12, EYE.z - 16] },
    clear: (x, z) => road.isPaved(x, z, 0.06) || props.occupied(x, z),
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

  // The car from the home page, pulled in, side on to the camera.
  const parked = createCar();
  parked.group.position.set(ROAD.layby.x, 0, PARKED_Z);
  scene.add(parked.group);

  function apply(p: Palette) {
    atmosphere.apply(p);
    mats.ground.color.set(p.meadow);
    meadow.setColor(p.meadow);
    // The camera stands among them here, where they would only be a blur
    // of colour at the foot of the shot: they stay unlit.
    road.setStuds(0);
    mats.galvanised.color.set(p.gantry);
    // Lit from the front here, so its sheeting needs little help.
    sign.setColors(p.sign, p.signGlow * 0.3);

    // Parked with the engine off: no headlights.
    parked.applyPalette({ ...p, headlights: 0 });
  }

  const ready = Promise.allSettled([parked.ready, forest.ready, sign.ready]);

  function dispose() {
    parked.dispose();
    forest.dispose();
  }

  return { scene, atmosphere, ready, car: parked, apply, sign, phone, dispose };
}
