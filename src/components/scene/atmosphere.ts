import * as THREE from "three";
import type { Palette } from "../road/palette";
import { HAZE } from "./style";
import { canvasTexture, matte } from "./util";

// The light and air every scene shares: the sky dome (also the source of the
// environment light), clouds, dust hanging in the low sun, the sun itself
// with its shadows, the sky fill, fog, and the hills on the horizon. Each
// scene places them for its own shot, but they are built and coloured here
// alone, so the three scenes keep the same light logic.

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
    // A smooth wash from the horizon up, as a print's sky is laid.
    vec3 color = mix(uHorizon, uTop, smoothstep(0.0, 0.55, pow(clamp(height, 0.0, 1.0), 0.7)));
    float facing = max(dot(direction, uSunDirection), 0.0);
    // A broad warm glow round the sun, a soft ring, and a crisp disc.
    color = mix(color, uSun, pow(facing, 10.0) * 0.35 * uSunGlow);
    color = mix(color, uSun, pow(facing, 400.0) * 0.6 * uSunGlow);
    color = mix(color, uSun * 1.6, smoothstep(0.99935, 0.9995, facing) * uSunDisc);
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
    gl_FragColor = vec4(uColor * 1.6, falloff * falloff * vAlpha * 0.6);
  }
`;

type Range = [number, number];

export type AtmosphereOptions = {
  rand: () => number;
  // The scene's clock (in seconds, stopped for reduced motion), which the
  // dust shares with the grass's wind.
  time: { value: number };
  // The direction the shot looks, in degrees round from straight down -z,
  // for composing the clouds round it (see CLOUDS).
  clouds: { facing: number };
  dust: { count: number; x: Range; y: Range; z: Range };
  // The sun's shadow camera: a square `extent` either side of its target,
  // from `distance` away.
  shadow: { extent: number; distance: number; far: number; mapSize: number };
  fog: Range;
  // The two ridges on the horizon (see ridge), and whether they dip where a
  // road runs off between them.
  hills: { far: RidgeShape; near: RidgeShape; valley: boolean };
};

type RidgeShape = { z: number; depth: number; base: number; amp: number; seed: number };

// One cloud, as two printings of the same outline (a run of round lumps on
// a flat base): `shade` is the whole shape, and `lit` the shape with its
// underside eaten away, so laid over it the shade shows only as a crescent
// under each lump. White on clear, crisp (antialiased) edges. `lumps` and
// `tower` set its character, from a long low bank to a towering cumulus.
function cloudTextures(rand: () => number, lumps: number, tower: number) {
  const base = 230;
  const shapes = Array.from({ length: lumps }, (_, i) => {
    const x = 70 + (i + 0.5) * (372 / lumps) + (rand() - 0.5) * 24;
    const middle = 1 - Math.abs(x - 256) / 256;
    return { x, r: 26 + middle * (30 + tower * 70) + rand() * 18 };
  });
  const draw = (ctx: CanvasRenderingContext2D, lift: number) => {
    ctx.beginPath();
    ctx.roundRect(36, base - 34 - lift, 440, 34, 17);
    ctx.fill();
    for (const { x, r } of shapes) {
      ctx.beginPath();
      ctx.arc(x, base - r * 0.72 - lift, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // A flat underside.
    ctx.clearRect(0, base - lift, 512, 256);
  };
  const shade = canvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = "#fff";
    draw(ctx, 0);
  });
  const lit = canvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = "#fff";
    draw(ctx, 0);
    ctx.globalCompositeOperation = "destination-in";
    draw(ctx, 20);
  });
  return { shade, lit };
}

// Where the clouds sit, composed round the view (degrees round from it, and
// up from the horizon) rather than scattered: a long bank low on each side,
// a tall cumulus off-centre, and a couple of small ones higher up.
const CLOUDS = [
  { az: -44, el: 7, width: 1.9, lumps: 8, tower: 0.2 },
  { az: -20, el: 17, width: 0.7, lumps: 4, tower: 0.4 },
  { az: 9, el: 9, width: 1.3, lumps: 5, tower: 1 },
  { az: 30, el: 21, width: 0.55, lumps: 3, tower: 0.5 },
  { az: 47, el: 6, width: 2.2, lumps: 9, tower: 0.15 },
];

// Rolling ridges, curving away at the sides, optionally dipping in the middle.
function ridge(material: THREE.Material, { z, depth, base, amp, seed }: RidgeShape, valley: boolean) {
  const geometry = new THREE.PlaneGeometry(1800, depth, 180, 14).rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const across = Math.cos((position.getZ(i) / depth) * Math.PI) ** 1.5;
    const profile = base + amp * (0.5 + 0.3 * Math.sin(x * 0.011 + seed) + 0.2 * Math.sin(x * 0.031 + seed * 2) + 0.08 * Math.sin(x * 0.09 + seed * 3));
    const dip = valley ? 0.35 + 0.65 * THREE.MathUtils.smoothstep(Math.abs(x), 0, 160) : 1;
    position.setY(i, profile * across * dip - 1);
    position.setZ(i, position.getZ(i) + (x * x) / 5000);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = z;
  return mesh;
}

export function createAtmosphere(scene: THREE.Scene, options: AtmosphereOptions) {
  const { rand } = options;
  const group = new THREE.Group();
  scene.add(group);

  // Smooth, like everything else: the haze softens them, not facets.
  const hillFar = matte();
  const hillNear = matte();
  group.add(ridge(hillFar, options.hills.far, options.hills.valley), ridge(hillNear, options.hills.near, options.hills.valley));

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
  group.add(sky);

  // Clouds as a print draws them: flat shapes in two inks, sunlit tops
  // over shaded undersides (see cloudTextures), each lit from the sun's
  // side of the sky (see apply).
  const clouds = new THREE.Group();
  const cloudInks: { lit: THREE.SpriteMaterial; shade: THREE.SpriteMaterial; direction: THREE.Vector3 }[] = [];
  for (const cloud of CLOUDS) {
    const { shade, lit } = cloudTextures(rand, cloud.lumps, cloud.tower);
    const angle = THREE.MathUtils.degToRad(options.clouds.facing + cloud.az);
    const elevation = THREE.MathUtils.degToRad(cloud.el);
    const distance = 1000;
    const direction = new THREE.Vector3(Math.sin(angle) * Math.cos(elevation), Math.sin(elevation), -Math.cos(angle) * Math.cos(elevation));
    const width = 330 * cloud.width;
    const inks = {
      shade: new THREE.SpriteMaterial({ map: shade, transparent: true, depthWrite: false, fog: false }),
      lit: new THREE.SpriteMaterial({ map: lit, transparent: true, depthWrite: false, fog: false }),
      direction,
    };
    cloudInks.push(inks);
    for (const [material, order] of [
      [inks.shade, -0.9],
      [inks.lit, -0.8],
    ] as const) {
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(direction).multiplyScalar(distance);
      // The flat base sits at the cloud's height, the lumps rise above it.
      sprite.center.set(0.5, 0.1);
      sprite.scale.set(width, width / 2, 1);
      sprite.renderOrder = order;
      clouds.add(sprite);
    }
  }
  group.add(clouds);

  const { time } = options;
  const { count, x, y, z } = options.dust;
  const dustPositions = new Float32Array(count * 3);
  const dustSeeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    dustPositions.set([x[0] + rand() * (x[1] - x[0]), y[0] + rand() * (y[1] - y[0]), z[0] + rand() * (z[1] - z[0])], i * 3);
    dustSeeds[i] = rand();
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute("aSeed", new THREE.BufferAttribute(dustSeeds, 1));
  const dustMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uScale: { value: 1000 }, uColor: { value: new THREE.Color() } },
    vertexShader: dustVertex,
    fragmentShader: dustFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;
  group.add(dust);

  const hemi = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  const { extent, distance, far, mapSize } = options.shadow;
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(mapSize);
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  sun.shadow.camera.updateProjectionMatrix();
  group.add(hemi, sun, sun.target);
  const sunDirection = new THREE.Vector3();
  scene.fog = new THREE.Fog(0xffffff, options.fog[0], options.fog[1]);

  function aimSun(target: THREE.Vector3) {
    sun.target.position.copy(target);
    sun.target.updateMatrixWorld();
    sun.position.copy(target).addScaledVector(sunDirection, distance);
  }

  function apply(p: Palette) {
    const elevation = THREE.MathUtils.degToRad(p.sunElevation);
    const azimuth = THREE.MathUtils.degToRad(p.sunAzimuth);
    sunDirection.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
    aimSun(sun.target.position);
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
    hillFar.color.set(p.hillFar);
    hillNear.color.set(p.hillNear);
    // Clouds toward the sun catch its colour; low ones take the horizon's.
    const sunInk = new THREE.Color(p.sun);
    const horizon = new THREE.Color(p.skyHorizon);
    for (const { lit, shade, direction } of cloudInks) {
      const toward = Math.max(0, direction.dot(sunDirection)) ** 3;
      const low = 1 - THREE.MathUtils.smoothstep(direction.y, 0.08, 0.35);
      lit.color.set(p.cloud).lerp(sunInk, toward * 0.55).lerp(horizon, low * 0.25);
      shade.color.set(p.cloudShade).lerp(horizon, low * 0.3 + toward * 0.2);
    }
    HAZE.uHazeColor.value.set(p.sun).lerp(horizon, 0.35);
    HAZE.uHazeStrength.value = p.hazeStrength;
    dustMaterial.uniforms.uColor.value.set(p.dust);
  }

  // Per frame: the dome stays centred on the camera, the clouds drift, and
  // the dust is sized for the lens. `pixels` is the drawing buffer's height.
  function update(camera: THREE.PerspectiveCamera, seconds: number, motion: number, pixels: number) {
    time.value = seconds * motion;
    sky.position.copy(camera.position);
    clouds.position.copy(camera.position).setY(0);
    HAZE.uHazeSun.value.copy(sunDirection).transformDirection(camera.matrixWorldInverse);
    clouds.position.x += Math.sin(seconds * 0.006) * 25 * motion;
    dustMaterial.uniforms.uScale.value = pixels / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  }

  return { sun, sunDirection, aimSun, apply, update };
}

export type Atmosphere = ReturnType<typeof createAtmosphere>;
