import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// A British rural dual carriageway (A-road), built to UK dimensions at 0.44
// world units per metre (the car is a true-scale Polo). Traffic keeps left:
// the car starts in the left lane on x = 0 heading down -z, with the
// overtaking lane to its right, then a grassed central reservation with a
// steel barrier, then the opposite carriageway. A lay-by opens off the
// nearside a little way ahead.
const M = 0.44;
const LANE = 3.65 * M;
const NEAR = 20;
const FAR = -600;

// Lateral positions (x) across the whole road, left to right.
const NEAR_EDGE = -LANE / 2; // our nearside lane edge
const NEAR_SHOULDER = NEAR_EDGE - 1 * M; // 1 m hard strip
const OFF_EDGE = NEAR_EDGE + 2 * LANE;
const OFF_SHOULDER = OFF_EDGE + 0.5 * M;
const RESERVATION = [OFF_SHOULDER, OFF_SHOULDER + 3.5 * M] as const;
const BARRIER_X = (RESERVATION[0] + RESERVATION[1]) / 2;
const ONCOMING_OFF_EDGE = RESERVATION[1] + 0.5 * M;
const ONCOMING_NEAR_EDGE = ONCOMING_OFF_EDGE + 2 * LANE;
const ONCOMING_SHOULDER = ONCOMING_NEAR_EDGE + 1 * M;

// The lay-by: a 3 m parking strip beside the nearside hard strip, with
// tapered entry and exit and a kerb along its back edge. z positions: where
// the entry taper begins, where it reaches full width, where the exit taper
// begins, and where it ends.
const LAYBY_WIDTH = 3 * M;
const LAYBY_BACK = NEAR_SHOULDER - LAYBY_WIDTH;
const LAYBY = { entry: -5, start: -9, end: -25, exit: -29 };

// Shared with the engine so the car's routes follow the road.
export const ROAD = {
  lane: LANE,
  // Pulling into the lay-by: drift across between `entry` and `start` to
  // its centre line at `x`, and come to a stop at `stop`.
  layby: { x: NEAR_SHOULDER - LAYBY_WIDTH / 2, entry: LAYBY.entry, start: LAYBY.start, stop: -18 },
  metre: M,
  // Gantry posts: on the nearside verge, and in the central reservation on
  // the far side of the barrier, so the gantry spans past the guard rail.
  gantryPosts: [NEAR_SHOULDER - 0.5, RESERVATION[1] - 0.25] as [number, number],
};

// UK markings, in metres: edge lines are solid (broken 1 m / 1 m across a
// lay-by), and lane lines are 2 m marks with 7 m gaps.
const EDGE_WIDTH = 0.15 * M;
const LANE_LINE = { width: 0.1 * M, mark: 2 * M, gap: 7 * M };
const STUD_SPACING = 18 * M;

// The asphalt texture tiles every TILE units (about 2.3 m).
const TILE = 1;

// Seeded random, so the road looks the same on every visit.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value noise in [0, 1], summed over a few octaves.
function valueNoise(size: number, cellCounts: number[], rand: () => number) {
  const out = new Float32Array(size * size);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  let total = 0;
  cellCounts.forEach((cells, octave) => {
    const grid = Array.from({ length: cells * cells }, rand);
    const at = (x: number, y: number) => grid[(y % cells) * cells + (x % cells)];
    const weight = 1 / (octave + 1);
    total += weight;
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells;
      const y0 = Math.floor(fy);
      const ty = smooth(fy - y0);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const x0 = Math.floor(fx);
        const tx = smooth(fx - x0);
        const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
        const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
        out[y * size + x] += (top * (1 - ty) + bottom * ty) * weight;
      }
    }
  });
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function dataTexture(data: Uint8Array, size: number, anisotropy: number, srgb: boolean) {
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Hot-rolled asphalt, about 2 mm per pixel: aggregate stones of mixed shades
// set in dark binder, with matching relief (normal map) and roughness.
function asphaltTextures(anisotropy: number) {
  const size = 1024;
  const rand = rng(21);
  const height = valueNoise(size, [8, 32], rand).map((v) => v * 0.25);
  const shade = new Float32Array(size * size).fill(0.27);
  const rough = new Float32Array(size * size).fill(0.95);
  const stones = 70000;
  for (let s = 0; s < stones; s++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 0.8 + rand() ** 2 * 2.6;
    const tone = 0.24 + rand() ** 1.6 * 0.42;
    const lift = 0.4 + rand() * 0.6;
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 > r2) continue;
        const i = ((y + size) % size) * size + ((x + size) % size);
        const h = 0.25 + lift * Math.sqrt(1 - d2 / r2) * 0.75;
        if (h <= height[i]) continue;
        height[i] = h;
        shade[i] = tone;
        rough[i] = 0.7 + rand() * 0.15;
      }
    }
  }
  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const n = new THREE.Vector3();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const grit = (rand() - 0.5) * 0.04;
      const v = Math.round(Math.min(1, shade[i] + grit) * 255);
      // Aggregate in UK asphalt runs slightly warm.
      albedo.set([v, Math.round(v * 0.99), Math.round(v * 0.97), 255], i * 4);
      const dx = height[y * size + ((x + 1) % size)] - height[y * size + ((x - 1 + size) % size)];
      const dy = height[((y + 1) % size) * size + x] - height[((y - 1 + size) % size) * size + x];
      n.set(-dx * 2.5, -dy * 2.5, 1).normalize();
      normal.set([(n.x * 0.5 + 0.5) * 255, (n.y * 0.5 + 0.5) * 255, (n.z * 0.5 + 0.5) * 255, 255], i * 4);
      const g = Math.round(rough[i] * 255);
      roughness.set([g, g, g, 255], i * 4);
    }
  }
  return {
    map: dataTexture(albedo, size, anisotropy, true),
    normalMap: dataTexture(normal, size, anisotropy, false),
    roughnessMap: dataTexture(roughness, size, anisotropy, false),
  };
}

// Large-scale patchiness (repairs, weathering) so the tiling never reads.
function patchTexture(anisotropy: number) {
  const size = 256;
  const noise = valueNoise(size, [4, 8, 16, 32], rng(5));
  const data = new Uint8Array(size * size * 4);
  noise.forEach((v, i) => {
    const b = Math.round(v * 255);
    data.set([b, b, b, 255], i * 4);
  });
  return dataTexture(data, size, anisotropy, false);
}

// Varies the asphalt over tens of metres, and polishes the wheel paths of
// each lane, which run along `axis` ("x" or "z") with centres `lanes`.
function weather(material: THREE.MeshStandardMaterial, patches: THREE.Texture, axis: "x" | "z", lanes: number[]) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPatches = { value: patches };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vRoadPlan;")
      .replace("#include <fog_vertex>", "#include <fog_vertex>\nvRoadPlan = (modelMatrix * vec4(transformed, 1.0)).xz;");
    const across = axis === "x" ? "vRoadPlan.x" : "vRoadPlan.y";
    const tracks = lanes
      .map(
        (centre) => `track = max(track, 1.0 - smoothstep(0.05, 0.13, abs(abs(${across} - (${centre.toFixed(3)})) - 0.33)));
        oil = max(oil, 1.0 - smoothstep(0.0, 0.18, abs(${across} - (${centre.toFixed(3)}))));`,
      )
      .join("\n");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uPatches;\nvarying vec2 vRoadPlan;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float track = 0.0;
        float oil = 0.0;
        ${tracks}
        float patchy = texture2D(uPatches, vRoadPlan / 37.0).r * 0.6 + texture2D(uPatches, vRoadPlan / 9.0 + 0.31).r * 0.4;
        diffuseColor.rgb *= (0.82 + 0.36 * patchy) * (1.0 + 0.07 * track) * (1.0 - 0.06 * oil);`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor *= 1.0 - 0.18 * track;");
  };
  material.customProgramCacheKey = () => `road-weather-${axis}-${lanes.join(",")}`;
}

// Flat geometry lying on the road at height y, with UVs in world units so
// every piece of asphalt and paint shares one continuous texture.
function onRoad(geometry: THREE.BufferGeometry, y: number) {
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  const position = geometry.attributes.position;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = position.getX(i) / TILE;
    uv[i * 2 + 1] = -position.getZ(i) / TILE;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}

// A rectangle from (x0, z0) to (x1, z1), in shape coordinates (x, -z).
function rect(x0: number, z0: number, x1: number, z1: number) {
  const geometry = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0));
  geometry.translate((x0 + x1) / 2, -(z0 + z1) / 2, 0);
  return geometry;
}

// Dashes along z (or along x for the side road), between `from` and `to`.
function dashes(line: { width: number; mark: number; gap: number }, along: "z" | "x", at: number, from: number, to: number) {
  const pieces: THREE.BufferGeometry[] = [];
  const step = line.mark + line.gap;
  const dir = Math.sign(to - from);
  for (let s = from; dir * (to - s) > line.mark; s += dir * step) {
    pieces.push(
      along === "z"
        ? rect(at - line.width / 2, s, at + line.width / 2, s + dir * line.mark)
        : rect(s, at - line.width / 2, s + dir * line.mark, at + line.width / 2),
    );
  }
  return pieces;
}

export function createRoad({ anisotropy }: { anisotropy: number }) {
  const group = new THREE.Group();
  const asphalt = asphaltTextures(anisotropy);
  const patches = patchTexture(anisotropy);
  const surface = (axis: "x" | "z", lanes: number[]) => {
    const material = new THREE.MeshStandardMaterial({
      ...asphalt,
      normalScale: new THREE.Vector2(0.9, 0.9),
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    weather(material, patches, axis, lanes);
    return material;
  };
  // Paint takes on the asphalt's relief.
  const paint = new THREE.MeshStandardMaterial({
    color: 0xeeede6,
    roughness: 0.62,
    roughnessMap: asphalt.roughnessMap,
    normalMap: asphalt.normalMap,
    normalScale: new THREE.Vector2(0.5, 0.5),
  });
  // Wheel paths in both lanes each way, and in the lay-by.
  const mainSurface = surface("x", [
    ROAD.layby.x,
    0,
    LANE,
    ONCOMING_OFF_EDGE + LANE / 2,
    ONCOMING_OFF_EDGE + LANE * 1.5,
  ]);

  const add = (pieces: THREE.BufferGeometry[], material: THREE.Material, y: number) => {
    const mesh = new THREE.Mesh(onRoad(mergeGeometries(pieces.map((p) => p.index ? p.toNonIndexed() : p)), y), material);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // Asphalt: both carriageways with their hard strips, and the lay-by with
  // S-curved tapers in and out. Shape coordinates are (x, -z).
  add([rect(NEAR_SHOULDER, NEAR, OFF_SHOULDER, FAR), rect(RESERVATION[1], NEAR, ONCOMING_SHOULDER, FAR)], mainSurface, 0);
  const x0 = NEAR_SHOULDER;
  const [wEntry, wStart, wEnd, wExit] = [LAYBY.entry, LAYBY.start, LAYBY.end, LAYBY.exit].map((z) => -z);
  const layby = new THREE.Shape();
  layby.moveTo(x0 + 0.01, wEntry);
  layby.bezierCurveTo(x0, (wEntry + wStart) / 2, LAYBY_BACK, (wEntry + wStart) / 2, LAYBY_BACK, wStart);
  layby.lineTo(LAYBY_BACK, wEnd);
  layby.bezierCurveTo(LAYBY_BACK, (wEnd + wExit) / 2, x0, (wEnd + wExit) / 2, x0 + 0.01, wExit);
  layby.closePath();
  add([new THREE.ShapeGeometry(layby, 16)], mainSurface, 0);

  // Paint on our carriageway. The nearside edge line breaks into 1 m / 1 m
  // dashes across the lay-by's mouth.
  const markings: THREE.BufferGeometry[] = [
    rect(NEAR_EDGE - EDGE_WIDTH, NEAR, NEAR_EDGE, LAYBY.entry),
    ...dashes({ width: EDGE_WIDTH, mark: M, gap: M }, "z", NEAR_EDGE - EDGE_WIDTH / 2, LAYBY.entry, LAYBY.exit),
    rect(NEAR_EDGE - EDGE_WIDTH, LAYBY.exit, NEAR_EDGE, FAR),
    ...dashes(LANE_LINE, "z", NEAR_EDGE + LANE, NEAR, FAR),
    rect(OFF_EDGE, NEAR, OFF_EDGE + EDGE_WIDTH, FAR),
    // The oncoming carriageway, mirrored.
    rect(ONCOMING_OFF_EDGE - EDGE_WIDTH, NEAR, ONCOMING_OFF_EDGE, FAR),
    ...dashes(LANE_LINE, "z", ONCOMING_OFF_EDGE + LANE, NEAR, FAR),
    rect(ONCOMING_NEAR_EDGE, NEAR, ONCOMING_NEAR_EDGE + EDGE_WIDTH, FAR),
  ];

  add(markings, paint, 0.004);

  // A concrete kerb along the lay-by's back edge, following its tapers.
  const kerbLine = [
    ...new THREE.CubicBezierCurve(
      new THREE.Vector2(x0, wEntry),
      new THREE.Vector2(x0, (wEntry + wStart) / 2),
      new THREE.Vector2(LAYBY_BACK, (wEntry + wStart) / 2),
      new THREE.Vector2(LAYBY_BACK, wStart),
    ).getPoints(12),
    ...new THREE.CubicBezierCurve(
      new THREE.Vector2(LAYBY_BACK, wEnd),
      new THREE.Vector2(LAYBY_BACK, (wEnd + wExit) / 2),
      new THREE.Vector2(x0, (wEnd + wExit) / 2),
      new THREE.Vector2(x0, wExit),
    ).getPoints(12),
  ];
  const kerbPieces: THREE.BufferGeometry[] = [];
  const kerbHeight = 0.1 * M;
  const kerbWidth = 0.125 * M;
  for (let i = 1; i < kerbLine.length; i++) {
    const a = kerbLine[i - 1];
    const b = kerbLine[i];
    const dx = b.x - a.x;
    const dz = -(b.y - a.y);
    const length = Math.hypot(dx, dz);
    if (length < 1e-4) continue;
    const piece = new THREE.BoxGeometry(kerbWidth, kerbHeight, length + 0.01);
    piece.rotateY(Math.atan2(dx, dz));
    piece.translate((a.x + b.x) / 2 - kerbWidth / 2, kerbHeight / 2 - 0.02, -(a.y + b.y) / 2);
    kerbPieces.push(piece);
  }
  const kerb = new THREE.Mesh(mergeGeometries(kerbPieces), new THREE.MeshStandardMaterial({ color: 0xb9b6ad, roughness: 0.92 }));
  kerb.castShadow = kerb.receiveShadow = true;
  group.add(kerb);

  // The blue lay-by sign ("P") at the entry, facing oncoming traffic.
  const signCanvas = document.createElement("canvas");
  signCanvas.width = signCanvas.height = 256;
  const ctx = signCanvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#1d5bab";
  ctx.fillRect(12, 12, 232, 232);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 200px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("P", 128, 140);
  const signFace = new THREE.CanvasTexture(signCanvas);
  signFace.colorSpace = THREE.SRGBColorSpace;
  const signMetal = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.45 });
  const laybySign = new THREE.Group();
  const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * M, 0.025 * M, 1.9 * M, 8).translate(0, 0.95 * M, 0), signMetal);
  const signPlate = new THREE.Mesh(new THREE.BoxGeometry(0.6 * M, 0.6 * M, 0.02), [
    signMetal,
    signMetal,
    signMetal,
    signMetal,
    new THREE.MeshStandardMaterial({ map: signFace, roughness: 0.5 }),
    signMetal,
  ]);
  signPlate.position.set(0, 1.9 * M, 0.03);
  laybySign.add(signPost, signPlate);
  laybySign.position.set(LAYBY_BACK - 0.35, -0.02, LAYBY.entry + 0.6);
  laybySign.traverse((object) => (object.castShadow = true));
  group.add(laybySign);

  // Road studs ("cat's eyes"): red on the nearside edge, white on lane
  // lines, amber on the offside edge by the central reservation, and green
  // across the lay-by's mouth, where traffic may cross the edge.
  const studGeometry = new THREE.BoxGeometry(0.1 * M, 0.025 * M, 0.18 * M).translate(0, 0.006, 0);
  const studColours = { red: 0xff2a1a, white: 0xfff4e0, amber: 0xffa21a, green: 0x2aff6a };
  const studMaterials = Object.fromEntries(
    Object.entries(studColours).map(([name, colour]) => [
      name,
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: colour, emissiveIntensity: 0, roughness: 0.3 }),
    ]),
  ) as Record<keyof typeof studColours, THREE.MeshStandardMaterial>;
  const studRows: [number, keyof typeof studColours][] = [
    [NEAR_EDGE - EDGE_WIDTH - 0.08 * M, "red"],
    [NEAR_EDGE + LANE, "white"],
    [OFF_EDGE + EDGE_WIDTH + 0.08 * M, "amber"],
    [ONCOMING_OFF_EDGE - EDGE_WIDTH - 0.08 * M, "amber"],
    [ONCOMING_OFF_EDGE + LANE, "white"],
    [ONCOMING_NEAR_EDGE + EDGE_WIDTH + 0.08 * M, "red"],
  ];
  const matrix = new THREE.Matrix4();
  const studCount = Math.floor((NEAR - FAR) / STUD_SPACING);
  for (const colour of ["red", "white", "amber"] as const) {
    const rows = studRows.filter(([, c]) => c === colour);
    const studs = new THREE.InstancedMesh(studGeometry, studMaterials[colour], rows.length * studCount);
    rows.forEach(([x], row) => {
      for (let i = 0; i < studCount; i++) {
        const z = NEAR - (i + 0.5) * STUD_SPACING;
        // Green rather than red across the lay-by's mouth.
        const skip = x < 0 && z < LAYBY.entry && z > LAYBY.exit;
        studs.setMatrixAt(row * studCount + i, skip ? matrix.makeScale(0, 0, 0) : matrix.makeTranslation(x, 0, z));
      }
    });
    group.add(studs);
  }
  const greenCount = Math.floor((LAYBY.entry - LAYBY.exit) / (4.5 * M));
  const greenStuds = new THREE.InstancedMesh(studGeometry, studMaterials.green, greenCount);
  for (let i = 0; i < greenCount; i++) {
    greenStuds.setMatrixAt(i, matrix.makeTranslation(NEAR_EDGE - EDGE_WIDTH - 0.08 * M, 0, LAYBY.entry - (i + 0.5) * 4.5 * M));
  }
  group.add(greenStuds);

  // Steel safety barrier down the central reservation: double-sided
  // corrugated beam on posts every 2 m.
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9bec4, metalness: 0.85, roughness: 0.38 });
  const postCount = Math.floor((NEAR - FAR) / (2 * M));
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1 * M, 0.75 * M, 0.1 * M).translate(0, 0.375 * M, 0), steel, postCount);
  for (let i = 0; i < postCount; i++) posts.setMatrixAt(i, matrix.makeTranslation(BARRIER_X, 0, NEAR - i * 2 * M));
  posts.castShadow = posts.receiveShadow = true;
  group.add(posts);
  // A W-beam: two ridges, 310 mm deep, seen end on.
  const beamProfile = new THREE.Shape();
  const depth = 0.31 * M;
  const bulge = 0.08 * M;
  beamProfile.moveTo(0, 0);
  beamProfile.bezierCurveTo(bulge, depth * 0.15, bulge, depth * 0.35, 0, depth * 0.5);
  beamProfile.bezierCurveTo(bulge, depth * 0.65, bulge, depth * 0.85, 0, depth);
  beamProfile.lineTo(-0.01, depth);
  beamProfile.lineTo(-0.01, 0);
  const beamGeometry = new THREE.ExtrudeGeometry(beamProfile, { depth: NEAR - FAR, bevelEnabled: false, curveSegments: 6 });
  for (const side of [-1, 1]) {
    const beam = new THREE.Mesh(beamGeometry, steel);
    beam.scale.x = side;
    beam.position.set(BARRIER_X + side * 0.06 * M, 0.45 * M, FAR);
    beam.castShadow = beam.receiveShadow = true;
    group.add(beam);
  }

  // White marker posts with red reflectors on the nearside verge, every 50 m.
  const markerCount = Math.floor((NEAR - FAR) / (50 * M));
  const markerPosts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.1 * M, 1 * M, 0.08 * M).translate(0, 0.5 * M, 0),
    new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.55 }),
    markerCount,
  );
  const reflectors = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.06 * M, 0.15 * M, 0.01).translate(0, 0.85 * M, 0.04 * M),
    studMaterials.red,
    markerCount,
  );
  for (let i = 0; i < markerCount; i++) {
    const z = NEAR - (i + 0.3) * 50 * M;
    // Skip the post that would stand in the lay-by.
    const at = z < LAYBY.entry + 1 && z > LAYBY.exit - 1 ? matrix.makeScale(0, 0, 0) : matrix.makeTranslation(NEAR_SHOULDER - 0.6, 0, z);
    markerPosts.setMatrixAt(i, at);
    reflectors.setMatrixAt(i, at);
  }
  markerPosts.castShadow = true;
  group.add(markerPosts, reflectors);

  return {
    group,
    // True where something standing here would be on asphalt or barrier.
    isPaved(x: number, z: number, margin = 0) {
      if (x > NEAR_SHOULDER - margin && x < RESERVATION[0] + margin) return true;
      if (x > RESERVATION[1] - margin && x < ONCOMING_SHOULDER + margin) return true;
      if (Math.abs(x - BARRIER_X) < 0.12 + margin) return true;
      return x < NEAR_SHOULDER + margin && x > LAYBY_BACK - kerbWidth - margin && z < LAYBY.entry + margin && z > LAYBY.exit - margin;
    },
    // Retroreflective studs glow when the light is low.
    setStuds(intensity: number) {
      for (const material of Object.values(studMaterials)) material.emissiveIntensity = intensity;
    },
  };
}
