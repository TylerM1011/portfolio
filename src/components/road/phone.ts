import * as THREE from "three";
import { ink } from "../scene/style";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ROAD } from "./road";
import { canvasTexture, matte } from "./world";

// The roadside emergency telephone, shared by the lay-by (contact page) and
// the yard (projects page): the model, and the rig that makes it behave.
// Picking it up opens the door and pushes the camera in on it, and the dial
// comes up over it (see PhoneDial).
const M = ROAD.metre;

// Draws a telephone handset, centred at (x, y), r across, turned so its
// earpiece is at the top left (as on the SOS signs).
function handset(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  ctx.lineCap = "round";
  ctx.lineWidth = r * 0.32;
  ctx.beginPath();
  ctx.arc(0, r * 0.55, r * 0.95, Math.PI * 1.22, Math.PI * 1.78);
  ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * r * 0.62, -r * 0.08);
    ctx.rotate(side * 0.55);
    ctx.beginPath();
    ctx.roundRect(-r * 0.24, -r * 0.12, r * 0.48, r * 0.5, r * 0.16);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// The door: an orange flap with "SOS" on a white plate, a handset, and the
// instruction to pull it open.
function doorTexture() {
  return canvasTexture(256, 320, (ctx) => {
    ctx.fillStyle = "#ec7a1c";
    ctx.fillRect(0, 0, 256, 320);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 236, 300);
    ctx.save();
    ctx.fillStyle = "#f7f4ec";
    ctx.beginPath();
    ctx.roundRect(34, 34, 188, 80, 10);
    ctx.fill();
    ctx.fillStyle = "#151515";
    ctx.font = "800 64px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SOS", 128, 77);
    ctx.restore();
    handset(ctx, 128, 182, 62, "#151515");
    ctx.fillStyle = "#151515";
    ctx.font = "700 20px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PULL TO OPEN", 128, 266);
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(36, 150, 14, 52);
  });
}

// A card stuck inside the door, read once it swings open: the numbers the
// dial reaches (see PhoneDial).
function cardTexture() {
  return canvasTexture(256, 160, (ctx) => {
    ctx.fillStyle = "#f6f3ea";
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = "#151515";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = "800 22px system-ui, sans-serif";
    ctx.fillText("DIAL", 128, 26);
    ctx.fillRect(28, 44, 200, 3);
    ctx.font = "700 26px system-ui, sans-serif";
    [
      ["0", "CV"],
      ["1", "LINKEDIN"],
      ["2", "GITHUB"],
    ].forEach(([digit, name], i) => {
      ctx.textAlign = "left";
      ctx.fillText(digit, 36, 72 + i * 32);
      ctx.fillText(name, 76, 72 + i * 32);
    });
  });
}

// The box around everything in `root`, in root's own frame.
function localBounds(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const bounds = new THREE.Box3();
  const part = new THREE.Box3();
  const relative = new THREE.Matrix4();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.computeBoundingBox();
    part.copy(child.geometry.boundingBox!).applyMatrix4(relative.multiplyMatrices(inverse, child.matrixWorld));
    bounds.union(part);
  });
  return bounds;
}

export type PhoneState = { open: number; lift: number; ring: number };
export type Phone = ReturnType<typeof createPhone>;

// The emergency telephone: an orange housing on a post, its door hinged on
// the right (away from the camera). Behind the door, the handset on its hook
// and a card. The same phone stands in the lay-by and by the yard's gate.
export function createPhone({ post }: { post: THREE.Material }) {
  const W = 0.5 * M;
  const H = 0.62 * M;
  const D = 0.3 * M;
  const T = 0.025 * M;
  const POST = 0.82 * M;
  const orange = ink({ color: 0xec7a1c });
  const inside = matte({ color: 0x1e2024 });
  const black = ink({ color: 0x141414 });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.36 * M, 0.08 * M, 0.36 * M).translate(0, 0.04 * M, 0), matte({ color: 0xa9a59c })));
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.09 * M, POST, 0.09 * M).translate(0, POST / 2, 0), post));
  const box = new THREE.Group();
  box.position.y = POST;
  group.add(box);
  // The shell, open at the front: back, sides, bottom and a hood.
  const hood = new THREE.BoxGeometry(W + 0.06 * M, 0.05 * M, D + 0.1 * M);
  box.add(
    new THREE.Mesh(
      mergeGeometries([
        new THREE.BoxGeometry(W, H, T).translate(0, H / 2, -D / 2 + T / 2),
        new THREE.BoxGeometry(T, H, D).translate(-W / 2 + T / 2, H / 2, 0),
        new THREE.BoxGeometry(T, H, D).translate(W / 2 - T / 2, H / 2, 0),
        new THREE.BoxGeometry(W, T, D).translate(0, T / 2, 0),
        hood.translate(0, H + 0.025 * M, 0.03 * M),
      ]),
      orange,
    ),
  );
  box.add(new THREE.Mesh(new THREE.BoxGeometry(W - 2 * T, H - 2 * T, 0.004).translate(0, H / 2, -D / 2 + T + 0.002), inside));

  // The handset, hanging on its hook against the back wall.
  const phone = new THREE.Group();
  phone.position.set(-0.13 * M, H * 0.55, -D / 2 + T + 0.03 * M);
  phone.add(
    new THREE.Mesh(
      mergeGeometries([
        new THREE.BoxGeometry(0.06 * M, 0.3 * M, 0.05 * M),
        new THREE.BoxGeometry(0.1 * M, 0.08 * M, 0.08 * M).translate(0, 0.17 * M, 0.02 * M),
        new THREE.BoxGeometry(0.1 * M, 0.08 * M, 0.08 * M).translate(0, -0.17 * M, 0.02 * M),
      ]),
      black,
    ),
  );
  box.add(phone);
  box.add(new THREE.Mesh(new THREE.BoxGeometry(0.03 * M, 0.06 * M, 0.06 * M).translate(-0.13 * M, H * 0.55 + 0.2 * M, -D / 2 + T + 0.03 * M), post));
  // A coiled cord, down to the box's floor.
  const cord = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(
        Array.from({ length: 40 }, (_, i) => {
          const t = i / 39;
          const a = t * Math.PI * 18;
          return new THREE.Vector3(
            -0.13 * M + 0.08 * M * t + Math.cos(a) * 0.012 * M,
            H * 0.55 - 0.2 * M - t * 0.12 * M + Math.sin(a) * 0.012 * M,
            -D / 2 + T + 0.04 * M,
          );
        }),
      ),
      80,
      0.006 * M,
      5,
    ),
    black,
  );
  box.add(cord);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.22 * M, 0.14 * M), matte({ map: cardTexture() }));
  card.position.set(0.09 * M, H * 0.6, -D / 2 + T + 0.006);
  box.add(card);

  // The door swings out from its hinge on the right.
  const door = new THREE.Group();
  door.position.set(W / 2, 0, D / 2);
  const face = ink({ map: doorTexture() });
  const doorInside = ink({ color: 0xd56c16 });
  door.add(
    new THREE.Mesh(new THREE.BoxGeometry(W, H, T).translate(-W / 2, H / 2, -T / 2), [orange, orange, orange, orange, face, doorInside]),
  );
  box.add(door);

  group.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;
  });

  // What the HTML button covers on screen, and what the camera closes in
  // on: everything above the post, door shut, in the box's own frame.
  const bounds = localBounds(box);

  // `open` (0 shut, 1 wide) and `lift` (handset off the hook, 0 to 1) are
  // eased toward by the rig; `ring` shakes the box.
  const handsetRest = phone.position.clone();
  function update(time: number, state: PhoneState) {
    door.rotation.y = state.open * 1.9;
    phone.position.set(handsetRest.x + state.lift * 0.04, handsetRest.y + state.lift * 0.05, handsetRest.z + state.lift * 0.16);
    phone.rotation.set(state.lift * 0.5, 0, state.lift * -0.6);
    box.rotation.z = Math.sin(time * 55) * 0.018 * state.ring;
    box.position.x = Math.sin(time * 47) * 0.003 * state.ring;
  }

  return { group, box, bounds, update };
}

// The phone rings for this long every RING_EVERY seconds, until the visitor
// has had a go at it. The door stays open this long after a call.
const RING_EVERY = 7;
const RING_FOR = 1.1;
const CALL_HOLD = 6;
// Picking up the phone, the camera pushes in on the open box until it fills
// about this much of the screen's height. The push takes about a second.
const ZOOM_FILL = 0.62;
const ZOOM_RATE = 3.2;

const approach = (value: number, target: number, rate: number, dt: number) => value + (target - value) * (1 - Math.exp(-dt * rate));

export type PhoneRig = ReturnType<typeof createPhoneRig>;

// Makes a phone in a scene behave: it rings now and then until touched, its
// door eases ajar under the pointer, and picking it up opens it wide and
// draws the camera in close. `element` is the HTML button kept fitted over
// it on screen. An engine calls step() each frame before placing the
// camera, frame() to pull the camera in, and fit() once the camera is set.
export function createPhoneRig(phone: Phone, { element, reducedMotion }: { element: HTMLElement; reducedMotion: boolean }) {
  const motion = reducedMotion ? 0 : 1;
  const instant = reducedMotion ? 1e3 : 1;
  const state: PhoneState = { open: 0, lift: 0, ring: 0 };
  let hovering = false;
  let used = false;
  let dialOpen = false;
  let calledAt = -Infinity;
  let zoom = 0;
  let speed = 0;

  // The button's stand-in drawing goes; the scene's phone shows through.
  const elementStyle = element.style.cssText;
  const art = element.querySelector("svg");
  Object.assign(element.style, { left: "0", top: "0", right: "auto", bottom: "auto", transform: "none", aspectRatio: "auto" });
  element.setAttribute("data-modelled", "");
  art?.style.setProperty("visibility", "hidden");

  const corners = Array.from({ length: 8 }, (_, i) =>
    new THREE.Vector3(
      i & 1 ? phone.bounds.max.x : phone.bounds.min.x,
      i & 2 ? phone.bounds.max.y : phone.bounds.min.y,
      i & 4 ? phone.bounds.max.z : phone.bounds.min.z,
    ),
  );
  const corner = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const front = new THREE.Vector3();
  const toward = new THREE.Vector3();
  const close = new THREE.Vector3();

  return {
    hover(on: boolean) {
      hovering = on;
      if (on) used = true;
    },
    openDial(on: boolean) {
      used = true;
      dialOpen = on;
    },
    call() {
      used = true;
      calledAt = performance.now() / 1000;
    },
    // Advances the door, handset and ringing, and the push in. Returns how
    // far in the camera is, eased (0 out, 1 close up).
    step(time: number, dt: number) {
      const calling = time - calledAt < CALL_HOLD;
      const ringing = !used && !hovering && motion > 0 && time % RING_EVERY < RING_FOR;
      const open = calling || dialOpen;
      state.open = approach(state.open, open ? 1 : hovering ? 0.22 : 0, (open ? 5 : 7) * instant, dt);
      state.lift = approach(state.lift, calling && state.open > 0.7 ? 1 : 0, 6 * instant, dt);
      state.ring = approach(state.ring, ringing ? 1 : 0, 18, dt);
      phone.update(time, state);

      const from = zoom;
      zoom = approach(zoom, dialOpen ? 1 : 0, ZOOM_RATE * instant, dt);
      speed = Math.abs(zoom - from) / Math.max(dt, 1e-3);
      return zoom * zoom * (3 - 2 * zoom);
    },
    // Draws the camera's eye and aim toward the close-up by k (from step):
    // square on to the box, swung a little back toward where the eye stood
    // so the open door (hinged on the right) stays out of the way.
    frame(eye: THREE.Vector3, look: THREE.Vector3, k: number, fov: number) {
      if (k <= 0) return;
      const box = phone.box.matrixWorld;
      phone.bounds.getCenter(centre).applyMatrix4(box);
      const height = (phone.bounds.max.y - phone.bounds.min.y) * new THREE.Vector3().setFromMatrixScale(box).y;
      front.set(0, 0, 1).transformDirection(box).setY(0).normalize();
      toward.subVectors(eye, centre).setY(0).normalize();
      front.add(toward).normalize();
      const distance = height / ZOOM_FILL / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
      close.copy(centre).addScaledVector(front, distance);
      eye.lerp(close, k);
      look.lerp(centre, k);
    },
    // A streak of zoom blur while the camera rushes in or out.
    get blur() {
      return Math.min(1, speed * 0.4 * motion);
    },
    // Fits the button over the phone on screen, and points the zoom blur
    // (`blurCentre`, in UV) at it.
    fit(camera: THREE.Camera, width: number, height: number, blurCentre: THREE.Vector2) {
      let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const point of corners) {
        corner.copy(point).applyMatrix4(phone.box.matrixWorld).project(camera);
        const x = ((corner.x + 1) / 2) * width;
        const y = ((1 - corner.y) / 2) * height;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
      blurCentre.set((left + right) / 2 / width, 1 - (top + bottom) / 2 / height);
      // A little slack round the box, so it is easy to hit.
      const pad = 6;
      element.style.transform = `translate(${left - pad}px,${top - pad}px)`;
      element.style.width = `${right - left + 2 * pad}px`;
      element.style.height = `${bottom - top + 2 * pad}px`;
    },
    dispose() {
      element.style.cssText = elementStyle;
      element.removeAttribute("data-modelled");
      art?.style.removeProperty("visibility");
    },
  };
}
