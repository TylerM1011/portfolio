import * as THREE from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { loadBuffer, MODEL_URLS } from "@/lib/assets";
import { disposeTree } from "./car";

// Tree prototypes from "Pine Forest at Sunset" by Jagobo (CC BY 4.0): three
// large pines ("hero-*") and five young ponderosas ("line-*"), each sitting
// on the origin, with hidden branch geometry simplified.
const MODEL_URL = MODEL_URLS.forest;

type Spot = { x: number; y: number; z: number; height: number; rotation: number };

// Builds one InstancedMesh per part (bark, needles) of each prototype.
function instance(prototype: THREE.Object3D, spots: Spot[], castShadow: boolean, rand: () => number) {
  const box = new THREE.Box3().setFromObject(prototype);
  const nativeHeight = box.max.y - box.min.y;
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const meshes: THREE.InstancedMesh[] = [];
  prototype.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material as THREE.MeshStandardMaterial;
    // Smooths the needles' alpha-tested edges under MSAA.
    if (material.alphaTest > 0) material.alphaToCoverage = true;
    const mesh = new THREE.InstancedMesh(object.geometry, material, spots.length);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    meshes.push(mesh);
  });
  spots.forEach((spot, i) => {
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.rotation.set(0, spot.rotation, 0);
    dummy.scale.setScalar(spot.height / nativeHeight);
    dummy.updateMatrix();
    const v = 0.85 + rand() * 0.3;
    tint.setRGB(v * (0.95 + rand() * 0.1), v, v * (0.9 + rand() * 0.15));
    for (const mesh of meshes) {
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, tint);
    }
  });
  return meshes;
}

export function createForest({
  detail,
  rand,
  groundY,
  keepClear,
}: {
  detail: number;
  rand: () => number;
  // Height of the ground the trees stand on.
  groundY: number;
  // Returns true where a tree of this height would block something the
  // camera needs to see (the road, the sign, the sun).
  keepClear: (x: number, z: number, height: number) => boolean;
}) {
  const group = new THREE.Group();
  let disposed = false;

  const spot = (x: number, y: number, z: number, height: number, list: Spot[]) => {
    if (!keepClear(x, z, height)) list.push({ x, y, z, height, rotation: rand() * Math.PI * 2 });
  };

  // Groves of tall pines either side of the road, woods of younger pines
  // filling out both sides, and a deep treeline where the land meets the
  // hills (keepClear leaves the gap where the road runs on).
  function place() {
    const near: Spot[] = [];
    const far: Spot[] = [];
    const treeline: Spot[] = [];
    const side = () => (rand() < 0.5 ? -1 : 1);
    // Measured out from the middle of the dual carriageway.
    const middle = 3.4;
    const groves = Array.from({ length: 18 }, () => [middle + side() * (8 + rand() * 9), -6 - rand() * 90] as const);
    for (let i = 0; i < Math.round(90 * Math.max(detail, 0.6)); i++) {
      const [x, z] = groves[Math.floor(rand() * groves.length)];
      spot(x + (rand() - 0.5) * 7, groundY, z + (rand() - 0.5) * 10, 6 + rand() * 3.5, near);
    }
    for (let i = 0; i < Math.round(500 * detail); i++) {
      spot(middle + side() * (16 + rand() ** 1.5 * 120), groundY, 10 - rand() * 120, 5 + rand() * 4, far);
    }
    for (let i = 0; i < Math.round(1100 * detail); i++) {
      const x = middle + (rand() * 2 - 1) * 300;
      spot(x, groundY, -105 - rand() * 95 - (x * x) / 3000, 4 + rand() * 4.5, treeline);
    }
    // Only pines the shadow map can reach cast shadows.
    return { shaded: near.filter((s) => s.z > -45), unshaded: near.filter((s) => s.z <= -45), far, treeline };
  }

  // Deal the spots out across the prototypes of each kind.
  function deal(prototypes: THREE.Object3D[], list: Spot[], castShadow: boolean) {
    const hands = prototypes.map(() => [] as Spot[]);
    for (const s of list) hands[Math.floor(rand() * prototypes.length)].push(s);
    prototypes.forEach((prototype, i) => {
      if (hands[i].length) group.add(...instance(prototype, hands[i], castShadow, rand));
    });
  }

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const spots = place();
  // The bytes come from the shared asset cache (see lib/assets.ts); each
  // scene parses its own copy, since it disposes of the meshes when it stops.
  const ready = loadBuffer(MODEL_URL)
    .then((buffer) => loader.parseAsync(buffer, "/models/"))
    .then(
    (gltf) => {
      const { shaded, unshaded, far, treeline } = spots;
      if (disposed) return disposeTree(gltf.scene);
      gltf.scene.updateMatrixWorld(true);
      const prototypes = gltf.scene.children;
      const heroes = prototypes.filter((p) => p.name.startsWith("hero"));
      const young = prototypes.filter((p) => p.name.startsWith("line"));
      deal(heroes, shaded, true);
      deal(heroes, unshaded, false);
      deal(young, far, false);
      // The lightest prototypes for the distant rows.
      deal(young.slice(0, 3), treeline, false);
    },
    (error) => console.error("RoadScene: could not load the forest", error),
  );

  return {
    group,
    ready,
    dispose() {
      disposed = true;
    },
  };
}
