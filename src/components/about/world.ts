import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CAR_HEIGHT, createCar } from "../road/car";
import { meadowGround } from "../road/world";
import { createAtmosphere } from "../scene/atmosphere";
import { ink } from "../scene/style";
import { rng } from "../scene/util";
import type { AboutPalette } from "./palette";
import {
  asphaltTexture,
  brickTexture,
  dialTexture,
  fanlightTexture,
  floorTexture,
  paneTexture,
  pathTexture,
  posterTexture,
  blueprintTexture,
  rugTexture,
  screenTexture,
  slabTexture,
} from "./textures";

// The about page: a Victorian terrace, seen from across the street, and the
// front room behind its door. Same world units as the other scenes (0.44 to
// the metre, y up); the house fronts stand on z = 0 facing +z, toward the
// camera, and the street runs along x. Our house is the one in the middle,
// its door on the left (ajar) and a canted bay on the right. The front room
// is built for real behind the front wall, so the camera can walk in
// through the door: a sofa with its back to the door, facing the telly on
// the back wall, a fireplace on the left-hand party wall with the car keys
// on a hook above its mantelpiece, and a side table at the sofa's end with the lamp and
// the landline.

const HOUSE_W = 2.4;
const WALL = 0.12;
// The gardens and pavements stand a kerb above the road; the house floor a
// step above them.
const GARDEN_Y = 0.05;
export const FLOOR = 0.1;
const CEIL = 1.25;
const EAVES = 2.55;
const RIDGE = 3.55;
const RIDGE_Z = -1.35;
// Positions within a house, for one whose door is on the left; every other
// house is mirrored, so doors and bays pair up along the terrace.
const DOOR = { x: -0.7, w: 0.4, h: 0.9, fan: 0.17 };
const BAY = { x: 0.43, half: 0.48, front: 0.3, depth: 0.3, sill: FLOOR + 0.3, head: FLOOR + 0.95 };
const UPPER = { y: 1.65, h: 0.6 };
// Inside faces of the front room.
const ROOM = { left: -1.08, right: 1.08, back: -2.42, front: -WALL };
const GARDEN_Z = 1.0;
const KERB_Z = 2.0;
const ROAD_FAR = 5.6;
const OUR_NUMBER = 11;

// The camera's two resting shots, and the walk between them (see engine.ts).
export const OUTSIDE = {
  eye: new THREE.Vector3(0.25, GARDEN_Y + 0.74, 6.8),
  look: new THREE.Vector3(-0.15, 1.12, 0),
};
export const INSIDE = {
  eye: new THREE.Vector3(0.1, FLOOR + 0.8, -0.3),
  look: new THREE.Vector3(0.02, FLOOR + 0.3, ROOM.back),
};
// Up the path, through the door, and round to face the room.
export const ENTRY = {
  eye: [
    OUTSIDE.eye,
    new THREE.Vector3(-0.45, GARDEN_Y + 0.74, 2.6),
    new THREE.Vector3(-0.68, FLOOR + 0.72, 0.5),
    new THREE.Vector3(-0.66, FLOOR + 0.73, -0.25),
    INSIDE.eye,
  ],
  look: [
    OUTSIDE.look,
    new THREE.Vector3(-0.66, FLOOR + 0.6, 0),
    new THREE.Vector3(-0.62, FLOOR + 0.55, -2),
    new THREE.Vector3(-0.2, FLOOR + 0.4, ROOM.back),
    INSIDE.look,
  ],
};
// How far the front door stands open: ajar as found, a little wider under
// the pointer, and wide once the visitor goes in.
export const DOOR_AJAR = 0.8;
export const DOOR_HOVER = 1.1;
export const DOOR_OPEN = 1.62;

type Mat = THREE.Material;

function add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: Mat | Mat[], x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
// Rounded, for soft furnishings and anything moulded.
const soft = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * 0.999);

// A horizontal plane w by d at height y, its UVs in world units so a
// repeating texture keeps its scale.
function floorPlane(w: number, d: number, unit = 1) {
  const geometry = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / unit, (uv.getY(i) * d) / unit);
  return geometry;
}

// A rectangle with rectangular holes, in the xy plane. Holes are
// [left, bottom, right, top].
function wallShape(width: number, height: number, holes: number[][]) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.closePath();
  for (const [l, b, r, t] of holes) {
    const hole = new THREE.Path();
    hole.moveTo(l, b);
    hole.lineTo(l, t);
    hole.lineTo(r, t);
    hole.lineTo(r, b);
    hole.closePath();
    shape.holes.push(hole);
  }
  return shape;
}

export type AboutWorld = ReturnType<typeof buildAbout>;

export function buildAbout({ anisotropy, detail }: { anisotropy: number; detail: number }) {
  const scene = new THREE.Scene();
  const rand = rng(47);
  const time = { value: 0 };

  const mats = {
    ground: meadowGround(anisotropy),
    brick: ink({ map: brickTexture(rand, "#9c4a36", anisotropy) }),
    render: ink({ color: 0xe9e1cf }),
    stone: ink({ color: 0xe6dcc6 }),
    white: ink({ color: 0xf2efe6 }),
    black: ink({ color: 0x1d1d20 }),
    brass: ink({ color: 0xc9a14a }),
    slate: ink({ color: 0x4d5561 }),
    pot: ink({ color: 0xb4603f }),
    pavement: ink({ map: slabTexture(rand, anisotropy) }),
    kerb: ink({ color: 0xa8a49b }),
    asphalt: ink({ map: asphaltTexture(rand, anisotropy) }),
    line: ink({ color: 0xeeeae0 }),
    gravel: ink({ color: 0xb9ad94 }),
    lawn: ink({ color: 0x7d9455 }),
    hedge: ink({ color: 0x4f6b3a }),
    tiles: ink({ map: pathTexture(anisotropy) }),
    // Our windows are clear, so the front room shows through them.
    glass: ink({ color: 0xc6d6e2, transparent: true, opacity: 0.16, depthWrite: false }),
    // Inside.
    floor: ink({ map: floorTexture(rand, anisotropy) }),
    paint: ink({ color: 0xc0c9a6 }),
    feature: ink({ color: 0x55776f }),
    ceiling: ink({ color: 0xf1ebdc }),
    wood: ink({ color: 0x7a4e2f }),
    oak: ink({ color: 0xa8774a }),
    sofa: ink({ color: 0xc99a3a }),
    teal: ink({ color: 0x2f6b6b }),
    rust: ink({ color: 0xb5552d }),
    iron: ink({ color: 0x232325 }),
    gilt: ink({ color: 0xc29a4b }),
    mirror: ink({ color: 0xa9bcc4 }),
    leaf: ink({ color: 0x3f6a3a }),
    ivory: ink({ color: 0xe9e0c8 }),
    plastic: ink({ color: 0x2b2c30 }),
    // Glowing things: the lamp's shade, the coals, the street lamp. Their
    // glow is set from the palette (see apply).
    shade: ink({ color: 0xf3e2c0, emissive: 0xffc888, emissiveIntensity: 0.4 }),
    coals: ink({ color: 0x5a2a18, emissive: 0xff7a2a, emissiveIntensity: 0.6 }),
    lantern: ink({ color: 0xf6efe0, emissive: 0xffd9a0, emissiveIntensity: 0 }),
  };

  const ground = add(scene, new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), mats.ground, 0, -0.01, -1000);
  ground.receiveShadow = true;

  // ---------------------------------------------------------------- street

  const street = new THREE.Group();
  scene.add(street);
  const span = 7 * HOUSE_W;
  add(street, floorPlane(80, ROAD_FAR - KERB_Z, 2), mats.asphalt, 0, 0, (KERB_Z + ROAD_FAR) / 2);
  // A broken white centre line.
  for (let x = -40; x < 40; x += 1.6) add(street, box(0.8, 0.004, 0.045), mats.line, x, 0.002, (KERB_Z + ROAD_FAR) / 2);
  add(street, floorPlane(80, KERB_Z - GARDEN_Z, 0.5), mats.pavement, 0, GARDEN_Y, (GARDEN_Z + KERB_Z) / 2);
  add(street, floorPlane(80, 4, 0.5), mats.pavement, 0, GARDEN_Y, ROAD_FAR + 2);
  for (const z of [KERB_Z - 0.035, ROAD_FAR + 0.035]) add(street, box(80, GARDEN_Y + 0.004, 0.07), mats.kerb, 0, (GARDEN_Y + 0.004) / 2, z);
  // The gardens, gravelled, between the houses and their front walls.
  add(street, floorPlane(span + 4, GARDEN_Z + 0.1, 1), mats.gravel, 0, GARDEN_Y, (GARDEN_Z + 0.1) / 2);

  // A street lamp at the kerb, lit at dusk.
  const lamp = new THREE.Group();
  lamp.position.set(-3.6, GARDEN_Y, KERB_Z - 0.22);
  add(lamp, new THREE.CylinderGeometry(0.026, 0.04, 2.4, 12).translate(0, 1.2, 0), mats.slate);
  add(lamp, box(0.03, 0.03, 0.42), mats.slate, 0, 2.38, 0.2);
  add(lamp, box(0.16, 0.05, 0.1), mats.slate, 0, 2.36, 0.42);
  add(lamp, box(0.14, 0.012, 0.08), mats.lantern, 0, 2.33, 0.42);
  street.add(lamp);

  // ---------------------------------------------------------------- terrace

  const terrace = new THREE.Group();
  scene.add(terrace);
  const doorColours = [0x7a1f24, 0x2f4f3a, 0xe8e4da, 0x2c2c30, 0x274a72, 0xb8892b, 0x5a3f63];
  // Some of the neighbours' windows light up at dusk.
  const litPanes: THREE.MeshToonMaterial[] = [];

  function sash(parent: THREE.Object3D, x: number, y: number, w: number, h: number, glass: Mat) {
    add(parent, new THREE.PlaneGeometry(w, h), glass, x, y + h / 2, 0.004);
    for (const side of [-1, 1]) add(parent, box(0.035, h + 0.03, 0.035), mats.white, x + side * (w / 2), y + h / 2, 0.012);
    add(parent, box(w + 0.035, 0.035, 0.035), mats.white, x, y + h, 0.012);
    add(parent, box(w + 0.035, 0.025, 0.035), mats.white, x, y, 0.012);
    add(parent, box(w, 0.02, 0.03), mats.white, x, y + h * 0.5, 0.014);
    add(parent, box(w + 0.1, 0.035, 0.07), mats.stone, x, y - 0.02, 0.03);
    add(parent, box(w + 0.12, 0.07, 0.03), mats.stone, x, y + h + 0.055, 0.012);
  }

  function pane() {
    const map = paneTexture(rand);
    const material = ink({ map, emissiveMap: map, emissive: 0xffc070, emissiveIntensity: 0 });
    if (rand() < 0.45) litPanes.push(material);
    return material;
  }

  // A panelled front door, hinged at its left edge (x = 0), standing on y = 0.
  function doorLeaf(colour: number) {
    const leaf = new THREE.Group();
    const paint = ink({ color: colour });
    const moulding = ink({ color: new THREE.Color(colour).multiplyScalar(0.82) });
    const { w, h } = DOOR;
    add(leaf, box(w - 0.006, h - 0.004, 0.035), paint, w / 2, h / 2, 0);
    for (const side of [-1, 1]) {
      add(leaf, box(w * 0.32, h * 0.36, 0.008), moulding, w / 2 + side * w * 0.2, h * 0.7, 0.02);
      add(leaf, box(w * 0.32, h * 0.26, 0.008), moulding, w / 2 + side * w * 0.2, h * 0.2, 0.02);
    }
    add(leaf, box(w * 0.36, 0.022, 0.012), mats.brass, w / 2, h * 0.46, 0.022);
    add(leaf, new THREE.TorusGeometry(0.022, 0.005, 6, 16), mats.brass, w / 2, h * 0.62, 0.026);
    add(leaf, new THREE.SphereGeometry(0.014, 12, 8), mats.brass, w * 0.86, h * 0.5, 0.028);
    return leaf;
  }

  // One canted bay: a front and two angled sides, each a brick stall riser,
  // a stone sill, a sash and a cornice, under a flat lead roof.
  function bay(parent: THREE.Object3D, bx: number, glass: () => Mat) {
    const { half, front, depth, sill, head } = BAY;
    const faces = [
      [bx - half, 0, bx - front, depth],
      [bx - front, depth, bx + front, depth],
      [bx + front, depth, bx + half, 0],
    ];
    for (const [ax, az, bx2, bz] of faces) {
      const panel = new THREE.Group();
      const w = Math.hypot(bx2 - ax, bz - az);
      panel.position.set((ax + bx2) / 2, 0, (az + bz) / 2);
      panel.rotation.y = Math.atan2(-(bz - az), bx2 - ax);
      add(panel, box(w, sill - GARDEN_Y, 0.09), mats.brick, 0, (sill + GARDEN_Y) / 2, -0.045);
      add(panel, box(w + 0.03, 0.03, 0.12), mats.stone, 0, sill + 0.015, -0.04);
      const top = sill + 0.03;
      add(panel, new THREE.PlaneGeometry(w - 0.03, head - top), glass(), 0, (top + head) / 2, -0.03);
      for (const side of [-1, 1]) add(panel, box(0.035, head - top, 0.06), mats.white, side * (w / 2 - 0.0175), (top + head) / 2, -0.03);
      add(panel, box(w, 0.022, 0.04), mats.white, 0, top + (head - top) * 0.62, -0.03);
      add(panel, box(w + 0.04, 0.07, 0.12), mats.white, 0, head + 0.035, -0.04);
      parent.add(panel);
    }
    const roof = new THREE.Shape();
    roof.moveTo(bx - half - 0.03, 0);
    roof.lineTo(bx + half + 0.03, 0);
    roof.lineTo(bx + front + 0.04, -(depth + 0.04));
    roof.lineTo(bx - front - 0.04, -(depth + 0.04));
    roof.closePath();
    add(parent, new THREE.ExtrudeGeometry(roof, { depth: 0.07, bevelEnabled: false }).rotateX(-Math.PI / 2), mats.slate, 0, head + 0.07, 0);
    return roof;
  }

  let ourDoor: THREE.Group | null = null;
  let ourBayFloor: THREE.Shape | null = null;
  for (let i = -3; i <= 3; i++) {
    const house = new THREE.Group();
    house.position.x = i * HOUSE_W;
    const mirror = i % 2 === 0 ? 1 : -1;
    const ours = i === 0;
    const dx = mirror * DOOR.x;
    const bx = mirror * BAY.x;
    const doorTop = FLOOR + DOOR.h + 0.025 + DOOR.fan;
    const holes = [[dx - DOOR.w / 2, 0.02, dx + DOOR.w / 2, doorTop]];
    if (ours) holes.push([bx - BAY.half, 0.02, bx + BAY.half, BAY.head + 0.02]);
    const shape = wallShape(HOUSE_W, EAVES, holes);
    const facade = add(house, new THREE.ExtrudeGeometry(shape, { depth: WALL, bevelEnabled: false }).translate(0, 0, -WALL), i === 2 ? mats.render : mats.brick);
    facade.name = "facade";
    if (ours) {
      // Plaster on the inside of the front wall.
      const plaster = add(house, new THREE.ShapeGeometry(shape), ink({ color: 0xc0c9a6, side: THREE.DoubleSide }), 0, 0, -WALL - 0.002);
      plaster.castShadow = false;
    }

    // The door, its fanlight with the house number (counting up the row
    // one by one: 10 and 12 either side of ours), and the stone step.
    const number = OUR_NUMBER + i;
    const leaf = doorLeaf(ours ? 0xc25a1c : doorColours[(i + 3) % doorColours.length]);
    const hinge = new THREE.Group();
    hinge.position.set(dx - DOOR.w / 2, FLOOR, -WALL * 0.55);
    hinge.add(leaf);
    house.add(hinge);
    if (ours) ourDoor = hinge;
    // Behind a neighbour's door, a dark hall rather than the sky.
    if (!ours) add(house, box(DOOR.w, doorTop, 0.02), mats.black, dx, doorTop / 2, -WALL - 0.01);
    add(house, box(DOOR.w, 0.025, WALL * 0.7), mats.white, dx, FLOOR + DOOR.h + 0.0125, -WALL * 0.5);
    add(house, new THREE.PlaneGeometry(DOOR.w, DOOR.fan), ink({ map: fanlightTexture(number) }), dx, FLOOR + DOOR.h + 0.025 + DOOR.fan / 2, -WALL * 0.5);
    for (const side of [-1, 1]) add(house, box(0.045, doorTop + 0.02, 0.03), mats.white, dx + side * (DOOR.w / 2 + 0.0225), doorTop / 2, 0.015);
    add(house, box(DOOR.w + 0.16, 0.08, 0.04), mats.stone, dx, doorTop + 0.06, 0.02);
    add(house, box(DOOR.w + 0.12, FLOOR - GARDEN_Y, 0.16), mats.stone, dx, (FLOOR + GARDEN_Y) / 2, 0.08);

    // The bay, and the two windows upstairs.
    const roof = bay(house, bx, ours ? () => mats.glass : pane);
    if (ours) ourBayFloor = roof;
    sash(house, dx, UPPER.y, 0.34, UPPER.h, pane());
    sash(house, bx, UPPER.y, 0.6, UPPER.h, pane());

    // The front garden: a path of tiles (ours) or flags to the gate, a low
    // wall with stone coping, gate piers, and a hedge or a lawn.
    add(house, floorPlane(DOOR.w * 0.8, GARDEN_Z - 0.16, DOOR.w * 0.8), ours ? mats.tiles : mats.pavement, dx, GARDEN_Y + 0.002, (GARDEN_Z + 0.16) / 2);
    const gate = [dx - 0.2, dx + 0.2];
    for (const [l, r] of [
      [-HOUSE_W / 2, gate[0]],
      [gate[1], HOUSE_W / 2],
    ]) {
      add(house, box(r - l, 0.26, 0.1), mats.brick, (l + r) / 2, GARDEN_Y + 0.13, GARDEN_Z + 0.05);
      add(house, box(r - l, 0.03, 0.13), mats.stone, (l + r) / 2, GARDEN_Y + 0.275, GARDEN_Z + 0.05);
    }
    for (const x of gate) {
      add(house, box(0.1, 0.34, 0.11), mats.brick, x, GARDEN_Y + 0.17, GARDEN_Z + 0.05);
      add(house, box(0.12, 0.035, 0.13), mats.stone, x, GARDEN_Y + 0.355, GARDEN_Z + 0.05);
    }
    // A low wall down to the pavement between each pair of gardens.
    add(house, box(0.08, 0.2, GARDEN_Z), mats.brick, HOUSE_W / 2, GARDEN_Y + 0.1, GARDEN_Z / 2);
    if (ours || rand() < 0.5) {
      add(house, floorPlane(Math.abs(bx) + 0.45, GARDEN_Z - BAY.depth - 0.2, 1), mats.lawn, bx, GARDEN_Y + 0.003, (GARDEN_Z + BAY.depth + 0.05) / 2 + 0.05);
    }
    if (!ours && rand() < 0.6) {
      add(house, soft(HOUSE_W / 2 - 0.15, 0.24, 0.16, 0.06), mats.hedge, bx, GARDEN_Y + 0.12, GARDEN_Z - 0.1);
    }
    // A wheelie bin by the wall.
    if (ours || rand() < 0.5) {
      const bin = new THREE.Group();
      const colour = ours ? mats.black : rand() < 0.5 ? mats.black : ink({ color: 0x2f5a3a });
      add(bin, soft(0.26, 0.4, 0.3, 0.02), colour, 0, 0.2, 0);
      add(bin, soft(0.28, 0.025, 0.33, 0.01), colour, 0, 0.41, 0.01);
      for (const side of [-1, 1]) add(bin, new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12).rotateZ(Math.PI / 2), mats.black, side * 0.12, 0.035, -0.14);
      bin.position.set(dx - mirror * 0.36, GARDEN_Y, 0.55);
      bin.rotation.y = mirror * 0.15;
      house.add(bin);
    }
    terrace.add(house);
  }

  // The roof: one slate slope along the terrace, a black gutter at the
  // eaves, a downpipe and a chimney stack on each party wall.
  const run = Math.hypot(0.12 - RIDGE_Z, RIDGE - EAVES);
  const pitch = Math.atan2(RIDGE - EAVES, 0.12 - RIDGE_Z);
  const roof = add(terrace, box(span + 0.4, 0.05, run), mats.slate, 0, (EAVES + RIDGE) / 2 + 0.02, (0.12 + RIDGE_Z) / 2);
  roof.rotation.x = pitch;
  add(terrace, box(span + 0.4, 0.06, 0.08), mats.pot, 0, RIDGE + 0.04, RIDGE_Z);
  add(terrace, new THREE.CylinderGeometry(0.035, 0.035, span + 0.4, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), mats.black, 0, EAVES + 0.01, 0.12);
  add(terrace, box(span + 0.4, 0.06, 0.03), mats.white, 0, EAVES - 0.01, 0.06);
  for (let i = -3; i <= 4; i++) {
    const x = (i - 0.5) * HOUSE_W;
    add(terrace, box(0.03, EAVES - GARDEN_Y, 0.03), mats.black, x + 0.08, (EAVES + GARDEN_Y) / 2, 0.03);
    add(terrace, box(0.34, 0.6, 0.26), mats.brick, x, RIDGE + 0.2, RIDGE_Z);
    add(terrace, box(0.38, 0.05, 0.3), mats.stone, x, RIDGE + 0.52, RIDGE_Z);
    for (const p of [-0.09, 0, 0.09]) add(terrace, new THREE.CylinderGeometry(0.03, 0.036, 0.14, 10), mats.pot, x + p, RIDGE + 0.61, RIDGE_Z);
  }

  // The car the visitor drove here, parked at the kerb just past the front
  // door, in the middle of the street view: it's the way back home.
  const car = createCar();
  car.group.position.set(1.25, 0, KERB_Z + 0.46);
  car.group.rotation.y = -Math.PI / 2;
  scene.add(car.group);

  // ------------------------------------------------------------- front room

  const room = new THREE.Group();
  scene.add(room);
  const width = ROOM.right - ROOM.left;
  const depth = ROOM.front - ROOM.back;
  const midZ = (ROOM.front + ROOM.back) / 2;
  const height = CEIL - FLOOR;
  add(room, floorPlane(width, depth), mats.floor, 0, FLOOR, midZ);
  add(room, floorPlane(DOOR.w, WALL + 0.01), mats.floor, DOOR.x, FLOOR, -WALL / 2);
  if (ourBayFloor) add(room, new THREE.ShapeGeometry(ourBayFloor).rotateX(-Math.PI / 2), mats.floor, BAY.x, FLOOR, 0);
  add(room, floorPlane(width, depth).rotateX(Math.PI), mats.ceiling, 0, CEIL, midZ);
  add(room, box(0.04, height + 0.04, depth), mats.paint, ROOM.left - 0.02, FLOOR + height / 2, midZ);
  add(room, box(0.04, height + 0.04, depth), mats.paint, ROOM.right + 0.02, FLOOR + height / 2, midZ);
  add(room, box(width + 0.08, height + 0.04, 0.04), mats.paint, 0, FLOOR + height / 2, ROOM.back - 0.02);
  // Skirting and a picture rail round the walls.
  for (const y of [FLOOR + 0.025, FLOOR + 0.86]) {
    const h = y === FLOOR + 0.025 ? 0.05 : 0.015;
    add(room, box(0.012, h, depth), mats.white, ROOM.left + 0.006, y, midZ);
    add(room, box(0.012, h, depth), mats.white, ROOM.right - 0.006, y, midZ);
    add(room, box(width, h, 0.012), mats.white, 0, y, ROOM.back + 0.006);
  }

  // The chimney breast on the left, painted a darker green, with a cast
  // iron fireplace, a tiled hearth, a mantelpiece and a mirror over it.
  const breast = { x: ROOM.left + 0.17, z: -1.45, w: 0.82 };
  add(room, box(0.17, height, breast.w), mats.feature, ROOM.left + 0.085, FLOOR + height / 2, breast.z);
  const fire = new THREE.Group();
  fire.position.set(breast.x, FLOOR, breast.z);
  room.add(fire);
  add(fire, box(0.02, 0.36, 0.38), mats.iron, 0.01, 0.18, 0);
  add(fire, box(0.024, 0.18, 0.18), ink({ color: 0x0c0c0d }), 0.012, 0.1, 0);
  for (let i = 0; i < 6; i++) add(fire, new THREE.IcosahedronGeometry(0.018, 0), mats.coals, 0.03, 0.03 + (i % 2) * 0.014, -0.05 + i * 0.02);
  for (const side of [-1, 1]) add(fire, box(0.05, 0.47, 0.06), mats.white, 0.025, 0.235, side * 0.24);
  add(fire, box(0.1, 0.03, 0.64), mats.white, 0.04, 0.485, 0);
  add(fire, box(0.16, 0.012, 0.5), ink({ color: 0x2f4a3f }), 0.08, 0.006, 0);
  add(fire, box(0.012, 0.3, 0.42), mats.gilt, 0.006, 0.78, 0);
  add(fire, box(0.004, 0.26, 0.37), mats.mirror, 0.014, 0.78, 0);
  // On the mantelpiece: a carriage clock and a pair of candlesticks.
  add(fire, soft(0.05, 0.06, 0.07, 0.008), mats.wood, 0.04, 0.53, 0.03);
  add(fire, new THREE.CircleGeometry(0.02, 20).rotateY(Math.PI / 2), mats.ivory, 0.066, 0.535, 0.03);
  for (const z of [-0.22, 0.22]) {
    add(fire, new THREE.CylinderGeometry(0.008, 0.012, 0.06, 10), mats.brass, 0.04, 0.53, z);
    add(fire, new THREE.CylinderGeometry(0.005, 0.005, 0.05, 8), mats.ivory, 0.04, 0.585, z);
  }
  const fireLight = new THREE.PointLight(0xff8a3d, 0.5, 0.8, 2);
  fireLight.position.set(breast.x + 0.16, FLOOR + 0.1, breast.z);
  room.add(fireLight);

  // A pot plant in the corner beyond it.
  const plant = new THREE.Group();
  plant.position.set(ROOM.left + 0.16, FLOOR, ROOM.back + 0.16);
  add(plant, new THREE.CylinderGeometry(0.07, 0.055, 0.13, 16).translate(0, 0.065, 0), mats.pot);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const leaf = add(plant, new THREE.SphereGeometry(1, 10, 6).scale(0.03, 0.11, 0.012), mats.leaf, Math.cos(a) * 0.05, 0.22 + rand() * 0.08, Math.sin(a) * 0.05);
    leaf.rotation.set(Math.sin(a) * 0.6, -a, -Math.cos(a) * 0.6);
  }
  room.add(plant);

  // A bookcase on the right-hand wall.
  const books = new THREE.Group();
  books.position.set(ROOM.right - 0.07, FLOOR, -1.95);
  books.rotation.y = -Math.PI / 2;
  add(books, box(0.42, 0.76, 0.02), mats.oak, 0, 0.38, -0.06);
  for (const x of [-0.2, 0.2]) add(books, box(0.02, 0.76, 0.13), mats.oak, x, 0.38, 0);
  const spines = [0x8c2f2f, 0x2f4f6b, 0xd6b44a, 0x3c6b4a, 0xe8e0cc, 0x5a3f63, 0xb5552d, 0x2b2c30];
  for (let s = 0; s < 4; s++) {
    const y = 0.02 + s * 0.185;
    add(books, box(0.4, 0.016, 0.13), mats.oak, 0, y, 0);
    let x = -0.185;
    while (x < 0.17) {
      const w = 0.016 + rand() * 0.016;
      const h = 0.1 + rand() * 0.05;
      add(books, box(w, h, 0.1), ink({ color: spines[Math.floor(rand() * spines.length)] }), x + w / 2, y + 0.008 + h / 2, 0.005);
      x += w + 0.002;
      if (rand() < 0.08) x += 0.04;
    }
  }
  add(books, box(0.4, 0.016, 0.13), mats.oak, 0, 0.76, 0);
  room.add(books);

  // Photos on the right-hand wall, nearer the door.
  for (const [z, y, w, h] of [
    [-0.95, FLOOR + 0.66, 0.14, 0.18],
    [-1.22, FLOOR + 0.7, 0.18, 0.13],
  ]) {
    add(room, box(0.012, h, w), mats.black, ROOM.right - 0.006, y, z);
    add(room, box(0.004, h - 0.03, w - 0.03), ink({ color: [0xd9c7a0, 0x9fb3a0][Math.round(rand())] }), ROOM.right - 0.014, y, z);
  }

  // A pendant light hanging from the middle of the ceiling.
  add(room, new THREE.CylinderGeometry(0.003, 0.003, 0.2, 6), mats.black, 0, CEIL - 0.1, -1.35);
  add(room, new THREE.CylinderGeometry(0.035, 0.08, 0.07, 20, 1, true), ink({ color: 0xe6dcc6, side: THREE.DoubleSide }), 0, CEIL - 0.22, -1.35);

  // The rug and the coffee table, bare but for a clipboard of blueprints:
  // the projects, as pinned up on the projects page.
  add(room, floorPlane(0.95, 0.65), ink({ map: rugTexture() }), -0.06, FLOOR + 0.002, -1.66);
  const table = new THREE.Group();
  table.position.set(-0.06, FLOOR, -1.7);
  add(table, soft(0.5, 0.025, 0.25, 0.008), mats.oak, 0, 0.18, 0);
  add(table, box(0.44, 0.012, 0.2), mats.oak, 0, 0.06, 0);
  for (const [x, z] of [
    [-0.22, -0.1],
    [0.22, -0.1],
    [-0.22, 0.1],
    [0.22, 0.1],
  ])
    add(table, box(0.02, 0.17, 0.02), mats.oak, x, 0.085, z);
  room.add(table);

  // The clipboard: a hardboard board, a few blueprints under its steel
  // clip (the ones beneath set a little askew), lying on the table with the
  // clip toward the telly so the top sheet reads the right way up from the
  // sofa.
  const clipboard = new THREE.Group();
  clipboard.position.set(0, 0.1925, 0.005);
  clipboard.rotation.y = 0.12;
  table.add(clipboard);
  const [boardW, boardD] = [0.17, 0.235];
  add(clipboard, soft(boardW, 0.005, boardD, 0.008), ink({ color: 0x9a6a3e }), 0, 0.0025, 0);
  const sheetW = boardW - 0.022;
  const sheetD = sheetW * (352 / 256);
  const sheetZ = 0.012;
  const flat = (w: number, d: number) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  for (const [i, turn, dx] of [
    [2, 0.06, 0.004],
    [1, -0.045, -0.003],
  ] as const) {
    add(clipboard, flat(sheetW, sheetD), ink({ map: blueprintTexture(i) }), dx, 0.0052 + (2 - i) * 0.0004, sheetZ).rotation.y = turn;
  }
  const topSheet = ink({ map: blueprintTexture(0) });
  add(clipboard, flat(sheetW, sheetD), topSheet, 0, 0.0062, sheetZ);
  const clipSteel = ink({ color: 0xc3c7cc });
  const clipZ = -boardD / 2 + 0.022;
  add(clipboard, soft(0.075, 0.006, 0.03, 0.003), clipSteel, 0, 0.0085, clipZ);
  add(clipboard, new THREE.CylinderGeometry(0.0045, 0.0045, 0.085, 12).rotateZ(Math.PI / 2), clipSteel, 0, 0.011, clipZ - 0.013);
  add(clipboard, new THREE.TorusGeometry(0.008, 0.0015, 6, 16, Math.PI).rotateX(-Math.PI / 2), clipSteel, 0, 0.012, clipZ - 0.02);

  // The sofa, its back to the door, facing the telly.
  const sofa = new THREE.Group();
  sofa.position.set(-0.06, FLOOR, -1.12);
  sofa.rotation.y = Math.PI;
  add(sofa, soft(0.9, 0.1, 0.4, 0.03), mats.sofa, 0, 0.085, 0);
  for (const x of [-0.27, 0, 0.27]) add(sofa, soft(0.27, 0.06, 0.3, 0.025), mats.sofa, x, 0.165, 0.04);
  add(sofa, soft(0.9, 0.24, 0.1, 0.035), mats.sofa, 0, 0.25, -0.15);
  for (const x of [-0.27, 0, 0.27]) {
    const cushion = add(sofa, soft(0.27, 0.16, 0.08, 0.03), mats.sofa, x, 0.27, -0.08);
    cushion.rotation.x = -0.15;
  }
  for (const side of [-1, 1]) add(sofa, soft(0.09, 0.2, 0.4, 0.035), mats.sofa, side * 0.41, 0.17, 0);
  for (const [x, z] of [
    [-0.42, -0.17],
    [0.42, -0.17],
    [-0.42, 0.17],
    [0.42, 0.17],
  ])
    add(sofa, new THREE.CylinderGeometry(0.012, 0.008, 0.04, 8), mats.wood, x, 0.02, z);
  const pillowA = add(sofa, soft(0.15, 0.14, 0.05, 0.025), mats.teal, -0.3, 0.27, -0.03);
  pillowA.rotation.set(-0.3, 0.3, 0.15);
  const pillowB = add(sofa, soft(0.14, 0.13, 0.05, 0.025), mats.rust, 0.31, 0.27, -0.03);
  pillowB.rotation.set(-0.3, -0.25, -0.12);
  room.add(sofa);

  // The sideboard on the back wall, with the telly on top and a print over it.
  const sideboard = new THREE.Group();
  sideboard.position.set(0.05, FLOOR, ROOM.back + 0.11);
  add(sideboard, soft(0.66, 0.2, 0.2, 0.01), mats.wood, 0, 0.13, 0);
  for (const x of [-0.165, 0.165]) {
    add(sideboard, box(0.31, 0.16, 0.004), ink({ color: 0x6a4228 }), x, 0.13, 0.101);
    add(sideboard, new THREE.SphereGeometry(0.008, 8, 6), mats.brass, x + (x < 0 ? 0.13 : -0.13), 0.13, 0.106);
  }
  for (const x of [-0.3, 0.3]) add(sideboard, box(0.02, 0.03, 0.02), mats.wood, x, 0.015, 0.07);
  room.add(sideboard);
  // The road poster over it, which is a way home too, in a walnut
  // frame with an oak slip round the print.
  const posterFrame = new THREE.Group();
  // Hung over the picture rail, so it stands off the wall by the rail's depth.
  posterFrame.position.set(0.05, FLOOR + 0.82, ROOM.back + 0.012);
  const [frameW, frameH, rail] = [0.36, 0.48, 0.032];
  add(posterFrame, box(frameW - 0.02, frameH - 0.02, 0.008), mats.wood, 0, 0, 0.004);
  for (const side of [-1, 1]) {
    add(posterFrame, soft(frameW, rail, 0.028, 0.006), mats.wood, 0, side * (frameH - rail) / 2, 0.014);
    add(posterFrame, soft(rail, frameH, 0.028, 0.006), mats.wood, side * (frameW - rail) / 2, 0, 0.014);
    add(posterFrame, box(frameW - 2 * rail, 0.006, 0.02), mats.oak, 0, side * (frameH / 2 - rail - 0.003), 0.012);
    add(posterFrame, box(0.006, frameH - 2 * rail, 0.02), mats.oak, side * (frameW / 2 - rail - 0.003), 0, 0.012);
  }
  const posterPrint = ink({ map: posterTexture() });
  add(posterFrame, new THREE.PlaneGeometry(frameW - 2 * rail - 0.012, frameH - 2 * rail - 0.012), posterPrint, 0, 0, 0.0085);
  room.add(posterFrame);

  // The telly: a chunky set with a curved-glass picture, showing teletext.
  const tv = new THREE.Group();
  tv.position.set(0.05, FLOOR + 0.23, ROOM.back + 0.14);
  tv.scale.setScalar(1.15);
  add(tv, soft(0.38, 0.3, 0.26, 0.025), mats.plastic, 0, 0.15, 0);
  add(tv, soft(0.28, 0.22, 0.12, 0.04), mats.plastic, 0, 0.15, -0.15);
  const screen = new THREE.MeshBasicMaterial({ map: screenTexture(), color: 0xd8d8d8 });
  const picture = add(tv, new THREE.PlaneGeometry(0.29, 0.215), screen, -0.025, 0.165, 0.131);
  picture.castShadow = false;
  for (let i = 0; i < 6; i++) add(tv, box(0.04, 0.004, 0.004), ink({ color: 0x18181a }), 0.152, 0.24 - i * 0.018, 0.131);
  for (let i = 0; i < 3; i++) add(tv, box(0.016, 0.008, 0.006), ink({ color: 0x6b6d73 }), 0.135 + i * 0.022, 0.06, 0.131);
  add(tv, new THREE.CircleGeometry(0.004, 10), ink({ color: 0xff3b2f, emissive: 0xff3b2f, emissiveIntensity: 0.8 }), -0.15, 0.04, 0.131);
  room.add(tv);

  // The side table at the sofa's end, with a lamp and the landline.
  const side = new THREE.Group();
  side.position.set(0.53, FLOOR, -1.22);
  const TOP = 0.27;
  add(side, new THREE.CylinderGeometry(0.16, 0.16, 0.016, 40), mats.oak, 0, TOP - 0.008, 0);
  add(side, new THREE.CylinderGeometry(0.13, 0.13, 0.01, 32), mats.oak, 0, 0.09, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const leg = add(side, new THREE.CylinderGeometry(0.008, 0.006, TOP, 8), mats.oak, Math.cos(a) * 0.11, TOP / 2, Math.sin(a) * 0.11);
    leg.rotation.set(Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1);
  }
  room.add(side);

  const lampGroup = new THREE.Group();
  lampGroup.position.set(0.075, TOP, -0.075);
  add(lampGroup, new THREE.SphereGeometry(0.035, 16, 12).scale(1, 1.25, 1).translate(0, 0.045, 0), mats.teal);
  add(lampGroup, new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), mats.brass, 0, 0.11, 0);
  add(lampGroup, new THREE.CylinderGeometry(0.04, 0.065, 0.07, 24, 1, true), mats.shade, 0, 0.16, 0);
  side.add(lampGroup);
  // A warm light just inside the door, so the gap glows from the street
  // and spills a little light down the step.
  const hallLight = new THREE.PointLight(0xffc58a, 0.8, 1.5, 1.4);
  hallLight.position.set(DOOR.x + 0.15, FLOOR + 0.85, -0.45);
  room.add(hallLight);
  const lampLight = new THREE.PointLight(0xffc58a, 0.6, 1.8, 0.6);
  lampLight.position.set(side.position.x + 0.075, FLOOR + TOP + 0.24, side.position.z - 0.075);
  room.add(lampLight);

  const phone = createLandline();
  // Set in from the edge, so all of it (and its cord) stands on the top.
  phone.group.position.set(-0.035, TOP, 0.045);
  phone.group.scale.setScalar(1.25);
  phone.group.rotation.y = -0.5;
  side.add(phone.group);

  // The car keys, hanging from a hook on the chimney breast beside the
  // mirror, over the mantelpiece.
  const keys = createKeys(mats);
  keys.group.position.set(0, 0.74, -0.31);
  keys.group.scale.setScalar(1.6);
  fire.add(keys.group);

  // Everything casts and takes shadow, except the glass and the glow.
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object === ground) return;
    const material = object.material as THREE.Material;
    const clear = material.transparent || material instanceof THREE.MeshBasicMaterial;
    object.castShadow = !clear;
    object.receiveShadow = !clear;
  });

  // The sky, clouds, dust, hills and light (see scene/atmosphere.ts). The
  // shot looks up at the terrace, so the hills stay hidden behind its roof.
  const atmosphere = createAtmosphere(scene, {
    rand,
    time,
    clouds: { facing: 0 },
    dust: { count: Math.round(320 * detail), x: [-4, 4], y: [0.1, 2.6], z: [-2.2, 6] },
    shadow: { extent: 7, distance: 40, far: 90, mapSize: detail < 1 ? 1024 : 2048 },
    fog: [30, 560],
    hills: {
      far: { z: -440, depth: 280, base: 10, amp: 46, seed: 1.3 },
      near: { z: -250, depth: 130, base: 3, amp: 18, seed: 4.1 },
      valley: false,
    },
  });
  atmosphere.aimSun(new THREE.Vector3(0, 0, 0.5));

  // The car's lights: off while it's parked, on (as if just unlocked)
  // while the pointer is on it. Kept with the palette they're drawn in.
  let palette: AboutPalette | null = null;
  let carLit = false;
  const lightCar = () => palette && car.applyPalette({ ...palette, headlights: carLit ? 1 : 0, taillight: carLit ? 1 : 0 });

  function apply(p: AboutPalette) {
    palette = p;
    atmosphere.apply(p);
    mats.ground.color.set(p.meadow);
    lampLight.intensity = p.lamp;
    hallLight.intensity = p.lamp * 1.1;
    mats.shade.emissiveIntensity = 0.25 + p.lamp * 0.35;
    fireLight.intensity = p.fire;
    mats.coals.emissiveIntensity = 0.3 + p.fire * 0.7;
    mats.lantern.emissiveIntensity = p.windows * 1.4;
    for (const material of litPanes) material.emissiveIntensity = p.windows * 0.75;
    lightCar();
  }

  scene.updateMatrixWorld(true);
  const doorway = new THREE.Box3(new THREE.Vector3(DOOR.x - DOOR.w / 2, FLOOR, -WALL), new THREE.Vector3(DOOR.x + DOOR.w / 2, FLOOR + DOOR.h, 0.02));

  return {
    scene,
    atmosphere,
    time,
    ready: Promise.allSettled([car.ready]),
    apply,
    dispose: () => car.dispose(),
    car: {
      // Round the body as parked (the model loads later, so not measured).
      bounds: new THREE.Box3().setFromCenterAndSize(car.group.position.clone().setY(CAR_HEIGHT / 2), new THREE.Vector3(1.6, CAR_HEIGHT, 0.7)),
      setLit(on: boolean) {
        if (on === carLit) return;
        carLit = on;
        lightCar();
      },
      // The engine idling: the body shivers on its springs, with a slow
      // lope, while the wheels stay on the road. `rev` (0 to 1) blips the
      // throttle: a harder shake, the nose lifting a touch. 0 holds it still.
      idle(time: number, amount: number, rev: number) {
        const shake = amount * (1 + 1.4 * rev);
        const buzz = Math.sin(time * 14.3) * 0.6 + Math.sin(time * 9.1 + 1.7) * 0.4;
        const lope = Math.sin(time * 9.4) * Math.sin(time * 1.3) * 0.5 + 0.5;
        const lift = (buzz * 0.0035 + lope * 0.003) * shake;
        car.body.position.y = lift;
        car.body.rotation.set(-0.008 * rev * amount + Math.sin(time * 11.7 + 0.6) * 0.002 * shake, 0, Math.sin(time * 12.9) * 0.005 * shake);
        for (const wheel of car.wheels) {
          wheel.userData.restY ??= wheel.position.y;
          wheel.position.y = wheel.userData.restY - lift;
        }
      },
    },
    door: {
      bounds: doorway,
      setOpen(angle: number) {
        if (ourDoor) ourDoor.rotation.y = angle;
      },
    },
    tv: {
      group: tv,
      bounds: new THREE.Box3().setFromObject(picture),
      // 0 resting, 1 under the pointer: the picture brightens.
      setGlow(k: number) {
        screen.color.setScalar(0.85 + 0.15 * k);
      },
    },
    poster: {
      bounds: new THREE.Box3().setFromObject(posterFrame),
      // 0 resting, 1 under the pointer: the print brightens.
      setGlow(k: number) {
        posterPrint.color.setScalar(1 + 0.18 * k);
      },
    },
    clipboard: {
      bounds: new THREE.Box3().setFromObject(clipboard),
      // 0 resting, 1 under the pointer: the top sheet brightens.
      setGlow(k: number) {
        topSheet.color.setScalar(1 + 0.2 * k);
      },
    },
    // Round the body and the handset, not the cord.
    phone: { ...phone, bounds: new THREE.Box3().setFromCenterAndSize(phone.group.localToWorld(new THREE.Vector3(0, 0.035, 0)), new THREE.Vector3(0.12, 0.1, 0.11)) },
    keys: { ...keys, bounds: new THREE.Box3().setFromObject(keys.group) },
    // Where the close-ups of the side table and the telly look from.
    sideTable: new THREE.Box3().setFromObject(side),
  };
}

// The landline: an ivory rotary telephone of the old GPO kind, its handset
// across the cradle, the dial on the sloping front, the cord coiled down
// the side. Faces +z, standing on y = 0, about life size.
function createLandline() {
  const group = new THREE.Group();
  const ivory = ink({ color: 0xe9e0c8 });
  const darker = ink({ color: 0xd6cbb0 });
  const w = 0.096;
  const d = 0.092;
  const h = 0.052;
  // The body's side profile, as (back to front, up), extruded across.
  const profile = new THREE.Shape();
  profile.moveTo(-d / 2, 0);
  profile.lineTo(d / 2, 0);
  profile.lineTo(d / 2, h * 0.35);
  profile.lineTo(d * 0.1, h);
  profile.lineTo(-d * 0.2, h);
  profile.lineTo(-d / 2, h * 0.75);
  profile.closePath();
  const body = new THREE.ExtrudeGeometry(profile, { depth: w - 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 3, curveSegments: 4 });
  body.translate(0, 0, -(w - 0.012) / 2).rotateY(-Math.PI / 2);
  add(group, body, ivory);

  // The dial, on the front slope, facing up and out.
  const slope = Math.atan2(h * 0.65, d * 0.4);
  const dial = new THREE.Group();
  dial.position.set(0, h * 0.68 + 0.004, d * 0.3);
  dial.rotation.x = -(Math.PI / 2 - slope);
  add(dial, new THREE.CylinderGeometry(0.029, 0.031, 0.006, 32).rotateX(Math.PI / 2), darker);
  add(dial, new THREE.CircleGeometry(0.028, 32), ink({ map: dialTexture() }), 0, 0, 0.0035);
  group.add(dial);

  // The cradle's two prongs, and the handset lying across them.
  for (const side of [-1, 1]) add(group, soft(0.014, 0.018, 0.02, 0.005), ivory, side * w * 0.36, h + 0.008, -d * 0.05);
  const handset = new THREE.Group();
  handset.position.set(0, h + 0.022, -d * 0.05);
  const bar = new THREE.Mesh(
    mergeGeometries([
      new RoundedBoxGeometry(0.08, 0.014, 0.022, 2, 0.006),
      new THREE.CylinderGeometry(0.016, 0.013, 0.022, 16).translate(-0.048, -0.01, 0).toNonIndexed(),
      new THREE.CylinderGeometry(0.016, 0.013, 0.022, 16).translate(0.048, -0.01, 0).toNonIndexed(),
    ]),
    ivory,
  );
  handset.add(bar);
  group.add(handset);
  // The coiled cord, from the handset's end down to the body's side.
  const cord = new THREE.CatmullRomCurve3(
    Array.from({ length: 50 }, (_, i) => {
      const t = i / 49;
      const a = t * Math.PI * 22;
      return new THREE.Vector3(-w * 0.55 - Math.sin(t * Math.PI) * 0.015 + Math.cos(a) * 0.004, h - t * h * 0.6 + Math.sin(a) * 0.004, -d * 0.05 + t * d * 0.2);
    }),
  );
  add(group, new THREE.TubeGeometry(cord, 120, 0.0016, 5), ivory);

  const rest = handset.position.clone();
  // `lift` raises the handset off the cradle; `ring` rattles it.
  function update(time: number, { lift, ring }: { lift: number; ring: number }) {
    const rattle = Math.sin(time * 70) * 0.002 * ring;
    handset.position.set(rest.x + lift * 0.01, rest.y + lift * 0.03 + Math.abs(rattle), rest.z + lift * 0.02);
    handset.rotation.set(lift * 0.4, 0, lift * 0.25 + rattle * 4);
    group.rotation.z = Math.sin(time * 52) * 0.02 * ring;
  }
  return { group, update };
}

// The car keys, hanging from a brass hook on a little oak plaque: a ring
// with a house key, a back door key, the car's fob and a leather tag. Made
// for a wall facing +x, the hook's pin at the origin; about life size.
function createKeys(mats: { brass: Mat; black: Mat; rust: Mat; oak: Mat }) {
  const group = new THREE.Group();
  const steel = ink({ color: 0xb8bcc2 });
  add(group, soft(0.006, 0.05, 0.034, 0.002), mats.oak, 0.003, 0.004, 0);
  add(group, new THREE.CylinderGeometry(0.0018, 0.0018, 0.016, 8).rotateZ(Math.PI / 2), mats.brass, 0.012, 0, 0);
  add(group, new THREE.CylinderGeometry(0.0018, 0.0018, 0.007, 8), mats.brass, 0.0195, 0.003, 0);

  // The bunch swings from the pin, the ring turned on it to face out into
  // the room; each key also swings on the ring.
  const bunch = new THREE.Group();
  bunch.position.x = 0.017;
  const TURN = -0.8;
  group.add(bunch);
  const R = 0.011;
  add(bunch, new THREE.TorusGeometry(R, 0.0014, 6, 24).rotateY(Math.PI / 2), steel, 0, -R, 0);

  const dangles: { pivot: THREE.Group; rest: number; phase: number }[] = [];
  const hang = (z: number, rest: number, build: (g: THREE.Group) => void) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, -2 * R + 0.001, z);
    pivot.rotation.x = rest;
    build(pivot);
    bunch.add(pivot);
    dangles.push({ pivot, rest, phase: dangles.length * 2.1 });
  };
  const key = (material: Mat, length: number) => (g: THREE.Group) => {
    add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.002, 16).rotateZ(Math.PI / 2), material, 0, -0.008, 0);
    add(g, box(0.002, length, 0.006), material, 0, -0.016 - length / 2, 0);
    for (let i = 0; i < 4; i++) add(g, box(0.002, 0.004, 0.003), material, 0, -0.022 - i * 0.006, 0.0042);
  };
  hang(-0.004, -0.35, key(mats.brass, 0.03));
  hang(0.004, 0.3, key(steel, 0.026));
  hang(0, 0.05, (g) => {
    add(g, soft(0.01, 0.036, 0.022, 0.005), mats.black, 0, -0.021, 0);
    add(g, new THREE.CircleGeometry(0.004, 12).rotateY(Math.PI / 2), ink({ color: 0x6b6d73 }), 0.0052, -0.025, 0);
  });
  hang(0.002, 0.7, (g) => {
    add(g, soft(0.003, 0.03, 0.012, 0.002), mats.rust, 0, -0.016, 0);
  });
  bunch.rotation.y = TURN;

  // The swing is a damped pendulum: `jingle` (0 to 1) nudges it at about
  // its own pace, so it builds to a gentle sway of a few degrees, and it
  // dies away once left alone. The keys trail the bunch a little and sway
  // softly on the ring, only ever in the plane of the wall, so nothing
  // swings into the wall or through its neighbours.
  let swing = 0;
  let speed = 0;
  let last = -1;
  function update(time: number, jingle: number) {
    const dt = last < 0 ? 0 : Math.min(0.05, time - last);
    last = time;
    const drive = jingle * Math.sin(time * 11) * 6;
    speed += (-140 * swing - 2.6 * speed + drive) * dt;
    swing += speed * dt;
    bunch.rotation.set(swing, TURN, 0);
    const sway = Math.min(1, Math.abs(speed) / 2.5);
    for (const { pivot, rest, phase } of dangles) {
      pivot.rotation.x = rest - swing * 0.3 + Math.sin(time * 7 + phase) * 0.05 * sway;
    }
  }
  return { group, update };
}
