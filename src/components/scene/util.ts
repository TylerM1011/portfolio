import * as THREE from "three";
import { ink } from "./style";

// Small helpers every scene's world builder uses.

// Seeded, so a scene's layout is the same on every visit.
export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function radialTexture(stops: [number, string][]) {
  return canvasTexture(128, 128, (ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  });
}

// Draws at (x, y) and at its wrapped copies, so the texture tiles.
function wrapped(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void) {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const px = x + dx;
      const py = y + dy;
      if (px + r < 0 || px - r > size || py + r < 0 || py - r > size) continue;
      draw(px, py);
    }
  }
}

// Tileable painted ground: soft blotches of a lighter and a darker tone on
// a base, like paint laid on in broad strokes, then an optional stipple.
// Colours are "r,g,b" strings, the base any CSS colour.
export function groundTexture(rand: () => number, colors: { base: string; light: string; dark: string }, grit: number) {
  const size = 512;
  return canvasTexture(size, size, (ctx) => {
    ctx.fillStyle = colors.base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 80; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 30 + rand() * 100;
      const color = rand() < 0.5 ? colors.light : colors.dark;
      const alpha = 0.06 + rand() * 0.14;
      wrapped(size, x, y, r, (px, py) => {
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, r);
        gradient.addColorStop(0, `rgba(${color},${alpha})`);
        gradient.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(px - r, py - r, 2 * r, 2 * r);
      });
    }
    for (let i = 0; i < grit; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = rand() < 0.9 ? 0.6 + rand() * 1.2 : 1.8 + rand() * 2.6;
      const squash = 0.55 + rand() * 0.45;
      const angle = rand() * Math.PI;
      ctx.fillStyle = `rgba(${rand() < 0.55 ? colors.dark : colors.light},${0.25 + rand() * 0.45})`;
      wrapped(size, x, y, r, (px, py) => {
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * squash, angle, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });
}

// The plain surface (see style.ts).
export const matte = ink;

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
