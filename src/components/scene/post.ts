import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// The resting values of the grade, shared by every scene. The style is a
// print, not a photograph (see style.ts), so the grade imitates no camera:
// no grain, no lens fringing, no colour split. It keeps only a faint
// darkening at the corners, like ink settling at a sheet's edge, and the
// zoom blur of the drive away.
export const GRADE = { vignette: 0.18 };

// Runs in display space: a zoom blur toward uCenter that grows with speed,
// then the vignette.
const GradeShader = {
  name: "PrintGradeShader",
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uBlur: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uVignette: { value: GRADE.vignette },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uBlur;
    uniform vec2 uCenter;
    uniform float uVignette;
    varying vec2 vUv;

    void main() {
      vec3 color;
      if (uBlur > 0.001) {
        vec2 toCenter = vUv - uCenter;
        color = vec3(0.0);
        for (int i = 0; i < 12; i++) {
          float s = float(i) / 11.0;
          color += texture2D(tDiffuse, uCenter + toCenter * (1.0 - uBlur * 0.09 * s)).rgb;
        }
        color /= 12.0;
      } else {
        color = texture2D(tDiffuse, vUv).rgb;
      }
      vec2 offset = vUv - 0.5;
      float edge = length(offset * vec2(1.0, 0.85));
      color *= mix(1.0, 1.0 - smoothstep(0.3, 0.9, edge), uVignette);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  // A soft glow round real lights only (the sun, lamps, taillights): the
  // painted surfaces stay below the threshold.
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.5, 1.05);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(grade);
  return { composer, bloom, grade: grade.uniforms };
}
