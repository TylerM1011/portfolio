import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { TEXTURE_URLS } from "@/lib/assets";
import { createCar } from "../road/car";
import { createForest } from "../road/forest";
import { createPhone, handset } from "../road/phone";
import type { Palette } from "../road/palette";
import { createRoad, ROAD } from "../road/road";
import { day, dusk } from "./palette";
import { createRouteSign, type RouteSignArt } from "./sign";
import { LAYBY_BLUE } from "../road/sign";
import {
  addWind,
  canvasTexture,
  cardGeometry,
  dustFragment,
  dustVertex,
  imageTexture,
  matte,
  radialTexture,
  rng,
  skyFragment,
  skyVertex,
} from "../road/world";

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
// the route sign standing back on the bank, the emergency telephone, the
// blue marker sign pointing to it, the litter bin, then the parked car.
// `bottom` is the sign's lower edge, about 1.8 m up.
export const ROUTE_SIGN = { x: -4.5, z: -11.8, bottom: 0.78 };
const PHONE = { x: KERB - 0.35, z: -13.4 };
const MARKER = { x: KERB - 0.25, z: -14.3 };
const BIN = { x: KERB - 0.45, z: -15.2 };
const PARKED_Z = -16.3;
// The woods behind the verge.
const WOODS = { x: [-15, -6] as [number, number], z: [-4, -26] as [number, number], count: 150 };

// The blue marker sign (as on UK motorways): a white-bordered blue plate,
// a yellow panel pointing toward the nearest emergency telephone with a
// handset and "SOS" on it, and a column of white location marks.
function markerTexture() {
  return canvasTexture(320, 448, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(0, 0, 320, 448, 22);
    ctx.fill();
    ctx.fillStyle = LAYBY_BLUE;
    ctx.beginPath();
    ctx.roundRect(12, 12, 296, 424, 14);
    ctx.fill();
    const panel = (inset: number) => {
      ctx.beginPath();
      ctx.moveTo(30 + inset * 1.6, 224);
      ctx.lineTo(222 - inset, 70 + inset);
      ctx.lineTo(222 - inset, 378 - inset);
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = "#ffffff";
    panel(0);
    ctx.fillStyle = "#f2b417";
    panel(8);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 9; i++) ctx.fillRect(262, 40 + i * 42, 16, 16);
    handset(ctx, 168, 205, 52, "#111111");
    ctx.fillStyle = "#111111";
    ctx.font = "700 50px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SOS", 150, 278);
  });
}

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

// The SOS marker: the blue plate on a pair of posts.
function createMarker(galvanised: THREE.Material) {
  const group = new THREE.Group();
  const W = 0.62 * M;
  const H = 0.86 * M;
  const BOTTOM = 1.0 * M;
  const material = new THREE.MeshStandardMaterial({ map: markerTexture(), emissive: 0xffffff, roughness: 0.45 });
  material.emissiveMap = material.map;
  for (const x of [-W * 0.3, W * 0.3]) {
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025 * M, 0.025 * M, BOTTOM + H, 8).translate(x, (BOTTOM + H) / 2, -0.02), galvanised));
  }
  group.add(
    new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.012).translate(0, BOTTOM + H / 2, 0), [
      galvanised,
      galvanised,
      galvanised,
      galvanised,
      material,
      galvanised,
    ]),
  );
  shadowed(group);
  return { group, material };
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
    new THREE.MeshStandardMaterial({ map: binTexture(), roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }),
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
  const plastic = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.32, metalness: 0.1 });
  const sack = new THREE.Mesh(bag, plastic);
  sack.scale.set(0.22 * M, 0.3 * M, 0.2 * M);
  sack.position.set(R + 0.18 * M, 0.25 * M, 0.12 * M);
  sack.rotation.set(0.1, 0.4, -0.25);
  group.add(sack);
  group.add(new THREE.Mesh(new THREE.ConeGeometry(0.035 * M, 0.12 * M, 8).translate(R + 0.24 * M, 0.58 * M, 0.12 * M), plastic));

  const can = new THREE.Mesh(
    new THREE.CylinderGeometry(0.033 * M, 0.033 * M, 0.12 * M, 14).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.3, metalness: 0.7 }),
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
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  const textureLoads: Promise<void>[] = [];
  const texture = (url: string, repeat = 1) => {
    const { texture: map, ready } = imageTexture(url, "LaybyScene");
    textureLoads.push(ready);
    map.anisotropy = anisotropy;
    if (repeat !== 1) {
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(repeat, repeat);
    }
    return map;
  };
  const mats = {
    ground: matte({ map: texture(TEXTURE_URLS.meadow, 4000 / 3) }),
    lushGrass: matte({ map: texture(TEXTURE_URLS.lushGrass), alphaTest: 0.5, alphaToCoverage: true }),
    fineGrass: matte({ map: texture(TEXTURE_URLS.fineGrass), alphaTest: 0.5, alphaToCoverage: true }),
    galvanised: new THREE.MeshStandardMaterial({ color: 0xa4adb7, metalness: 0.75, roughness: 0.42 }),
    hillFar: matte({ flatShading: true }),
    hillNear: matte({ flatShading: true }),
  };
  addWind(mats.lushGrass, wind);
  addWind(mats.fineGrass, wind);

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
  const marker = createMarker(mats.galvanised);
  marker.group.position.set(MARKER.x, GROUND_Y, MARKER.z);
  marker.group.rotation.y = facing(MARKER.x, MARKER.z);
  scene.add(marker.group);
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
    [MARKER.x, MARKER.z, 0.15],
    [BIN.x, BIN.z, 0.35],
    [ROUTE_SIGN.x - 0.45, ROUTE_SIGN.z, 0.12],
    [ROUTE_SIGN.x + 0.45, ROUTE_SIGN.z, 0.12],
  ];
  const clear = (x: number, z: number) => footprints.some(([fx, fz, r]) => Math.hypot(x - fx, z - fz) < r);

  // Meadow grass on the verges, as on the road: mown short by the
  // carriageway, longer out on the bank.
  function grass(material: THREE.Material, density: number, height: [number, number]) {
    const area = { x: [-16, 1], z: [EYE.z + 12, EYE.z - 16] };
    const attempts = Math.round((area.x[1] - area.x[0]) * (area.z[0] - area.z[1]) * density * detail);
    const mesh = new THREE.InstancedMesh(cardGeometry(), material, attempts);
    let count = 0;
    for (let i = 0; i < attempts; i++) {
      const x = area.x[0] + rand() * (area.x[1] - area.x[0]);
      const z = area.z[0] - rand() * (area.z[0] - area.z[1]);
      if (road.isPaved(x, z, 0.06) || clear(x, z)) continue;
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

  // Pines on the bank behind the verge, held back from the road, and none
  // behind the camera (nor on the line to the sun).
  const sunAzimuth = day.sunAzimuth;
  const sunElevation = Math.min(day.sunElevation, dusk.sunElevation);
  const forest = createForest({
    detail,
    rand,
    groundY: GROUND_Y,
    woods: WOODS,
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
  void forest.ready.then(() =>
    forest.group.traverse((object) => {
      object.castShadow = false;
    }),
  );

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
    // Spread across the shot, which looks out along -x.
    const angle = THREE.MathUtils.degToRad(-155 + c * 13 + rand() * 6);
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

  const dustCount = Math.round(420 * detail);
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSeeds = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPositions.set([-7 + rand() * 8, 0.1 + rand() * 2.6, EYE.z + 7 - rand() * 14], i * 3);
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

  // The car from the home page, pulled in, side on to the camera, hazards
  // on.
  const parked = createCar();
  parked.group.position.set(ROAD.layby.x, 0, PARKED_Z);
  // The flashers are sized for the home page's view from well behind.
  for (const blinker of parked.blinkers) blinker.scale.setScalar(0.06);
  scene.add(parked.group);

  const hemi = new THREE.HemisphereLight();
  scene.add(hemi);
  // The camera barely moves, so the shadow map sits still over the lay-by.
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(detail < 1 ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 140 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.set(-3, 0, EYE.z);
  scene.add(sun, sun.target);
  const sunDirection = new THREE.Vector3();
  scene.fog = new THREE.Fog(0xffffff, 30, 560);

  function apply(p: Palette) {
    const elevation = THREE.MathUtils.degToRad(p.sunElevation);
    const azimuth = THREE.MathUtils.degToRad(p.sunAzimuth);
    sunDirection.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
    sun.position.copy(sun.target.position).addScaledVector(sunDirection, 60);
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
    mats.galvanised.color.set(p.gantry);
    // Lit from the front here, so its sheeting needs little help.
    sign.setColors(p.sign, p.signGlow * 0.3);
    marker.material.emissiveIntensity = p.signGlow;
    mats.hillFar.color.set(p.hillFar);
    mats.hillNear.color.set(p.hillNear);
    cloudMaterial.color.set(p.cloud);
    dustMaterial.uniforms.uColor.value.set(p.dust);

    // Parked with the engine off: no headlights.
    parked.applyPalette({ ...p, headlights: 0 });
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

  function update(time: number) {
    // Hazard lights, about 90 flashes a minute. Only the near side's: from
    // here the far lamp is round the car's rear corner, so its glow would
    // hang in the air past the bodywork.
    const [far, near] = parked.blinkers;
    far.visible = false;
    near.visible = Math.floor(time * 3) % 2 === 0;
  }

  const ready = Promise.allSettled([parked.ready, forest.ready, ...textureLoads, sign.ready]);

  return {
    scene,
    skyScene,
    withDimSun,
    ready,
    forest,
    car: parked,
    sky,
    clouds,
    dust: dustMaterial,
    wind,
    apply,
    update,
    sign,
    phone,
  };
}
