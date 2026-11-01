import * as THREE from "three";
import { createCar } from "./car";
import { createForest } from "./forest";
import { createRoad, ROAD } from "./road";
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

// Seeded so the meadow and treeline are the same on every visit.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function radialTexture(stops: [number, string][]) {
  return canvasTexture(128, 128, (ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  });
}

const matte = (params: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, ...params });

// Two crossed grass cards. Each face is wound both ways with every normal
// pointing up, so grass is lit like the ground it grows from instead of
// darkening as cards turn away.
function cardGeometry() {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (const angle of [0, Math.PI / 2]) {
    const x = Math.cos(angle) / 2;
    const z = Math.sin(angle) / 2;
    const base = positions.length / 3;
    positions.push(-x, 0, -z, x, 0, z, x, 1, z, -x, 1, -z);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    index.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(Array(positions.length / 3).fill([0, 1, 0]).flat(), 3));
  geometry.setIndex(index);
  return geometry;
}

// Bends each card by its height squared, in waves that roll across the meadow.
function addWind(material: THREE.MeshStandardMaterial, time: { value: number }) {
  material.onBeforeCompile = (shader) => {
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
  };
  material.customProgramCacheKey = () => "road-wind";
}

const skyVertex = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform float uSunDisc;
  uniform float uSunGlow;
  uniform vec3 uSunDirection;
  varying vec3 vDirection;
  void main() {
    vec3 direction = normalize(vDirection);
    float height = direction.y;
    vec3 color = mix(uHorizon, uTop, pow(clamp(height, 0.0, 1.0), 0.5));
    float facing = max(dot(direction, uSunDirection), 0.0);
    color += uSun * (pow(facing, 6.0) * 0.22 + pow(facing, 90.0) * 0.7) * uSunGlow;
    color += uSun * smoothstep(0.99915, 0.99945, facing) * 24.0 * uSunDisc;
    color = mix(color, uHorizon, smoothstep(0.0, -0.04, height));
    gl_FragColor = vec4(color, 1.0);
  }
`;

const dustVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.12 + aSeed * 12.9) * 0.18;
    p.y += sin(uTime * 0.16 + aSeed * 7.1) * 0.12;
    p.z += cos(uTime * 0.1 + aSeed * 3.7) * 0.18;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float depth = -mvPosition.z;
    gl_PointSize = (0.012 + 0.02 * fract(aSeed * 91.7)) * uScale / depth;
    float twinkle = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 0.6 + aSeed * 40.0));
    vAlpha = twinkle * smoothstep(0.4, 1.6, depth) * (1.0 - smoothstep(14.0, 26.0, depth));
  }
`;

const dustFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float falloff = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(uColor * 1.6, falloff * falloff * vAlpha * 0.7);
  }
`;

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
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  // Ground and grass textures from "Pine Forest at Sunset" (see forest.ts).
  const textures = new THREE.LoadingManager();
  const texturesReady = new Promise<void>((resolve) => {
    textures.onLoad = resolve;
    textures.onError = (url) => console.error(`RoadScene: could not load ${url}`);
  });
  const textureLoader = new THREE.TextureLoader(textures);
  const texture = (url: string, repeatX = 1, repeatY = 1) => {
    const map = textureLoader.load(url);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = anisotropy;
    if (repeatX !== 1 || repeatY !== 1) {
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(repeatX, repeatY);
    }
    return map;
  };
  // One tile of meadow every 3 units.
  const groundMap = texture("/models/meadow-ground.webp", 4000 / 3, 4000 / 3);

  const mats = {
    ground: matte({ map: groundMap }),
    lushGrass: matte({ map: texture("/models/grass-lush.webp"), alphaTest: 0.5, alphaToCoverage: true }),
    fineGrass: matte({ map: texture("/models/grass-fine.webp"), alphaTest: 0.5, alphaToCoverage: true }),
    gantry: new THREE.MeshStandardMaterial({ metalness: 0.75, roughness: 0.42 }),
    hillFar: matte({ flatShading: true }),
    hillNear: matte({ flatShading: true }),
  };
  addWind(mats.lushGrass, wind);
  addWind(mats.fineGrass, wind);

  function strip(width: number, depth: number, material: THREE.Material, x: number, z: number, y = 0) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  strip(4000, 4000, mats.ground, 0, -1000, GROUND_Y);

  const road = createRoad({ anisotropy });
  scene.add(road.group);

  // Meadow grass on the verges and central reservation: a dense leafy layer
  // with taller seed heads scattered through it.
  function grass(material: THREE.Material, density: number, height: [number, number]) {
    const area = { x: [-18, 24], z: [8, -60] };
    const attempts = Math.round((area.x[1] - area.x[0]) * (area.z[0] - area.z[1]) * density * detail);
    const mesh = new THREE.InstancedMesh(cardGeometry(), material, attempts);
    let count = 0;
    for (let i = 0; i < attempts; i++) {
      const x = area.x[0] + rand() * (area.x[1] - area.x[0]);
      const z = area.z[0] - rand() * (area.z[0] - area.z[1]);
      if (road.isPaved(x, z, 0.06)) continue;
      // Mown short near the road, longer further out.
      const reach = THREE.MathUtils.smoothstep(Math.abs(x - 3), 4, 12);
      const h = (height[0] + rand() * (height[1] - height[0])) * (0.55 + 0.45 * reach);
      dummy.position.set(x, GROUND_Y, z);
      dummy.rotation.set((rand() - 0.5) * 0.2, rand() * Math.PI, (rand() - 0.5) * 0.2);
      dummy.scale.set(h * (1.1 + rand() * 0.5), h, h * (1.1 + rand() * 0.5));
      dummy.updateMatrix();
      mesh.setMatrixAt(count, dummy.matrix);
      const v = 0.8 + rand() * 0.35;
      mesh.setColorAt(count++, tint.setRGB(v * (0.95 + rand() * 0.12), v, v * (0.9 + rand() * 0.1)));
    }
    mesh.count = count;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  grass(mats.lushGrass, 2.6, [0.25, 0.45]);
  grass(mats.fineGrass, 0.7, [0.4, 0.75]);

  // Gantry: two posts carrying a box truss, with the sign panels hung from
  // its front.
  const gantry = new THREE.Group();
  gantry.position.z = GANTRY_Z;
  for (const x of GANTRY_POSTS) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, GANTRY_TOP, 0.12), mats.gantry);
    post.position.set(x, GANTRY_TOP / 2, 0);
    gantry.add(post);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), mats.gantry);
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
      const distance = Math.hypot(x, 2.2 - z);
      const azimuth = THREE.MathUtils.radToDeg(Math.atan2(x, 2.2 - z));
      const spread = THREE.MathUtils.radToDeg(Math.atan2(3, distance));
      const top = THREE.MathUtils.radToDeg(Math.atan2(height - 0.9, distance));
      return Math.abs(azimuth - sunAzimuth) < 4 + spread && top > sunElevation - 2;
    },
  });
  scene.add(forest.group);

  // Rolling ridges, dipping where the road vanishes and curving away at the sides.
  function ridge(material: THREE.Material, z: number, depth: number, base: number, amp: number, seed: number) {
    const geometry = new THREE.PlaneGeometry(1800, depth, 180, 14).rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const across = Math.cos((position.getZ(i) / depth) * Math.PI) ** 1.5;
      const profile = base + amp * (0.5 + 0.3 * Math.sin(x * 0.011 + seed) + 0.2 * Math.sin(x * 0.031 + seed * 2) + 0.08 * Math.sin(x * 0.09 + seed * 3));
      const valley = 0.35 + 0.65 * THREE.MathUtils.smoothstep(Math.abs(x), 0, 160);
      position.setY(i, profile * across * valley - 1);
      position.setZ(i, position.getZ(i) + (x * x) / 5000);
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = z;
    scene.add(mesh);
  }
  ridge(mats.hillFar, -440, 280, 10, 46, 1.3);
  ridge(mats.hillNear, -250, 130, 3, 18, 4.1);

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
  // The environment map is rendered from the sky alone, so the car's paint
  // and glass reflect the same gradient and sun.
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
    const angle = THREE.MathUtils.degToRad(-60 + c * 13 + rand() * 6);
    const distance = 700 + rand() * 300;
    const center = new THREE.Vector3(Math.sin(angle) * distance, 70 + rand() * 190, -Math.cos(angle) * distance);
    const puffs = 5 + Math.floor(rand() * 4);
    for (let p = 0; p < puffs; p++) {
      const sprite = new THREE.Sprite(cloudMaterial);
      sprite.position.copy(center).add(new THREE.Vector3((rand() - 0.5) * 140, (rand() - 0.5) * 22, (rand() - 0.5) * 40));
      sprite.scale.set(110 + rand() * 130, 40 + rand() * 45, 1);
      clouds.add(sprite);
    }
  }
  scene.add(clouds);

  const dustCount = Math.round(520 * detail);
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSeeds = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPositions.set([(rand() - 0.5) * 12, 0.1 + rand() * 3.1, 6 - rand() * 36], i * 3);
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

  const car = createCar();
  car.group.position.z = CAR_Z;
  scene.add(car.group);

  const hemi = new THREE.HemisphereLight();
  scene.add(hemi);
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 140 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const sunDirection = new THREE.Vector3();
  scene.fog = new THREE.Fog(0xffffff, 30, 560);

  function apply(p: Palette) {
    const elevation = THREE.MathUtils.degToRad(p.sunElevation);
    const azimuth = THREE.MathUtils.degToRad(p.sunAzimuth);
    sunDirection.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
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

    for (const material of [mats.ground, mats.lushGrass, mats.fineGrass]) material.color.set(p.meadow);
    road.setStuds(p.studs);
    mats.gantry.color.set(p.gantry);
    signs.setColors(p.sign, p.signGlow);
    mats.hillFar.color.set(p.hillFar);
    mats.hillNear.color.set(p.hillNear);
    cloudMaterial.color.set(p.cloud);
    dustMaterial.uniforms.uColor.value.set(p.dust);

    car.applyPalette(p);
  }

  // Captures the environment from a sky with no sun disc and only a faint
  // glow, so paint and glass don't mirror a hotspot.
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

  // Everything loaded asynchronously, settled (loaded or failed).
  const ready = Promise.allSettled([car.ready, forest.ready, texturesReady, signs.ready]);

  return { scene, skyScene, withDimSun, ready, road, forest, sky, sun, sunDirection, wind, clouds, dust: dustMaterial, car, sign: signs, apply };
}
