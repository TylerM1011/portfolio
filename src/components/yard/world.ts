import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { createForest } from "../road/forest";
import { createPhone } from "../road/phone";
import { createGantrySign, directionArt, SW, type GantryPanel, type SignItem } from "../road/sign";
import { meadowGround } from "../road/world";
import { createAtmosphere } from "../scene/atmosphere";
import { foreground, ink } from "../scene/style";
import { canvasTexture, groundTexture, matte, radialTexture, rng } from "../scene/util";
import { day, dusk, type YardPalette } from "./palette";

// World units match the road scene: 0.44 to the metre. x is lateral, y is
// height, and the yard opens away from the camera down -z. The camera stands
// just outside the gate (z = 7), on a bank a few metres up, looking in: a
// tower crane on the left, a steel frame going up on the right, and an
// excavator working a spoil heap in front. The site is a clearing scraped out
// of the same pine country as the road.
const M = 0.44;
const GROUND_Y = -0.02;
const DIRT_Y = 0;

export const EYE = new THREE.Vector3(0, 2.2, 15);
export const LOOK = new THREE.Vector3(0, 1.2, -20);

// The fenced yard.
const YARD = { left: -30, right: 30, front: 7, back: -42, gate: 3.5 };

// The signpost stands by the gate, off to the right and turned to face the
// camera: out by the fence on wide screens, clear of the sheets, and drawn
// in on narrow ones to stay in shot (see placeSignpost). Its panels are
// drawn to the gantry's 250 mm x-height and scaled down to a site road's
// 110 mm. It is drawn like every other sign on the site (see the gantry and
// the lay-by): clean panels, square on, on plain posts.
export const SIGNPOST = { maxX: 3.2, z: 7.3, scale: 0.45, clearance: 0.4 };
// The emergency phone stands just left of the signpost, a step nearer, a
// touch over life size so it holds its own in the shot.
const PHONE = { gap: 0.45, forward: 0.2, scale: 1.25 };
// Faces stand this far in front of the posts, clear of the rails behind.
const SIGNPOST_FACE = 0.17;

// Lays out the signpost: a stack of direction panels (see directionArt), one
// per destination in order down the post, all the size of the largest. x and
// y are in the signpost's own frame, before scaling, with the ground at
// y = 0. The invisible CSS sign spans the stack, flush on the faces.
export function layoutSignpost<T extends SignItem>(items: readonly T[]) {
  const size = items
    .map((item) => directionArt(item))
    .reduce((max, art) => ({ width: Math.max(max.width, art.width), height: Math.max(max.height, art.height) }), { width: 0, height: 0 });
  const w = size.width * SW;
  const h = size.height * SW;
  const gap = 2 * SW;
  const bottom = SIGNPOST.clearance / SIGNPOST.scale;
  const panels: GantryPanel<T>[] = items.map((item, i) => ({
    item,
    art: directionArt(item, size),
    left: -w / 2,
    right: w / 2,
    top: bottom + (items.length - i) * h + (items.length - 1 - i) * gap,
  }));
  return {
    panels,
    left: -w / 2,
    right: w / 2,
    top: panels[0].top,
    bottom,
    z: SIGNPOST_FACE,
  };
}

export type SignpostLayout = ReturnType<typeof layoutSignpost<SignItem>>;

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const AXIS = new THREE.Vector3(0, 0, 1);
const ONE = new THREE.Vector3(1, 1, 1);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _d = new THREE.Vector3();
const _mid = new THREE.Vector3();

// Lays a geometry that runs along z, centred on the origin, from a to b.
function span(geometry: THREE.BufferGeometry, a: THREE.Vector3, b: THREE.Vector3) {
  _d.subVectors(b, a).normalize();
  _q.setFromUnitVectors(AXIS, _d);
  _mid.addVectors(a, b).multiplyScalar(0.5);
  return geometry.applyMatrix4(_m.compose(_mid, _q, ONE));
}

// A square bar, t thick, from a to b.
const bar = (a: THREE.Vector3, b: THREE.Vector3, t: number) => span(new THREE.BoxGeometry(t, t, a.distanceTo(b)), a, b);

// A round rod, r in radius, from a to b: hydraulic rams, rails, pipes.
const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, sides = 12) =>
  span(new THREE.CylinderGeometry(r, r, a.distanceTo(b), sides).rotateX(Math.PI / 2), a, b);

// A box with softened edges (r, capped to fit), as everything built here
// has: sharp-edged boxes read as placeholders next to everything else.
const rounded = (w: number, h: number, d: number, r = 0.03) =>
  new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));

// A universal beam or column (an I section, about 350 mm deep), from a to b.
const I_SECTION = (() => {
  const d = 0.16 / 2;
  const f = 0.12 / 2;
  const tf = 0.022;
  const tw = 0.012;
  const shape = new THREE.Shape()
    .moveTo(-f, -d)
    .lineTo(f, -d)
    .lineTo(f, -d + tf)
    .lineTo(tw / 2, -d + tf)
    .lineTo(tw / 2, d - tf)
    .lineTo(f, d - tf)
    .lineTo(f, d)
    .lineTo(-f, d)
    .lineTo(-f, d - tf)
    .lineTo(-tw / 2, d - tf)
    .lineTo(-tw / 2, -d + tf)
    .lineTo(-f, -d + tf)
    .closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
})();
const member = (a: THREE.Vector3, b: THREE.Vector3) => span(I_SECTION.clone().scale(1, 1, a.distanceTo(b)), a, b);

function merged(parts: THREE.BufferGeometry[]) {
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return geometry;
}

function add(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  x = 0,
  y = 0,
  z = 0,
  rotation = 0,
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotation;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Where the topsoil was scraped back: solid in the middle, ragged at the edge.
function patchMask(rand: () => number) {
  const texture = canvasTexture(256, 256, (ctx) => {
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, "#fff");
    gradient.addColorStop(0.74, "#fff");
    gradient.addColorStop(0.97, "#000");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 320; i++) {
      const angle = rand() * Math.PI * 2;
      const distance = (0.68 + rand() * 0.3) * 128;
      ctx.fillStyle = rand() < 0.5 ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.arc(128 + Math.cos(angle) * distance, 128 + Math.sin(angle) * distance, 3 + rand() * 11, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

// A crawler's tread print: two bands of cleat marks, repeating along v.
function trackTexture() {
  const texture = canvasTexture(128, 128, (ctx) => {
    for (const x of [6, 82]) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(x, 0, 40, 128);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      for (let y = 0; y < 128; y += 32) ctx.fillRect(x + 3, y, 34, 12);
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// A shipping container's side, drawn boldly: a few broad ribs in two tones,
// and darker rails top and bottom.
function corrugatedTexture() {
  const texture = canvasTexture(256, 64, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = "rgb(214 214 214)";
    for (let x = 0; x < 256; x += 32) ctx.fillRect(x + 18, 0, 14, 64);
    ctx.fillStyle = "rgb(170 170 170)";
    ctx.fillRect(0, 0, 256, 5);
    ctx.fillRect(0, 59, 256, 5);
  });
  return texture;
}

// Site cabin walls: white panels with seams and a blue skirt, windows (side)
// or a door (end). The emissive map lights the glass at dusk.
function cabinTextures(kind: "side" | "end") {
  const w = kind === "side" ? 512 : 256;
  const h = 256;
  const glass: [number, number, number, number][] =
    kind === "side"
      ? [
          [60, 70, 110, 90],
          [200, 70, 110, 90],
          [380, 70, 90, 90],
        ]
      : [[150, 70, 60, 70]];
  const map = canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = "#e4dfd3";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(60,50,40,0.1)";
    for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 3, h);
    ctx.fillStyle = "#33639c";
    ctx.fillRect(0, h - 36, w, 36);
    ctx.fillRect(0, 0, w, 10);
    for (const [x, y, gw, gh] of glass) {
      // White uPVC frames with a sill, and glass that shows the sky.
      ctx.fillStyle = "#f4f2ec";
      ctx.fillRect(x - 7, y - 7, gw + 14, gh + 14);
      ctx.fillStyle = "#c9c4b8";
      ctx.fillRect(x - 10, y + gh + 7, gw + 20, 5);
      const sky = ctx.createLinearGradient(0, y, 0, y + gh);
      sky.addColorStop(0, "#7d93a6");
      sky.addColorStop(1, "#4d5f6e");
      ctx.fillStyle = sky;
      ctx.fillRect(x, y, gw, gh);
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.moveTo(x, y + gh * 0.7);
      ctx.lineTo(x + gw * 0.55, y);
      ctx.lineTo(x + gw * 0.8, y);
      ctx.lineTo(x, y + gh);
      ctx.fill();
      ctx.fillStyle = "#f4f2ec";
      ctx.fillRect(x + gw / 2 - 2, y, 4, gh);
    }
    if (kind === "end") {
      ctx.fillStyle = "#3f6c9e";
      ctx.fillRect(40, 60, 80, 160);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(48, 68, 64, 70);
      ctx.fillStyle = "#d8d8d2";
      ctx.fillRect(104, 140, 8, 14);
    }
  });
  const emissive = canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    for (const [x, y, gw, gh] of glass) ctx.fillRect(x, y, gw, gh);
  });
  return { map, emissive };
}

function brickTexture() {
  // Three bold courses a side: a pallet of bricks, read from a distance.
  return canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = "#d7cbb9";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#b0603f";
    for (let row = 0; row < 3; row++) {
      for (let col = -1; col < 2; col++) {
        const x = col * 32 + (row % 2) * 16 + 2;
        ctx.fillRect(x, row * 21 + 2, 28, 17);
      }
    }
  });
}

// A ribbon of ground decal following a smooth path, v measured in widths.
function ribbon(points: THREE.Vector3[], width: number) {
  const curve = new THREE.CatmullRomCurve3(points);
  const length = curve.getLength();
  const steps = Math.ceil(length / 0.25);
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const side = new THREE.Vector3();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    side.set(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width / 2);
    positions.push(p.x - side.x, DIRT_Y + 0.004, p.z - side.z, p.x + side.x, DIRT_Y + 0.004, p.z + side.z);
    const along = (t * length) / width;
    uvs.push(0, along, 1, along);
    if (i < steps) {
      const a = i * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

// A heap with a lumpy profile, settled flat on the ground.
function heap(radius: number, height: number, seed: number) {
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(1, 4).deleteAttribute("uv").deleteAttribute("normal"));
  const position = geometry.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const lumps =
      1 +
      0.1 * Math.sin(p.x * 4.1 + seed) * Math.cos(p.z * 3.3 + seed * 1.7) +
      0.06 * Math.sin(p.x * 9 + p.z * 7 + seed * 3) +
      0.05 * Math.sin(Math.atan2(p.z, p.x) * 5 + seed);
    const y = Math.max(p.y, 0);
    // Slumped sides, a rounded crest.
    const r = radius * lumps * (1 - 0.15 * y);
    position.setXYZ(i, p.x * r, p.y < 0 ? -0.05 : height * lumps * y ** 1.2, p.z * r);
  }
  // Planar uvs, so the dirt texture lies across the heap at ground scale.
  const uvs = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uvs[i * 2] = position.getX(i) / 4;
    uvs[i * 2 + 1] = position.getZ(i) / 4 + position.getY(i) / 4;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

type Materials = ReturnType<typeof createMaterials>;

function createMaterials(anisotropy: number, rand: () => number) {
  // Painted, not photographed (see scene/style.ts): broad swathes of earth
  // and hardcore with no grit.
  const dirtMap = groundTexture(rand, { base: "#8e6c4b", light: "168,132,96", dark: "116,86,58" }, 0);
  dirtMap.wrapS = dirtMap.wrapT = THREE.RepeatWrapping;
  dirtMap.anisotropy = anisotropy;
  const gravelMap = groundTexture(rand, { base: "#9a958c", light: "186,180,170", dark: "128,122,114" }, 0);
  gravelMap.wrapS = gravelMap.wrapT = THREE.RepeatWrapping;
  const side = cabinTextures("side");
  const end = cabinTextures("end");
  const cabinWall = (t: typeof side) =>
    ink({ map: t.map, emissiveMap: t.emissive, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.7 });
  const cabinSide = cabinWall(side);
  const cabinEnd = cabinWall(end);
  const cabinRoof = matte({ color: 0x9a9c9e });
  const corrugated = corrugatedTexture();

  const mats = {
    meadow: meadowGround(anisotropy),
    dirt: foreground(matte({ map: dirtMap, alphaMap: patchMask(rand), transparent: true }), 0.16, 3, 16),
    // Its own copy, so the heaps' planar uvs tile at ground scale.
    heap: matte({ map: dirtMap.clone() }),
    gravel: matte({ map: gravelMap }),
    tracks: matte({
      map: trackTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    // Construction-plant yellow.
    crane: ink({ color: 0xf0b000, roughness: 0.5, metalness: 0.3 }),
    machine: ink({ color: 0xee9a12, roughness: 0.45, metalness: 0.25 }),
    // Red oxide primer on the new steelwork.
    steel: ink({ color: 0x8a3e2c, roughness: 0.7, metalness: 0.35 }),
    galvanised: ink({ color: 0xb6bdc4, roughness: 0.42, metalness: 0.8 }),
    rubber: matte({ color: 0x28282a, roughness: 0.85 }),
    concrete: matte({ color: 0xbab5ab }),
    pipes: matte({ color: 0xb3ada2, side: THREE.DoubleSide }),
    // Tinted glass that shows the sky (as on the car), not a black mirror.
    glass: ink({ color: 0x40525f, roughness: 0.45, metalness: 0.1 }),
    undercarriage: matte({ color: 0x2c2b2a, roughness: 0.8 }),
    wood: matte({ color: 0xa57b4d }),
    bricks: matte({ map: brickTexture() }),
    safety: ink({ color: 0xf2c400, roughness: 0.6 }),
    lamp: ink({ color: 0x30302e, emissive: 0xfff0d2, emissiveIntensity: 0 }),
    cones: ink({ vertexColors: true, roughness: 0.55 }),
    barrier: ink({ roughness: 0.5 }),
    cabin: [cabinEnd, cabinEnd, cabinRoof, cabinRoof, cabinSide, cabinSide],
    cabinWalls: [cabinSide, cabinEnd],
    containerRed: matte({ map: corrugated, color: 0x9a4430, roughness: 0.75 }),
    containerBlue: matte({ map: corrugated, color: 0x2f5d8c, roughness: 0.75 }),
  };
  return mats;
}

function glowMaterial(color: number) {
  return new THREE.SpriteMaterial({
    map: radialTexture([
      [0, "rgba(255,255,255,1)"],
      [0.25, "rgba(255,255,255,0.6)"],
      [1, "rgba(255,255,255,0)"],
    ]),
    color,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// A luffing-free hammerhead tower crane: lattice mast on a concrete base,
// slewing jib and counter-jib, with a trolley lowering a bundle of beams.
function createCrane(mats: Materials) {
  const group = new THREE.Group();
  const BASE = 0.5;
  const MAST = 15;
  const h = 0.4;
  const corners = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ] as const;
  add(group, rounded(2.4, BASE, 2.4, 0.08), mats.concrete, 0, BASE / 2, 0);

  // Drawn boldly, as a print would: few, thick members, so the lattice
  // reads as a pattern of triangles rather than a haze of fine lines.
  const mast: THREE.BufferGeometry[] = [];
  for (const [x, z] of corners) mast.push(bar(v(x, BASE, z), v(x, BASE + MAST, z), 0.1));
  const bays = Math.round(MAST / (4 * h));
  const bay = MAST / bays;
  for (let i = 0; i < bays; i++) {
    const y0 = BASE + i * bay;
    const y1 = y0 + bay;
    corners.forEach(([ax, az], f) => {
      const [bx, bz] = corners[(f + 1) % 4];
      const up = (i + f) % 2 === 0;
      mast.push(bar(v(ax, up ? y0 : y1, az), v(bx, up ? y1 : y0, bz), 0.055));
      mast.push(bar(v(ax, y1, az), v(bx, y1, bz), 0.055));
    });
  }
  add(group, merged(mast), mats.crane);

  const top = new THREE.Group();
  top.position.y = BASE + MAST;
  group.add(top);
  const JIB = 24;
  const COUNTER = 8;
  const J = 0.5;
  const JH = 0.9;
  const JW = 0.38;
  const APEX = 4.4;
  const steel: THREE.BufferGeometry[] = [new THREE.BoxGeometry(1.3, 0.4, 1.3).translate(0, 0.2, 0)];
  for (const [x, z] of corners) steel.push(bar(v(x * 1.2, 0.4, z * 1.2), v(0, APEX, 0), 0.07));
  corners.forEach(([x, z], f) => {
    const [nx, nz] = corners[(f + 1) % 4];
    steel.push(bar(v(x * 0.7, 2.2, z * 0.7), v(nx * 0.7, 2.2, nz * 0.7), 0.04));
  });
  // Jib: two bottom chords and a top chord, laced into a triangle.
  for (const z of [-JW, JW]) steel.push(bar(v(0.6, J, z), v(JIB, J, z), 0.08));
  const panels = Math.round((JIB - 0.6) / 1.8);
  const panel = (JIB - 0.6) / panels;
  steel.push(bar(v(0.6 + panel / 2, J + JH, 0), v(JIB - panel / 2, J + JH, 0), 0.08));
  for (let i = 0; i < panels; i++) {
    const x0 = 0.6 + i * panel;
    const x1 = x0 + panel;
    const xm = (x0 + x1) / 2;
    for (const z of [-JW, JW]) {
      steel.push(bar(v(x0, J, z), v(xm, J + JH, 0), 0.05));
      steel.push(bar(v(xm, J + JH, 0), v(x1, J, z), 0.05));
    }
    steel.push(bar(v(x1, J, -JW), v(x1, J, JW), 0.05));
  }
  // Counter-jib: a railed walkway out to the counterweights.
  for (const z of [-0.5, 0.5]) {
    steel.push(bar(v(-0.6, J, z), v(-COUNTER, J, z), 0.08));
    steel.push(bar(v(-0.6, J + 0.55, z), v(-COUNTER, J + 0.55, z), 0.03));
    for (let x = -2; x > -COUNTER; x -= 2) steel.push(bar(v(x, J, z), v(x, J + 0.55, z), 0.045));
  }
  for (let x = -2; x >= -COUNTER; x -= 2) steel.push(bar(v(x, J, -0.5), v(x, J, 0.5), 0.05));
  // Pendant ties from the tower head.
  steel.push(bar(v(0, APEX, 0), v(JIB * 0.45, J + JH, 0), 0.03));
  steel.push(bar(v(0, APEX, 0), v(JIB * 0.85, J + JH, 0), 0.03));
  for (const z of [-0.5, 0.5]) steel.push(bar(v(0, APEX, 0), v(-COUNTER + 0.4, J + 0.55, z), 0.03));
  add(top, merged(steel), mats.crane);

  add(top, new THREE.BoxGeometry(COUNTER - 0.6, 0.04, 1.0), mats.galvanised, -(COUNTER + 0.6) / 2, J + 0.02, 0);
  for (let i = 0; i < 4; i++) add(top, rounded(0.28, 1.5, 1.1, 0.05), mats.concrete, -COUNTER + 0.35 + i * 0.3, J - 0.35, 0);
  add(top, rounded(1.3, 0.6, 0.8, 0.08), mats.galvanised, -COUNTER + 2.7, J + 0.34, 0);
  // Operator's cab, hung off the slewing platform, glazed on three sides.
  add(top, rounded(0.6, 0.65, 0.7, 0.07), mats.crane, 0.4, 0.15, 1.0);
  add(top, rounded(0.08, 0.42, 0.6, 0.03), mats.glass, 0.68, 0.22, 1.0);
  add(top, rounded(0.5, 0.36, 0.04, 0.015), mats.glass, 0.4, 0.24, 1.34);
  add(top, new THREE.CylinderGeometry(0.6, 0.6, 0.3, 32), mats.galvanised, 0, 0.15, 0);

  const trolley = new THREE.Group();
  trolley.position.set(13, J, 0);
  top.add(trolley);
  add(trolley, rounded(0.55, 0.18, 0.9, 0.04), mats.galvanised, 0, -0.1, 0);
  const pendulum = new THREE.Group();
  pendulum.position.y = -0.2;
  trolley.add(pendulum);
  const ropes = add(
    pendulum,
    merged([-0.1, 0.1].map((z) => new THREE.CylinderGeometry(0.012, 0.012, 1, 5).translate(0, -0.5, z))),
    mats.rubber,
  );
  const hook = new THREE.Group();
  pendulum.add(hook);
  add(hook, rounded(0.28, 0.32, 0.2, 0.05), mats.crane, 0, -0.16, 0);
  add(
    hook,
    merged([bar(v(0, -0.32, 0), v(-1.2, -0.82, 0), 0.015), bar(v(0, -0.32, 0), v(1.2, -0.82, 0), 0.015)]),
    mats.rubber,
  );
  add(
    hook,
    merged([
      member(v(-1.7, -0.92, -0.065), v(1.7, -0.92, -0.065)),
      member(v(-1.7, -0.92, 0.065), v(1.7, -0.92, 0.065)),
      member(v(-1.7, -0.76, 0), v(1.7, -0.76, 0)),
    ]),
    mats.steel,
  );

  // Red aviation lights on the tower head and both jib ends.
  const beaconMaterial = glowMaterial(0xff2a1a);
  const beacons = [v(0, APEX + 0.1, 0), v(JIB, J + 0.15, 0), v(-COUNTER, J + 0.8, 0)].map((at) => {
    const sprite = new THREE.Sprite(beaconMaterial);
    sprite.position.copy(at);
    sprite.scale.setScalar(0.9);
    top.add(sprite);
    return sprite;
  });

  return {
    group,
    beaconMaterial,
    update(time: number, motion: number) {
      top.rotation.y = 0.12 + Math.sin(time * 0.045) * 0.5 * motion;
      trolley.position.x = 13 + Math.sin(time * 0.07 + 0.6) * 5 * motion;
      const drop = 7 + Math.sin(time * 0.055 + 2) * 2.5 * motion;
      ropes.scale.y = drop;
      hook.position.y = -drop;
      hook.rotation.y = Math.sin(time * 0.17) * 0.5 * motion;
      pendulum.rotation.z = Math.sin(time * 0.7) * 0.012 * motion;
      pendulum.rotation.x = Math.sin(time * 0.55 + 1) * 0.008 * motion;
      const on = motion === 0 || Math.floor(time * 1.1) % 2 === 0;
      for (const beacon of beacons) beacon.visible = on;
    },
  };
}

// A four-storey steel frame partway up: the lower floors decked in concrete
// and edged with handrail, the top storey half erected.
function createFrame(mats: Materials) {
  const group = new THREE.Group();
  const NX = 4;
  const NZ = 3;
  const SPAN = 3.2;
  const STOREY = 1.7;
  const LEVELS = 4;
  const has = (ix: number, level: number) => level < LEVELS || ix <= 2;
  const at = (ix: number, iz: number, y: number) => v(ix * SPAN, y, -iz * SPAN);

  const members: THREE.BufferGeometry[] = [];
  const pads: THREE.BufferGeometry[] = [];
  const braces: THREE.BufferGeometry[] = [];
  const rails: THREE.BufferGeometry[] = [];
  const slabs: THREE.BufferGeometry[] = [];

  for (let ix = 0; ix < NX; ix++) {
    for (let iz = 0; iz < NZ; iz++) {
      pads.push(rounded(0.5, 0.12, 0.5, 0.03).translate(ix * SPAN, 0.06, -iz * SPAN));
      for (let level = 1; level <= LEVELS; level++) {
        if (has(ix, level)) members.push(member(at(ix, iz, (level - 1) * STOREY), at(ix, iz, level * STOREY)));
      }
    }
  }
  for (let level = 1; level <= LEVELS; level++) {
    const y = level * STOREY - 0.08;
    for (let ix = 0; ix < NX; ix++) {
      for (let iz = 0; iz < NZ; iz++) {
        if (ix < NX - 1 && has(ix + 1, level)) members.push(member(at(ix, iz, y), at(ix + 1, iz, y)));
        if (iz < NZ - 1 && has(ix, level)) members.push(member(at(ix, iz + 1, y), at(ix, iz, y)));
      }
    }
  }
  // Cross bracing in one bay of the back and left faces.
  for (let level = 1; level < LEVELS; level++) {
    const y0 = (level - 1) * STOREY + 0.1;
    const y1 = level * STOREY - 0.16;
    braces.push(bar(at(1, NZ - 1, y0), at(2, NZ - 1, y1), 0.05), bar(at(2, NZ - 1, y0), at(1, NZ - 1, y1), 0.05));
    braces.push(bar(at(0, 0, y0), at(0, 1, y1), 0.05), bar(at(0, 1, y0), at(0, 0, y1), 0.05));
  }

  function deck(level: number, bays: number) {
    const y = level * STOREY;
    const x0 = -0.15;
    const x1 = bays * SPAN + 0.15;
    const z0 = 0.15;
    const z1 = -(NZ - 1) * SPAN - 0.15;
    slabs.push(rounded(x1 - x0, 0.1, z0 - z1, 0.03).translate((x0 + x1) / 2, y + 0.05, (z0 + z1) / 2));
    const r = y + 0.1;
    const edges = [
      [v(x0, r, z0), v(x1, r, z0)],
      [v(x1, r, z0), v(x1, r, z1)],
      [v(x1, r, z1), v(x0, r, z1)],
      [v(x0, r, z1), v(x0, r, z0)],
    ];
    for (const [a, b] of edges) {
      for (const lift of [0.22, 0.45]) rails.push(bar(a.clone().setY(r + lift), b.clone().setY(r + lift), 0.025));
      const posts = Math.max(1, Math.round(a.distanceTo(b) / 1.1));
      for (let i = 0; i < posts; i++) {
        const p = a.clone().lerp(b, i / posts);
        rails.push(bar(p, p.clone().setY(r + 0.46), 0.025));
      }
    }
  }
  deck(1, NX - 1);
  deck(2, NX - 1);
  deck(3, 2);

  add(group, merged(members), mats.steel);
  add(group, merged(braces), mats.galvanised);
  add(group, merged(pads), mats.concrete);
  add(group, merged(slabs), mats.concrete);
  add(group, merged(rails), mats.safety);
  return group;
}

// A side-on outline swept along x: a shape drawn in (z, y), extruded `width`
// across and centred on x, with softened edges.
function profile(shape: THREE.Shape, width: number, bevel = 0.015) {
  return new THREE.ExtrudeGeometry(shape, {
    depth: width - 2 * bevel,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 10,
  })
    .translate(0, 0, -(width - 2 * bevel) / 2)
    .rotateY(-Math.PI / 2);
}

// A tapering arm along a smooth path (in z, y), `from` thick at its root and
// `to` at its tip, with rounded ends: the boom and the stick. `side(t, d)`
// is the point d out from its edge at t along it (d < 0 for the other edge),
// where the rams take hold.
function arm(points: THREE.Vector2[], from: number, to: number) {
  const curve = new THREE.SplineCurve(points);
  const steps = 24;
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const half = THREE.MathUtils.lerp(from, to, t) / 2;
    const n = new THREE.Vector2(-tangent.y, tangent.x).multiplyScalar(half);
    left.push(p.clone().add(n));
    right.push(p.clone().sub(n));
  }
  const shape = new THREE.Shape(left);
  const tip = curve.getPoint(1);
  const end = Math.atan2(left[steps].y - tip.y, left[steps].x - tip.x);
  shape.absarc(tip.x, tip.y, to / 2, end, end - Math.PI, true);
  for (const p of right.reverse()) shape.lineTo(p.x, p.y);
  const root = curve.getPoint(0);
  const start = Math.atan2(right[steps].y - root.y, right[steps].x - root.x);
  shape.absarc(root.x, root.y, from / 2, start, start - Math.PI, true);
  const side = (t: number, d: number) => {
    const tangent = curve.getTangent(t);
    const half = THREE.MathUtils.lerp(from, to, t) / 2;
    return curve.getPoint(t).add(new THREE.Vector2(-tangent.y, tangent.x).multiplyScalar(Math.sign(d) * half + d));
  };
  return { shape, side };
}

// A 20-tonne tracked excavator, its arm reaching into the spoil heap. Built
// to read as the yard's hero machine beside the loaded car and trees: a
// curved boom, track frames with their pads, a framed glass cab.
function createExcavator(mats: Materials, slew: number) {
  const group = new THREE.Group();

  // Tracks: a stadium-shaped frame each side, wrapped in grouser pads.
  const TRACK = { length: 1.76, height: 0.34, width: 0.28, x: 0.42 };
  const r = TRACK.height / 2;
  const straight = TRACK.length / 2 - r;
  const frame = new THREE.Shape()
    .moveTo(-straight, -r)
    .lineTo(straight, -r)
    .absarc(straight, 0, r, -Math.PI / 2, Math.PI / 2, false)
    .lineTo(-straight, r)
    .absarc(-straight, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  const pads: THREE.BufferGeometry[] = [];
  const perimeter = 4 * straight + 2 * Math.PI * r;
  const count = Math.round(perimeter / 0.075);
  for (let i = 0; i < count; i++) {
    let d = (i / count) * perimeter;
    let z: number, y: number, angle: number;
    if (d < 2 * straight) {
      [z, y, angle] = [-straight + d, -r, 0];
    } else if ((d -= 2 * straight) < Math.PI * r) {
      angle = d / r;
      [z, y] = [straight + Math.sin(angle) * r, -Math.cos(angle) * r];
    } else if ((d -= Math.PI * r) < 2 * straight) {
      [z, y, angle] = [straight - d, r, Math.PI];
    } else {
      angle = Math.PI + (d - 2 * straight) / r;
      [z, y] = [-straight + Math.sin(angle) * r, -Math.cos(angle) * r];
    }
    pads.push(new THREE.BoxGeometry(TRACK.width + 0.02, 0.03, 0.045).rotateX(angle).translate(0, y, z));
  }
  const padRing = merged(pads);
  for (const side of [-1, 1]) {
    add(group, profile(frame, TRACK.width - 0.02, 0.02), mats.undercarriage, side * TRACK.x, r + 0.01, 0);
    add(group, padRing.clone(), mats.rubber, side * TRACK.x, r + 0.01, 0);
    // Idler and sprocket hubs, showing on the outside.
    for (const z of [-straight, straight]) {
      add(group, new THREE.CylinderGeometry(0.1, 0.1, 0.02, 20).rotateZ(Math.PI / 2), mats.machine, side * (TRACK.x + TRACK.width / 2), r + 0.01, z);
    }
  }
  padRing.dispose();
  add(group, rounded(0.62, 0.2, 1.2, 0.05), mats.undercarriage, 0, 0.3, 0);
  add(group, new THREE.CylinderGeometry(0.38, 0.4, 0.1, 32), mats.undercarriage, 0, 0.44, 0);

  const house = new THREE.Group();
  house.position.y = 0.48;
  house.rotation.y = slew;
  group.add(house);
  // Deck, engine cover and a rounded counterweight at the back.
  add(house, rounded(1.08, 0.34, 1.32, 0.06), mats.machine, 0, 0.2, -0.05);
  add(house, rounded(1.1, 0.42, 0.42, 0.14), mats.machine, 0, 0.23, -0.82);
  add(house, rounded(0.6, 0.14, 0.7, 0.05), mats.machine, 0.2, 0.43, -0.42);
  add(house, rounded(1.12, 0.05, 0.44, 0.02), mats.undercarriage, 0, 0.06, -0.82);
  add(house, rod(v(0.38, 0.45, -0.58), v(0.38, 0.74, -0.58), 0.026), mats.undercarriage);
  // Handrail along the right-hand deck.
  add(
    house,
    merged([
      rod(v(0.5, 0.37, 0.2), v(0.5, 0.62, 0.2), 0.012, 8),
      rod(v(0.5, 0.37, -0.45), v(0.5, 0.62, -0.45), 0.012, 8),
      rod(v(0.5, 0.62, 0.22), v(0.5, 0.62, -0.47), 0.012, 8),
    ]),
    mats.safety,
  );

  // Cab: tinted glass in a yellow frame, roof and lower panel.
  const CAB = { x: -0.28, z: 0.22, w: 0.46, d: 0.6, h: 0.62, y: 0.42 };
  add(house, rounded(CAB.w - 0.02, CAB.h - 0.1, CAB.d - 0.02, 0.04), mats.glass, CAB.x, CAB.y + CAB.h / 2 + 0.02, CAB.z);
  add(house, rounded(CAB.w + 0.02, 0.16, CAB.d + 0.02, 0.04), mats.machine, CAB.x, CAB.y + 0.08, CAB.z);
  add(house, rounded(CAB.w + 0.04, 0.06, CAB.d + 0.06, 0.025), mats.machine, CAB.x, CAB.y + CAB.h + 0.04, CAB.z);
  const pillars: THREE.BufferGeometry[] = [];
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      pillars.push(rounded(0.04, CAB.h, 0.04, 0.012).translate(CAB.x + (dx * CAB.w) / 2, CAB.y + CAB.h / 2 + 0.02, CAB.z + (dz * CAB.d) / 2));
    }
  }
  add(house, merged(pillars), mats.machine);

  // Boom (curved), stick and bucket, in the plane x = 0.14, drawn side on
  // as (z, y). The bucket curls under at the end of the stick.
  const X = 0.14;
  const root = new THREE.Vector2(0.32, 0.42);
  const knee = new THREE.Vector2(1.12, 1.62);
  const head = new THREE.Vector2(1.95, 1.86);
  const wrist = new THREE.Vector2(2.68, 0.42);
  const boomArm = arm([root, new THREE.Vector2(0.62, 1.12), knee, new THREE.Vector2(1.5, 1.88), head], 0.24, 0.15);
  const stickArm = arm([head, new THREE.Vector2(2.3, 1.15), wrist], 0.15, 0.1);
  add(house, profile(boomArm.shape, 0.2), mats.machine, X, 0, 0);
  add(house, profile(stickArm.shape, 0.15), mats.machine, X, 0, 0);
  const scoop = new THREE.Shape()
    .moveTo(0, 0.04)
    .quadraticCurveTo(-0.16, -0.06, -0.12, -0.26)
    .quadraticCurveTo(-0.06, -0.4, 0.12, -0.38)
    .lineTo(0.36, -0.3)
    .lineTo(0.3, -0.22)
    .quadraticCurveTo(0.12, -0.2, 0.1, -0.02)
    .closePath();
  const bucket = add(house, profile(scoop, 0.44, 0.02), mats.machine, X, wrist.y, wrist.x);
  bucket.rotation.x = -0.6;
  // Teeth along the lip.
  const teeth: THREE.BufferGeometry[] = [];
  for (const tx of [-0.15, -0.05, 0.05, 0.15]) teeth.push(rounded(0.05, 0.03, 0.09, 0.01).translate(tx, -0.31, 0.38));
  const toothRow = add(house, merged(teeth), mats.undercarriage, X, wrist.y, wrist.x);
  toothRow.rotation.x = -0.6;

  // Hydraulic rams, each a cylinder with a polished rod, held just off the
  // arm's edge: a pair under the boom from the deck, one along its back to
  // the stick, one down the stick to the bucket.
  const at = (p: THREE.Vector2, x: number) => v(x, p.y, p.x);
  const ram = (a: THREE.Vector2, b: THREE.Vector2, x: number, radius: number) => {
    const mid = a.clone().lerp(b, 0.58);
    return [rod(at(a, x), at(mid, x), radius), rod(at(mid, x), at(b, x), radius * 0.55)];
  };
  const deck = new THREE.Vector2(0.52, 0.3);
  const underBoom = boomArm.side(0.4, -0.02);
  add(
    house,
    merged([
      ...ram(deck, underBoom, X - 0.14, 0.045),
      ...ram(deck, underBoom, X + 0.14, 0.045),
      ...ram(boomArm.side(0.62, 0.05), stickArm.side(0.04, 0.12), X, 0.04),
      ...ram(stickArm.side(0.12, 0.05), stickArm.side(0.88, 0.05), X, 0.032),
    ]),
    mats.galvanised,
  );
  // Pins at each joint.
  for (const p of [root, head, wrist]) add(house, new THREE.CylinderGeometry(0.05, 0.05, 0.26, 16).rotateZ(Math.PI / 2), mats.undercarriage, X, p.y, p.x);
  return group;
}

// Heras panels along each run of fence, drawn as a print would: a bold
// galvanised frame round each panel, a sparse grid of bars standing for the
// mesh, and a dark block foot at each joint.
function createFence(mats: Materials, runs: [THREE.Vector3, THREE.Vector3][]) {
  const W = 3.5 * M;
  const H = 2 * M;
  const lift = 0.07;
  const frames: THREE.BufferGeometry[] = [];
  const grid: THREE.BufferGeometry[] = [];
  const feet: THREE.BufferGeometry[] = [];
  const foot = (at: THREE.Vector3, heading: number) => rounded(0.12, 0.08, 0.32, 0.03).rotateY(heading).translate(at.x, 0.04, at.z);
  for (const [from, to] of runs) {
    const heading = Math.atan2(to.x - from.x, to.z - from.z);
    const count = Math.max(1, Math.round(from.distanceTo(to) / W));
    for (let i = 0; i < count; i++) {
      const a = from.clone().lerp(to, i / count);
      const b = from.clone().lerp(to, (i + 1) / count);
      const at = (t: number, y: number) => a.clone().lerp(b, t).setY(lift + y);
      frames.push(rod(at(0.01, 0), at(0.01, H), 0.022, 8), rod(at(0.99, 0), at(0.99, H), 0.022, 8));
      frames.push(rod(at(0, H), at(1, H), 0.018, 8), rod(at(0, 0), at(1, 0), 0.018, 8));
      for (const t of [1 / 3, 2 / 3]) grid.push(rod(at(t, 0), at(t, H), 0.008, 6));
      grid.push(rod(at(0, H / 2), at(1, H / 2), 0.008, 6));
      feet.push(foot(a, heading + Math.PI / 2));
    }
    feet.push(foot(to, heading + Math.PI / 2));
  }
  const group = new THREE.Group();
  add(group, merged(frames), mats.galvanised);
  add(group, merged(grid), mats.galvanised);
  add(group, merged(feet), mats.rubber);
  return group;
}

// Traffic cones, with a white reflective sleeve, as one instanced mesh.
function createCones(mats: Materials, spots: [number, number][], rand: () => number) {
  const colored = (geometry: THREE.BufferGeometry, color: number) => {
    const c = new THREE.Color(color);
    const count = geometry.attributes.position.count;
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [c.r, c.g, c.b]).flat(), 3));
    return geometry;
  };
  const cone = merged([
    colored(new THREE.BoxGeometry(0.18, 0.02, 0.18).translate(0, 0.01, 0), 0x1e1e1e),
    colored(new THREE.ConeGeometry(0.075, 0.31, 14, 1, true).translate(0, 0.175, 0), 0xff5a10),
    colored(new THREE.CylinderGeometry(0.044, 0.056, 0.07, 14, 1, true).translate(0, 0.2, 0), 0xf4f4f0),
  ]);
  const mesh = new THREE.InstancedMesh(cone, mats.cones, spots.length);
  const dummy = new THREE.Object3D();
  spots.forEach(([x, z], i) => {
    dummy.position.set(x, DIRT_Y, z);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Interlocking plastic barriers, alternately red and white, along a line.
function createBarriers(mats: Materials, from: THREE.Vector3, to: THREE.Vector3) {
  const L = 1 * M * 1.9;
  const shape = new THREE.Shape()
    .moveTo(-0.11, 0)
    .lineTo(0.11, 0)
    .lineTo(0.06, 0.36)
    .lineTo(-0.06, 0.36)
    .closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: L * 0.96, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
  geometry.translate(0, 0, (-L * 0.96) / 2);
  const count = Math.max(1, Math.round(from.distanceTo(to) / L));
  const mesh = new THREE.InstancedMesh(geometry, mats.barrier, count);
  const dummy = new THREE.Object3D();
  const red = new THREE.Color(0xc8261c);
  const white = new THREE.Color(0xf2f0ea);
  const heading = Math.atan2(to.x - from.x, to.z - from.z);
  for (let i = 0; i < count; i++) {
    dummy.position.copy(from).lerp(to, (i + 0.5) / count).setY(DIRT_Y);
    dummy.rotation.set(0, heading + (i % 2 ? 0.03 : -0.03), 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, i % 2 ? white : red);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A lattice-free floodlight mast with a bar of four lamps, aimed into the yard.
function createFloodlight(mats: Materials, x: number, z: number, target: THREE.Vector3) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = Math.atan2(target.x - x, target.z - z);
  const HEIGHT = 4.6;
  add(group, rounded(0.6, 0.25, 0.6, 0.05), mats.concrete, 0, 0.125, 0);
  add(group, new THREE.CylinderGeometry(0.04, 0.06, HEIGHT, 12), mats.galvanised, 0, HEIGHT / 2, 0);
  add(group, rounded(1.0, 0.04, 0.04, 0.015), mats.galvanised, 0, HEIGHT, 0);
  for (const lx of [-0.36, -0.12, 0.12, 0.36]) {
    const lamp = add(group, rounded(0.2, 0.16, 0.07, 0.025), mats.lamp, lx, HEIGHT + 0.12, 0.05);
    lamp.rotation.x = 0.35;
  }
  return { group, head: new THREE.Vector3(x, HEIGHT + 0.1, z) };
}

export type Yard = ReturnType<typeof buildYard>;

export function buildYard({
  anisotropy,
  detail,
  signpost: layout,
  font,
}: {
  anisotropy: number;
  detail: number;
  signpost: SignpostLayout;
  font: string;
}) {
  const scene = new THREE.Scene();
  const rand = rng(23);
  const wind = { value: 0 };

  const mats = createMaterials(anisotropy, rand);

  function ground(width: number, depth: number, material: THREE.Material, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  ground(4000, 4000, mats.meadow, 0, GROUND_Y, -1000);
  const DIRT = { width: 96, depth: 92, z: -9 };
  (mats.dirt.map as THREE.Texture).repeat.set(DIRT.width / 4, DIRT.depth / 4);
  ground(DIRT.width, DIRT.depth, mats.dirt, 0, DIRT_Y, DIRT.z);

  // Plant tracks worn in from the gate to the heap, the frame and the crane.
  for (const path of [
    [v(0, 0, 22), v(0.4, 0, 10), v(-2.5, 0, 1), v(-7.5, 0, -2.5), v(-9.5, 0, -6)],
    [v(0.8, 0, 22), v(1.6, 0, 8), v(5, 0, -4), v(9, 0, -12), v(10.5, 0, -16)],
    [v(-2.5, 0, 1), v(-8, 0, -10), v(-14, 0, -18), v(-17, 0, -21)],
    [v(5, 0, -4), v(12, 0, -6), v(18, 0, -4), v(22, 0, 2)],
  ]) {
    const mesh = new THREE.Mesh(ribbon(path, 1.3), mats.tracks);
    mesh.receiveShadow = true;
    // Both are transparent; draw the tracks after the dirt they print on.
    mesh.renderOrder = 1;
    scene.add(mesh);
  }

  // Puddles left by the last rain, flat pools of the sky's colour, each in
  // a rim of darker, wet earth; and rubble in heaps along the way.
  const puddle = new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const wet = ink({ color: 0x5e4630, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const [x, z, rx, rz, turn] of [
    [-5.6, 10.6, 1.5, 0.62, 0.25],
    [4.4, 12.2, 0.95, 0.42, -0.2],
    [-1.6, 4.2, 1.2, 0.5, 0.1],
    [7.6, 1.2, 1.7, 0.66, 0.4],
    [-12.5, 1.5, 1.1, 0.45, -0.3],
  ]) {
    const pool = (scale: number, material: THREE.Material, y: number) => {
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), material);
      mesh.scale.set(rx * scale, 1, rz * scale);
      mesh.rotation.y = turn;
      mesh.position.set(x, DIRT_Y + y, z);
      mesh.receiveShadow = true;
      scene.add(mesh);
    };
    pool(1.14, wet, 0.008);
    pool(1, puddle, 0.012);
  }
  const pebble = new THREE.IcosahedronGeometry(1, 1).scale(1, 0.55, 0.8);
  const rubbleSpots: [number, number, number][] = [
    [-8.3, 11.2, 9],
    [6.8, 9.6, 7],
    [-3.2, -1.8, 8],
    [2.6, 5.2, 5],
    [12.5, -2.5, 7],
  ];
  const rubble = new THREE.InstancedMesh(pebble, ink({ color: 0xb3aa9c }), rubbleSpots.reduce((n, [, , k]) => n + k, 0));
  {
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    let i = 0;
    for (const [cx, cz, count] of rubbleSpots) {
      for (let k = 0; k < count; k++) {
        const size = 0.06 + rand() * 0.12;
        dummy.position.set(cx + (rand() - 0.5) * 1.4, DIRT_Y + size * 0.25, cz + (rand() - 0.5) * 0.9);
        dummy.rotation.set(0, rand() * Math.PI, 0);
        dummy.scale.setScalar(size);
        dummy.updateMatrix();
        rubble.setMatrixAt(i, dummy.matrix);
        const v = 0.8 + rand() * 0.3;
        rubble.setColorAt(i++, tint.setRGB(v, v * 0.97, v * 0.93));
      }
    }
  }
  rubble.castShadow = rubble.receiveShadow = true;
  scene.add(rubble);

  // The signpost: the direction panels on two galvanised posts, as clean
  // as the gantry's.
  const signpost = new THREE.Group();
  signpost.rotation.order = "YXZ";
  const signs = createGantrySign(layout.panels, { font, z: layout.z, metal: mats.galvanised, anisotropy, lamps: false });
  signpost.add(signs.group);
  const postHeight = layout.top - 0.02;
  for (const x of [layout.left * 0.6, layout.right * 0.6]) {
    add(signpost, new THREE.CylinderGeometry(0.05, 0.05, postHeight, 16), mats.galvanised, x, postHeight / 2, 0);
  }
  signpost.scale.setScalar(SIGNPOST.scale);
  scene.add(signpost);

  // The emergency phone, beside it, the same one as in the lay-by (see
  // road/phone.ts).
  const phone = createPhone({ post: mats.galvanised });
  phone.group.rotation.order = "YXZ";
  phone.group.scale.setScalar(PHONE.scale);
  scene.add(phone.group);

  // Stands the signpost x across (capped at SIGNPOST.maxX), facing the
  // camera, with the phone at its side. The phone turns a little
  // further than square on, so it shows its side.
  function placeSignpost(x: number) {
    x = Math.min(x, SIGNPOST.maxX);
    signpost.position.set(x, 0, SIGNPOST.z);
    signpost.rotation.set(0, Math.atan2(EYE.x - x, EYE.z - SIGNPOST.z), 0);
    signpost.updateMatrixWorld(true);
    const px = x + layout.left * SIGNPOST.scale - PHONE.gap;
    const pz = SIGNPOST.z + PHONE.forward;
    phone.group.position.set(px, DIRT_Y, pz);
    phone.group.rotation.set(0, Math.atan2(EYE.x - px, EYE.z - pz) + 0.35, 0);
    phone.group.updateMatrixWorld(true);
  }
  placeSignpost(SIGNPOST.maxX);

  // Tower crane, behind and to the left, its jib swinging over the frame.
  const crane = createCrane(mats);
  crane.group.position.set(-19, 0, -24);
  scene.add(crane.group);

  const frame = createFrame(mats);
  frame.position.set(11, 0, -20);
  frame.rotation.y = -0.12;
  scene.add(frame);

  // Steel waiting to go up, stacked on timber bearers.
  const stock: THREE.BufferGeometry[] = [];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      const z = (i - (3 - row) / 2) * 0.14;
      const y = 0.1 + 0.08 + row * 0.165;
      stock.push(member(v(-2, y, z), v(2, y, z)));
    }
  }
  add(scene, merged(stock), mats.steel, 8, 0, -12.5, 0.1);
  for (const x of [-1.5, 0, 1.5]) add(scene, new THREE.BoxGeometry(0.12, 0.1, 0.9), mats.wood, 8 + x, 0.05, -12.5 + x * 0.1, 0.1);

  // The excavator, slewed round to load from its heap.
  const excavator = createExcavator(mats, -1.05);
  excavator.position.set(-10, 0, -5);
  excavator.rotation.y = 0.35;
  scene.add(excavator);
  for (const [r, h, x, z, seed] of [
    [3.6, 1.9, -14.5, -3, 1],
    [2.4, 1.1, -11, -10, 2.4],
    [1.8, 0.8, -18, 1.5, 3.7],
  ]) {
    add(scene, heap(r, h, seed), mats.heap, x, DIRT_Y, z);
  }
  add(scene, heap(2.6, 1.3, 5.1), mats.gravel, 3, DIRT_Y, -31);
  add(scene, heap(1.9, 0.9, 6.3), mats.gravel, 21, DIRT_Y, -34);

  // Welfare cabins, double-stacked, with a stair up the end.
  // Each a box with rounded edges under a roof that overhangs a little.
  function cabin(x: number, y: number, z: number, rotation: number) {
    add(scene, rounded(6 * M + 0.06, 0.05, 2.6 * M + 0.08, 0.02), mats.cabin[2], x, y + 2.6 * M + 0.02, z, rotation);
    return add(scene, rounded(6 * M, 2.6 * M, 2.6 * M, 0.035), mats.cabin, x, y + 1.3 * M, z, rotation);
  }
  const CABIN = { x: 11, z: -5, rotation: -0.35 };
  const Y = v(0, 1, 0);
  const local = (x: number, y: number, z: number) => v(x, y, z).applyAxisAngle(Y, CABIN.rotation).add(v(CABIN.x, 0, CABIN.z));
  for (const x of [-1.1, 0, 1.1]) {
    const at = local(x, 0.05, 0);
    add(scene, new THREE.BoxGeometry(0.15, 0.1, 1.3), mats.wood, at.x, at.y, at.z, CABIN.rotation);
  }
  cabin(CABIN.x, 0.1, CABIN.z, CABIN.rotation);
  cabin(CABIN.x, 0.1 + 2.6 * M, CABIN.z, CABIN.rotation);
  cabin(14.6, 0.1, -8.2, -0.5);
  // Stair up the end wall to the top cabin's door.
  const end = -3 * M - 0.2;
  const stairBase = local(end, 0, 1.2);
  const stairTop = local(end, 0.1 + 2.6 * M, -0.2);
  add(
    scene,
    merged([
      bar(stairBase, stairTop, 0.06),
      bar(stairBase.clone().add(v(0, 0.45, 0)), stairTop.clone().add(v(0, 0.45, 0)), 0.03),
      new THREE.BoxGeometry(0.4, 0.04, 0.5).rotateY(CABIN.rotation).translate(stairTop.x, stairTop.y, stairTop.z),
    ]),
    mats.galvanised,
  );

  const container = () => rounded(6.06 * M, 2.59 * M, 2.44 * M, 0.04);
  add(scene, container(), mats.containerRed, 18, 1.295 * M, -13, 0.25);
  add(scene, container(), mats.containerBlue, 18.3, 3.885 * M + 0.002, -13.1, 0.22);
  add(scene, container(), mats.containerBlue, -16, 1.295 * M, -14, 1.35);

  // Concrete drainage pipes, chocked in a pyramid.
  const pipe = new THREE.CylinderGeometry(0.36, 0.36, 1.05, 24, 1, true).rotateZ(Math.PI / 2);
  for (const [x, y, z] of [
    [-0.37, 0.36, 0],
    [0.37, 0.36, 0],
    [0, 0.98, 0],
  ]) {
    add(scene, pipe.clone().rotateY(Math.PI / 2), mats.pipes, -4 + x, y, -17 + z, 0.5);
  }
  pipe.dispose();

  // Pallets of bricks by the frame.
  for (const [x, z, rotation] of [
    [6, -8, 0.2],
    [6.7, -8.6, 0.25],
    [5.4, -9.1, -0.1],
  ]) {
    add(scene, rounded(0.53, 0.07, 0.48, 0.01), mats.wood, x, 0.035, z, rotation);
    add(scene, rounded(0.5, 0.4, 0.45, 0.02), mats.bricks, x, 0.27, z, rotation);
  }

  const fence = createFence(
    mats,
    [
      [v(YARD.left, 0, YARD.front), v(-YARD.gate, 0, YARD.front)],
      [v(YARD.gate, 0, YARD.front), v(YARD.right, 0, YARD.front)],
      [v(YARD.right, 0, YARD.front), v(YARD.right, 0, YARD.back)],
      [v(YARD.right, 0, YARD.back), v(YARD.left, 0, YARD.back)],
      [v(YARD.left, 0, YARD.back), v(YARD.left, 0, YARD.front)],
    ],
  );
  scene.add(fence);

  const coneSpots: [number, number][] = [];
  for (let i = 0; i < 7; i++) coneSpots.push([-YARD.gate - 0.3 + i * 0.05, YARD.front - 0.6 - i * 1.4]);
  for (let i = 0; i < 7; i++) coneSpots.push([YARD.gate + 0.3 - i * 0.05, YARD.front - 0.6 - i * 1.4]);
  for (let i = 0; i < 6; i++) coneSpots.push([4.5 + i * 1.1, -14.8 + (rand() - 0.5) * 0.2]);
  coneSpots.push([-6.2, -1.2], [-6.6, -0.6], [14.6, -9.2]);
  scene.add(createCones(mats, coneSpots, rand));
  scene.add(createBarriers(mats, v(-7, 0, -13), v(-1, 0, -13.5)));
  scene.add(createBarriers(mats, v(16, 0, -20), v(16.4, 0, -28)));

  const center = v(0, 0, -14);
  const floodlights = [createFloodlight(mats, -25, -6, center), createFloodlight(mats, 24, -33, center), createFloodlight(mats, -4, -38, center)];
  const spots = floodlights.slice(0, 2).map(({ group, head }) => {
    scene.add(group);
    const spot = new THREE.SpotLight(0xffe2b8, 0, 0, 0.62, 0.7, 0);
    spot.position.copy(head);
    spot.target.position.copy(center);
    scene.add(spot, spot.target);
    return spot;
  });
  scene.add(floodlights[2].group);

  const sunAzimuth = Math.min(day.sunAzimuth, dusk.sunAzimuth);
  const sunElevation = Math.min(day.sunElevation, dusk.sunElevation);
  const forest = createForest({
    detail,
    rand,
    groundY: GROUND_Y,
    keepClear: (x, z, height) => {
      // The yard, a margin round it, and the ground behind the camera.
      if (z > -60 && Math.abs(x) < 50) return true;
      if (z > EYE.z - 4) return true;
      const distance = Math.hypot(x - EYE.x, EYE.z - z);
      const azimuth = THREE.MathUtils.radToDeg(Math.atan2(x - EYE.x, EYE.z - z));
      const spread = THREE.MathUtils.radToDeg(Math.atan2(3, distance));
      const top = THREE.MathUtils.radToDeg(Math.atan2(height - EYE.y, distance));
      return Math.abs(azimuth - sunAzimuth) < 4 + spread && top > sunElevation - 2;
    },
  });
  scene.add(forest.group);

  // The sky, clouds, site dust hanging in the low sun, hills and light (see
  // scene/atmosphere.ts). The camera barely moves, so the shadow map can sit
  // still over the yard.
  const atmosphere = createAtmosphere(scene, {
    rand,
    time: wind,
    clouds: { facing: 0 },
    dust: { count: Math.round(900 * detail), x: [-17, 17], y: [0.1, 4.6], z: [EYE.z - 2, EYE.z - 42] },
    shadow: { extent: 34, distance: 120, far: 260, mapSize: detail < 1 ? 1024 : 2048 },
    fog: [40, 600],
    hills: {
      far: { z: -460, depth: 280, base: 6, amp: 34, seed: 2.2 },
      near: { z: -260, depth: 130, base: 2, amp: 12, seed: 5.3 },
      valley: false,
    },
  });
  atmosphere.aimSun(new THREE.Vector3(0, 0, -16));

  function apply(p: YardPalette) {
    atmosphere.apply(p);
    mats.meadow.color.set(p.meadow);
    // Still water shows the sky above it, a shade darker.
    puddle.color.set(p.skyTop).lerp(new THREE.Color(p.skyHorizon), 0.3).multiplyScalar(0.8);
    for (const material of [mats.dirt, mats.heap]) material.color.set(p.dirt);
    mats.tracks.color.set(p.dirt).multiplyScalar(0.42);
    mats.lamp.emissiveIntensity = p.floodlights * 2.5;
    for (const spot of spots) spot.intensity = p.floodlights;
    for (const wall of mats.cabinWalls) wall.emissiveIntensity = p.windows;
    crane.beaconMaterial.color.set(0xff2a1a).multiplyScalar(p.beacon);
    signs.setColors(p.sign, p.signGlow * 0.3);
  }

  const ready = Promise.allSettled([forest.ready, signs.ready]);

  return {
    scene,
    atmosphere,
    ready,
    apply,
    dispose: forest.dispose,
    update: crane.update,
    sign: signs,
    signpost,
    placeSignpost,
    phone,
  };
}
