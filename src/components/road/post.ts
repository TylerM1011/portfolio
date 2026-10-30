import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// Runs after tone mapping, in display space: a zoom blur toward uCenter that
// grows with speed, lens fringing toward the edges, a teal/orange split,
// vignette and film grain.
const GradeShader = {
  name: "RoadGradeShader",
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uBlur: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uAberration: { value: 0.0015 },
    uVignette: { value: 0.5 },
    uGrain: { value: 0.035 },
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
    uniform float uTime;
    uniform float uBlur;
    uniform vec2 uCenter;
    uniform float uAberration;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec3 fringe(vec2 uv, vec2 direction, float amount) {
      return vec3(
        texture2D(tDiffuse, uv + direction * amount).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - direction * amount).b
      );
    }

    void main() {
      vec2 offset = vUv - 0.5;
      float amount = uAberration * dot(offset, offset) * 4.0;
      vec3 color;
      if (uBlur > 0.001) {
        vec2 toCenter = vUv - uCenter;
        color = vec3(0.0);
        for (int i = 0; i < 12; i++) {
          float s = float(i) / 11.0;
          color += fringe(uCenter + toCenter * (1.0 - uBlur * 0.09 * s), offset, amount);
        }
        color /= 12.0;
      } else {
        color = fringe(vUv, offset, amount);
      }

      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color += vec3(-0.012, 0.004, 0.024) * (1.0 - smoothstep(0.0, 0.45, luma));
      color += vec3(0.022, 0.008, -0.018) * smoothstep(0.55, 1.0, luma);

      float edge = length(offset * vec2(1.0, 0.85));
      color *= mix(1.0, 1.0 - smoothstep(0.25, 0.85, edge), uVignette);

      float grain = hash(gl_FragCoord.xy + fract(uTime * 7.31) * 913.0) - 0.5;
      color += grain * uGrain * (1.0 - luma * 0.5);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.7, 1);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(grade);
  return { composer, bloom, grade: grade.uniforms };
}
