import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { ink, type Ink } from "../scene/style";
import { disposeTree } from "../scene/util";
import type { Palette } from "./palette";

export { disposeTree };

// The car: a Volkswagen Polo, drawn for the house style (see scene/style.ts)
// rather than loaded. Its proportions were measured from the Polo model the
// site used before (0.44 world units to the metre) and its look is in its
// shape and a handful of flat inks:
//
// - a low roof that runs long and tapers into a raked rear screen under a
//   small body-coloured spoiler, with a short, falling bonnet;
// - a beltline that rises toward the tail, a crisp shoulder crease along
//   the doors, and glass that leans in toward the roof (tumblehome), with a
//   broad C-pillar leaning forward;
// - softly rounded corners in plan, strongest at the nose, and wheel arches
//   with lips that stand proud of the sides;
// - wide red lamps that wrap round the rear corners, a plain roundel
//   between them, the yellow plate in its recess below; at the front a slim
//   dark grille band joining the headlamps;
// - one solid body colour, a deep slate blue (the one strong cool colour in
//   a warm scene), dark glass, pale flat wheels with five dark slots.
//
// It faces -z, with its tail (and taillights) toward the camera.

// Clearance the camera's eye keeps above the roof (see engine.ts).
export const CAR_HEIGHT = 0.7;

const LENGTH = 1.78;
const WIDTH = 0.77;
const WHEEL = { radius: 0.138, width: 0.12, x: 0.305, rear: 0.31, front: 1.43, arch: 0.17 };
// Where the sides stop standing upright and start leaning in.
const SHOULDER = 0.37;

const INKS = {
  paint: 0x5a83a0,
  recess: 0x4d7390,
  glass: 0x26323e,
  trim: 0x2a2b2f,
  tyre: 0x232428,
  wheel: 0xc9cbc9,
  plateRear: 0xf0d27a,
  plateFront: 0xf1efe8,
  lamp: 0x7a1c18,
  headlamp: 0xe9e6dc,
};

// A side outline (u from the tail forward, y up) swept across the car's
// width, centred on x, rounded at its edges, then pulled into the car's
// form (see narrowing). Shading is smooth over curves and crisp at creases.
function sweep(shape: THREE.Shape, width: number, bevel: number) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width - 2 * bevel,
    bevelEnabled: true,
    bevelSize: bevel,
    // The bevel rounds the outline's edges inward, so each panel stays
    // exactly the outline drawn for it.
    bevelOffset: -bevel,
    bevelThickness: bevel,
    bevelSegments: 8,
    curveSegments: 16,
  })
    .translate(0, 0, -(width - 2 * bevel) / 2)
    // u runs toward -z, from the tail at z = LENGTH / 2.
    .rotateY(Math.PI / 2)
    .translate(0, 0, LENGTH / 2);
  geometry.deleteAttribute("uv");
  form(geometry);
  return toCreasedNormals(geometry, 0.3);
}

// How much of its full half-width the car keeps at (u, y): it rounds in at
// the tail and (more) at the nose in plan; above the shoulder crease it
// leans in, through the glass to the roof; below the sill it tucks under.
// Measured against the Polo: 0.385 half-width up to the shoulder, 0.34 at
// the beltline, 0.25 at the roof.
function narrowing(u: number, y: number) {
  const tail = 0.26 * THREE.MathUtils.smoothstep(0.32 - u, 0, 0.32) ** 2;
  const nose = 0.46 * THREE.MathUtils.smoothstep(u, 1.45, LENGTH) ** 2.2;
  const lean = Math.max(0, y - SHOULDER) * 1.4;
  const tuck = 0.06 * (1 - THREE.MathUtils.smoothstep(y, 0.12, 0.24));
  return (1 - tail - nose) * (1 - lean - tuck);
}

function form(geometry: THREE.BufferGeometry) {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const u = LENGTH / 2 - position.getZ(i);
    position.setX(i, position.getX(i) * narrowing(u, position.getY(i)));
  }
}

const shape = (points: [number, number][]) => new THREE.Shape(points.map(([u, y]) => new THREE.Vector2(u, y)));

// The lower body: tail, beltline rising to the rear, the scuttle, bonnet and
// nose, with the wheel arches cut from the sill.
function bodyShape() {
  const sill = 0.12;
  const { arch, radius } = { arch: WHEEL.arch, radius: WHEEL.radius };
  const s = new THREE.Shape();
  s.moveTo(0.06, sill);
  s.quadraticCurveTo(0.0, sill, 0.0, 0.2);
  s.lineTo(0.0, 0.36);
  s.quadraticCurveTo(0.0, 0.44, 0.05, 0.456);
  s.lineTo(1.1, 0.405);
  s.quadraticCurveTo(1.18, 0.4, 1.25, 0.442);
  s.quadraticCurveTo(1.5, 0.43, 1.66, 0.385);
  s.quadraticCurveTo(1.78, 0.35, 1.785, 0.26);
  s.lineTo(1.78, 0.16);
  s.quadraticCurveTo(1.775, sill, 1.71, sill);
  s.lineTo(WHEEL.front + arch, sill);
  s.lineTo(WHEEL.front + arch, radius);
  s.absarc(WHEEL.front, radius, arch, 0, Math.PI, false);
  s.lineTo(WHEEL.front - arch, sill);
  s.lineTo(WHEEL.rear + arch, sill);
  s.lineTo(WHEEL.rear + arch, radius);
  s.absarc(WHEEL.rear, radius, arch, 0, Math.PI, false);
  s.lineTo(WHEEL.rear - arch, sill);
  s.closePath();
  return s;
}

// Paints every vertex of a geometry one colour, for merging parts that
// share a material.
function coloured(geometry: THREE.BufferGeometry, color: number) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g.attributes.uv) g.deleteAttribute("uv");
  const c = new THREE.Color(color);
  g.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: g.attributes.position.count }, () => [c.r, c.g, c.b]).flat(), 3));
  return g;
}

const rounded = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) - 1e-4);
const atU = (u: number) => LENGTH / 2 - u;
// The car's half-width at (u, y), on its surface.
const halfWidth = (u: number, y: number) => (WIDTH / 2) * narrowing(u, y);

function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.3, "rgba(255,255,255,0.6)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// The car's group carries its position and heading; `body` inside it takes
// roll, squat and idle shake.
export function createCar() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const shaded = (mesh: THREE.Mesh) => {
    mesh.castShadow = mesh.receiveShadow = true;
    body.add(mesh);
    return mesh;
  };

  // The painted shell and its glass, one mesh in vertex-coloured ink.
  const shell = ink({ vertexColors: true });
  const lower = sweep(bodyShape(), WIDTH, 0.06);
  // The glass band: rear screen, side windows and windscreen, sitting just
  // into the beltline so no seam shows.
  const greenhouse = sweep(
    shape([
      [0.05, 0.446],
      [0.3, 0.598],
      [0.97, 0.598],
      [1.25, 0.436],
      [1.1, 0.395],
    ]),
    WIDTH - 0.02,
    0.03,
  );
  const roof = sweep(
    shape([
      [0.27, 0.585],
      [0.31, 0.636],
      [0.93, 0.636],
      [0.99, 0.588],
    ]),
    WIDTH,
    0.04,
  );
  // The spoiler over the rear screen, and the broad C-pillar, its front edge
  // leaning forward, standing just proud of the glass at each side.
  const spoiler = sweep(shape([[0.235, 0.604], [0.25, 0.647], [0.36, 0.647], [0.36, 0.615]]), WIDTH - 0.04, 0.012);
  const pillar = sweep(shape([[0.09, 0.45], [0.32, 0.6], [0.5, 0.6], [0.4, 0.44]]), WIDTH - 0.008, 0.004);
  const lowerBox = new THREE.Box3().setFromBufferAttribute(lower.attributes.position as THREE.BufferAttribute);
  const tail = lowerBox.max.z;
  const nose = lowerBox.min.z;
  // Arch lips: a rounded rim round each wheel arch, proud of the side.
  const lips = [WHEEL.rear, WHEEL.front].flatMap((u) =>
    [-1, 1].map((s) =>
      new THREE.TorusGeometry(WHEEL.arch + 0.006, 0.02, 8, 28, Math.PI)
        .rotateY(Math.PI / 2)
        .translate(s * (halfWidth(u, 0.26) - 0.006), WHEEL.radius, atU(u)),
    ),
  );
  const parts = [
    coloured(lower, INKS.paint),
    coloured(greenhouse, INKS.glass),
    coloured(roof, INKS.paint),
    coloured(spoiler, INKS.paint),
    coloured(pillar, INKS.paint),
    ...lips.map((lip) => coloured(lip, INKS.paint)),
    // A dark diffuser under the rear bumper, and the front's lower intake.
    coloured(rounded(halfWidth(0.04, 0.15) * 2 - 0.04, 0.05, 0.06, 0.02).translate(0, 0.145, tail - 0.04), INKS.trim),
    coloured(rounded(0.42, 0.06, 0.04, 0.02).translate(0, 0.2, nose + 0.035), INKS.trim),
    // Sills, under the doors.
    ...[-1, 1].map((s) => coloured(rounded(0.03, 0.045, 0.66, 0.015).translate(s * (halfWidth(0.88, 0.14) - 0.004), 0.135, atU(0.87)), INKS.trim)),
    // A dark underside that fills the wheel arches.
    coloured(rounded(WIDTH - 0.12, 0.16, LENGTH - 0.3, 0.05).translate(0, 0.19, 0), INKS.trim),
    // The plate in its recess on the tailgate, the plain roundel above it.
    coloured(rounded(0.25, 0.08, 0.02, 0.012).translate(0, 0.305, tail - 0.012), INKS.recess),
    coloured(rounded(0.19, 0.044, 0.012, 0.006).translate(0, 0.305, tail - 0.002), INKS.plateRear),
    coloured(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 28).rotateX(Math.PI / 2).translate(0, 0.398, tail - 0.004), INKS.wheel),
    coloured(new THREE.CylinderGeometry(0.02, 0.02, 0.014, 24).rotateX(Math.PI / 2).translate(0, 0.398, tail - 0.003), INKS.recess),
    // The front plate, and the slim grille band joining the headlamps.
    coloured(rounded(0.2, 0.046, 0.012, 0.006).translate(0, 0.21, nose - 0.002), INKS.plateFront),
    coloured(rounded(halfWidth(1.74, 0.34) * 2 - 0.08, 0.034, 0.03, 0.012).translate(0, 0.34, nose + 0.035), INKS.trim),
    // Mirrors at the foot of the windscreen pillars.
    ...[-1, 1].map((s) => coloured(rounded(0.07, 0.045, 0.08, 0.02).translate(s * (halfWidth(1.12, 0.45) + 0.035), 0.455, atU(1.12)), INKS.paint)),
  ];
  shaded(new THREE.Mesh(mergeGeometries(parts), shell));
  for (const part of [greenhouse, roof, spoiler, pillar, ...lips]) part.dispose();

  // Taillights wide across the tail, wrapping round its corners, and
  // headlamps at each end of the grille band. Their glow follows the
  // palette (see applyPalette).
  const taillights: Ink[] = [ink({ color: INKS.lamp, emissive: 0xff3322, emissiveIntensity: 1 })];
  const tailY = 0.415;
  const tailX = halfWidth(0.03, tailY) - 0.1;
  for (const s of [-1, 1]) {
    const back = shaded(new THREE.Mesh(rounded(0.2, 0.07, 0.05, 0.024), taillights[0]));
    back.position.set(s * tailX, tailY, tail - 0.035);
    back.rotation.y = s * 0.38;
    const wrap = shaded(new THREE.Mesh(rounded(0.03, 0.06, 0.14, 0.014), taillights[0]));
    wrap.position.set(s * (halfWidth(0.12, tailY) - 0.002), tailY, atU(0.12));
  }
  const headlamp = ink({ color: INKS.headlamp, emissive: 0xffe6c4, emissiveIntensity: 0 });
  for (const s of [-1, 1]) {
    const lamp = shaded(new THREE.Mesh(rounded(0.13, 0.045, 0.06, 0.018), headlamp));
    lamp.position.set(s * (halfWidth(1.7, 0.34) - 0.07), 0.345, atU(1.71));
    lamp.rotation.y = -s * 0.35;
  }

  // Wheels, each on a pivot at its hub so it can roll about the axle.
  const tyre = ink({ color: INKS.tyre });
  const face = ink({ color: INKS.wheel });
  const slot = ink({ color: INKS.trim });
  const wheels: THREE.Object3D[] = [];
  for (const u of [WHEEL.rear, WHEEL.front]) {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * WHEEL.x, WHEEL.radius, atU(u));
      const spin = new THREE.Group();
      pivot.add(spin);
      const roll = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
        const mesh = new THREE.Mesh(geometry.rotateZ(Math.PI / 2), material);
        mesh.castShadow = mesh.receiveShadow = true;
        spin.add(mesh);
      };
      roll(new THREE.CylinderGeometry(WHEEL.radius, WHEEL.radius, WHEEL.width, 32), tyre);
      roll(new THREE.CylinderGeometry(0.085, 0.085, WHEEL.width + 0.006, 32), face);
      roll(
        mergeGeometries(
          [0, 1, 2, 3, 4].map((i) =>
            new THREE.BoxGeometry(0.03, WHEEL.width + 0.01, 0.018).translate(0.05, 0, 0).rotateY((i * 2 * Math.PI) / 5),
          ),
        ),
        slot,
      );
      body.add(pivot);
      // The engine turns these about x as the car rolls.
      wheels.push(spin);
    }
  }

  // Indicators: a glow at the outer end of each taillight.
  const blinkerMaterial = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: new THREE.Color(0xffa21a).multiplyScalar(6),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const blinkers = [new THREE.Sprite(blinkerMaterial), new THREE.Sprite(blinkerMaterial)] as const;
  blinkers.forEach((blinker, i) => {
    blinker.visible = false;
    blinker.scale.setScalar(0.16);
    blinker.position.set((i === 0 ? -1 : 1) * (tailX + 0.06), tailY, tail - 0.01);
    body.add(blinker);
  });

  // A soft contact shadow under the car, beneath the sun's own shadow.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  shadow.position.y = 0.006;
  shadow.scale.set(WIDTH * 1.3, 1, LENGTH * 1.12);
  group.add(shadow);

  // Red spill on the asphalt behind, and headlights down the road at dusk.
  const glow = new THREE.PointLight(0xff2a1f, 1, 3, 2);
  glow.position.set(0, tailY, tail + 0.35);
  group.add(glow);
  const headlights = [-1, 1].map((s) => {
    const light = new THREE.SpotLight(0xffe6c4, 0, 34, 0.42, 0.6, 1.4);
    light.position.set(s * WIDTH * 0.33, CAR_HEIGHT * 0.45, nose);
    light.target.position.set(s * WIDTH * 0.66, 0, nose - 12);
    group.add(light, light.target);
    return light;
  });

  function applyPalette(p: Palette) {
    for (const material of taillights) material.emissiveIntensity = p.taillight;
    glow.intensity = p.taillight * 0.35;
    headlamp.emissiveIntensity = p.headlights > 0 ? 1.4 : 0;
    for (const light of headlights) {
      light.visible = p.headlights > 0;
      light.intensity = p.headlights;
    }
  }

  return {
    group,
    body,
    wheels,
    blinkers,
    // Nothing to load: kept so the scenes can wait on it like their other parts.
    ready: Promise.resolve(),
    applyPalette,
    wheelRadius: WHEEL.radius,
    dispose() {},
  };
}

export type Car = ReturnType<typeof createCar>;
