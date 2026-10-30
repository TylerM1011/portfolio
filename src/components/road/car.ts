import * as THREE from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Palette } from "./palette";

// "2024 Volkswagen Polo 170 TSI" by Ddiaz Design (CC BY-NC-SA 4.0), with the
// cabin cut down to the seats and the mesh meshopt-compressed.
const MODEL_URL = "/models/polo.glb";

// Scaled so the roof sits at 0.7, like the illustrated car it replaces. The
// camera's eye has to stay above the roof (see engine.ts).
export const CAR_HEIGHT = 0.7;

const WHEEL_NODE = /^Rim 17 Polo MY24 (FL|FR|RL|RR)$/;
// Moonstone-style metallic grey.
const PAINT = 0x7c8087;

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

function materialsOf(mesh: THREE.Mesh) {
  return [mesh.material].flat() as THREE.MeshStandardMaterial[];
}

// Frees the GPU resources of every mesh, point cloud and sprite under root.
export function disposeTree(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Sprite)) return;
    object.geometry.dispose();
    for (const material of [object.material].flat() as THREE.Material[]) {
      // Shader extras keep their textures in userData.textures.
      const extras: unknown[] = material.userData.textures ?? [];
      for (const value of [...Object.values(material), ...extras]) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}

// The car's group carries its position and heading; `body` inside it takes
// roll, squat and idle shake. The model loads asynchronously; `ready`
// settles once it is in place (or has failed to load).
export function createCar() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const wheels: THREE.Object3D[] = [];
  const taillights: THREE.MeshStandardMaterial[] = [];
  let wheelRadius = 0.14;
  let palette: Palette | null = null;
  let disposed = false;

  const blinkerMaterial = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: new THREE.Color(0xffa21a).multiplyScalar(6),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const blinkers = [new THREE.Sprite(blinkerMaterial), new THREE.Sprite(blinkerMaterial)] as const;
  for (const blinker of blinkers) {
    blinker.visible = false;
    blinker.scale.setScalar(0.16);
    body.add(blinker);
  }

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  shadow.position.y = 0.006;
  group.add(shadow);

  // Red spill on the asphalt behind, and headlights down the road at dusk.
  const glow = new THREE.PointLight(0xff2a1f, 1, 3, 2);
  group.add(glow);
  const headlights = [-1, 1].map((side) => {
    const light = new THREE.SpotLight(0xffe6c4, 0, 34, 0.42, 0.6, 1.4);
    light.userData.side = side;
    group.add(light, light.target);
    return light;
  });

  function applyPalette(p: Palette) {
    palette = p;
    for (const material of taillights) material.emissiveIntensity = p.taillight;
    glow.intensity = p.taillight * 0.35;
    for (const light of headlights) {
      light.visible = p.headlights > 0;
      light.intensity = p.headlights;
    }
  }

  function place(model: THREE.Object3D) {
    const holder = new THREE.Group();
    holder.add(model);
    const staging = new THREE.Group();
    staging.add(holder);

    // Turn the car so its taillights face the camera (+z), then scale it to
    // height and sit it on the ground, centered on the group's origin.
    staging.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const tail = new THREE.Box3();
    model.traverse((object) => {
      if (object instanceof THREE.Mesh && materialsOf(object).some((m) => m.name === "Glow_Red")) tail.expandByObject(object);
    });
    const toTail = tail.getCenter(new THREE.Vector3()).sub(box.getCenter(new THREE.Vector3()));
    holder.rotation.y = -Math.round(Math.atan2(toTail.x, toTail.z) / (Math.PI / 2)) * (Math.PI / 2);
    holder.scale.setScalar(CAR_HEIGHT / box.getSize(new THREE.Vector3()).y);
    staging.updateMatrixWorld(true);
    box.setFromObject(holder);
    const center = box.getCenter(new THREE.Vector3());
    holder.position.set(-center.x, -box.min.y, -center.z);
    staging.updateMatrixWorld(true);
    box.setFromObject(holder);
    tail.makeEmpty();

    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = object.receiveShadow = true;
      for (const material of materialsOf(object)) {
        // The factory finish and glass are near-mirror, which turns the low
        // sun into a blown-out hotspot. Soften and dim every reflection.
        material.envMapIntensity = 0.15;
        if (material instanceof THREE.MeshPhysicalMaterial) {
          material.specularIntensity = Math.min(material.specularIntensity, 0.2);
          if (material.name === "CarPaint") {
            material.color.set(PAINT);
            material.metalness = 0.4;
            material.roughness = Math.max(material.roughness, 0.42);
            material.clearcoat = 0.2;
            material.clearcoatRoughness = Math.max(material.clearcoatRoughness, 0.4);
          }
          if (material.transparent || material.transmission > 0) {
            material.roughness = Math.max(material.roughness, 0.2);
            material.specularIntensity = Math.min(material.specularIntensity, 0.12);
            material.clearcoat = 0;
            material.envMapIntensity = 0.08;
          }
        }
        if (material.name === "Glow_Red") {
          taillights.push(material);
          tail.expandByObject(object);
        }
        // Transmission needs a second render of the whole scene each frame;
        // tinted see-through glass reads the same from behind.
        if (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0) {
          material.transmission = 0;
          material.transparent = true;
          material.opacity = Math.max(material.opacity, 0.55);
        }
      }
    });

    body.add(holder);
    holder.updateMatrixWorld(true);

    // Give each wheel a pivot at its hub so it can roll about the axle.
    model.traverse((object) => {
      if (WHEEL_NODE.test(object.name)) wheels.push(object);
    });
    for (const wheel of wheels) {
      const hub = new THREE.Box3().setFromObject(wheel);
      wheelRadius = hub.getSize(new THREE.Vector3()).y / 2;
      const pivot = new THREE.Object3D();
      pivot.position.copy(hub.getCenter(new THREE.Vector3()));
      body.add(pivot);
      pivot.updateMatrixWorld(true);
      pivot.attach(wheel);
    }
    wheels.splice(0, wheels.length, ...wheels.map((wheel) => wheel.parent!));

    // Fit the blinkers, shadow and lights around the model.
    const size = box.getSize(new THREE.Vector3());
    const tailY = tail.isEmpty() ? CAR_HEIGHT * 0.55 : tail.getCenter(new THREE.Vector3()).y;
    const tailX = tail.isEmpty() ? size.x * 0.4 : tail.max.x - 0.04;
    blinkers.forEach((blinker, i) => blinker.position.set((i === 0 ? -1 : 1) * tailX, tailY, box.max.z + 0.02));
    shadow.scale.set(size.x * 1.3, 1, size.z * 1.15);
    glow.position.set(0, tailY, box.max.z + 0.35);
    for (const light of headlights) {
      const x = light.userData.side * size.x * 0.33;
      light.position.set(x, CAR_HEIGHT * 0.45, box.min.z);
      light.target.position.set(x * 2, 0, box.min.z - 12);
    }
    if (palette) applyPalette(palette);
  }

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const ready = loader.loadAsync(MODEL_URL).then(
    (gltf) => {
      if (disposed) disposeTree(gltf.scene);
      else place(gltf.scene);
    },
    (error) => console.error("RoadScene: could not load the car model", error),
  );

  return {
    group,
    body,
    wheels,
    blinkers,
    ready,
    applyPalette,
    get wheelRadius() {
      return wheelRadius;
    },
    dispose() {
      disposed = true;
    },
  };
}

export type Car = ReturnType<typeof createCar>;
