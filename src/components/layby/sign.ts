import * as THREE from "three";
import {
  board,
  BORDER,
  LAYBY_BLUE,
  LEGEND_FONT_SIZE,
  legendWidth,
  MARGIN,
  outline,
  ROUTE_YELLOW,
  SW,
  TILE,
  TILE_TO_BASELINE,
  weather,
  type Art,
  type Fill,
} from "../road/sign";

// The lay-by's navigation: a route confirmation sign (TSM 7, 5.1), as seen
// just past a junction on a primary route: the route number in yellow at the
// top, then each destination, white on green.
// Dimensions are in stroke widths (sw), as in road/sign.ts. Each
// destination's line is a link; `rows` gives the band each one covers.

// Between lines of legend.
const LINE_GAP = 2;
// The route number stands a little clear of the destinations below it.
const ROUTE_GAP = 3;

export type RouteRow<T> = { item: T };

export function routeSignArt<T extends { label: string; href: string }>(route: string, rows: readonly RouteRow<T>[]) {
  const names = Math.max(...rows.map(({ item }) => legendWidth(item.label)));
  const width = Math.max(names, legendWidth(route)) + 2 * (BORDER + MARGIN);
  const texts: Art["texts"] = [];
  let y = BORDER + MARGIN;
  texts.push({ text: route, x: width / 2, y: y + TILE_TO_BASELINE, anchor: "middle", fill: "yellow" });
  y += TILE + ROUTE_GAP;
  const bands = rows.map(({ item }) => {
    texts.push({ text: item.label, x: BORDER + MARGIN, y: y + TILE_TO_BASELINE, anchor: "start", fill: "white" });
    const band = { item, top: y - LINE_GAP / 2, height: TILE + LINE_GAP };
    y += TILE + LINE_GAP;
    return band;
  });
  const height = y - LINE_GAP + MARGIN + BORDER;
  const { field, shapes } = board(width, height);
  const art: Art = { width, height, field, shapes, texts };
  return { art, rows: bands };
}

export type RouteSignArt<T extends { label: string; href: string } = { label: string; href: string }> = ReturnType<
  typeof routeSignArt<T>
>;

// Texture pixels per sw.
const PX = 32;

// The sign in the scene: the printed plate with a chamfered edge, rails
// behind, on two posts. Its face is centred on x = 0 at height
// `bottom + height / 2`, `z` in front of the posts; units are the world's.
export function createRouteSign(
  { art, rows }: RouteSignArt,
  { font, bottom, z, anisotropy }: { font: string; bottom: number; z: number; anisotropy: number },
) {
  const group = new THREE.Group();
  const w = art.width * SW;
  const h = art.height * SW;
  const centre = bottom + h / 2;
  let green = "#00703c";
  let highlight: { href: string | null; active: boolean } = { href: null, active: false };

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(art.width * PX);
  canvas.height = Math.round(art.height * PX);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  // Darkened: unlike the gantry's, this face takes the low sun head on,
  // which would bleach the green and bloom the border.
  const face = new THREE.MeshStandardMaterial({ map: texture, color: 0x9a9a9a, emissiveMap: texture, emissive: 0xffffff, roughness: 0.55 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.45 });
  // The posts are painted a dark grey, worn at the feet.
  const paint = new THREE.MeshStandardMaterial({ color: 0x4a4c4f, metalness: 0.4, roughness: 0.6 });

  const shape = outline(w, h, 2 * BORDER * SW);
  const faceGeometry = new THREE.ShapeGeometry(shape, 6);
  const uv = faceGeometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / w + 0.5, uv.getY(i) / h + 0.5);
  const plateFace = new THREE.Mesh(faceGeometry, face);
  plateFace.position.set(0, centre, z);
  group.add(plateFace);
  const depth = 0.03;
  const bevel = 0.012;
  const plate = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 6 }),
    metal,
  );
  plate.position.set(0, centre, z - depth - bevel - 0.0005);
  group.add(plate);
  const railZ = z - depth - 2 * bevel - 0.015;
  for (const at of [0.3, 0, -0.3]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.03, 0.03), metal);
    rail.position.set(0, centre + at * h, railZ);
    group.add(rail);
  }
  // Two posts, a third of the way in from each side, on flanged feet.
  const postTop = bottom + h * 0.92;
  for (const x of [-w * 0.3, w * 0.3]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, postTop, 14).translate(0, postTop / 2, 0), paint);
    post.position.set(x, 0, railZ - 0.05);
    group.add(post);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.03, 16).translate(0, 0.015, 0), paint);
    foot.position.set(x, 0, railZ - 0.05);
    group.add(foot);
  }
  group.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });

  function draw() {
    const fills: Record<Fill, string> = { white: "#ffffff", green, blue: LAYBY_BLUE, yellow: ROUTE_YELLOW };
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(PX, 0, 0, PX, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, art.width, art.height);
    for (const { d, fill } of art.shapes) {
      ctx.fillStyle = fills[fill];
      ctx.fill(new Path2D(d));
    }
    const row = rows.find(({ item }) => item.href === highlight.href);
    if (row) {
      ctx.fillStyle = `rgb(255 255 255 / ${highlight.active ? 0.2 : 0.12})`;
      ctx.beginPath();
      ctx.roundRect(BORDER + 0.6, row.top, art.width - 2 * BORDER - 1.2, row.height, 1);
      ctx.fill();
    }
    ctx.font = `${LEGEND_FONT_SIZE}px ${font}`;
    ctx.textBaseline = "alphabetic";
    for (const { text, x, y, anchor, fill } of art.texts) {
      ctx.textAlign = anchor === "middle" ? "center" : anchor === "end" ? "right" : "left";
      ctx.fillStyle = fills[fill];
      ctx.fillText(text, x, y);
    }
    weather(ctx, art.width, art.height, 3);
    texture.needsUpdate = true;
  }
  draw();
  const ready = document.fonts.load(`${LEGEND_FONT_SIZE * PX}px ${font}`).then(draw, draw);

  return {
    group,
    ready,
    // The face's centre, in the group's frame, for laying the links over it.
    centre: new THREE.Vector3(0, centre, z),
    setColors(sign: number, glow: number) {
      green = `#${sign.toString(16).padStart(6, "0")}`;
      face.emissiveIntensity = glow;
      draw();
    },
    // Lights the hovered destination's line, a little brighter once chosen.
    setHighlight(href: string | null, active: boolean) {
      if (highlight.href === href && highlight.active === active) return;
      highlight = { href, active };
      draw();
    },
  };
}
