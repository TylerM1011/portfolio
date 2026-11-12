import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { extendShader, ink, twoSided } from "../scene/style";

// The meadow's growth, drawn in the house style (see scene/style.ts) rather
// than as photographed grass cards: solid little shapes with designed
// colour, arranged with intent.
//
// - Mown verge: a band of paler, short grass along the road's edge (the
//   ground band itself is laid by the scene), with low tufts.
// - Tussocks: domed clumps of blades across the field, dark at the root and
//   sunlit at the tips, lit as one volume so each has a light and a shade side.
// - Drifts: patches of tall seeding grass with straw-coloured heads, where a
//   slow field of "dampness" rises, so the meadow has broad structure.
// - Wildflowers in clusters through the drifts: cream cow parsley, yellow
//   buttercups and pink-purple knapweed.
//
// Each kind is one instanced mesh, and the grass sways with the wind.

// Multipliers on the palette's meadow green, root to tip; the straw of the
// seed heads; and the flowers' own inks.
const GRASS = { root: [0.58, 0.64, 0.6], mid: [1, 1, 1], tip: [1.16, 1.1, 0.82] };
const STRAW = new THREE.Color(0xe2c98c);
const FLOWERS = { parsley: 0xf3eedc, buttercup: 0xf2c53d, knapweed: 0xb0638f };

const UP = new THREE.Vector3(0, 1, 0);

// Bends each instance by its height squared, in waves that roll across the
// meadow.
export function addWind(material: THREE.Material, time: { value: number }) {
  extendShader(material, "road-wind", (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vec2 root = instanceMatrix[3].xz;
      float gust = 0.5 + 0.5 * sin(uTime * 0.35 - root.y * 0.09 + root.x * 0.05);
      float phase = uTime * 1.1 - root.y * 0.7 + root.x * 0.5;
      float bend = (sin(phase) * 0.6 + sin(phase * 2.3) * 0.25 + 0.35) * (0.02 + gust * 0.06);
      transformed.x += bend * position.y * position.y;
      transformed.z += bend * 0.4 * position.y * position.y;`,
    );
  });
}

// A fan of `count` blades round a small base, leaning out by `lean` and
// bending further near the tips. Unit height. Each blade takes the normal of
// a dome over the whole clump, so the clump lights as one shape.
function clump(count: number, lean: number, width: number, heads: THREE.Color | null, seed: number) {
  const rand = (k: number) => Math.sin(seed * 91.7 + k * 12.989) * 0.5 + 0.5;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const out = new THREE.Vector3();
  const n = new THREE.Vector3();
  const push = (p: THREE.Vector3, color: number[]) => {
    positions.push(p.x, p.y, p.z);
    n.copy(out).multiplyScalar(0.75).addScaledVector(UP, 0.5 + p.y * 0.6).normalize();
    normals.push(n.x, n.y, n.z);
    colors.push(...color);
  };
  for (let i = 0; i < count; i++) {
    const a = ((i + rand(i) * 0.6) / count) * Math.PI * 2;
    out.set(Math.cos(a), 0, Math.sin(a));
    const across = new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(width / 2);
    const h = 0.75 + rand(i + 9) * 0.25;
    const tilt = lean * (0.6 + rand(i + 3) * 0.6);
    const at = (t: number) => out.clone().multiplyScalar(0.06 + tilt * t * t).setY(h * t);
    const base = at(0);
    const mid = at(0.55);
    const tip = at(1);
    const bl = base.clone().sub(across);
    const br = base.clone().add(across);
    const ml = mid.clone().sub(across.clone().multiplyScalar(0.7));
    const mr = mid.clone().add(across.clone().multiplyScalar(0.7));
    for (const [p, c] of [
      [bl, GRASS.root], [br, GRASS.root], [mr, GRASS.mid],
      [bl, GRASS.root], [mr, GRASS.mid], [ml, GRASS.mid],
      [ml, GRASS.mid], [mr, GRASS.mid], [tip, GRASS.tip],
    ] as const) push(p, [...c]);
    if (heads) {
      // A seed head: a slim spindle at the tip.
      const top = tip.clone().addScaledVector(UP, 0.14);
      const side = across.clone().multiplyScalar(1.4);
      const straw = [heads.r, heads.g, heads.b];
      push(tip.clone().sub(side), straw);
      push(tip.clone().add(side), straw);
      push(top, straw);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

// A few flower heads on short leaning stems, in one ink; unit height.
function flowers(color: number, heads: number, size: number, seed: number) {
  const rand = (k: number) => Math.sin(seed * 41.3 + k * 7.31) * 0.5 + 0.5;
  const ink = new THREE.Color(color);
  const stem = new THREE.Color(0x5f7a40);
  const parts: THREE.BufferGeometry[] = [];
  const paint = (geometry: THREE.BufferGeometry, c: THREE.Color) => {
    geometry.deleteAttribute("uv");
    const count = geometry.attributes.position.count;
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [c.r, c.g, c.b]).flat(), 3));
    return geometry.index ? geometry.toNonIndexed() : geometry;
  };
  for (let i = 0; i < heads; i++) {
    const a = rand(i) * Math.PI * 2;
    const r = 0.08 + rand(i + 4) * 0.12;
    const h = 0.7 + rand(i + 8) * 0.3;
    const head = new THREE.Vector3(Math.cos(a) * r, h, Math.sin(a) * r);
    // A flattened bud, wider than tall, like a print's dot of colour.
    parts.push(paint(new THREE.IcosahedronGeometry(size, 0).scale(1, 0.6, 1).translate(head.x, head.y, head.z), ink));
    parts.push(paint(new THREE.CylinderGeometry(0.008, 0.012, h, 3, 1, true).translate(0, h / 2, 0).applyMatrix4(new THREE.Matrix4().makeShear(0, 0, head.x / h, head.z / h, 0, 0)), stem));
  }
  return mergeGeometries(parts);
}

// A slow field in [0, 1] over the ground, for where the drifts and flower
// patches lie. Seeded, so the meadow is the same on every visit.
function field(seed: number, scale: number) {
  return (x: number, z: number) => {
    const u = x / scale;
    const v = z / scale;
    const f =
      Math.sin(u * 1.7 + seed) * Math.cos(v * 1.3 - seed * 0.7) +
      0.6 * Math.sin(u * 3.1 - v * 2.3 + seed * 2.1) +
      0.35 * Math.cos(u * 5.3 + v * 4.7 + seed * 3.3);
    return THREE.MathUtils.clamp(0.5 + f / 3.9, 0, 1);
  };
}

export function createMeadow({
  detail,
  rand,
  groundY,
  area,
  clear,
  wildness,
  wind,
}: {
  detail: number;
  rand: () => number;
  groundY: number;
  area: { x: [number, number]; z: [number, number] };
  // True where nothing may grow (the road, the things on the verge).
  clear: (x: number, z: number) => boolean;
  // 0 on the mown verge, rising to 1 out in the wild meadow.
  wildness: (x: number, z: number) => number;
  wind: { value: number };
}) {
  const group = new THREE.Group();
  const grass = twoSided(ink({ vertexColors: true }));
  addWind(grass, wind);
  const bloom = twoSided(ink({ vertexColors: true }));
  addWind(bloom, wind);

  const drift = field(rand() * 10, 4.5);
  const patches = field(rand() * 10, 2.2);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const width = area.x[1] - area.x[0];
  const depth = area.z[0] - area.z[1];

  // Scatters one kind: `chance` says how likely a spot is to take it, and
  // `size` its height there.
  function sow(
    geometries: THREE.BufferGeometry[],
    material: THREE.Material,
    density: number,
    chance: (x: number, z: number, wild: number) => number,
    size: (wild: number) => number,
    spread = 0.5,
  ) {
    const attempts = Math.round(width * depth * density * detail);
    const meshes = geometries.map((geometry) => new THREE.InstancedMesh(geometry, material, attempts));
    const counts = meshes.map(() => 0);
    for (let i = 0; i < attempts; i++) {
      const x = area.x[0] + rand() * width;
      const z = area.z[0] - rand() * depth;
      const wild = wildness(x, z);
      if (clear(x, z) || rand() > chance(x, z, wild)) continue;
      const k = Math.floor(rand() * meshes.length);
      const h = size(wild) * (0.8 + rand() * 0.4);
      dummy.position.set(x, groundY, z);
      dummy.rotation.set((rand() - 0.5) * 0.1, rand() * Math.PI * 2, (rand() - 0.5) * 0.1);
      dummy.scale.set(h * (1 + rand() * spread), h, h * (1 + rand() * spread));
      dummy.updateMatrix();
      meshes[k].setMatrixAt(counts[k], dummy.matrix);
      const v = 0.92 + rand() * 0.14;
      meshes[k].setColorAt(counts[k]++, tint.setRGB(v * (0.97 + rand() * 0.06), v, v * (0.94 + rand() * 0.08)));
    }
    meshes.forEach((mesh, k) => {
      mesh.count = counts[k];
      mesh.receiveShadow = true;
      group.add(mesh);
    });
  }

  // A few low tufts on the mown verge, so its edge with the meadow is soft.
  sow([clump(7, 0.4, 0.14, null, 1)], grass, 0.6, (_x, _z, wild) => 0.6 * (1 - THREE.MathUtils.smoothstep(wild, 0.1, 0.45)), () => 0.08, 0.8);
  // Tussocks: rounded clumps, gathered in loose patches across the field.
  sow(
    [clump(13, 0.22, 0.12, null, 3), clump(15, 0.28, 0.11, null, 4)],
    grass,
    1.6,
    (x, z, wild) => wild * (0.35 + 0.65 * THREE.MathUtils.smoothstep(patches(x + 7, z), 0.35, 0.55)),
    (wild) => 0.2 + 0.18 * wild,
    0.6,
  );
  // Tall seeding grass, in drifts.
  sow(
    [clump(7, 0.25, 0.06, STRAW, 5), clump(6, 0.3, 0.06, STRAW, 6)],
    grass,
    1.3,
    (x, z, wild) => wild * THREE.MathUtils.smoothstep(drift(x, z), 0.45, 0.62),
    (wild) => 0.42 + 0.25 * wild,
    0.3,
  );
  // Wildflowers, clustered where the drifts and the patches both run high.
  sow(
    [flowers(FLOWERS.parsley, 4, 0.075, 7), flowers(FLOWERS.buttercup, 5, 0.05, 8), flowers(FLOWERS.knapweed, 4, 0.055, 9)],
    bloom,
    1.4,
    (x, z, wild) => wild * THREE.MathUtils.smoothstep(patches(x, z), 0.52, 0.64) * THREE.MathUtils.smoothstep(drift(x, z), 0.2, 0.4),
    (wild) => 0.3 + 0.2 * wild,
    0.2,
  );

  return {
    group,
    // The grass takes the palette's meadow green; the flowers keep their own.
    setColor(meadow: number) {
      grass.color.set(meadow);
    },
  };
}
