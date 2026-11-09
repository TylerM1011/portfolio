import * as THREE from "three";
import { ROAD } from "./road";

// The gantry's direction signs, designed to the Traffic Signs Manual,
// Chapter 7 (2018). Every dimension is in stroke widths (sw), a quarter of
// the x-height, and is measured to the letter tiles rather than the letters.
// Legends are Transport Medium, white on primary route green (TSM 7, 2.1.1).
// The scene paints each panel from panelArt(); the HTML sign in RoadScene
// (which stays in place, invisible, as the links) renders the same art as
// SVG for browsers without WebGL.

// A 250 mm x-height, for advance direction signs on a high standard
// all-purpose dual carriageway (TSM 7, Appendix E), in world units.
export const SW = (0.25 / 4) * ROAD.metre;

const BORDER = 1.5; // 2.5.4, with an inside corner radius to match
const TILE = 8; // 2.2.3: twice the x-height
const MARGIN = 2.5; // legend to border (Figure 2-4) and between elements
const SKY = 2; // 9.1.9: added to the top of a sign seen against open sky
const WORD_SPACE = 2.5; // 2.3.2

// Transport Medium's letter tiles in sw, from the font's advances (the
// widths in the Schedule 17 working drawings), so the HTML sign can be laid
// out before the font loads.
const TILE_WIDTHS = new Map(
  (
    "a4.41 b4.66 c4.1 d4.74 e4.34 f2.99 g4.53 h4.47 i2.13 j2.31 k4.31 l2.47 m6.54 n4.46 o4.72 p4.72 q4.71 " +
    "r3.19 s3.85 t3.22 u4.59 v3.9 w5.85 x4.15 y3.91 z3.87 A5.43 B5.85 C5.88 D6.15 E5.25 F4.74 G6.18 H6.4 " +
    "I2.9 J3.71 K5.51 L4.26 M7.34 N6.71 O6.22 P5.18 Q6.31 R5.63 S5.46 T4.35 U6.15 V5.19 W7.24 X5.1 Y4.91 " +
    "Z4.75 05.31 13.15 24.79 35.07 45.25 54.87 65.03 74.15 85.18 95.1 &5.03 '1.56 (4.19 )4.19 ,2.6 -2.62 " +
    ".2.12 /3.1 :2.12 ?5.51 !3.38"
  )
    .split(" ")
    .map((entry) => [entry[0], Number(entry.slice(1))]),
);

function legendWidth(text: string) {
  return [...text].reduce((width, c) => width + (c === " " ? WORD_SPACE : (TILE_WIDTHS.get(c) ?? 4.5)), 0);
}

// The font's em is 7.53 sw, and its letters sit 6.8 sw below the top of
// their tile (the x-height centred on the tile, 2.2.4); capitals are centred
// 3.6 sw above the baseline.
export const LEGEND_FONT_SIZE = 2048 / 272;
const TILE_TO_BASELINE = 1850 / 272;
const CAP_MIDDLE = 978 / 272;

// The standard arrow (Figure 4-4): 16 sw long and 8 sw across, pointing
// left. Its head is a chevron 4 sw deep, with every edge at 45°, and the
// shaft is the middle third.
const STANDARD_ARROW = [
  [0, 4],
  [4, 0],
  [8, 0],
  [16 / 3, 8 / 3],
  [16, 8 / 3],
  [16, 16 / 3],
  [16 / 3, 16 / 3],
  [8, 8],
  [4, 8],
];
// The lane drop sign's downward arrow (Figure 9-3): 17 by 7 sw, inset
// 0.5 sw in its 18 by 8 sw tile.
const LANE_ARROW = [
  [6.5, 0],
  [10.5, 0],
  [10.5, 2.53],
  [17, 1],
  [8.5, 7],
  [0, 1],
  [6.5, 2.53],
];
const LANE_ARROW_TILE = { width: 18, height: 8 };

// The lay-by symbol's blue.
export const LAYBY_BLUE = "#1d5bab";

export type SignItem = { label: string; lateral: number };
type Fill = "white" | "green" | "blue";
export type Art = {
  width: number;
  height: number;
  // The green field inside the border, for the hover highlight.
  field: string;
  shapes: { d: string; fill: Fill }[];
  texts: { text: string; x: number; y: number; anchor: "start" | "middle"; fill: Fill }[];
};

const n = (v: number) => +v.toFixed(3);

function rounded(x: number, y: number, w: number, h: number, r: number) {
  const arc = (ex: number, ey: number) => `A${r} ${r} 0 0 1 ${n(ex)} ${n(ey)}`;
  return (
    `M${n(x + r)} ${n(y)}H${n(x + w - r)}${arc(x + w, y + r)}V${n(y + h - r)}${arc(x + w - r, y + h)}` +
    `H${n(x + r)}${arc(x, y + h - r)}V${n(y + r)}${arc(x + r, y)}Z`
  );
}

function polygon(points: number[][], dx = 0, dy = 0) {
  return `M${points.map(([x, y]) => `${n(x + dx)} ${n(y + dy)}`).join("L")}Z`;
}

// Turns an arrow clockwise by `degrees` and moves its bounding box to the
// origin, returning the points and the box's size.
function turn(points: number[][], degrees: number) {
  const a = THREE.MathUtils.degToRad(degrees);
  const turned = points.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
  const xs = turned.map(([x]) => x);
  const ys = turned.map(([, y]) => y);
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
  return {
    points: turned.map(([x, y]) => [x - minX, y - minY]),
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

// A sign's border and field.
function board(width: number, height: number) {
  const field = rounded(BORDER, BORDER, width - 2 * BORDER, height - 2 * BORDER, BORDER);
  const shapes: Art["shapes"] = [
    { d: rounded(0, 0, width, height, 2 * BORDER), fill: "white" },
    { d: field, fill: "green" },
  ];
  return { field, shapes };
}

// A lane drop sign (Figure 9-1): the legend, a bar 2.5 sw in from each side
// border, and the downward arrow centred beneath, the whole sign at least
// `minWidth` wide so it spans its lane (9.1.4).
function laneArt(item: SignItem, minWidth: number): Art {
  const label = legendWidth(item.label);
  const width = Math.max(minWidth, label + 2 * (MARGIN + BORDER));
  const tileTop = BORDER + MARGIN + SKY;
  const bar = tileTop + TILE + 1.5;
  const arrowTop = bar + 1 + 2.5;
  const height = arrowTop + LANE_ARROW_TILE.height + MARGIN + BORDER;
  const { field, shapes } = board(width, height);
  const inset = (LANE_ARROW_TILE.width - 17) / 2;
  shapes.push(
    {
      d: polygon([
        [BORDER + MARGIN, bar],
        [width - BORDER - MARGIN, bar],
        [width - BORDER - MARGIN, bar + 1],
        [BORDER + MARGIN, bar + 1],
      ]),
      fill: "white",
    },
    { d: polygon(LANE_ARROW, width / 2 - 8.5, arrowTop + inset), fill: "white" },
  );
  return {
    width,
    height,
    field,
    shapes,
    texts: [{ text: item.label, x: width / 2, y: tileTop + TILE_TO_BASELINE, anchor: "middle", fill: "white" }],
  };
}

// The lay-by exit, designed as a stack-type sign (9.1.3, 4.2.1): the arrow
// half left, centred vertically with at least 2.5 sw above and below, then
// the lay-by symbol, which always goes to the left of its legend (4.2.6).
// The legend leaves 1 sw more above it than below, and the symbol sits
// alongside its tiles, raised 0.5 sw (3.5).
function exitArt(item: SignItem): Art {
  const arrow = turn(
    STANDARD_ARROW.map(([x, y]) => [x - 8, y - 4]),
    45,
  );
  const top = BORDER + SKY;
  const inner = arrow.height + 2 * MARGIN;
  const height = top + inner + BORDER;
  const tileTop = top + (inner - TILE + 1) / 2;
  const arrowLeft = BORDER + MARGIN;
  const symbolLeft = arrowLeft + arrow.width + MARGIN;
  const legendLeft = symbolLeft + TILE + MARGIN;
  const width = legendLeft + legendWidth(item.label) + MARGIN + BORDER;
  const { field, shapes } = board(width, height);
  // The symbol is treated as a panel: a 0.5 sw white edge with a 1 sw
  // inside corner radius (3.3.1).
  const symbolTop = tileTop - 0.5;
  shapes.push(
    { d: polygon(arrow.points, arrowLeft, top + MARGIN), fill: "white" },
    { d: rounded(symbolLeft, symbolTop, TILE, TILE, 1.5), fill: "white" },
    { d: rounded(symbolLeft + 0.5, symbolTop + 0.5, TILE - 1, TILE - 1, 1), fill: "blue" },
  );
  return {
    width,
    height,
    field,
    shapes,
    texts: [
      { text: "P", x: symbolLeft + TILE / 2, y: symbolTop + TILE / 2 + CAP_MIDDLE, anchor: "middle", fill: "white" },
      { text: item.label, x: legendLeft, y: tileTop + TILE_TO_BASELINE, anchor: "start", fill: "white" },
    ],
  };
}

// lateral below 0 is the lay-by; the rest are lanes. `minWidth` is in sw.
export function panelArt(item: SignItem, minWidth = 0) {
  return item.lateral < 0 ? exitArt(item) : laneArt(item, minWidth);
}

// One panel of a ground-mounted stack-type sign (TSM 7, 4.2): the standard
// arrow, then the legend. lateral below 0 points left, above 0 right, and 0
// points down, back the way the car came. The arrow sits in a 16 sw slot so
// legends line up down the stack; `size` (in sw) lets every panel match the
// largest.
export function directionArt(item: SignItem, size = { width: 0, height: 0 }): Art {
  const arrow = turn(STANDARD_ARROW, item.lateral < 0 ? 0 : item.lateral > 0 ? 180 : -90);
  const slot = 16;
  const inner = Math.max(TILE, arrow.height) + 2 * MARGIN;
  const height = Math.max(size.height, inner + 2 * BORDER);
  const legendLeft = BORDER + MARGIN + slot + MARGIN;
  const width = Math.max(size.width, legendLeft + legendWidth(item.label) + MARGIN + BORDER);
  const { field, shapes } = board(width, height);
  shapes.push({ d: polygon(arrow.points, BORDER + MARGIN + (slot - arrow.width) / 2, (height - arrow.height) / 2), fill: "white" });
  return {
    width,
    height,
    field,
    shapes,
    texts: [{ text: item.label, x: legendLeft, y: (height - TILE) / 2 + TILE_TO_BASELINE, anchor: "start", fill: "white" }],
  };
}

// Texture pixels per sw.
const PX = 40;

// Seeded, so the weathering is the same on every visit and every redraw.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Grime settled toward the bottom edge, and rain streaks running down from
// the top.
function weather(ctx: CanvasRenderingContext2D, width: number, height: number, seed: number) {
  const rand = rng(seed);
  const grime = ctx.createLinearGradient(0, height * 0.55, 0, height);
  grime.addColorStop(0, "rgb(60 50 35 / 0)");
  grime.addColorStop(1, "rgb(60 50 35 / 0.16)");
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < width / 4; i++) {
    const x = rand() * width;
    const w = 0.25 + rand() * 0.8;
    const length = 3 + rand() ** 2 * 15;
    const streak = ctx.createLinearGradient(0, 0, 0, length);
    streak.addColorStop(0, `rgb(40 35 30 / ${0.05 + rand() * 0.08})`);
    streak.addColorStop(1, "rgb(40 35 30 / 0)");
    ctx.fillStyle = streak;
    ctx.fillRect(x, 0, w, length);
  }
}

// Years of neglect, for signs left out on a building site: sheeting
// bleached by the sun, mud thrown up from the ground, flakes chipped and
// peeled back to the aluminium (mostly at the edges), rust weeping from the
// fixings, scratches, and lichen along the top. `wear` scales it all, 0 to 1.
function wearDown(ctx: CanvasRenderingContext2D, width: number, height: number, seed: number, wear: number) {
  const rand = rng(seed * 31 + 5);
  const dot = (x: number, y: number, r: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  ctx.fillStyle = `rgb(232 226 204 / ${0.28 * wear})`;
  ctx.fillRect(0, 0, width, height);

  // Broad stains of dirt where water has sat on the face.
  for (let i = 0; i < (width / 6) * wear; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const r = 1.5 + rand() * 4;
    const stain = ctx.createRadialGradient(x, y, 0, x, y, r);
    stain.addColorStop(0, `rgb(66 56 38 / ${0.12 + rand() * 0.16})`);
    stain.addColorStop(1, "rgb(66 56 38 / 0)");
    ctx.fillStyle = stain;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }

  const mud = ctx.createLinearGradient(0, height * 0.35, 0, height);
  mud.addColorStop(0, "rgb(84 64 40 / 0)");
  mud.addColorStop(1, `rgb(84 64 40 / ${0.55 * wear})`);
  ctx.fillStyle = mud;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < width * 10 * wear; i++) {
    dot(rand() * width, height - rand() ** 2 * height * 0.75, 0.08 + rand() * 0.35, `rgb(70 52 32 / ${0.15 + rand() * 0.3})`);
  }

  // Rust creeping in from the bottom edge.
  for (let i = 0; i < (width / 3) * wear; i++) {
    const x = rand() * width;
    const r = 0.6 + rand() * 1.8;
    const creep = ctx.createRadialGradient(x, height, 0, x, height, r * 1.6);
    creep.addColorStop(0, `rgb(120 58 20 / ${0.45 + rand() * 0.3})`);
    creep.addColorStop(1, "rgb(120 58 20 / 0)");
    ctx.fillStyle = creep;
    ctx.fillRect(x - r * 1.6, height - r * 1.6, r * 3.2, r * 1.6);
  }

  for (let i = 0; i < Math.round((width / 2.5) * wear); i++) {
    let x = rand() * width;
    let y = rand() * height;
    if (rand() < 0.7) {
      const side = Math.floor(rand() * 4);
      if (side === 0) y = rand() * 1.5;
      else if (side === 1) y = height - rand() * 1.5;
      else if (side === 2) x = rand() * 1.5;
      else x = width - rand() * 1.5;
    }
    const r = 0.5 + rand() ** 2 * 3.2;
    const points = 7 + Math.floor(rand() * 5);
    ctx.beginPath();
    for (let k = 0; k < points; k++) {
      const a = (k / points) * Math.PI * 2;
      const reach = r * (0.45 + rand() * 0.75);
      ctx.lineTo(x + Math.cos(a) * reach, y + Math.sin(a) * reach * 0.8);
    }
    ctx.closePath();
    ctx.fillStyle = "#a9aca6";
    ctx.fill();
    ctx.strokeStyle = "rgb(60 58 52 / 0.45)";
    ctx.lineWidth = 0.12;
    ctx.stroke();
  }

  // The fixings sit where the rails cross the uprights behind (see
  // createGantrySign).
  for (const fx of [0.2, 0.8]) {
    for (const fy of [0.25, 0.75]) {
      const x = fx * width + (rand() - 0.5) * 0.6;
      const y = fy * height;
      const length = (5 + rand() * 9) * wear;
      const streak = ctx.createLinearGradient(0, y, 0, y + length);
      streak.addColorStop(0, `rgb(128 62 22 / ${0.85 * wear})`);
      streak.addColorStop(0.4, `rgb(128 62 22 / ${0.45 * wear})`);
      streak.addColorStop(1, "rgb(128 62 22 / 0)");
      ctx.fillStyle = streak;
      ctx.fillRect(x - 0.55, y, 1.1 + rand() * 0.6, length);
      dot(x, y, 0.9, "rgb(140 72 30 / 0.7)");
      dot(x, y, 0.4, "#5f574e");
    }
  }

  ctx.lineCap = "round";
  for (let i = 0; i < width * 0.6 * wear; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const a = rand() * Math.PI;
    const length = 0.8 + rand() * 4;
    ctx.strokeStyle = `rgb(235 235 225 / ${0.15 + rand() * 0.25})`;
    ctx.lineWidth = 0.05 + rand() * 0.08;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * length, y + Math.sin(a) * length);
    ctx.stroke();
  }

  for (let i = 0; i < 6 * wear; i++) {
    const x = rand() * width;
    for (let k = 0; k < 4; k++) {
      dot(x + (rand() - 0.5) * 1.6, rand() * 2.2, 0.2 + rand() * 0.6, `rgb(168 170 92 / ${0.2 + rand() * 0.2})`);
    }
  }
}

// A plate outline in world units, centred on the origin.
function outline(width: number, height: number, radius: number) {
  const shape = new THREE.Shape();
  const [x, y] = [-width / 2, -height / 2];
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

export type GantryPanel<T extends SignItem = SignItem> = {
  item: T;
  art: Art;
  left: number;
  right: number;
  top: number;
  // Turned about its centre (radians, anticlockwise), as if worked loose.
  tilt?: number;
};

// The gantry's sign panels: each an aluminium plate with rounded corners and
// a chamfered edge that catches the light, its printed face, stiffening
// rails and uprights behind (the uprights clamp onto the truss), and a lamp
// on top. Faces sit at `z`; `metal` dresses everything but the faces.
// `wear` (0 to 1) runs the panels down well past ordinary weathering.
export function createGantrySign(
  panels: readonly GantryPanel[],
  { font, z, metal, anisotropy, lamps = true, wear = 0 }: {
    font: string;
    z: number;
    metal: THREE.Material;
    anisotropy: number;
    // Gantry signs are lit from above; post-mounted ones go without.
    lamps?: boolean;
    wear?: number;
  },
) {
  const group = new THREE.Group();
  let green = "#00703c";
  let highlight: { lateral: number | null; active: boolean } = { lateral: null, active: false };

  const drawn = panels.map(({ item, art, left, right, top, tilt = 0 }, i) => {
    const w = right - left;
    const h = art.height * SW;
    // Everything below is placed relative to the panel's centre.
    const panel = new THREE.Group();
    panel.position.set((left + right) / 2, top - h / 2, 0);
    panel.rotation.z = tilt;
    group.add(panel);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(art.width * PX);
    canvas.height = Math.round(art.height * PX);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;

    // Retroreflective sheeting: lit by the scene, but also glowing a little
    // (faked) so it reads with the sun behind the gantry.
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: 0xffffff,
      roughness: 0.4,
      metalness: 0,
    });

    const shape = outline(w, h, 2 * BORDER * SW);
    const faceGeometry = new THREE.ShapeGeometry(shape, 6);
    // ShapeGeometry's UVs are its x/y; map them onto the texture.
    const uv = faceGeometry.attributes.uv;
    for (let v = 0; v < uv.count; v++) uv.setXY(v, uv.getX(v) / w + 0.5, uv.getY(v) / h + 0.5);
    const face = new THREE.Mesh(faceGeometry, material);
    face.position.set(0, 0, z);
    panel.add(face);

    // The bevel's front edge is the face's outline; it widens backwards from
    // there, so the chamfer shows as a rim around the face.
    const depth = 0.03;
    const bevel = 0.012;
    const thickness = depth + 2 * bevel;
    const plate = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelSize: bevel,
        bevelThickness: bevel,
        bevelSegments: 2,
        curveSegments: 6,
      }),
      metal,
    );
    plate.position.set(0, 0, z - depth - bevel - 0.0005);
    panel.add(plate);

    // Horizontal rails behind the plate, a quarter of the way in from its
    // top and bottom, and uprights behind them reaching back to the truss.
    const railZ = z - thickness - 0.015;
    for (const at of [0.25, -0.25]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.03, 0.03), metal);
      rail.position.set(0, at * h, railZ);
      panel.add(rail);
    }
    for (const x of [-w * 0.3, w * 0.3]) {
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.04, h / 2 + 0.03, 0.04), metal);
      upright.position.set(x, 0, railZ - 0.035);
      panel.add(upright);
    }

    if (lamps) {
      // A lamp on a short stem above the panel, its arm reaching out to hang
      // the housing over the face, tipped down toward it.
      const lamp = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.1, 0.014), metal);
      stem.position.set(0, h / 2 + 0.05, z - thickness / 2);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.1), metal);
      arm.position.set(0, h / 2 + 0.1, z - thickness / 2 + 0.05);
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.022, 0.05), metal);
      housing.position.set(0, h / 2 + 0.095, z + 0.07);
      housing.rotation.x = 0.35;
      lamp.add(stem, arm, housing);
      panel.add(lamp);
    }

    return { item, art, canvas, texture, material, seed: 7 + i };
  });

  group.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });

  function draw() {
    const fills: Record<Fill, string> = { white: "#ffffff", green, blue: LAYBY_BLUE };
    for (const { item, art, canvas, texture, seed } of drawn) {
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(PX, 0, 0, PX, 0, 0);
      // White to the very edge, so filtering never pulls in a dark fringe
      // around the plate's rounded corners.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, art.width, art.height);
      // Path2D is browser-only, so the art is turned into paths here.
      for (const { d, fill } of art.shapes) {
        ctx.fillStyle = fills[fill];
        ctx.fill(new Path2D(d));
      }
      ctx.font = `${LEGEND_FONT_SIZE}px ${font}`;
      ctx.textBaseline = "alphabetic";
      for (const { text, x, y, anchor, fill } of art.texts) {
        ctx.textAlign = anchor === "middle" ? "center" : "left";
        ctx.fillStyle = fills[fill];
        ctx.fillText(text, x, y);
      }
      if (item.lateral === highlight.lateral) {
        ctx.fillStyle = `rgb(255 255 255 / ${highlight.active ? 0.2 : 0.12})`;
        ctx.fill(new Path2D(art.field));
      }
      weather(ctx, art.width, art.height, seed);
      if (wear > 0) wearDown(ctx, art.width, art.height, seed, wear);
      texture.needsUpdate = true;
    }
  }
  draw();

  // The font is already in use on the page; redraw once it has loaded.
  const ready = document.fonts.load(`${LEGEND_FONT_SIZE * PX}px ${font}`).then(draw, draw);

  return {
    group,
    ready,
    setColors(sign: number, glow: number) {
      green = `#${sign.toString(16).padStart(6, "0")}`;
      for (const { material } of drawn) material.emissiveIntensity = glow;
      draw();
    },
    // Lights up the hovered destination's panel, a little brighter once chosen.
    setHighlight(lateral: number | null, active: boolean) {
      if (highlight.lateral === lateral && highlight.active === active) return;
      highlight = { lateral, active };
      draw();
    },
  };
}
