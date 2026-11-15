import * as THREE from "three";
import { canvasTexture } from "../scene/util";

// The about scene's painted surfaces. As everywhere (see scene/style.ts),
// texture only adds broad variation or a drawn pattern, never grain: the
// brick is laid in faint courses over blotches of a lighter and darker red,
// the floorboards are flat planks of a few browns.

function repeat(texture: THREE.Texture, anisotropy: number) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  return texture;
}

// One world unit of brickwork (about 2.3 m): 30 courses of stretchers,
// faint mortar, a few bricks a shade off. `base` is any CSS colour.
export function brickTexture(rand: () => number, base: string, anisotropy: number) {
  const size = 512;
  const courses = 30;
  const across = 10;
  return repeat(
    canvasTexture(size, size, (ctx) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 40; i++) {
        const x = rand() * size;
        const y = rand() * size;
        const r = 40 + rand() * 120;
        const tone = rand() < 0.5 ? "255,220,190" : "70,25,20";
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, `rgba(${tone},${0.05 + rand() * 0.08})`);
        gradient.addColorStop(1, `rgba(${tone},0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      const h = size / courses;
      const w = size / across;
      for (let row = 0; row < courses; row++) {
        const shift = row % 2 ? w / 2 : 0;
        for (let col = -1; col <= across; col++) {
          if (rand() < 0.12) {
            ctx.fillStyle = rand() < 0.5 ? "rgba(255,225,200,0.1)" : "rgba(60,20,15,0.12)";
            ctx.fillRect(col * w + shift, row * h, w, h);
          }
        }
      }
      ctx.fillStyle = "rgba(235,220,200,0.2)";
      for (let row = 0; row < courses; row++) {
        ctx.fillRect(0, row * h, size, 2);
        const shift = row % 2 ? w / 2 : 0;
        for (let col = 0; col <= across; col++) ctx.fillRect(col * w + shift, row * h, 2, h);
      }
    }),
    anisotropy,
  );
}

// Paving slabs, four to a unit each way, with faint joints.
export function slabTexture(rand: () => number, anisotropy: number) {
  const size = 256;
  return repeat(
    canvasTexture(size, size, (ctx) => {
      ctx.fillStyle = "#cfcac0";
      ctx.fillRect(0, 0, size, size);
      const s = size / 4;
      for (let x = 0; x < 4; x++) {
        for (let y = 0; y < 4; y++) {
          ctx.fillStyle = `rgba(${rand() < 0.5 ? "255,250,240" : "90,85,80"},${0.04 + rand() * 0.08})`;
          ctx.fillRect(x * s, y * s, s, s);
        }
      }
      ctx.fillStyle = "rgba(80,75,70,0.28)";
      for (let i = 0; i <= 4; i++) {
        ctx.fillRect(i * s - 1, 0, 2, size);
        ctx.fillRect(0, i * s - 1, size, 2);
      }
    }),
    anisotropy,
  );
}

// Asphalt: broad patches of a lighter and darker grey.
export function asphaltTexture(rand: () => number, anisotropy: number) {
  const size = 256;
  return repeat(
    canvasTexture(size, size, (ctx) => {
      ctx.fillStyle = "#56575c";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 30; i++) {
        const x = rand() * size;
        const y = rand() * size;
        const r = 20 + rand() * 60;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        const tone = rand() < 0.5 ? "120,120,128" : "30,30,36";
        gradient.addColorStop(0, `rgba(${tone},0.12)`);
        gradient.addColorStop(1, `rgba(${tone},0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
    }),
    anisotropy,
  );
}

// A Victorian tiled path: black and cream quarries set diagonally, inside a
// terracotta rope border. One texture spans the path's width and as much
// of its length.
export function pathTexture(anisotropy: number) {
  const size = 256;
  return repeat(
    canvasTexture(size, size, (ctx) => {
      ctx.fillStyle = "#b0553a";
      ctx.fillRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.rect(26, 0, size - 52, size);
      ctx.clip();
      ctx.fillStyle = "#ede4cf";
      ctx.fillRect(0, 0, size, size);
      ctx.translate(size / 2, 0);
      ctx.rotate(Math.PI / 4);
      const s = 34;
      ctx.fillStyle = "#24211f";
      for (let x = -12; x < 12; x++) {
        for (let y = -12; y < 12; y++) {
          if ((x + y) % 2 === 0) ctx.fillRect(x * s, y * s, s, s);
        }
      }
      ctx.restore();
      ctx.fillStyle = "#24211f";
      for (let y = 0; y < size; y += 32) {
        ctx.fillRect(8, y + 8, 10, 16);
        ctx.fillRect(size - 18, y + 8, 10, 16);
      }
    }),
    anisotropy,
  );
}

// Floorboards running away from the door: one unit across, sixteen boards
// of a few browns, the ends staggered.
export function floorTexture(rand: () => number, anisotropy: number) {
  const size = 512;
  const boards = 16;
  return repeat(
    canvasTexture(size, size, (ctx) => {
      const w = size / boards;
      const browns = ["#9a6a43", "#a87449", "#8f603b", "#b07c50", "#966641"];
      for (let i = 0; i < boards; i++) {
        let y = -rand() * size;
        while (y < size) {
          const length = size * (0.45 + rand() * 0.5);
          ctx.fillStyle = browns[Math.floor(rand() * browns.length)];
          ctx.fillRect(i * w, y, w, length);
          ctx.fillStyle = "rgba(50,28,15,0.35)";
          ctx.fillRect(i * w, y, w, 2);
          y += length;
        }
        ctx.fillStyle = "rgba(50,28,15,0.4)";
        ctx.fillRect(i * w, 0, 2, size);
      }
    }),
    anisotropy,
  );
}

// The rug under the coffee table: a border, a field, and a medallion.
export function rugTexture() {
  return canvasTexture(512, 352, (ctx) => {
    ctx.fillStyle = "#7d2e2a";
    ctx.fillRect(0, 0, 512, 352);
    ctx.strokeStyle = "#e7d3a6";
    ctx.lineWidth = 10;
    ctx.strokeRect(22, 22, 468, 308);
    ctx.lineWidth = 4;
    ctx.strokeRect(42, 42, 428, 268);
    ctx.fillStyle = "#29405a";
    ctx.fillRect(48, 48, 416, 256);
    ctx.fillStyle = "#e7d3a6";
    ctx.beginPath();
    ctx.moveTo(256, 96);
    ctx.lineTo(352, 176);
    ctx.lineTo(256, 256);
    ctx.lineTo(160, 176);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#7d2e2a";
    ctx.beginPath();
    ctx.moveTo(256, 124);
    ctx.lineTo(318, 176);
    ctx.lineTo(256, 228);
    ctx.lineTo(194, 176);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e7d3a6";
    for (const [x, y] of [
      [96, 96],
      [416, 96],
      [96, 256],
      [416, 256],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// A fanlight over a door: dark glass with the house number in gold leaf.
export function fanlightTexture(number: number) {
  return canvasTexture(256, 96, (ctx) => {
    ctx.fillStyle = "#1d2430";
    ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(0, 0, 256, 40);
    ctx.fillStyle = "#e3b955";
    ctx.font = "italic 700 64px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(number), 128, 52);
  });
}

// A neighbour's window, seen from the street: dark glass, net curtains over
// the lower sash, and curtains drawn back either side. Lit from inside at
// dusk (the engine glows it through its emissive).
export function paneTexture(rand: () => number) {
  const curtain = ["#7b2f36", "#2f4f6b", "#6d6a3a", "#5a3f63"][Math.floor(rand() * 4)];
  return canvasTexture(128, 192, (ctx) => {
    const glass = ctx.createLinearGradient(0, 0, 0, 192);
    glass.addColorStop(0, "#2c3442");
    glass.addColorStop(1, "#1a1f29");
    ctx.fillStyle = glass;
    ctx.fillRect(0, 0, 128, 192);
    ctx.fillStyle = "#f3eee2";
    ctx.fillRect(0, 104, 128, 88);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    for (let x = 4; x < 128; x += 10) ctx.fillRect(x, 104, 3, 88);
    ctx.fillStyle = "#f3eee2";
    for (let x = 0; x < 128; x += 16) {
      ctx.beginPath();
      ctx.arc(x + 8, 104, 8, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillStyle = curtain;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(30, 0);
    ctx.quadraticCurveTo(14, 90, 22, 192);
    ctx.lineTo(0, 192);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(128, 0);
    ctx.lineTo(98, 0);
    ctx.quadraticCurveTo(114, 90, 106, 192);
    ctx.lineTo(128, 192);
    ctx.fill();
  });
}

// The print over the sideboard: a screen-printed travel poster of the
// home page's road, in the scenes' own inks.
export function posterTexture() {
  return canvasTexture(256, 352, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 0, 220);
    sky.addColorStop(0, "#4a7fbf");
    sky.addColorStop(1, "#f4d6a0");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 256, 352);
    ctx.fillStyle = "#fff0d2";
    ctx.beginPath();
    ctx.arc(176, 150, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a9b8a4";
    ctx.beginPath();
    ctx.moveTo(0, 190);
    ctx.quadraticCurveTo(70, 150, 140, 180);
    ctx.quadraticCurveTo(200, 160, 256, 175);
    ctx.lineTo(256, 352);
    ctx.lineTo(0, 352);
    ctx.fill();
    ctx.fillStyle = "#7f9763";
    ctx.fillRect(0, 205, 256, 147);
    ctx.fillStyle = "#4b4c52";
    ctx.beginPath();
    ctx.moveTo(110, 205);
    ctx.lineTo(146, 205);
    ctx.lineTo(236, 352);
    ctx.lineTo(20, 352);
    ctx.fill();
    ctx.fillStyle = "#f4efe2";
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      ctx.fillRect(126 + t * 4, 212 + t * t * 140, 4 + t * 6, 8 + t * 14);
    }
    ctx.fillStyle = "#00703c";
    ctx.fillRect(84, 120, 88, 40);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.strokeRect(88, 124, 80, 32);
    // The sign on the road ahead says where it goes.
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 21px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("HOME", 128, 141);
  });
}

// The television's picture: a teletext page, "READ ME" in yellow double
// height on a blue band, the page header in white across the top.
export function screenTexture() {
  return canvasTexture(512, 384, (ctx) => {
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, 512, 384);
    ctx.font = "700 26px ui-monospace, Menlo, monospace";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("P100", 24, 20);
    ctx.fillStyle = "#ffff3a";
    ctx.fillText("TYLERTEXT", 120, 20);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("100", 300, 20);
    ctx.fillStyle = "#3ad7ff";
    ctx.fillText("19:42", 400, 20);
    ctx.fillStyle = "#1a2fd0";
    ctx.fillRect(0, 96, 512, 150);
    ctx.fillStyle = "#ffff3a";
    ctx.save();
    ctx.scale(1, 1.9);
    ctx.font = "800 84px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("READ ME", 256, 60);
    ctx.restore();
    ctx.font = "700 24px ui-monospace, Menlo, monospace";
    const keys: [string, string][] = [
      ["#ff3b3b", "ABOUT"],
      ["#3bff5a", "WORK"],
      ["#ffff3a", "SKILLS"],
      ["#3ad7ff", "INDEX"],
    ];
    keys.forEach(([colour, label], i) => {
      ctx.fillStyle = colour;
      ctx.fillText(label, 24 + i * 122, 330);
    });
    // Scanlines.
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    for (let y = 0; y < 384; y += 4) ctx.fillRect(0, y, 512, 2);
  });
}

// The landline's dial face: the number ring, under the finger plate with
// its ten holes, and the card in the middle.
export function dialTexture() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.translate(128, 128);
    ctx.fillStyle = "#f4efe2";
    ctx.beginPath();
    ctx.arc(0, 0, 126, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d8ccae";
    ctx.beginPath();
    ctx.arc(0, 0, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < 10; i++) {
      const a = ((80 - i * 30) * Math.PI) / 180 - Math.PI / 2;
      const x = Math.cos(a) * 86;
      const y = Math.sin(a) * 86;
      ctx.fillStyle = "#fbf8f0";
      ctx.beginPath();
      ctx.arc(x, y, 19, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2a2622";
      ctx.fillText(String((i + 1) % 10), x, y + 1);
    }
    ctx.fillStyle = "#fbf8f0";
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2a2622";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#b03a2e";
    ctx.font = "italic 700 18px Georgia, serif";
    ctx.fillText("Home", 0, -6);
    ctx.fillStyle = "#2a2622";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillText("01382", 0, 14);
  });
}

// The top sheet on the coffee table's clipboard: a blueprint, white lines on
// Prussian blue over a grid, a floor plan and a title block, as on the
// projects page. `seed` picks which of two drawings, for the sheets under it.
export function blueprintTexture(seed = 0) {
  return canvasTexture(256, 352, (ctx) => {
    const paper = ctx.createLinearGradient(0, 0, 256, 352);
    paper.addColorStop(0, "#3b74ab");
    paper.addColorStop(0.5, "#2b6199");
    paper.addColorStop(1, "#1d4472");
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, 256, 352);
    ctx.strokeStyle = "rgba(238, 241, 234, 0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= 256; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, 352);
      ctx.stroke();
    }
    for (let y = 0; y <= 352; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(256, y + 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(238, 241, 234, 0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 236, 332);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (seed % 2 === 0) {
      // A ground floor plan: walls, a door swing, a stair.
      ctx.rect(36, 52, 184, 150);
      ctx.moveTo(128, 52);
      ctx.lineTo(128, 112);
      ctx.moveTo(128, 140);
      ctx.lineTo(128, 202);
      ctx.moveTo(36, 130);
      ctx.lineTo(100, 130);
      ctx.moveTo(100, 130);
      ctx.arc(100, 130, 26, -Math.PI / 2, 0);
      for (let i = 0; i < 6; i++) {
        ctx.moveTo(150, 150 + i * 8);
        ctx.lineTo(206, 150 + i * 8);
      }
    } else {
      // A front elevation: a gable, windows and a door.
      ctx.moveTo(30, 210);
      ctx.lineTo(226, 210);
      ctx.moveTo(50, 210);
      ctx.lineTo(50, 110);
      ctx.lineTo(128, 50);
      ctx.lineTo(206, 110);
      ctx.lineTo(206, 210);
      ctx.rect(70, 124, 34, 34);
      ctx.rect(152, 124, 34, 34);
      ctx.rect(112, 164, 32, 46);
    }
    ctx.stroke();
    // The dimension line along the top.
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(36, 34);
    ctx.lineTo(220, 34);
    ctx.moveTo(36, 28);
    ctx.lineTo(36, 40);
    ctx.moveTo(220, 28);
    ctx.lineTo(220, 40);
    ctx.stroke();
    // The title block in the bottom right.
    ctx.lineWidth = 1.5;
    ctx.strokeRect(110, 270, 136, 72);
    ctx.beginPath();
    ctx.moveTo(110, 300);
    ctx.lineTo(246, 300);
    ctx.moveTo(178, 300);
    ctx.lineTo(178, 342);
    ctx.stroke();
    ctx.fillStyle = "rgba(238, 241, 234, 0.85)";
    ctx.font = "700 16px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PROJECTS", 178, 286);
    ctx.font = "600 10px ui-monospace, monospace";
    ctx.fillText("SHEETS", 144, 321);
    ctx.fillText("1:100", 212, 321);
    // A red "under construction" stamp, at an angle.
    ctx.save();
    ctx.translate(80, 250);
    ctx.rotate(-0.25);
    ctx.strokeStyle = "rgba(255, 122, 107, 0.9)";
    ctx.lineWidth = 3;
    ctx.strokeRect(-56, -14, 112, 28);
    ctx.fillStyle = "rgba(255, 122, 107, 0.9)";
    ctx.font = "800 12px ui-monospace, monospace";
    ctx.fillText(seed % 2 === 0 ? "IN PROGRESS" : "COLLABORATED", 0, 1);
    ctx.restore();
  });
}
