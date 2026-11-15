import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { site } from "@/lib/site";
import { createPhone } from "../road/phone";
import { ROAD } from "../road/road";
import { ink } from "../scene/style";
import { canvasTexture, matte } from "../scene/util";
import { createRouteSign, routeSignArt } from "./sign";

// The things standing on the lay-by's verge: the route sign, the emergency
// telephone and the litter bin. The contact page looks straight at them
// (see world.ts); the home page sees the same props in the same places, down
// the road past the gantry, as scenery only (see road/world.ts).
const M = ROAD.metre;
const KERB = ROAD.layby.back - 0.125 * M;

// The contact page's camera: out on the carriageway, looking straight
// across the lay-by at the verge, side on. The props turn to face it.
export const EYE = new THREE.Vector3(0.4, 0.75, -14.3);
export const LOOK = new THREE.Vector3(-6, 0.65, -14.5);

// Along the verge, just behind the kerb, left to right as the contact page
// sees them (down -z): the route sign standing back on the bank, the
// emergency telephone near the middle of the shot, then the litter bin.
// `bottom` is the sign's lower edge, about 1.8 m up.
export const ROUTE_SIGN = { x: -4.5, z: -11.8, bottom: 0.78 };
const PHONE = { x: KERB - 0.35, z: -13.4 };
const BIN = { x: KERB - 0.45, z: -14.9 };

// The contact page's navigation is the route sign: a route confirmation
// sign on the bank, like those just past a junction on an A-road, giving a
// route number, then everywhere but here, top to bottom. Change the route
// number freely.
const ROUTE = "T1";
export const routeSign = routeSignArt(
  ROUTE,
  site.nav.filter((item) => item.href !== "/contact").map((item) => ({ item })),
);

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
    ink({ map: binTexture(), roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }),
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
  const plastic = ink({ color: 0x151517, roughness: 0.32, metalness: 0.1 });
  const sack = new THREE.Mesh(bag, plastic);
  sack.scale.set(0.22 * M, 0.3 * M, 0.2 * M);
  sack.position.set(R + 0.18 * M, 0.25 * M, 0.12 * M);
  sack.rotation.set(0.1, 0.4, -0.25);
  group.add(sack);
  group.add(new THREE.Mesh(new THREE.ConeGeometry(0.035 * M, 0.12 * M, 8).translate(R + 0.24 * M, 0.58 * M, 0.12 * M), plastic));

  const can = new THREE.Mesh(
    new THREE.CylinderGeometry(0.033 * M, 0.033 * M, 0.12 * M, 14).rotateZ(Math.PI / 2),
    ink({ color: 0xc8202a, roughness: 0.3, metalness: 0.7 }),
  );
  can.position.set(-0.5 * M, 0.033 * M, 0.45 * M);
  can.rotation.y = 0.7;
  group.add(can);
  return shadowed(group);
}

export type LaybyProps = ReturnType<typeof createLaybyProps>;

// Builds the props on the verge, at ground height `groundY`. `post` is the
// galvanised steel of the phone's post.
export function createLaybyProps({
  rand,
  groundY,
  font,
  anisotropy,
  post,
}: {
  rand: () => number;
  groundY: number;
  font: string;
  anisotropy: number;
  post: THREE.Material;
}) {
  const group = new THREE.Group();
  // Everything on the verge turns to face the contact page's camera, the
  // phone a little further so it shows its side.
  const facing = (x: number, z: number) => Math.atan2(EYE.x - x, EYE.z - z);
  const phone = createPhone({ post });
  phone.group.position.set(PHONE.x, groundY, PHONE.z);
  // A touch over life size, so it holds its own in the shot.
  phone.group.scale.setScalar(1.25);
  phone.group.rotation.y = facing(PHONE.x, PHONE.z) + 0.35;
  group.add(phone.group);
  const bin = createBin(rand);
  bin.position.set(BIN.x, groundY, BIN.z);
  bin.rotation.y = facing(BIN.x, BIN.z);
  group.add(bin);

  // The route sign, back on the bank, square to the contact page's camera.
  const sign = createRouteSign(routeSign, { font, bottom: ROUTE_SIGN.bottom, z: 0.12, anisotropy });
  sign.group.position.set(ROUTE_SIGN.x, groundY, ROUTE_SIGN.z);
  sign.group.rotation.y = facing(ROUTE_SIGN.x, ROUTE_SIGN.z);
  group.add(sign.group);

  // Where nothing should grow: the props' footprints.
  const footprints = [
    [PHONE.x, PHONE.z, 0.2],
    [BIN.x, BIN.z, 0.35],
    [ROUTE_SIGN.x - 0.45, ROUTE_SIGN.z, 0.12],
    [ROUTE_SIGN.x + 0.45, ROUTE_SIGN.z, 0.12],
  ];
  const occupied = (x: number, z: number) => footprints.some(([fx, fz, r]) => Math.hypot(x - fx, z - fz) < r);

  return { group, phone, sign, occupied, ready: sign.ready };
}
