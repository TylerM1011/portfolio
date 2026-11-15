import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { toInk } from "../scene/style";
import { disposeTree } from "../scene/util";
import type { Palette } from "./palette";

export { disposeTree };

const MODEL_URL = "/models/kaykit/car_hatchback.gltf";

export const CAR_HEIGHT = 0.7;

const WIDTH = 0.77;
const EXPECTED = { length: 1.48, height: 0.68, wheelRadius: 0.133 };

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

export function createCar() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const wheels: THREE.Object3D[] = [];

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  shadow.position.y = 0.006;
  group.add(shadow);

  const glow = new THREE.PointLight(0xff2a1f, 1, 3, 2);
  group.add(glow);
  const headlights = [-1, 1].map((s) => {
    const light = new THREE.SpotLight(0xffe6c4, 0, 34, 0.42, 0.6, 1.4);
    light.position.set(s * WIDTH * 0.33, CAR_HEIGHT * 0.45, 0);
    group.add(light, light.target);
    return light;
  });

  function fit(length: number, height: number) {
    const tail = length / 2;
    shadow.scale.set(WIDTH * 1.3, 1, length * 1.12);
    glow.position.set(0, height * 0.5, tail + 0.35);
    headlights.forEach((light, i) => {
      const s = i === 0 ? -1 : 1;
      light.position.z = -tail;
      light.target.position.set(s * WIDTH * 0.66, 0, -tail - 12);
    });
  }
  fit(EXPECTED.length, EXPECTED.height);

  function applyPalette(p: Palette) {
    glow.intensity = p.taillight * 0.35;
    for (const light of headlights) {
      light.visible = p.headlights > 0;
      light.intensity = p.headlights;
    }
  }

  const car = {
    group,
    body,
    wheels,
    ready: Promise.resolve(),
    applyPalette,
    wheelRadius: EXPECTED.wheelRadius,
    dispose() {},
  };

  car.ready = new GLTFLoader().loadAsync(MODEL_URL).then(
    (gltf) => {
      const model = gltf.scene;
      const authored = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      model.scale.setScalar(WIDTH / authored.x);
      model.rotation.y = Math.PI;
      const box = new THREE.Box3().setFromObject(model);
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      model.position.set(-centre.x, -box.min.y, -centre.z);
      model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.material = toInk(mesh.material as THREE.Material);
      });
      body.add(model);

      body.updateWorldMatrix(true, true);
      const found: THREE.Object3D[] = [];
      model.traverse((object) => {
        if (/wheel/i.test(object.name)) found.push(object);
      });
      for (const wheel of found) {
        const spin = new THREE.Group();
        spin.position.copy(body.worldToLocal(wheel.getWorldPosition(new THREE.Vector3())));
        body.add(spin);
        spin.updateWorldMatrix(true, false);
        spin.attach(wheel);
        wheels.push(spin);
        car.wheelRadius = new THREE.Box3().setFromObject(wheel).getSize(new THREE.Vector3()).y / 2;
      }

      fit(size.z, size.y);
    },
    (error) => console.error("The car's model failed to load.", error),
  );

  return car;
}

export type Car = ReturnType<typeof createCar>;
