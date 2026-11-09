import * as THREE from "three";
import { TEXTURE_URLS } from "@/lib/assets";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { createForest } from "../road/forest";
import { createGantrySign, directionArt, SW, type GantryPanel, type SignItem } from "../road/sign";
import { canvasTexture, dustFragment, dustVertex, imageTexture, matte, radialTexture, rng, skyFragment, skyVertex } from "../road/world";
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
// 110 mm. It has seen better days: the post leans back and to the right and
// two of the panels have worked loose on their clamps (radians, per panel
// from the top; see also the wear in sign.ts).
export const SIGNPOST = { maxX: 3.2, z: 7.3, scale: 0.45, clearance: 0.4 };
const SIGNPOST_LEAN = { back: -0.025, side: -0.05 };
const SIGNPOST_TILTS = [-0.02, 0, 0.035];
// The grey-olive the sign green fades toward.
const SIGN_FADE = new THREE.Color(0x8c9682);
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
    tilt: SIGNPOST_TILTS[i % SIGNPOST_TILTS.length],
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

// Draws at (x, y) and at its wrapped copies, so the texture tiles.
function wrapped(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void) {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const px = x + dx;
      const py = y + dy;
      if (px + r < 0 || px - r > size || py + r < 0 || py - r > size) continue;
      draw(px, py);
    }
  }
}

// Tileable ground: soft blotches of damp and dry earth, then grit.
function groundTexture(rand: () => number, colors: { base: string; light: string; dark: string }, grit: number) {
  const size = 512;
  return canvasTexture(size, size, (ctx) => {
    ctx.fillStyle = colors.base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 80; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 30 + rand() * 100;
      const color = rand() < 0.5 ? colors.light : colors.dark;
      const alpha = 0.06 + rand() * 0.14;
      wrapped(size, x, y, r, (px, py) => {
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, r);
        gradient.addColorStop(0, `rgba(${color},${alpha})`);
        gradient.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(px - r, py - r, 2 * r, 2 * r);
      });
    }
    for (let i = 0; i < grit; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = rand() < 0.9 ? 0.6 + rand() * 1.2 : 1.8 + rand() * 2.6;
      const squash = 0.55 + rand() * 0.45;
      const angle = rand() * Math.PI;
      ctx.fillStyle = `rgba(${rand() < 0.55 ? colors.dark : colors.light},${0.25 + rand() * 0.45})`;
      wrapped(size, x, y, r, (px, py) => {
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * squash, angle, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });
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
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.fillRect(x, 0, 40, 128);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (let y = 0; y < 128; y += 16) ctx.fillRect(x + 2, y, 36, 6);
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Corrugated steel, for the shipping containers.
function corrugatedTexture() {
  const texture = canvasTexture(256, 64, (ctx) => {
    for (let x = 0; x < 256; x++) {
      const v = 0.78 + 0.22 * Math.sin((x / 256) * Math.PI * 2 * 24);
      ctx.fillStyle = `rgb(${255 * v},${255 * v},${255 * v})`;
      ctx.fillRect(x, 0, 1, 64);
    }
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, 256, 3);
    ctx.fillRect(0, 61, 256, 3);
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
    ctx.fillStyle = "#eceae4";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 2, h);
    ctx.fillStyle = "#2c5f9e";
    ctx.fillRect(0, h - 36, w, 36);
    ctx.fillRect(0, 0, w, 10);
    for (const [x, y, gw, gh] of glass) {
      ctx.fillStyle = "#3a3f44";
      ctx.fillRect(x - 5, y - 5, gw + 10, gh + 10);
      ctx.fillStyle = "#26343f";
      ctx.fillRect(x, y, gw, gh);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x, y, gw * 0.4, gh);
    }
    if (kind === "end") {
      ctx.fillStyle = "#56606a";
      ctx.fillRect(40, 60, 80, 160);
      ctx.fillStyle = "#c9c9c9";
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
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = "#d8d0c4";
    ctx.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 8; row++) {
      for (let col = -1; col < 4; col++) {
        const x = col * 36 + (row % 2) * 18 + 2;
        const shade = 150 + ((row * 7 + col * 13) % 5) * 9;
        ctx.fillStyle = `rgb(${shade},${shade * 0.48},${shade * 0.36})`;
        ctx.fillRect(x, row * 16 + 2, 33, 13);
      }
    }
  });
}

// The heras fence's welded mesh: one cell, repeated.
function meshTexture() {
  const texture = canvasTexture(16, 16, (ctx) => {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 16, 2);
    ctx.fillRect(0, 0, 2, 16);
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
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

function createMaterials(anisotropy: number, rand: () => number, meadowMap: THREE.Texture) {
  const dirtMap = groundTexture(rand, { base: "#8e6c4b", light: "196,162,120", dark: "66,46,30" }, 9000);
  dirtMap.wrapS = dirtMap.wrapT = THREE.RepeatWrapping;
  dirtMap.anisotropy = anisotropy;
  const gravelMap = groundTexture(rand, { base: "#9a958c", light: "220,214,204", dark: "70,68,64" }, 14000);
  gravelMap.wrapS = gravelMap.wrapT = THREE.RepeatWrapping;
  const fenceMap = meshTexture();
  fenceMap.repeat.set(35, 22);
  fenceMap.anisotropy = anisotropy;
  const side = cabinTextures("side");
  const end = cabinTextures("end");
  const cabinWall = (t: typeof side) =>
    new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.7 });
  const cabinSide = cabinWall(side);
  const cabinEnd = cabinWall(end);
  const cabinRoof = matte({ color: 0x8e9196 });
  const corrugated = corrugatedTexture();

  return {
    meadow: matte({ map: meadowMap }),
    dirt: matte({ map: dirtMap, alphaMap: patchMask(rand), transparent: true }),
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
    crane: new THREE.MeshStandardMaterial({ color: 0xf0b000, roughness: 0.5, metalness: 0.3 }),
    machine: new THREE.MeshStandardMaterial({ color: 0xee9a12, roughness: 0.45, metalness: 0.25 }),
    // Red oxide primer on the new steelwork.
    steel: new THREE.MeshStandardMaterial({ color: 0x8a3e2c, roughness: 0.7, metalness: 0.35 }),
    galvanised: new THREE.MeshStandardMaterial({ color: 0xb6bdc4, roughness: 0.42, metalness: 0.8 }),
    rubber: matte({ color: 0x28282a, roughness: 0.85 }),
    concrete: matte({ color: 0xbab5ab }),
    pipes: matte({ color: 0xb3ada2, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1b2730, roughness: 0.06, metalness: 0.9 }),
    wood: matte({ color: 0xa57b4d }),
    bricks: matte({ map: brickTexture() }),
    safety: new THREE.MeshStandardMaterial({ color: 0xf2c400, roughness: 0.6 }),
    fence: new THREE.MeshStandardMaterial({
      map: fenceMap,
      alphaTest: 0.5,
      alphaToCoverage: true,
      side: THREE.DoubleSide,
      color: 0xc7ccd0,
      metalness: 0.6,
      roughness: 0.45,
    }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x30302e, emissive: 0xfff0d2, emissiveIntensity: 0 }),
    cones: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
    barrier: new THREE.MeshStandardMaterial({ roughness: 0.5 }),
    cabin: [cabinEnd, cabinEnd, cabinRoof, cabinRoof, cabinSide, cabinSide],
    cabinWalls: [cabinSide, cabinEnd],
    containerRed: matte({ map: corrugated, color: 0x9a4430, roughness: 0.75 }),
    containerBlue: matte({ map: corrugated, color: 0x2f5d8c, roughness: 0.75 }),
    hillFar: matte({ flatShading: true }),
    hillNear: matte({ flatShading: true }),
  };
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
  add(group, new THREE.BoxGeometry(2.4, BASE, 2.4), mats.concrete, 0, BASE / 2, 0);

  const mast: THREE.BufferGeometry[] = [];
  for (const [x, z] of corners) mast.push(bar(v(x, BASE, z), v(x, BASE + MAST, z), 0.08));
  const bays = Math.round(MAST / (2 * h));
  const bay = MAST / bays;
  for (let i = 0; i < bays; i++) {
    const y0 = BASE + i * bay;
    const y1 = y0 + bay;
    corners.forEach(([ax, az], f) => {
      const [bx, bz] = corners[(f + 1) % 4];
      const up = (i + f) % 2 === 0;
      mast.push(bar(v(ax, up ? y0 : y1, az), v(bx, up ? y1 : y0, bz), 0.035));
      mast.push(bar(v(ax, y1, az), v(bx, y1, bz), 0.035));
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
  for (const z of [-JW, JW]) steel.push(bar(v(0.6, J, z), v(JIB, J, z), 0.06));
  const panels = Math.round(JIB - 0.6);
  const panel = (JIB - 0.6) / panels;
  steel.push(bar(v(0.6 + panel / 2, J + JH, 0), v(JIB - panel / 2, J + JH, 0), 0.06));
  for (let i = 0; i < panels; i++) {
    const x0 = 0.6 + i * panel;
    const x1 = x0 + panel;
    const xm = (x0 + x1) / 2;
    for (const z of [-JW, JW]) {
      steel.push(bar(v(x0, J, z), v(xm, J + JH, 0), 0.03));
      steel.push(bar(v(xm, J + JH, 0), v(x1, J, z), 0.03));
    }
    steel.push(bar(v(x1, J, -JW), v(x1, J, JW), 0.03));
  }
  // Counter-jib: a railed walkway out to the counterweights.
  for (const z of [-0.5, 0.5]) {
    steel.push(bar(v(-0.6, J, z), v(-COUNTER, J, z), 0.08));
    steel.push(bar(v(-0.6, J + 0.55, z), v(-COUNTER, J + 0.55, z), 0.03));
    for (let x = -1; x > -COUNTER; x -= 1) steel.push(bar(v(x, J, z), v(x, J + 0.55, z), 0.03));
  }
  for (let x = -1; x >= -COUNTER; x -= 1) steel.push(bar(v(x, J, -0.5), v(x, J, 0.5), 0.04));
  // Pendant ties from the tower head.
  steel.push(bar(v(0, APEX, 0), v(JIB * 0.45, J + JH, 0), 0.03));
  steel.push(bar(v(0, APEX, 0), v(JIB * 0.85, J + JH, 0), 0.03));
  for (const z of [-0.5, 0.5]) steel.push(bar(v(0, APEX, 0), v(-COUNTER + 0.4, J + 0.55, z), 0.03));
  add(top, merged(steel), mats.crane);

  add(top, new THREE.BoxGeometry(COUNTER - 0.6, 0.04, 1.0), mats.galvanised, -(COUNTER + 0.6) / 2, J + 0.02, 0);
  for (let i = 0; i < 4; i++) add(top, new THREE.BoxGeometry(0.28, 1.5, 1.1), mats.concrete, -COUNTER + 0.35 + i * 0.3, J - 0.35, 0);
  add(top, new THREE.BoxGeometry(1.3, 0.6, 0.8), mats.galvanised, -COUNTER + 2.7, J + 0.34, 0);
  // Operator's cab, hung off the slewing platform.
  add(top, new THREE.BoxGeometry(0.6, 0.65, 0.7), mats.crane, 0.4, 0.15, 1.0);
  add(top, new THREE.BoxGeometry(0.05, 0.42, 0.6), mats.glass, 0.72, 0.22, 1.0);

  const trolley = new THREE.Group();
  trolley.position.set(13, J, 0);
  top.add(trolley);
  add(trolley, new THREE.BoxGeometry(0.55, 0.18, 0.9), mats.galvanised, 0, -0.1, 0);
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
  add(hook, new THREE.BoxGeometry(0.28, 0.32, 0.2), mats.crane, 0, -0.16, 0);
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
      pads.push(new THREE.BoxGeometry(0.5, 0.12, 0.5).translate(ix * SPAN, 0.06, -iz * SPAN));
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
    slabs.push(new THREE.BoxGeometry(x1 - x0, 0.1, z0 - z1).translate((x0 + x1) / 2, y + 0.05, (z0 + z1) / 2));
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

// A 20-tonne tracked excavator, its arm reaching into the spoil heap.
function createExcavator(mats: Materials, slew: number) {
  const group = new THREE.Group();
  for (const s of [-1, 1]) {
    add(group, new THREE.BoxGeometry(0.27, 0.32, 1.7), mats.rubber, s * 0.42, 0.16, 0);
    for (const z of [-0.85, 0.85]) {
      add(group, new THREE.CylinderGeometry(0.16, 0.16, 0.27, 16).rotateZ(Math.PI / 2), mats.rubber, s * 0.42, 0.16, z);
    }
  }
  add(group, new THREE.BoxGeometry(0.6, 0.2, 1.3), mats.rubber, 0, 0.3, 0);
  add(group, new THREE.CylinderGeometry(0.38, 0.38, 0.1, 20), mats.rubber, 0, 0.44, 0);

  const house = new THREE.Group();
  house.position.y = 0.48;
  house.rotation.y = slew;
  group.add(house);
  add(house, new THREE.BoxGeometry(1.05, 0.42, 1.25), mats.machine, 0, 0.22, -0.1);
  add(house, new THREE.BoxGeometry(1.05, 0.36, 0.32), mats.machine, 0, 0.22, -0.86);
  add(house, new THREE.BoxGeometry(0.55, 0.12, 0.62), mats.machine, 0.22, 0.49, -0.4);
  add(house, new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), mats.rubber, 0.38, 0.65, -0.55);
  // Cab: tinted glass in a yellow frame.
  add(house, new THREE.BoxGeometry(0.44, 0.6, 0.56), mats.glass, -0.28, 0.73, 0.22);
  add(house, new THREE.BoxGeometry(0.48, 0.05, 0.62), mats.machine, -0.28, 1.05, 0.22);
  for (const [x, z] of [
    [-0.49, -0.05],
    [-0.07, -0.05],
    [-0.49, 0.5],
    [-0.07, 0.5],
  ]) {
    add(house, new THREE.BoxGeometry(0.04, 0.6, 0.04), mats.machine, x, 0.73, z);
  }

  // Boom, stick and bucket, with their rams.
  const p0 = v(0.14, 0.42, 0.35);
  const knee = v(0.14, 1.55, 1.1);
  const p1 = v(0.14, 1.85, 1.95);
  const p2 = v(0.14, 0.35, 2.7);
  add(house, merged([bar(p0, knee, 0.2), bar(knee, p1, 0.18), bar(p1, p2, 0.13)]), mats.machine);
  add(
    house,
    merged([bar(v(0.14, 0.3, 0.6), v(0.14, 1.25, 1.0), 0.06), bar(v(0.14, 1.75, 1.35), v(0.14, 2.0, 1.95), 0.05)]),
    mats.galvanised,
  );
  const bucket = add(house, new THREE.BoxGeometry(0.5, 0.32, 0.36), mats.rubber, p2.x, p2.y - 0.05, p2.z + 0.12);
  bucket.rotation.x = 0.5;
  return group;
}

// Heras panels between rubber feet along each run of fence.
function createFence(mats: Materials, runs: [THREE.Vector3, THREE.Vector3][], rand: () => number) {
  const W = 3.5 * M;
  const H = 2 * M;
  const frames: THREE.BufferGeometry[] = [];
  const meshes: THREE.BufferGeometry[] = [];
  const feet: THREE.BufferGeometry[] = [];
  const foot = (at: THREE.Vector3, heading: number) =>
    new THREE.BoxGeometry(0.1, 0.07, 0.3).rotateY(heading).translate(at.x, 0.035, at.z);
  for (const [from, to] of runs) {
    const heading = Math.atan2(to.x - from.x, to.z - from.z);
    const across = v(-(to.z - from.z), 0, to.x - from.x).normalize();
    const count = Math.max(1, Math.round(from.distanceTo(to) / W));
    for (let i = 0; i < count; i++) {
      const a = from.clone().lerp(to, i / count);
      const b = from.clone().lerp(to, (i + 1) / count);
      const lean = (rand() - 0.5) * 0.04;
      const lift = 0.07;
      const ta = a.clone().setY(lift + H);
      const tb = b.clone().setY(lift + H);
      const ba = a.clone().setY(lift);
      const bb = b.clone().setY(lift);
      const sway = across.clone().multiplyScalar(lean);
      ta.add(sway);
      tb.add(sway);
      frames.push(bar(ba, ta, 0.018), bar(bb, tb, 0.018), bar(ta, tb, 0.018), bar(ba, bb, 0.018));
      const plane = new THREE.PlaneGeometry(1, 1);
      const p = plane.attributes.position;
      const quad = [ta, tb, ba, bb];
      for (let k = 0; k < 4; k++) p.setXYZ(k, quad[k].x, quad[k].y, quad[k].z);
      plane.computeVertexNormals();
      meshes.push(plane);
      // Feet sit square across the run.
      feet.push(foot(a, heading + Math.PI / 2));
    }
    feet.push(foot(to, heading + Math.PI / 2));
  }
  const group = new THREE.Group();
  add(group, merged(frames), mats.galvanised);
  add(group, merged(meshes), mats.fence);
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
  add(group, new THREE.BoxGeometry(0.6, 0.25, 0.6), mats.concrete, 0, 0.125, 0);
  add(group, new THREE.CylinderGeometry(0.04, 0.06, HEIGHT, 10), mats.galvanised, 0, HEIGHT / 2, 0);
  add(group, new THREE.BoxGeometry(1.0, 0.04, 0.04), mats.galvanised, 0, HEIGHT, 0);
  for (const lx of [-0.36, -0.12, 0.12, 0.36]) {
    const lamp = add(group, new THREE.BoxGeometry(0.2, 0.16, 0.06), mats.lamp, lx, HEIGHT + 0.12, 0.05);
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

  const { texture: meadowMap, ready: texturesReady } = imageTexture(TEXTURE_URLS.meadow, "YardScene");
  meadowMap.anisotropy = anisotropy;
  meadowMap.wrapS = meadowMap.wrapT = THREE.RepeatWrapping;
  meadowMap.repeat.set(4000 / 3, 4000 / 3);

  const mats = createMaterials(anisotropy, rand, meadowMap);

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

  // The signpost: the direction panels, worn and weathered, on two posts
  // whose galvanising has long since given way to rust. Its own seed, so the
  // rest of the yard keeps its layout.
  const rust = groundTexture(rng(41), { base: "#7d7468", light: "168,160,148", dark: "112,58,26" }, 3000);
  rust.wrapS = rust.wrapT = THREE.RepeatWrapping;
  rust.repeat.set(1, 6);
  const rusty = new THREE.MeshStandardMaterial({ map: rust, roughness: 0.85, metalness: 0.35 });
  const signpost = new THREE.Group();
  signpost.rotation.order = "YXZ";
  const signs = createGantrySign(layout.panels, { font, z: layout.z, metal: rusty, anisotropy, lamps: false, wear: 1 });
  signpost.add(signs.group);
  const postHeight = layout.top - 0.02;
  for (const x of [layout.left * 0.6, layout.right * 0.6]) {
    add(signpost, new THREE.CylinderGeometry(0.045, 0.045, postHeight, 12), rusty, x, postHeight / 2, 0);
  }
  signpost.scale.setScalar(SIGNPOST.scale);
  scene.add(signpost);
  // Stands the signpost x across (capped at SIGNPOST.maxX), facing the
  // camera, leaning.
  function placeSignpost(x: number) {
    x = Math.min(x, SIGNPOST.maxX);
    signpost.position.set(x, 0, SIGNPOST.z);
    signpost.rotation.set(SIGNPOST_LEAN.back, Math.atan2(EYE.x - x, EYE.z - SIGNPOST.z), SIGNPOST_LEAN.side);
    signpost.updateMatrixWorld(true);
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
  function cabin(x: number, y: number, z: number, rotation: number) {
    return add(scene, new THREE.BoxGeometry(6 * M, 2.6 * M, 2.6 * M), mats.cabin, x, y + 1.3 * M, z, rotation);
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

  add(scene, new THREE.BoxGeometry(6.06 * M, 2.59 * M, 2.44 * M), mats.containerRed, 18, 1.295 * M, -13, 0.25);
  add(scene, new THREE.BoxGeometry(6.06 * M, 2.59 * M, 2.44 * M), mats.containerBlue, 18.3, 3.885 * M + 0.002, -13.1, 0.22);
  add(scene, new THREE.BoxGeometry(6.06 * M, 2.59 * M, 2.44 * M), mats.containerBlue, -16, 1.295 * M, -14, 1.35);

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
    add(scene, new THREE.BoxGeometry(0.53, 0.07, 0.48), mats.wood, x, 0.035, z, rotation);
    add(scene, new THREE.BoxGeometry(0.5, 0.4, 0.45), mats.bricks, x, 0.27, z, rotation);
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
    rand,
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

  function ridge(material: THREE.Material, z: number, depth: number, base: number, amp: number, seed: number) {
    const geometry = new THREE.PlaneGeometry(1800, depth, 180, 14).rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const across = Math.cos((position.getZ(i) / depth) * Math.PI) ** 1.5;
      const profile = base + amp * (0.5 + 0.3 * Math.sin(x * 0.011 + seed) + 0.2 * Math.sin(x * 0.031 + seed * 2) + 0.08 * Math.sin(x * 0.09 + seed * 3));
      position.setY(i, profile * across - 1);
      position.setZ(i, position.getZ(i) + (x * x) / 5000);
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = z;
    scene.add(mesh);
  }
  ridge(mats.hillFar, -460, 280, 6, 34, 2.2);
  ridge(mats.hillNear, -260, 130, 2, 12, 5.3);

  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uSunDirection: { value: new THREE.Vector3() },
      uSunDisc: { value: 1 },
      uSunGlow: { value: 1 },
    },
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const skyGeometry = new THREE.SphereGeometry(1500, 48, 24);
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.renderOrder = -1;
  scene.add(sky);
  const skyScene = new THREE.Scene();
  skyScene.add(new THREE.Mesh(skyGeometry, skyMaterial));

  const cloudMaterial = new THREE.SpriteMaterial({
    map: radialTexture([
      [0, "rgba(255,255,255,1)"],
      [0.45, "rgba(255,255,255,0.55)"],
      [1, "rgba(255,255,255,0)"],
    ]),
    transparent: true,
    depthWrite: false,
    fog: false,
    opacity: 0.85,
  });
  const clouds = new THREE.Group();
  for (let c = 0; c < 10; c++) {
    const angle = THREE.MathUtils.degToRad(-65 + c * 13 + rand() * 6);
    const distance = 700 + rand() * 300;
    const middle = new THREE.Vector3(Math.sin(angle) * distance, 80 + rand() * 190, -Math.cos(angle) * distance);
    const puffs = 5 + Math.floor(rand() * 4);
    for (let p = 0; p < puffs; p++) {
      const sprite = new THREE.Sprite(cloudMaterial);
      sprite.position.copy(middle).add(new THREE.Vector3((rand() - 0.5) * 140, (rand() - 0.5) * 22, (rand() - 0.5) * 40));
      sprite.scale.set(110 + rand() * 130, 40 + rand() * 45, 1);
      clouds.add(sprite);
    }
  }
  scene.add(clouds);

  // Site dust hanging in the low sun.
  const dustCount = Math.round(900 * detail);
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSeeds = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPositions.set([(rand() - 0.5) * 34, 0.1 + rand() * 4.5, EYE.z - 2 - rand() * 40], i * 3);
    dustSeeds[i] = rand();
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute("aSeed", new THREE.BufferAttribute(dustSeeds, 1));
  const dustMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: wind, uScale: { value: 1000 }, uColor: { value: new THREE.Color() } },
    vertexShader: dustVertex,
    fragmentShader: dustFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;
  scene.add(dust);

  const hemi = new THREE.HemisphereLight();
  scene.add(hemi);
  // The camera barely moves, so the shadow map can sit still over the yard.
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(detail < 1 ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 260 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.set(0, 0, -16);
  scene.add(sun, sun.target);
  const sunDirection = new THREE.Vector3();
  scene.fog = new THREE.Fog(0xffffff, 40, 600);

  function apply(p: YardPalette) {
    const elevation = THREE.MathUtils.degToRad(p.sunElevation);
    const azimuth = THREE.MathUtils.degToRad(p.sunAzimuth);
    sunDirection.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
    sun.position.copy(sun.target.position).addScaledVector(sunDirection, 120);
    skyMaterial.uniforms.uTop.value.set(p.skyTop);
    skyMaterial.uniforms.uHorizon.value.set(p.skyHorizon);
    skyMaterial.uniforms.uSun.value.set(p.sun);
    skyMaterial.uniforms.uSunDirection.value.copy(sunDirection);
    (scene.fog as THREE.Fog).color.set(p.fog);
    sun.color.set(p.sun);
    sun.intensity = p.sunIntensity;
    hemi.color.set(p.hemiSky);
    hemi.groundColor.set(p.hemiGround);
    hemi.intensity = p.hemiIntensity;
    scene.environmentIntensity = p.envIntensity;

    mats.meadow.color.set(p.meadow);
    for (const material of [mats.dirt, mats.heap]) material.color.set(p.dirt);
    mats.tracks.color.set(p.dirt).multiplyScalar(0.42);
    mats.hillFar.color.set(p.hillFar);
    mats.hillNear.color.set(p.hillNear);
    cloudMaterial.color.set(p.cloud);
    dustMaterial.uniforms.uColor.value.set(p.dust);
    mats.lamp.emissiveIntensity = p.floodlights * 2.5;
    for (const spot of spots) spot.intensity = p.floodlights;
    for (const wall of mats.cabinWalls) wall.emissiveIntensity = p.windows;
    crane.beaconMaterial.color.set(0xff2a1a).multiplyScalar(p.beacon);
    // Sun-bleached sheeting that has lost most of its shine.
    signs.setColors(new THREE.Color(p.sign).lerp(SIGN_FADE, 0.3).getHex(), p.signGlow * 0.4);
  }

  function withDimSun<T>(capture: () => T) {
    skyMaterial.uniforms.uSunDisc.value = 0;
    skyMaterial.uniforms.uSunGlow.value = 0.12;
    try {
      return capture();
    } finally {
      skyMaterial.uniforms.uSunDisc.value = 1;
      skyMaterial.uniforms.uSunGlow.value = 1;
    }
  }

  const ready = Promise.allSettled([forest.ready, texturesReady, signs.ready]);

  return {
    scene,
    skyScene,
    withDimSun,
    ready,
    forest,
    sky,
    clouds,
    dust: dustMaterial,
    wind,
    apply,
    update: crane.update,
    sign: signs,
    signpost,
    placeSignpost,
  };
}
