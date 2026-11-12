import * as THREE from "three";

// The house style, shared by every scene so that everything in them (the
// car, the trees, the meadow, the props) and the HTML laid over them read
// as one picture: a screen-printed travel poster, built as a diorama.
//
// - Every surface is drawn the same way: flat colour in two tones, its own
//   ink where the sun falls and a cooler, hue-shifted shade ink where it
//   doesn't, meeting at a narrow soft edge. Cast shadows are the same shade
//   ink. Nothing shines, reflects or carries relief.
// - Colour comes from a small set of inks (see palette.ts for the light,
//   and the objects' own colours); texture only ever adds broad, painted
//   variation or a cut-out outline, never photographic grain.
// - Depth comes from the air: the fog flattens the distance into bands of
//   treeline, hills and sky, as a print layers its colours.
//
// World builders make their materials with `ink`; `finish` then converts
// anything that slipped through, so no object can be drawn by a different
// hand.

// The light ramp every surface shares: dark (only the sky's fill) on the
// side away from the sun, full sun on the side toward it, with a narrow
// soft edge between. Indexed by half-Lambert, so 0.5 is the terminator.
const RAMP = (() => {
  const size = 64;
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const x = (i + 0.5) / size;
    const v = Math.round(255 * THREE.MathUtils.smoothstep(x, 0.5, 0.58));
    data.set([v, v, v, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, size, 1);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
})();

export type Ink = THREE.MeshToonMaterial;

// Parameters for an ink: those of MeshToonMaterial. The physical ones a
// realistic material would take are accepted and ignored, so a material can
// be described as it would be for a renderer and still come out in style.
export type InkParameters = THREE.MeshToonMaterialParameters & {
  roughness?: number;
  metalness?: number;
  roughnessMap?: THREE.Texture | null;
  envMapIntensity?: number;
};

const IGNORED = ["roughness", "metalness", "roughnessMap", "metalnessMap", "envMap", "envMapIntensity", "normalMap", "normalScale", "bumpMap", "clearcoat", "specularIntensity"];

export function ink(parameters: InkParameters = {}): Ink {
  const params: Record<string, unknown> = { ...parameters };
  for (const key of IGNORED) delete params[key];
  return haze(new THREE.MeshToonMaterial({ gradientMap: RAMP, ...(params as THREE.MeshToonMaterialParameters) }));
}

// The air between the camera and everything in the scene: the fog, warmed
// and thickened toward the sun, so the light seems to come a long way
// across the land, strongest at dusk. Shared by every ink; the atmosphere
// (see atmosphere.ts) keeps it pointed at the sun and coloured by it.
export const HAZE = {
  uHazeSun: { value: new THREE.Vector3(0, 0, -1) },
  uHazeColor: { value: new THREE.Color() },
  uHazeStrength: { value: 0 },
};

function haze(material: Ink) {
  extendShader(material, "haze", (shader) => {
    Object.assign(shader.uniforms, HAZE);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uHazeSun;\nuniform vec3 uHazeColor;\nuniform float uHazeStrength;")
      .replace(
        "#include <fog_fragment>",
        /* glsl */ `
        #ifdef USE_FOG
          float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
          float sunward = pow( max( dot( normalize( -vViewPosition ), uHazeSun ), 0.0 ), 5.0 ) * uHazeStrength;
          vec3 air = mix( fogColor, uHazeColor, sunward );
          float glow = sunward * 0.55 * smoothstep( 0.0, fogFar * 0.3, vFogDepth );
          gl_FragColor.rgb = mix( gl_FragColor.rgb, air, clamp( fogFactor + glow, 0.0, 1.0 ) );
        #endif`,
      );
  });
  return material;
}

// Redraws a realistic material (from a loaded model) as an ink, keeping its
// colour, cut-out, transparency, glow and any shader hooks.
export function toInk(material: THREE.Material): Ink {
  if (material instanceof THREE.MeshToonMaterial) {
    material.gradientMap = RAMP;
    return material;
  }
  const source = material as THREE.MeshStandardMaterial;
  const result = ink({
    name: source.name,
    color: source.color,
    map: source.map,
    alphaMap: source.alphaMap,
    alphaTest: source.alphaTest,
    alphaToCoverage: source.alphaToCoverage,
    transparent: source.transparent,
    opacity: source.opacity,
    side: source.side,
    emissive: source.emissive,
    emissiveMap: source.emissiveMap,
    emissiveIntensity: source.emissiveIntensity,
    vertexColors: source.vertexColors,
    fog: source.fog,
    depthWrite: source.depthWrite,
    depthTest: source.depthTest,
    blending: source.blending,
    polygonOffset: source.polygonOffset,
    polygonOffsetFactor: source.polygonOffsetFactor,
    polygonOffsetUnits: source.polygonOffsetUnits,
    visible: source.visible,
  });
  source.dispose();
  return result;
}

type Hook = (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => void;

// Adds a shader hook to a material without losing any it already has. `key`
// must tell this hook's variants apart, since it names the compiled program.
export function extendShader(material: THREE.Material, key: string, hook: Hook) {
  const previous = material.onBeforeCompile;
  const previousKey: string = material.userData.shaderKey ?? "";
  material.userData.shaderKey = `${previousKey}|${key}`;
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    hook(shader, renderer);
  };
  material.customProgramCacheKey = function () {
    return this.userData.shaderKey;
  };
}

// Keeps only a cut-out texture's outline: its alpha shapes the surface, and
// the colour is painted from `base` at the bottom of the card (uv.y = 0) to
// `tip` at the top, times the material colour. Grass and the like.
export function silhouette(material: Ink, base: THREE.ColorRepresentation, tip: THREE.ColorRepresentation) {
  const uniforms = { uBase: { value: new THREE.Color(base) }, uTip: { value: new THREE.Color(tip) } };
  extendShader(material, "silhouette", (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uBase;\nuniform vec3 uTip;")
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
        #ifdef USE_MAP
          diffuseColor.a *= texture2D( map, vMapUv ).a;
          diffuseColor.rgb *= mix( uBase, uTip, smoothstep( 0.0, 1.0, vMapUv.y ) );
        #endif`,
      );
  });
  return uniforms;
}

// Thin surfaces seen from both sides (blades of grass, petals): both faces
// take the normal the geometry gives them, rather than the back face being
// lit as if turned away, so a clump is lit as one volume.
export function twoSided(material: Ink) {
  material.side = THREE.DoubleSide;
  extendShader(material, "two-sided", (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", ""),
    );
  });
  return material;
}

// Lays a broad band of darker value across the ground nearest the camera,
// the way a poster paints its foreground in a deeper tone, so a big flat
// field reads as painted rather than unfinished. `near` and `far` are
// distances from the camera, in world units.
export function foreground(material: Ink, amount: number, near: number, far: number) {
  extendShader(material, `foreground-${amount}-${near}-${far}`, (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      diffuseColor.rgb *= 1.0 - ${amount.toFixed(3)} * (1.0 - smoothstep(${near.toFixed(2)}, ${far.toFixed(2)}, length(vViewPosition)));`,
    );
  });
  return material;
}

// Brings everything under root into the house style: any material that is
// not yet an ink is redrawn as one. Safe to call again as more of the scene
// loads.
export function finish(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((m) => (isLit(m) ? toInk(m) : m));
    else if (isLit(mesh.material)) mesh.material = toInk(mesh.material);
  });
}

const isLit = (material: THREE.Material) =>
  material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshLambertMaterial || material instanceof THREE.MeshPhongMaterial || material instanceof THREE.MeshToonMaterial;
