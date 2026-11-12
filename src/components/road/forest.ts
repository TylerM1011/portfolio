import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ink } from "../scene/style";

// The woods every scene stands in, drawn in the house style (see
// scene/style.ts) rather than loaded: four kinds of tree, each designed as a
// silhouette first.
//
// - Scots pine: a long bare trunk with a flat-topped crown of three or four
//   broad, lobed tiers, the tall trees of the groves.
// - Spruce: a narrow stacked cone of five tiers from near the ground.
// - Young pine: three wide tiers on a short trunk, the filler of the woods.
// - Birch: a rounded crown of a few overlapping clumps, so the woods aren't
//   all conifer.
//
// Each tier is a shallow, scalloped cone with a dark underside, so in the
// low sun every tier has its own sunlit face, shade face and shadowed skirt,
// the way a print builds a pine from stacked shapes. The distant rows use
// coarser versions of the same trees, which the fog flattens into a band.
// Every kind is one instanced mesh: cheap to draw however many there are.

// Inks, by height: the trunk, the crowns' deep and sunlit greens, the dark
// under each tier, and the birch's lighter greens.
const INK = {
  bark: new THREE.Color(0x5a4334),
  birchBark: new THREE.Color(0xd8d0c0),
  low: new THREE.Color(0x2d4632),
  high: new THREE.Color(0x587a45),
  under: new THREE.Color(0x1f3326),
  leafLow: new THREE.Color(0x56723c),
  leafHigh: new THREE.Color(0x8ea155),
};

type Tier = { y: number; height: number; radius: number };

// One tier: a cone from its tip down to a scalloped rim, then a shallow dark
// cone underneath, closed right in to the trunk, so the tier is solid from
// below as well as above. The two are separate surfaces, so the rim is a
// crisp edge rather than smoothed over.
function tier({ y, height, radius }: Tier, segments: number, lobes: number, phase: number, droop: number) {
  const lobe = (a: number) => Math.sin(lobes * a + phase);
  const profile: [number, number][] = [
    [0.002, y + height],
    [radius * 0.5, y + height * 0.5],
    [radius, y],
  ];
  const top = surface(profile, segments, (a, r, ring) => {
    const tip = Math.max(0, lobe(a));
    // Lobes reach out at the rim and droop a little at their tips.
    const out = ring === 0 ? 1 : 1 + 0.16 * lobe(a) * (ring / 2);
    return [r * out, ring === 2 ? -droop * height * tip : 0];
  }, (ring) => INK.low.clone().lerp(INK.high, 1 - ring / 2.4));
  const under = surface(
    [
      [radius, y],
      [radius * 0.45, y + height * 0.1],
      [0.004, y + height * 0.16],
    ],
    segments,
    (a, r, ring) => {
      const tip = Math.max(0, lobe(a));
      return [ring === 0 ? r * (1 + 0.16 * lobe(a)) : r, ring === 0 ? -droop * height * tip : 0];
    },
    () => INK.under,
  );
  return [top, under];
}

// A ring-by-ring surface round the y axis: `profile` gives each ring's
// radius and height, `shape` bends a ring's points (angle, radius, ring) to
// [radius, extra height], and `ink` colours each ring.
function surface(
  profile: [number, number][],
  segments: number,
  shape: (a: number, r: number, ring: number) => [number, number],
  inkFor: (ring: number) => THREE.Color,
) {
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  profile.forEach(([r, y], ring) => {
    const color = inkFor(ring);
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      const [radius, lift] = shape(a, r, ring);
      positions.push(Math.cos(a) * radius, y + lift, Math.sin(a) * radius);
      colors.push(color.r, color.g, color.b);
    }
  });
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j;
      const b = i * segments + ((j + 1) % segments);
      const c = (i + 1) * segments + j;
      const d = (i + 1) * segments + ((j + 1) % segments);
      index.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function trunk(height: number, radius: number, segments: number, color: THREE.Color) {
  const geometry = new THREE.CylinderGeometry(radius * 0.55, radius, height, segments, 1, true).translate(0, height / 2, 0);
  geometry.deleteAttribute("uv");
  const count = geometry.attributes.position.count;
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [color.r, color.g, color.b]).flat(), 3));
  return geometry;
}

// A rounded clump of leaves: a sphere whose normals lean out from the whole
// crown's centre, so the clumps share one light and shade side.
function clump(center: THREE.Vector3, radius: number, crown: THREE.Vector3, detail: number) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail).translate(center.x, center.y, center.z);
  geometry.deleteAttribute("uv");
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const colors: number[] = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const out = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    n.fromBufferAttribute(normal, i);
    out.subVectors(p, crown).normalize();
    n.multiplyScalar(0.45).addScaledVector(out, 0.55).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
    const c = INK.leafLow.clone().lerp(INK.leafHigh, THREE.MathUtils.smoothstep(p.y, crown.y - radius, crown.y + radius * 1.4));
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

// Merges the parts and scales the tree to unit height, standing on y = 0.
function finishTree(parts: THREE.BufferGeometry[]) {
  const geometry = mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)));
  for (const part of parts) part.dispose();
  geometry.computeBoundingBox();
  geometry.scale(1 / geometry.boundingBox!.max.y, 1 / geometry.boundingBox!.max.y, 1 / geometry.boundingBox!.max.y);
  return geometry;
}

// The four kinds, at full or coarse detail.
function scotsPine(fine: boolean, seed: number) {
  const s = fine ? 14 : 7;
  const tiers: Tier[] = [
    { y: 0.55, height: 0.18, radius: 0.2 },
    { y: 0.66, height: 0.17, radius: 0.17 },
    { y: 0.76, height: 0.16, radius: 0.13 },
    { y: 0.85, height: 0.15, radius: 0.085 },
  ];
  return finishTree([trunk(0.82, 0.022, fine ? 7 : 4, INK.bark), ...tiers.flatMap((t, i) => tier(t, s, 5, seed + i * 1.9, 0.35))]);
}

function spruce(fine: boolean, seed: number) {
  const s = fine ? 14 : 7;
  const tiers: Tier[] = [0, 1, 2, 3, 4].map((i) => ({ y: 0.08 + i * 0.165, height: 0.3 - i * 0.02, radius: 0.27 - i * 0.045 }));
  return finishTree([trunk(0.3, 0.025, fine ? 7 : 4, INK.bark), ...tiers.flatMap((t, i) => tier(t, s, 6, seed + i * 2.3, 0.25))]);
}

function youngPine(fine: boolean, seed: number) {
  const s = fine ? 14 : 7;
  const tiers: Tier[] = [
    { y: 0.16, height: 0.38, radius: 0.33 },
    { y: 0.42, height: 0.34, radius: 0.25 },
    { y: 0.66, height: 0.34, radius: 0.15 },
  ];
  return finishTree([trunk(0.3, 0.03, fine ? 7 : 4, INK.bark), ...tiers.flatMap((t, i) => tier(t, s, 5, seed + i * 1.3, 0.3))]);
}

function birch(fine: boolean, seed: number) {
  const crown = new THREE.Vector3(0, 0.66, 0);
  const rand = (k: number) => Math.sin(seed * 12.9898 + k * 78.233) * 0.5 + 0.5;
  const clumps = [
    [0, 0.68, 0, 0.21],
    [0.13, 0.58, 0.05, 0.16],
    [-0.12, 0.6, -0.04, 0.17],
    [0.03, 0.84, -0.03, 0.15],
    [-0.05, 0.55, 0.12, 0.14],
  ].map(([x, y, z, r], k) => clump(new THREE.Vector3(x, y + (rand(k) - 0.5) * 0.04, z), r * (0.9 + rand(k + 5) * 0.2), crown, fine ? 2 : 1));
  return finishTree([trunk(0.62, 0.024, fine ? 7 : 4, INK.birchBark), ...clumps]);
}

const KINDS = { scotsPine, spruce, youngPine, birch };
type Kind = keyof typeof KINDS;

type Spot = { x: number; y: number; z: number; height: number; rotation: number };

export function createForest({
  detail,
  rand,
  groundY,
  keepClear,
  woods,
  scale = 1,
}: {
  detail: number;
  // Scales every tree's height, for a shot taken close among them.
  scale?: number;
  rand: () => number;
  // Height of the ground the trees stand on.
  groundY: number;
  // Returns true where a tree of this height would block something the
  // camera needs to see (the road, the sign, the sun).
  keepClear: (x: number, z: number, height: number) => boolean;
  // An extra stand of young trees filling this area, for scenes that look
  // into the trees rather than down the road.
  woods?: { x: [number, number]; z: [number, number]; count: number };
}) {
  const group = new THREE.Group();
  // One material for every tree: the inks are in the geometry, and each
  // tree's own shade of green in its instance colour.
  const material = ink({ vertexColors: true });

  const spot = (x: number, y: number, z: number, height: number, list: Spot[]) => {
    height *= scale;
    if (!keepClear(x, z, height)) list.push({ x, y, z, height, rotation: rand() * Math.PI * 2 });
  };

  // Groves of tall pines either side of the road, woods of younger trees
  // filling out both sides, and a deep treeline where the land meets the
  // hills (keepClear leaves the gap where the road runs on).
  const near: Spot[] = [];
  const far: Spot[] = [];
  const treeline: Spot[] = [];
  const side = () => (rand() < 0.5 ? -1 : 1);
  // Measured out from the middle of the dual carriageway.
  const middle = 3.4;
  const groves = Array.from({ length: 18 }, () => [middle + side() * (8 + rand() * 9), -6 - rand() * 90] as const);
  for (let i = 0; i < Math.round(90 * Math.max(detail, 0.6)); i++) {
    const [x, z] = groves[Math.floor(rand() * groves.length)];
    spot(x + (rand() - 0.5) * 7, groundY, z + (rand() - 0.5) * 10, 6 + rand() * 3.5, near);
  }
  for (let i = 0; i < Math.round(500 * detail); i++) {
    spot(middle + side() * (16 + rand() ** 1.5 * 120), groundY, 10 - rand() * 120, 5 + rand() * 4, far);
  }
  for (let i = 0; i < Math.round(1100 * detail); i++) {
    const x = middle + (rand() * 2 - 1) * 300;
    spot(x, groundY, -105 - rand() * 95 - (x * x) / 3000, 4 + rand() * 4.5, treeline);
  }
  if (woods) {
    for (let i = 0; i < Math.round(woods.count * Math.max(detail, 0.6)); i++) {
      const x = woods.x[0] + rand() * (woods.x[1] - woods.x[0]);
      const z = woods.z[0] + rand() * (woods.z[1] - woods.z[0]);
      spot(x, groundY, z, 4 + rand() * 4, far);
    }
  }

  // Deals the spots out among the kinds, by weight, and draws each kind as
  // one instanced mesh. Only trees the shadow map can reach cast shadows.
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  function plant(list: Spot[], mix: Partial<Record<Kind, number>>, fine: boolean, castShadow: boolean) {
    const kinds = Object.entries(mix) as [Kind, number][];
    const total = kinds.reduce((sum, [, w]) => sum + w, 0);
    const hands = new Map<Kind, Spot[]>(kinds.map(([kind]) => [kind, []]));
    for (const s of list) {
      let pick = rand() * total;
      const [kind] = kinds.find(([, w]) => (pick -= w) < 0) ?? kinds[0];
      hands.get(kind)!.push(s);
    }
    for (const [kind, spots] of hands) {
      if (!spots.length) continue;
      const mesh = new THREE.InstancedMesh(KINDS[kind](fine, kinds.length), material, spots.length);
      spots.forEach((s, i) => {
        dummy.position.set(s.x, s.y, s.z);
        dummy.rotation.set(0, s.rotation, 0);
        // A little variety in build as well as height.
        const girth = 0.9 + rand() * 0.25;
        dummy.scale.set(s.height * girth, s.height, s.height * girth);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        // Each tree a slightly different green, a few warmer, a few cooler.
        const v = 0.9 + rand() * 0.2;
        mesh.setColorAt(i, tint.setRGB(v * (0.96 + rand() * 0.08), v, v * (0.93 + rand() * 0.1)));
      });
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  const shaded = near.filter((s) => s.z > -45);
  const unshaded = near.filter((s) => s.z <= -45);
  plant(shaded, { scotsPine: 3, spruce: 1 }, true, true);
  plant(unshaded, { scotsPine: 3, spruce: 1 }, true, false);
  plant(far, { youngPine: 3, spruce: 2, scotsPine: 1, birch: 1.5 }, true, false);
  plant(treeline, { youngPine: 2, spruce: 3, birch: 1 }, false, false);

  return {
    group,
    // Nothing to load: kept so the scenes can wait on it like their other parts.
    ready: Promise.resolve(),
    dispose() {},
  };
}
