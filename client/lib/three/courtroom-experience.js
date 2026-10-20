/* global window, document, location, console, performance, matchMedia, getComputedStyle, requestAnimationFrame, cancelAnimationFrame, setTimeout, clearTimeout, ResizeObserver */
// Ported from the design handoff's courtroom-experience.js: three is bundled from npm and the
// cases, acts, asset manifest and canvas fonts are passed to mount(). Otherwise kept as delivered.
// AI Courtroom — real-time 3D landing experience (three.js).
// Every significant object is built as a placeholder inside a named Group registered with reg(id, group).
// To swap in production models, set `src` on the matching entry in ASSETS (lib/landing-cases.ts); swapModels() replaces
// the placeholder children of every registered group with the loaded glTF while keeping pivots/animation.
import * as THREE from "three";
import { buildGavel } from "./models/gavel.js";
import { buildJudge } from "./models/judge.js";
import { buildDoor } from "./models/door.js";
import { buildClockCase, buildBankerLamp, buildPendulum } from "./models/furniture.js";
import { buildDesk, buildBoardFrame, buildOfficeChair } from "./models/office.js";
import { mergeByMaterial } from "./models/merge.js";
import {
  buildJudgesBench,
  buildJudgesChair,
  buildGalleryBench,
  buildCounselTable,
  buildDrapes,
  buildNamePlaque,
  buildInkwellSet,
  buildSconce,
  buildPortraitFrame,
  buildSideTable,
  buildLibraryTable,
  buildPocketDoor,
  buildRug,
} from "./models/furnishings.js";
import { buildBookcase, bookGeometry, buildChandelier } from "./models/library.js";
import { buildPillar, buildLantern, buildWindow, buildSteps, buildFacade, buildPavement, buildRoad } from "./models/exterior.js";
import { buildPanelledWall } from "./models/interior.js";
import {
  buildCourtWall,
  buildCourtWindow,
  buildCourtCeiling,
  buildBarRail,
  buildBarGate,
  buildAisleRunner,
} from "./models/courtroom-room.js";
import { buildClubChair } from "./models/lounge.js";
import { buildWaxSeal } from "./models/seal.js";
import { buildCourtDoorLeaf, buildCourtPlaque, buildWitnessStand, buildStenoDesk, buildTypewriter } from "./models/courtroom.js";

const W = window;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const ss = (t) => t * t * (3 - 2 * t);
const R = (p, a, b) => ss(inv(a, b, p));
const eio = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eout = (t) => 1 - Math.pow(1 - t, 3);
const bump = (p, a, b, c) => (p < b ? R(p, a, b) : 1 - R(p, b, c));
let _s = 20240917;
const rnd = () => (_s = (_s * 16807) % 2147483647) / 2147483647;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
let SERIF = '"Libre Caslon Display", Georgia, serif',
  TEXT = '"Libre Caslon Text", Georgia, serif',
  SANS = '"Hanken Grotesk", Helvetica, sans-serif',
  MONO = '"IBM Plex Mono", monospace',
  HAND = '"Caveat", cursive',
  SIGN = '"Homemade Apple", cursive';
const handNote = (g, t, x, y, col, rot, size, font = HAND) => {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = col;
  g.font = `${size}px ${font}`;
  g.textAlign = "left";
  g.fillText(t, 0, 0);
  g.restore();
};

/* ---------------- canvas textures ---------------- */
function cv(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
function tex(c, rep, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (rep) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep[0], rep[1]);
  }
  return t;
}
// grain without reading the canvas back: Safari (iOS) injects coloured anti-fingerprinting noise into getImageData, which showed up as coloured speckle on the courtroom walls.
const _gt = {};
function _grainTile(a) {
  if (_gt[a]) return _gt[a];
  const S = 512,
    nc = document.createElement("canvas");
  nc.width = nc.height = S;
  const nx = nc.getContext("2d"),
    id = nx.createImageData(S, S),
    q = id.data;
  for (let i = 0; i < q.length; i += 4) {
    const n = (rnd() - 0.5) * a,
      v = n > 0 ? 255 : 0;
    q[i] = v;
    q[i + 1] = v;
    q[i + 2] = v;
    q[i + 3] = Math.abs(n) * 2.2;
  }
  nx.putImageData(id, 0, 0);
  return (_gt[a] = nc);
}
// Glow / beam textures are computed straight into pixel arrays. Safari (iOS 26 fingerprinting protection) adds coloured noise to any canvas that holds
// gradients or blur when it is uploaded to WebGL; stretched over an additive glow plane that noise read as coloured speckle across the courtroom doorway.
function dataTex(w, h, fn, srgb = true) {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [v, a] = fn((x + 0.5) / w, (y + 0.5) / h),
        k = (y * w + x) * 4;
      d[k] = d[k + 1] = d[k + 2] = Math.round(255 * v);
      d[k + 3] = Math.round(255 * a);
    }
  const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function grain(g, w, h, a) {
  const t = _grainTile(a),
    p = g.createPattern(t, "repeat"),
    ox = (rnd() * 512) | 0,
    oy = (rnd() * 512) | 0,
    op = g.globalCompositeOperation,
    ga = g.globalAlpha;
  g.save();
  g.globalCompositeOperation = "source-atop";
  g.globalAlpha = 1;
  g.translate(-ox, -oy);
  g.fillStyle = p;
  g.fillRect(ox, oy, w, h);
  g.restore();
  g.globalCompositeOperation = op;
  g.globalAlpha = ga;
}
function sp(g, v) {
  if ("letterSpacing" in g) g.letterSpacing = v;
}
function wrap(g, text, x, y, mw, lh, max = 99) {
  const words = String(text).split(" ");
  let line = "",
    n = 0;
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (g.measureText(t).width > mw && line) {
      g.fillText(line, x, y);
      y += lh;
      line = w;
      if (++n >= max) return y;
    } else line = t;
  }
  if (line) g.fillText(line, x, y);
  return y + lh;
}
function fitLine(g, t, x, y, mw, size, fam, weight = "400", ls = "0px") {
  sp(g, ls);
  let z = size;
  do {
    g.font = `${weight} ${z}px ${fam}`;
  } while (g.measureText(t).width > mw && (z -= 1) > size * 0.45);
  g.fillText(t, x, y);
  sp(g, "0px");
}
function countLines(g, t, mw) {
  let n = 1,
    line = "";
  for (const w of String(t).split(" ")) {
    const tt = line ? line + " " + w : w;
    if (g.measureText(tt).width > mw && line) {
      n++;
      line = w;
    } else line = tt;
  }
  return n;
}
function wrapFit(g, t, x, y, mw, size, fam, weight, maxLines) {
  let z = size;
  for (; z > size * 0.5; z -= 2) {
    g.font = `${weight} ${z}px ${fam}`;
    if (
      countLines(g, t, mw) <= maxLines &&
      String(t)
        .split(" ")
        .every((w) => g.measureText(w).width <= mw)
    )
      break;
  }
  return wrap(g, t, x, y, mw, Math.round(z * 1.14), maxLines);
}
function bars(g, x, y, w, n, lh, col, jag = 0.35) {
  g.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const ww = w * (1 - rnd() * jag * (i % 5 === 4 ? 2 : 1));
    g.fillRect(x, y + i * lh, ww, Math.max(2, lh * 0.32));
  }
  return y + n * lh;
}
function woodC(base, dark, light, w = 512, h = 512, o = {}) {
  const [c, g] = cv(w, h);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 240; i++) {
    const x = rnd() * w,
      amp = 2 + rnd() * 6,
      f = 0.004 + rnd() * 0.012,
      ph = rnd() * 6;
    g.strokeStyle = rnd() < 0.6 ? dark : light;
    g.globalAlpha = 0.05 + rnd() * 0.17;
    g.lineWidth = 0.6 + rnd() * 2.4;
    g.beginPath();
    for (let y = 0; y <= h; y += 8) {
      const xx = x + Math.sin(y * f + ph) * amp;
      if (y) g.lineTo(xx, y);
      else g.moveTo(xx, y);
    }
    g.stroke();
  }
  if (o.planks) {
    g.globalAlpha = 0.6;
    g.strokeStyle = "#0a0604";
    g.lineWidth = 2.5;
    const n = o.planks,
      pw = w / n;
    for (let i = 0; i <= n; i++) {
      g.beginPath();
      g.moveTo(i * pw, 0);
      g.lineTo(i * pw, h);
      g.stroke();
      for (let k = 0; k < 2; k++) {
        const y = rnd() * h;
        g.beginPath();
        g.moveTo(i * pw, y);
        g.lineTo(i * pw + pw, y);
        g.stroke();
      }
      g.globalAlpha = 0.07;
      g.fillStyle = rnd() < 0.5 ? "#000" : "#fff";
      g.fillRect(i * pw, 0, pw, h);
      g.globalAlpha = 0.6;
    }
  }
  if (o.scratch) {
    g.strokeStyle = "#d9b58a";
    for (let i = 0; i < o.scratch; i++) {
      g.globalAlpha = 0.04 + rnd() * 0.12;
      g.lineWidth = 0.6;
      const x = rnd() * w,
        y = rnd() * h,
        l = 8 + rnd() * 40,
        a = rnd() * 6.3;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  grain(g, w, h, 12);
  return c;
}
function mottleC(base, w, h, n, a, dark = "#000", light = "#fff", gr = 16) {
  const [c, g] = cv(w, h);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    g.globalAlpha = a * rnd();
    g.fillStyle = rnd() < 0.5 ? dark : light;
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, 2 + rnd() * 14, 0, 7);
    g.fill();
  }
  g.globalAlpha = 1;
  grain(g, w, h, gr);
  return c;
}
function corkC() {
  const w = 512,
    [c, g] = cv(w, w);
  g.fillStyle = "#7a5636";
  g.fillRect(0, 0, w, w);
  for (let i = 0; i < 9000; i++) {
    const v = rnd();
    g.fillStyle = v < 0.4 ? "rgba(52,32,16,.5)" : v < 0.8 ? "rgba(150,108,66,.45)" : "rgba(30,18,10,.6)";
    g.fillRect(rnd() * w, rnd() * w, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  grain(g, w, w, 26);
  return c;
}
function stoneC() {
  const w = 1024,
    h = 1024,
    [c, g] = cv(w, h);
  g.fillStyle = "#3a3531";
  g.fillRect(0, 0, w, h);
  const bh = 128,
    bw = 256;
  for (let r = 0; r < h / bh; r++)
    for (let k = -1; k < w / bw + 1; k++) {
      const x = k * bw + ((r % 2) * bw) / 2;
      const v = 48 + rnd() * 18;
      g.fillStyle = `rgb(${v + 6},${v + 2},${v - 2})`;
      g.fillRect(x + 3, r * bh + 3, bw - 6, bh - 6);
    }
  grain(g, w, h, 30);
  return c;
}
function cobbleC() {
  const w = 512,
    [c, g] = cv(w, w);
  g.fillStyle = "#141110";
  g.fillRect(0, 0, w, w);
  for (let r = 0; r < 16; r++)
    for (let k = 0; k < 12; k++) {
      const v = 26 + rnd() * 16;
      g.fillStyle = `rgb(${v},${v - 2},${v - 4})`;
      g.beginPath();
      g.ellipse(k * 44 + (r % 2) * 22 + 20, r * 32 + 16, 19, 13, 0, 0, 7);
      g.fill();
    }
  grain(g, w, w, 20);
  return c;
}
function carpetC(field = "#4f1510") {
  const w = 256,
    h = 1024,
    [c, g] = cv(w, h);
  g.fillStyle = field;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#b8955a";
  g.fillRect(14, 0, 5, h);
  g.fillRect(w - 19, 0, 5, h);
  g.fillStyle = "#1e0806";
  g.fillRect(24, 0, 10, h);
  g.fillRect(w - 34, 0, 10, h);
  g.strokeStyle = "rgba(184,149,90,.25)";
  g.lineWidth = 2;
  for (let y = 0; y < h; y += 64) {
    g.beginPath();
    g.moveTo(w / 2, y);
    g.lineTo(w / 2 + 40, y + 32);
    g.lineTo(w / 2, y + 64);
    g.lineTo(w / 2 - 40, y + 32);
    g.closePath();
    g.stroke();
  }
  grain(g, w, h, 18);
  return c;
}
function rugC() {
  const w = 512,
    h = 1024,
    [c, g] = cv(w, h);
  g.fillStyle = "#471310";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#16161c";
  g.fillRect(0, 0, w, 70);
  g.fillRect(0, h - 70, w, 70);
  g.fillRect(0, 0, 70, h);
  g.fillRect(w - 70, 0, 70, h);
  g.strokeStyle = "#b8955a";
  g.lineWidth = 4;
  g.strokeRect(78, 78, w - 156, h - 156);
  g.strokeRect(18, 18, w - 36, h - 36);
  g.globalAlpha = 0.5;
  g.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.ellipse(w / 2, h / 2, 60 + i * 26, 140 + i * 50, 0, 0, 7);
    g.stroke();
  }
  g.globalAlpha = 1;
  grain(g, w, h, 22);
  return c;
}
function spineC() {
  const w = 64,
    h = 256,
    [c, g] = cv(w, h);
  g.fillStyle = "#d8d0c4";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 22, w, 5);
  g.fillRect(0, 34, w, 3);
  g.fillRect(0, h - 30, w, 5);
  g.fillStyle = "#1a1512";
  g.globalAlpha = 0.35;
  g.fillRect(8, 60, w - 16, 40);
  g.globalAlpha = 1;
  grain(g, w, h, 30);
  return c;
}
function stripeC(w, h, label, bg = "#2a2622", fg = "#35302b", ink = "#8d8374") {
  const [c, g] = cv(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = fg;
  g.lineWidth = 10;
  for (let i = -h; i < w + h; i += 26) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + h, h);
    g.stroke();
  }
  g.fillStyle = ink;
  g.font = `500 ${Math.round(w / 22)}px ${MONO}`;
  g.textAlign = "center";
  label.split("\n").forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i * w) / 16));
  return c;
}
function paperC(w, h, col = "#ece4d2", edge = 0.18) {
  const [c, g] = cv(w, h);
  g.fillStyle = col;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 80; i++) {
    g.globalAlpha = 0.03 * rnd();
    g.fillStyle = "#6b5030";
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, 10 + rnd() * 60, 0, 7);
    g.fill();
  }
  g.globalAlpha = 1;
  const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  gr.addColorStop(0, "rgba(90,60,30,0)");
  gr.addColorStop(1, `rgba(90,60,30,${edge})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  grain(g, w, h, 10);
  return [c, g];
}

function plaqueC(name) {
  const MAIN = name ? "ADV. " + String(name).toUpperCase() : "AI COURTROOM",
    SUB = name ? "CHAMBERS · AI COURTROOM" : "CHAMBERS OF ADVOCACY";
  const w = 1400,
    h = 292,
    [c, g] = cv(w, h);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, "#e2c286");
  gr.addColorStop(0.45, "#b88f4c");
  gr.addColorStop(1, "#8c6a36");
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "#5a4020";
  g.lineWidth = 6;
  g.strokeRect(18, 18, w - 36, h - 36);
  g.strokeStyle = "#f0d8a8";
  g.lineWidth = 2;
  g.strokeRect(30, 30, w - 60, h - 60);
  g.textAlign = "center";
  g.textBaseline = "middle";
  sp(g, "14px");
  let fs = 120;
  g.font = `400 ${fs}px ${SERIF}`;
  const tw = g.measureText(MAIN).width,
    mw = w - 200;
  if (tw > mw) {
    fs = Math.floor((fs * mw) / tw);
    g.font = `400 ${fs}px ${SERIF}`;
  }
  g.fillStyle = "rgba(255,236,200,.55)";
  g.fillText(MAIN, w / 2 + 9, 126);
  g.fillStyle = "#2a1a0a";
  g.fillText(MAIN, w / 2 + 7, 124);
  g.font = `600 26px ${SANS}`;
  sp(g, "10px");
  g.fillStyle = "#3a2610";
  g.fillText(SUB, w / 2 + 5, 224);
  const sw = g.measureText(SUB).width;
  g.fillStyle = "#8e1f19";
  [
    [w / 2 - sw / 2 - 40, 224],
    [w / 2 + sw / 2 + 40, 224],
  ].forEach(([x, y]) => {
    g.beginPath();
    g.moveTo(x, y - 9);
    g.lineTo(x + 9, y);
    g.lineTo(x, y + 9);
    g.lineTo(x - 9, y);
    g.fill();
  });
  grain(g, w, h, 14);
  return c;
}
function lintelC() {
  const w = 1024,
    h = 128,
    [c, g] = cv(w, h);
  g.fillStyle = "#2c1b10";
  g.fillRect(0, 0, w, h);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#c9a45c";
  fitLine(g, "NYAYA · SATYA · DHARMA", w / 2, h / 2 + 4, w - 60, 60, SERIF, "400", "16px");
  grain(g, w, h, 12);
  return c;
}
function coverC(cs) {
  const w = 512,
    h = 676,
    [c, g] = cv(w, h);
  g.fillStyle = cs.cover.bg;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) {
    g.globalAlpha = 0.05 * rnd();
    g.fillStyle = rnd() < 0.5 ? "#000" : "#fff";
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, 2 + rnd() * 10, 0, 7);
    g.fill();
  }
  g.globalAlpha = 1;
  const ink = cs.cover.ink;
  g.strokeStyle = ink;
  g.globalAlpha = 0.55;
  g.lineWidth = 2;
  g.strokeRect(26, 26, w - 52, h - 52);
  g.globalAlpha = 1;
  g.fillStyle = ink;
  g.textAlign = "left";
  g.font = `600 17px ${SANS}`;
  sp(g, "5px");
  fitLine(g, cs.docket.toUpperCase(), 52, 82, w - 104, 17, SANS, "600", "4px");
  g.font = `600 17px ${SANS}`;
  g.fillRect(52, 100, w - 104, 2);
  g.textAlign = "left";
  sp(g, "0px");
  let y = wrapFit(g, cs.title, 52, 190, w - 104, 52, SERIF, "400", 3);
  g.font = `italic 26px ${TEXT}`;
  wrap(g, cs.q || cs.area, 52, y + 14, w - 104, 32, 2);
  g.font = `600 15px ${SANS}`;
  sp(g, "4px");
  g.fillText(cs.area.toUpperCase(), 52, h - 140);
  sp(g, "0px");
  g.font = `600 15px ${SANS}`;
  sp(g, "4px");
  g.fillRect(52, h - 92, w - 104, 1);
  g.fillStyle = cs.cover.accent;
  g.fillText("CONFIDENTIAL — FOR COUNSEL", 52, h - 60);
  grain(g, w, h, 16);
  return c;
}
function insideC(cs) {
  const [c, g] = paperC(512, 676, "#e6dcc4");
  g.fillStyle = "#2a1d12";
  g.font = `600 16px ${SANS}`;
  sp(g, "5px");
  g.fillText("INDEX OF DOCUMENTS", 52, 90);
  g.fillRect(52, 104, 408, 1.5);
  sp(g, "0px");
  Object.values(cs.docs).forEach((d, i) => fitLine(g, `${i + 1}.  ${d[0]}`, 52, 150 + i * 44, 408, 22, TEXT));
  fitLine(g, cs.title, 52, 560, 408, 20, TEXT, "italic 400");
  return c;
}

const DOCS = [
  { k: "police", w: 0.21, h: 0.28 },
  { k: "photo", w: 0.16, h: 0.19 },
  { k: "tag", w: 0.075, h: 0.14 },
  { k: "witness", w: 0.21, h: 0.28 },
  { k: "transcript", w: 0.21, h: 0.28 },
  { k: "news", w: 0.26, h: 0.34 },
  { k: "note", w: 0.14, h: 0.14 },
  { k: "notice", w: 0.21, h: 0.28 },
];
function docC(k, cs) {
  const d = cs.docs[k],
    ink = "#1f1812",
    grey = "rgba(40,30,20,.28)";
  if (k === "photo") {
    const w = 520,
      h = 620,
      [c, g] = paperC(w, h, "#efeae0", 0.08);
    const [ph] = [stripeC(460, 460, "EVIDENCE PHOTO\ntexture slot")];
    g.drawImage(ph, 30, 30);
    g.fillStyle = "#2a2018";
    fitLine(g, d[1], 36, 560, w - 72, 44, HAND);
    return c;
  }
  if (k === "tag") {
    const w = 280,
      h = 520,
      [c, g] = paperC(w, h, "#c9a66b", 0.25);
    g.fillStyle = "#6b4a22";
    g.beginPath();
    g.arc(w / 2, 50, 22, 0, 7);
    g.fill();
    g.fillStyle = "#e6d6b0";
    g.beginPath();
    g.arc(w / 2, 50, 12, 0, 7);
    g.fill();
    g.fillStyle = "#8e1f19";
    g.fillRect(0, 100, w, 46);
    g.fillStyle = "#f2e6cc";
    g.font = `700 24px ${SANS}`;
    sp(g, "6px");
    g.textAlign = "center";
    g.fillText("EVIDENCE", w / 2, 132);
    sp(g, "0px");
    g.fillStyle = ink;
    const [ex, what] = d[1].split(" · ");
    fitLine(g, ex, w / 2, 200, w - 40, 22, MONO, "600");
    wrapFit(g, what || "", w / 2, 270, w - 40, 38, HAND, "400", 2);
    g.textAlign = "left";
    bars(g, 30, 380, w - 60, 4, 30, grey);
    return c;
  }
  if (k === "note") {
    const w = 520,
      h = 520,
      [c, g] = paperC(w, h, "#e7d9a2", 0.2);
    g.strokeStyle = "rgba(80,110,160,.35)";
    g.lineWidth = 2;
    for (let y = 90; y < h; y += 48) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.fillStyle = "#1d2a4a";
    wrapFit(g, d[1], 40, 176, w - 70, 64, HAND, "400", 3);
    g.strokeStyle = "#8e1f19";
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(w / 2, 380, 180, 44, -0.05, 0, 7);
    g.stroke();
    return c;
  }
  if (k === "news") {
    const w = 780,
      h = 1020,
      [c, g] = paperC(w, h, "#d9cfb6", 0.3);
    g.fillStyle = ink;
    g.textAlign = "center";
    fitLine(g, d[0], w / 2, 90, w - 80, 62, SERIF);
    g.fillRect(40, 112, w - 80, 3);
    g.fillRect(40, 120, w - 80, 1);
    g.font = `600 15px ${SANS}`;
    sp(g, "4px");
    g.fillText("LATE CITY EDITION", w / 2, 146);
    sp(g, "0px");
    let y = wrapFit(g, d[1], w / 2, 225, w - 90, 60, TEXT, "700", 3);
    g.textAlign = "left";
    const ph = stripeC(w - 80, 250, "PRESS PHOTO · texture slot", "#bdb39a", "#c7bea6", "#6f6754");
    g.drawImage(ph, 40, y + 10);
    for (let col = 0; col < 3; col++) bars(g, 40 + col * ((w - 80) / 3), y + 290, (w - 80) / 3 - 20, 14, 26, "rgba(30,24,18,.4)", 0.1);
    return c;
  }
  const w = 780,
    h = 1040,
    [c, g] = paperC(w, h, k === "transcript" ? "#ebe3cf" : "#eee8da", 0.16);
  g.fillStyle = ink;
  g.textAlign = "left";
  if (k === "notice") {
    g.fillStyle = "#8e1f19";
    g.fillRect(0, 0, w, 16);
    g.fillStyle = ink;
    g.textAlign = "center";
    fitLine(g, cs.court || "IN THE COURT", w / 2, 110, w - 120, 18, SANS, "600", "5px");
    const ny = wrapFit(g, d[1], w / 2, 190, w - 120, 54, SERIF, "400", 2);
    fitLine(g, cs.title, w / 2, ny + 14, w - 120, 28, TEXT, "italic 400");
    fitLine(g, cs.docket, w / 2, ny + 56, w - 120, 28, TEXT, "italic 400");
    g.textAlign = "left";
    bars(g, 70, ny + 120, w - 140, 13, 34, grey, 0.2);
    g.strokeStyle = "#8e1f19";
    g.lineWidth = 5;
    g.beginPath();
    g.arc(w - 160, h - 150, 70, 0, 7);
    g.stroke();
    g.font = `700 16px ${SANS}`;
    g.fillStyle = "#8e1f19";
    g.textAlign = "center";
    g.fillText("FILED", w - 160, h - 144);
    g.textAlign = "left";
    g.fillStyle = ink;
    handNote(g, "J. Whitmore", 76, h - 150, "#1d2a4a", -0.03, 36, SIGN);
    g.fillRect(70, h - 126, 320, 2);
    g.font = `18px ${TEXT}`;
    g.fillText("CLERK OF THE COURT", 70, h - 96);
    return c;
  }
  fitLine(g, d[0].toUpperCase(), 70, 100, w - 330, 18, SANS, "600", "6px");
  fitLine(g, cs.docket, 70, 132, w - 140, 16, MONO, "500");
  g.fillRect(70, 152, w - 140, 2);
  if (k === "police") {
    g.font = `700 22px ${MONO}`;
    g.fillText("I.I.F.-I", w - 190, 100);
    let y = wrapFit(g, d[1], 70, 220, w - 140, 28, TEXT, "400", 6);
    bars(g, 70, y + 20, w - 140, Math.max(0, Math.min(12, Math.floor((h - 280 - y) / 36))), 36, grey);
    {
      const ex = (cs.docs.tag[1] || "").split(" · ")[0] || "";
      handNote(g, "see " + ex + " →", 84, h - 220, "#9b1f18", -0.05, 50);
      g.strokeStyle = "#9b1f18";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(84, h - 204);
      g.quadraticCurveTo(200, h - 196, 330, h - 214);
      g.stroke();
    }
    g.strokeStyle = "#8e1f19";
    g.lineWidth = 4;
    g.strokeRect(w - 300, h - 170, 230, 80);
    g.fillStyle = "#8e1f19";
    g.font = `700 22px ${SANS}`;
    sp(g, "4px");
    g.fillText("ON RECORD", w - 280, h - 120);
    return c;
  }
  if (k === "witness") {
    const [q, who = ""] = d[1].split(" — ");
    g.strokeStyle = "rgba(80,110,160,.28)";
    g.lineWidth = 1.5;
    for (let ly = 238; ly < h - 220; ly += 56) {
      g.beginPath();
      g.moveTo(70, ly);
      g.lineTo(w - 70, ly);
      g.stroke();
    }
    g.fillStyle = "#1d2a4a";
    g.font = `46px ${HAND}`;
    wrap(g, q, 74, 230, w - 150, 56, 9);
    g.font = `20px ${TEXT}`;
    g.fillStyle = ink;
    g.fillText("I declare the above to be true.", 70, h - 200);
    handNote(g, who, 76, h - 118, "#1d2a4a", -0.04, 34, SIGN);
    g.fillRect(70, h - 96, 360, 2);
    g.font = `18px ${TEXT}`;
    g.fillText(who.toUpperCase(), 70, h - 66);
    return c;
  }
  if (k === "transcript") {
    let y = wrapFit(g, d[1], 70, 220, w - 140, 26, MONO, "400", 4);
    for (let i = 0; i < 7; i++) {
      g.fillStyle = ink;
      g.font = `600 22px ${MONO}`;
      g.fillText(i % 2 ? "A:" : "Q:", 70, y + 30 + i * 70);
      bars(g, 120, y + 18 + i * 70, w - 190, 2, 28, grey);
    }
    handNote(g, "inconsistent?", w - 360, h - 70, "#1d2a4a", -0.07, 52);
    g.strokeStyle = "#1d2a4a";
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(250, y + 30, 200, 38, -0.02, 0, 7);
    g.stroke();
    return c;
  }
  return c;
}
function finalC(cs) {
  const w = 780,
    h = 1040,
    [c, g] = paperC(w, h, "#f1eee6", 0.1);
  g.fillStyle = "#1f1812";
  g.font = `600 18px ${SANS}`;
  fitLine(g, cs.final.label.toUpperCase(), 70, 100, w - 140, 18, SANS, "600", "6px");
  g.fillRect(70, 120, w - 140, 2);
  g.font = `500 25px ${MONO}`;
  for (let i = 0; i < 12; i++) {
    const l = i < 3 ? cs.final.lines[i] : "";
    if (l) {
      g.fillStyle = i === 0 ? "rgba(142,31,25,.16)" : "transparent";
      g.fillRect(60, 170 + i * 60, w - 120, 46);
      g.fillStyle = "#1f1812";
      fitLine(g, l, 76, 202 + i * 60, w - 152, 25, MONO, "500");
    } else bars(g, 76, 180 + i * 60, w - 160, 1, 40, "rgba(40,30,20,.22)");
  }
  g.strokeStyle = "#8e1f19";
  g.lineWidth = 5;
  g.beginPath();
  g.ellipse(w / 2, 194, w / 2 - 36, 44, 0, 0, 7);
  g.stroke();
  handNote(g, "this changes everything.", 96, h - 110, "#9b1f18", -0.05, 54);
  return c;
}
function cardC(cs) {
  const w = 900,
    h = 500,
    [c, g] = paperC(w, h, "#efe6d3", 0.12);
  g.fillStyle = "#8e1f19";
  g.fillRect(0, 0, w, 14);
  g.fillStyle = "#1f1812";
  g.textAlign = "center";
  g.font = `600 20px ${SANS}`;
  sp(g, "8px");
  g.fillText("THE CASE", w / 2, 90);
  sp(g, "0px");
  let y = wrapFit(g, cs.title, w / 2, 180, w - 120, 62, SERIF, "400", 2);
  fitLine(g, cs.area + "  ·  " + cs.docket, w / 2, Math.min(y + 20, 440), w - 120, 30, TEXT, "italic 400");
  return c;
}
function timelineC(cs) {
  const w = 4096,
    h = 190,
    [c, g] = paperC(w, h, "#e9dfc7", 0.1);
  const ev = cs.timeline || [];
  const n = ev.length;
  if (!n) return c;
  const HW = 300;
  g.fillStyle = "#8e1f19";
  g.fillRect(0, 0, HW, h);
  g.fillStyle = "#f2e6cc";
  g.textAlign = "center";
  fitLine(g, "TIMELINE", HW / 2, 86, HW - 40, 30, SANS, "700", "6px");
  fitLine(g, "OF EVENTS", HW / 2, 124, HW - 40, 22, SANS, "700", "5px");
  const pad = 30,
    span = (w - HW - pad * 2) / n,
    cw = span - 44,
    ly = 66;
  g.strokeStyle = "#a8231c";
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(HW + pad, ly);
  g.lineTo(w - pad, ly);
  g.stroke();
  ev.forEach((e, k) => {
    const x = HW + pad + span * (k + 0.5);
    g.fillStyle = "#9b1f18";
    g.beginPath();
    g.arc(x, ly, 13, 0, 7);
    g.fill();
    g.fillStyle = "#f2e6cc";
    g.beginPath();
    g.arc(x - 4, ly - 4, 4, 0, 7);
    g.fill();
    g.textAlign = "center";
    g.fillStyle = "#1f1812";
    fitLine(g, e.t, x, 40, cw, 24, MONO, "600");
    g.fillStyle = "#1f1812";
    wrapFit(g, e.d, x, 106, cw, 24, TEXT, "400", 2);
  });
  g.textAlign = "left";
  return c;
}
function wrapT(g, text, x, y, maxW, lh) {
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (g.measureText(t).width > maxW && line) {
      g.fillText(line, x, y);
      y += lh;
      line = w;
    } else line = t;
  }
  if (line) g.fillText(line, x, y);
  return y + lh;
}
function sealDot(g, x, y, r) {
  g.fillStyle = "#8e1f19";
  g.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2,
      rr = r * (i % 2 ? 0.9 : 1);
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.fill();
  g.strokeStyle = "rgba(255,220,200,.35)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(x, y, r * 0.62, 0, Math.PI * 2);
  g.stroke();
}
function signAt(g, x, y, label) {
  g.strokeStyle = "#1d2a4a";
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(x - 46, y - 8);
  g.bezierCurveTo(x - 20, y - 34, x - 6, y + 6, x + 12, y - 16);
  g.bezierCurveTo(x + 22, y - 28, x + 30, y - 4, x + 48, y - 14);
  g.stroke();
  g.strokeStyle = "#2a1d12";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x - 70, y);
  g.lineTo(x + 70, y);
  g.stroke();
  g.fillStyle = "#2a1d12";
  g.font = `400 13px ${TEXT}`;
  g.fillText(label, x, y + 18);
}
function wallDocC(kind, who) {
  if (kind === "calendar") {
    const [c, g] = paperC(360, 520, "#f1ece0", 0.12);
    g.fillStyle = "#8e1f19";
    g.fillRect(0, 0, 360, 78);
    g.fillStyle = "#f7efe2";
    g.textAlign = "center";
    g.font = `600 30px ${SANS}`;
    sp(g, "6px");
    g.fillText("SEPTEMBER", 180, 44);
    g.font = `400 16px ${SANS}`;
    g.fillText("2026", 180, 66);
    sp(g, "0px");
    g.fillStyle = "#070504";
    g.beginPath();
    g.arc(180, 12, 5, 0, Math.PI * 2);
    g.fill();
    g.font = `600 14px ${SANS}`;
    "SMTWTFS".split("").forEach((d, i) => {
      g.fillStyle = i ? "#2a1d12" : "#8e1f19";
      g.fillText(d, 36 + i * 48, 108);
    });
    g.font = `400 20px ${TEXT}`;
    for (let d = 1; d <= 30; d++) {
      const k = d + 1,
        col = k % 7,
        row = (k / 7) | 0,
        x = 36 + col * 48,
        y = 146 + row * 52;
      g.fillStyle = col ? "#2a1d12" : "#8e1f19";
      g.fillText(String(d), x, y);
      if ([7, 18, 29].includes(d)) {
        g.strokeStyle = "#b3261e";
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(x, y - 7, 19, 15, -0.2, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.fillStyle = "#6b5a44";
    g.font = `italic 400 13px ${TEXT}`;
    g.fillText("Hearing dates marked in red", 180, 480);
    g.textAlign = "left";
    return c;
  }
  if (kind === "quote") {
    const [c, g] = cv(420, 260);
    g.fillStyle = "#1d2a22";
    g.fillRect(0, 0, 420, 260);
    g.strokeStyle = "#c9a45c";
    g.lineWidth = 2;
    g.strokeRect(14, 14, 392, 232);
    g.fillStyle = "#d9bd7c";
    g.textAlign = "center";
    g.font = `400 30px ${SERIF}`;
    sp(g, "5px");
    g.fillText("FIAT JUSTITIA", 210, 108);
    g.fillText("RUAT CAELUM", 210, 150);
    sp(g, "0px");
    g.font = `italic 400 15px ${TEXT}`;
    g.fillStyle = "#b9ad97";
    g.fillText("Let justice be done, though the heavens fall.", 210, 200);
    g.textAlign = "left";
    return c;
  }
  const dims = { degree: [700, 540], enrol: [480, 640], practice: [420, 320], preamble: [520, 700] }[kind],
    [W0, H0] = dims,
    [c, g] = paperC(W0, H0, kind === "preamble" ? "#efe6cf" : "#ece2c8", 0.22);
  g.strokeStyle = kind === "preamble" ? "#8e1f19" : "#8a6a36";
  g.lineWidth = 3;
  g.strokeRect(20, 20, W0 - 40, H0 - 40);
  g.lineWidth = 1;
  g.strokeRect(28, 28, W0 - 56, H0 - 56);
  g.fillStyle = "#2a1d12";
  g.textAlign = "center";
  const cx = W0 / 2;
  if (kind === "degree") {
    g.font = `600 22px ${SANS}`;
    sp(g, "6px");
    g.fillText("FACULTY OF LAW", cx, 92);
    sp(g, "0px");
    g.font = `italic 400 20px ${TEXT}`;
    g.fillText("This is to certify that", cx, 168);
    fitLine(g, who, cx, 224, W0 - 120, 40, SERIF);
    g.font = `italic 400 20px ${TEXT}`;
    g.fillText("has been admitted to the degree of", cx, 274);
    g.font = `400 34px ${SERIF}`;
    g.fillText("Bachelor of Laws (LL.B.)", cx, 324);
    g.font = `400 16px ${TEXT}`;
    g.fillText("Given under the seal of the University, 2019", cx, 370);
    sealDot(g, cx, 446, 34);
    signAt(g, 140, 462, "Registrar");
    signAt(g, 560, 462, "Vice-Chancellor");
  }
  if (kind === "enrol") {
    g.font = `600 18px ${SANS}`;
    sp(g, "5px");
    g.fillText("STATE BAR COUNCIL", cx, 84);
    sp(g, "0px");
    g.font = `400 28px ${SERIF}`;
    g.fillText("Certificate of Enrolment", cx, 130);
    g.fillStyle = "#b8a888";
    g.fillRect(cx - 50, 160, 100, 120);
    g.fillStyle = "#6b5a44";
    g.beginPath();
    g.arc(cx, 205, 22, 0, Math.PI * 2);
    g.fill();
    g.fillRect(cx - 38, 236, 76, 44);
    g.fillStyle = "#2a1d12";
    g.font = `italic 400 17px ${TEXT}`;
    g.fillText("Certified that", cx, 320);
    fitLine(g, who, cx, 360, W0 - 100, 30, SERIF);
    g.font = `400 16px ${TEXT}`;
    wrapT(g, "has been enrolled as an Advocate on the roll of this Council under the Advocates Act, 1961.", cx, 396, 380, 22);
    g.fillText("Enrolment No. D/2417/2019", cx, 470);
    g.fillText("Dated 14 August 2019", cx, 494);
    sealDot(g, 120, 566, 30);
    signAt(g, 350, 572, "Secretary");
  }
  if (kind === "practice") {
    g.font = `600 15px ${SANS}`;
    sp(g, "4px");
    g.fillText("STATE BAR COUNCIL", cx, 70);
    sp(g, "0px");
    g.font = `400 24px ${SERIF}`;
    g.fillText("Certificate of Practice", cx, 108);
    fitLine(g, who, cx, 148, W0 - 80, 15, TEXT);
    g.font = `400 15px ${TEXT}`;
    g.fillText("Renewed for the year 2026", cx, 172);
    sealDot(g, 96, 250, 24);
    signAt(g, 300, 256, "Registrar");
  }
  if (kind === "preamble") {
    g.font = `600 15px ${SANS}`;
    sp(g, "5px");
    g.fillText("THE CONSTITUTION OF INDIA", cx, 78);
    sp(g, "0px");
    g.font = `400 40px ${SERIF}`;
    g.fillStyle = "#8e1f19";
    g.fillText("Preamble", cx, 128);
    g.fillStyle = "#2a1d12";
    g.font = `400 17px ${TEXT}`;
    let y = 176;
    [
      "WE, THE PEOPLE OF INDIA, having solemnly resolved to constitute India into a SOVEREIGN SOCIALIST SECULAR DEMOCRATIC REPUBLIC and to secure to all its citizens:",
      "JUSTICE, social, economic and political;",
      "LIBERTY of thought, expression, belief, faith and worship;",
      "EQUALITY of status and of opportunity; and to promote among them all",
      "FRATERNITY assuring the dignity of the individual and the unity and integrity of the Nation;",
      "IN OUR CONSTITUENT ASSEMBLY this twenty-sixth day of November, 1949, do HEREBY ADOPT, ENACT AND GIVE TO OURSELVES THIS CONSTITUTION.",
    ].forEach((p) => {
      y = wrapT(g, p, cx, y, 420, 24) + 8;
    });
  }
  g.textAlign = "left";
  return c;
}

/* ---------------- environment map ---------------- */
// three's PMREM GGX filter (scene.environment below) is built from compile-time constants: a 256-sample loop, a
// fixed view vector (0,0,1) and #define PI. Chrome's D3D11 backend (ANGLE, Windows) unrolls and constant-folds it,
// and the HLSL compiler logs "warning X4122 ... cannot be represented accurately in double precision" for the
// folded sums. Feeding those three values from uniforms (same values, same result) leaves nothing to fold; each
// one removes one of the warnings (checked on D3D11). ponytail: relies on three's private _allocateTargets and
// _ggxMaterial; if an upgrade renames them the shader is left as is (warnings return, nothing breaks).
const GGX_LOOP = "for(uint i = 0u; i < uint(GGX_SAMPLES); i++)";
class PMREM extends THREE.PMREMGenerator {
  _allocateTargets(...args) {
    const target = super._allocateTargets(...args),
      m = this._ggxMaterial;
    if (m && !m.uniforms.ggxSamples && m.fragmentShader.includes(GGX_LOOP)) {
      Object.assign(m.uniforms, {
        ggxSamples: { value: m.defines.GGX_SAMPLES },
        ggxView: { value: new THREE.Vector3(0, 0, 1) },
        ggxPi: { value: 3.14159265359 },
      });
      m.fragmentShader = m.fragmentShader
        .replace("uniform float mipInt;", "uniform float mipInt;\nuniform uint ggxSamples;\nuniform vec3 ggxView;\nuniform float ggxPi;")
        .replace(GGX_LOOP, "for(uint i = 0u; i < ggxSamples; i++)")
        .replace("importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness)", "importanceSampleGGX_VNDF(Xi, ggxView, roughness)")
        .replace("#define PI 3.14159265359", "#define PI ggxPi");
    }
    return target;
  }
}

/* ---------------- sound (synthesised, muted by default) ---------------- */
class Snd {
  constructor() {
    this.on = false;
    this.ctx = null;
    this.vol = 0.5;
    this.side = 1;
  }
  init() {
    const C = (this.ctx = new (W.AudioContext || W.webkitAudioContext)());
    this.out = C.createGain();
    this.out.gain.value = 0;
    this.out.connect(C.destination);
    const len = (C.sampleRate * 2.4) | 0,
      ir = C.createBuffer(2, len, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    this.rev = C.createConvolver();
    this.rev.buffer = ir;
    const rg = C.createGain();
    rg.gain.value = 0.2;
    this.rev.connect(rg);
    rg.connect(this.out);
    this.dry = C.createGain();
    this.dry.connect(this.out);
    this.dry.connect(this.rev);
    const n = C.sampleRate * 2,
      wb = C.createBuffer(1, n, C.sampleRate),
      bb = C.createBuffer(1, n, C.sampleRate),
      wd = wb.getChannelData(0),
      bd = bb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      wd[i] = w;
      last = (last + 0.02 * w) / 1.02;
      bd[i] = last * 3.5;
    }
    this.white = wb;
    this.brown = bb;
    const s = C.createBufferSource();
    s.buffer = bb;
    s.loop = true;
    const f = C.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 160;
    const g = C.createGain();
    g.gain.value = 0.045;
    s.connect(f).connect(g).connect(this.out);
    s.start();
  }
  set(on) {
    if (on && !this.ctx) this.init();
    this.on = on;
    if (this.ctx) {
      this.ctx.resume();
      this.out.gain.setTargetAtTime(on ? this.vol : 0, this.ctx.currentTime, 0.25);
    }
  }
  setVol(v) {
    this.vol = clamp(v);
    if (this.ctx && this.on) this.out.gain.setTargetAtTime(this.vol, this.ctx.currentTime, 0.1);
  }
  nz(dur, o = {}) {
    if (!this.on) return;
    const C = this.ctx,
      t = C.currentTime + (o.delay || 0),
      s = C.createBufferSource();
    s.buffer = o.brown ? this.brown : this.white;
    const fl = C.createBiquadFilter();
    fl.type = o.type || "bandpass";
    fl.frequency.setValueAtTime(o.f || 1000, t);
    if (o.fEnd) fl.frequency.exponentialRampToValueAtTime(o.fEnd, t + dur);
    fl.Q.value = o.q || 1;
    const g = C.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.g || 0.4, t + (o.att || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(this.dry);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }
  tn(freq, dur, o = {}) {
    if (!this.on) return;
    const C = this.ctx,
      t = C.currentTime + (o.delay || 0),
      os = C.createOscillator();
    os.type = o.type || "sine";
    os.frequency.setValueAtTime(freq, t);
    if (o.fEnd) os.frequency.exponentialRampToValueAtTime(o.fEnd, t + dur);
    const g = C.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.g || 0.3, t + (o.att || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = os;
    if (o.bp) {
      const f = C.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = o.bp;
      f.Q.value = o.q || 6;
      os.connect(f);
      node = f;
    }
    node.connect(g).connect(this.dry);
    os.start(t);
    os.stop(t + dur + 0.05);
  }
  play(n, o = {}) {
    switch (n) {
      case "handle":
        this.nz(0.04, { f: 3000, q: 4, g: 0.18 });
        this.nz(0.05, { f: 1400, q: 5, g: 0.22, delay: 0.12 });
        break;
      case "creak":
        this.tn(62, 2.6, { type: "sawtooth", fEnd: 90, g: 0.07, att: 0.6, bp: 820, q: 14, delay: 0.5 });
        this.tn(88, 2.0, { type: "sawtooth", fEnd: 70, g: 0.035, att: 0.5, bp: 1300, q: 16, delay: 0.9 });
        this.nz(3.6, { brown: true, type: "lowpass", f: 300, g: 0.12, att: 1, delay: 0.4 });
        break;
      case "seal":
        this.nz(0.06, { f: 2600, q: 2, g: 0.2 });
        this.nz(0.1, { f: 900, q: 1, g: 0.12, delay: 0.03 });
        break;
      case "paper":
        this.nz(0.45, { f: 4000, q: 0.7, g: 0.05, fEnd: 1600, att: 0.1 });
        break;
      case "pin":
        this.nz(0.03, { f: 5000, q: 3, g: 0.06 });
        break;
      case "tick":
        this.nz(0.016, { f: 4300, q: 9, g: 0.05 });
        break;
      case "tkey":
        this.nz(0.018, { f: 2300 + Math.random() * 700, q: 1.8, g: 0.16 });
        this.tn(165 + Math.random() * 35, 0.035, { g: 0.07, fEnd: 90 });
        this.nz(0.01, { f: 5200, q: 3, g: 0.05, delay: 0.012 });
        break;
      case "tspace":
        this.nz(0.03, { f: 1300, q: 1.2, g: 0.14 });
        this.tn(120, 0.05, { g: 0.08, fEnd: 70 });
        break;
      case "treturn":
        this.tn(2350, 0.9, { g: 0.07, att: 0.002 });
        this.tn(4700, 0.4, { g: 0.02, att: 0.002 });
        this.nz(0.34, { f: 1800, q: 2, g: 0.07, fEnd: 3200, att: 0.05, delay: 0.06 });
        this.nz(0.03, { f: 900, q: 1, g: 0.18, delay: 0.42 });
        break;
      case "step": {
        this.side = -this.side;
        const surf = o.surf || "wood",
          pv = 1 + (Math.random() - 0.5) * 0.12 + this.side * 0.03;
        if (surf === "stone") {
          this.nz(0.07, { f: 1500 * pv, q: 1.3, g: 0.2, fEnd: 700 });
          this.nz(0.025, { f: 3800, q: 2, g: 0.06, delay: 0.004 });
          this.tn(95 * pv, 0.09, { g: 0.1, fEnd: 60 });
        } else if (surf === "carpet") {
          this.nz(0.12, { f: 600 * pv, q: 0.9, g: 0.12, fEnd: 250 });
          this.tn(80 * pv, 0.1, { g: 0.08, fEnd: 55 });
        } else {
          this.nz(0.09, { f: 950 * pv, q: 1.5, g: 0.2, fEnd: 420 });
          this.tn(118 * pv, 0.12, { g: 0.14, fEnd: 72 });
          this.nz(0.018, { f: 3000, q: 2, g: 0.04, delay: 0.006 });
          if (Math.random() < 0.25) this.tn(210 * pv, 0.18, { type: "triangle", g: 0.02, bp: 600, q: 18, delay: 0.03 });
        }
        break;
      }
      case "bigdoor":
        this.tn(48, 3, { type: "sawtooth", fEnd: 70, g: 0.07, att: 0.8, bp: 520, q: 12 });
        this.nz(3.4, { brown: true, type: "lowpass", f: 200, g: 0.16, att: 1.2 });
        break;
      case "gavel": {
        const hit = (dl, a) => {
          this.nz(0.012, { f: 2600, q: 0.7, g: 0.55 * a, att: 0.0008, delay: dl });
          this.nz(0.05, { f: 900, q: 2.2, g: 0.3 * a, att: 0.0008, delay: dl });
          [
            [418, 0.11, 0.34],
            [1154, 0.06, 0.16],
            [2262, 0.035, 0.08],
            [296, 0.16, 0.18],
          ].forEach(([fq, du, gg]) => this.tn(fq, du, { g: gg * a, att: 0.0008, delay: dl }));
          this.tn(105, 0.18, { g: 0.2 * a, att: 0.002, fEnd: 70, delay: dl });
        };
        hit(0, 1);
        hit(0.075, 0.22);
        break;
      }
    }
  }
}

/* ---------------- main ---------------- */
async function mount(container, overlay, cb = {}) {
  if (cb.fonts === "typewriter") {
    SERIF = '"Special Elite", "Courier Prime", monospace';
    TEXT = '"Courier Prime", "Courier New", monospace';
    SANS = TEXT;
  }
  // Ported: cases, acts, asset manifest and canvas font families come from the React page.
  if (cb.families) ({ SERIF, TEXT, SANS, MONO, HAND, SIGN } = { SERIF, TEXT, SANS, MONO, HAND, SIGN, ...cb.families });
  const CASES = cb.cases || [],
    ACTS = cb.acts || [];
  const load = async (f, l) => {
    (W.__acPhases || (W.__acPhases = [])).push([l, Math.round(performance.now())]);
    cb.onLoad?.(f, l);
    await new Promise((r) => {
      let d = 0;
      const f = () => {
        if (!d) {
          d = 1;
          r();
        }
      };
      requestAnimationFrame(() => setTimeout(f, 0));
      setTimeout(f, 60);
    });
  };
  await load(0.08, "Unlocking the chambers…");
  try {
    await Promise.race([
      Promise.all(
        [
          `400 60px ${SERIF}`,
          `italic 30px ${TEXT}`,
          `30px ${TEXT}`,
          `600 20px ${SANS}`,
          `500 20px ${MONO}`,
          `600 24px ${MONO}`,
          `700 22px ${MONO}`,
          `40px ${HAND}`,
          `40px ${SIGN}`,
        ].map((f) => document.fonts.load(f)),
      ),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fonts that fail to load fall back; the scene still draws */
  }

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    precision: "highp",
    preserveDrawingBuffer: true,
  });
  const MOB = !!(W.matchMedia && matchMedia("(pointer: coarse)").matches) || Math.min(W.innerWidth, W.innerHeight) < 600;
  renderer.setPixelRatio(Math.min(W.devicePixelRatio || 1, MOB ? 1.5 : 1.25));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const cvs = renderer.domElement;
  cvs.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;outline:none";
  container.appendChild(cvs);
  cvs.setAttribute("role", "img");
  cvs.setAttribute("aria-label", "First-person 3D walk-through of a law firm, its case files, an investigation board and a courtroom");
  const sysRM = !!(W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches);
  let RM = sysRM;
  const setMotion = (m) => {
    RM = m === "full" ? false : m === "reduced" ? true : sysRM;
  };
  setMotion(cb.motion || "system");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#060403");
  scene.fog = new THREE.FogExp2("#080504", 0.04);
  const cam = new THREE.PerspectiveCamera(50, 1, 0.03, 120);
  scene.add(cam);

  // warm environment for brass/leather reflections
  {
    const pm = new PMREM(renderer),
      es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial({ color: "#1c120b", side: THREE.BackSide })));
    const lp = (c, i, x, y, z, w, h) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide }),
      );
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      es.add(m);
    };
    lp("#ffd9a0", 5, 0, 4.8, 0, 6, 6);
    lp("#ffb870", 2.5, -9, 2, 3, 4, 5);
    lp("#ffe0b0", 1.6, 8, 3, -6, 5, 4);
    scene.environment = pm.fromScene(es, 0.03).texture;
  }

  await load(0.3, "Polishing the brass…");
  /* textures + materials */
  const T = {
    walnut: tex(woodC("#3e2718", "#1c0f08", "#6a4428", 512, 512, { scratch: 70 })),
    walnutDk: tex(woodC("#23150c", "#0d0704", "#3e2818")),
    oak: tex(woodC("#4a3120", "#1e120a", "#7a5534")),
    floor: tex(woodC("#2e1c10", "#120a06", "#4b301c", 1024, 1024, { planks: 6 }), [3, 6]),
    leather: tex(mottleC("#ffffff", 512, 512, 900, 0.08, "#000", "#fff", 22)),
    stone: tex(stoneC(), [3, 2.2]),
    cobble: tex(cobbleC(), [12, 7]),
    plaster: tex(mottleC("#c8c2b8", 256, 256, 400, 0.06, "#000", "#fff", 10), [4, 2]),
    cork: tex(corkC(), [5, 2]),
    carpet: tex(carpetC(), [1, 6]),
    runnerDk: tex(carpetC("#17110d"), [1, 6]),
    rug: tex(rugC()),
    spine: tex(spineC()),
    grad: dataTex(128, 256, (u, v) => [1, v * Math.min(1, Math.min(u, 1 - u) / 0.3)]),
    rad: dataTex(128, 128, (u, v) => [1, Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.5) * 2)]),
    plaque: tex(plaqueC(cb.plateName)),
    lintel: tex(lintelC()),
    inlay: tex(mottleC("#15201a", 512, 256, 300, 0.1, "#000", "#3a5a44", 14)),
  };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    walnut: std({ map: T.walnut, roughness: 0.5, envMapIntensity: 0.5 }),
    walnutDk: std({ map: T.walnutDk, roughness: 0.6, envMapIntensity: 0.35 }),
    oak: std({ map: T.oak, roughness: 0.42, envMapIntensity: 0.55 }),
    floor: std({ map: T.floor, roughness: 0.42, envMapIntensity: 0.45 }),
    brass: std({ color: "#c49c58", metalness: 1, roughness: 0.3, envMapIntensity: 1.2 }),
    brassDk: std({ color: "#8a6a3a", metalness: 1, roughness: 0.45, envMapIntensity: 0.9 }),
    leatherRed: std({ map: T.leather, color: "#4e1a15", roughness: 0.62, envMapIntensity: 0.35 }),
    leatherBrn: std({ map: T.leather, color: "#4d2c19", roughness: 0.55 }),
    stone: std({ map: T.stone, roughness: 0.92, color: "#9a9088" }),
    cobble: std({ map: T.cobble, roughness: 0.7, envMapIntensity: 0.6 }),
    plasterRed: std({ map: T.plaster, color: "#4a1f1a", roughness: 0.95, envMapIntensity: 0.2 }),
    plasterCream: std({ map: T.plaster, color: "#d8ccb4", roughness: 0.95, envMapIntensity: 0.3 }),
    paper: std({ color: "#b9b09c", roughness: 0.9 }),
    paperDim: std({ color: "#8f8776", roughness: 0.94, envMapIntensity: 0.3 }),
    book: std({ map: T.spine, roughness: 0.75, envMapIntensity: 0.3 }),
    cork: std({ map: T.cork, roughness: 0.95 }),
    wax: std({ color: "#8e1f19", roughness: 0.35, emissive: "#3a0604", envMapIntensity: 0.8 }),
    thread: std({ color: "#a8231c", emissive: "#b3261e", emissiveIntensity: 0.8, roughness: 0.6 }),
    threadMain: std({ color: "#b3261e", emissive: "#c42a20", emissiveIntensity: 1.05, roughness: 0.6 }),
    glow: std({ color: "#ffcf8a", emissive: "#ffbf70", emissiveIntensity: 3 }),
    lantern: std({ color: "#ffcf8a", emissive: "#ffb060", emissiveIntensity: 1.1 }),
    glowDim: std({ color: "#3a2210", emissive: "#6a3a18", emissiveIntensity: 0.7 }),
    glass: std({ color: "#1f5a3a", emissive: "#0c2e1c", emissiveIntensity: 0.5, roughness: 0.15, metalness: 0.1, side: THREE.DoubleSide }),
    robe: std({ color: "#141213", roughness: 0.34, envMapIntensity: 1.25 }),
    head: std({ color: "#3b3531", roughness: 0.55, envMapIntensity: 0.8 }),
    wig: std({ color: "#ebe6da", roughness: 0.92, envMapIntensity: 0.45 }),
    cream: std({ color: "#e9dfc9", roughness: 0.8 }),
    velvet: std({ map: T.leather, color: "#4a1210", roughness: 0.85 }),
    black: std({ color: "#0a0807", roughness: 0.8 }),
    inlay: std({ map: T.inlay, roughness: 0.55 }),
    carpet: std({ map: T.carpet, roughness: 0.95 }),
    runnerDk: std({ map: T.runnerDk, roughness: 0.95 }),
    rug: std({ map: T.rug, roughness: 0.95 }),
    windowDay: std({ color: "#f3e2c4", emissive: "#f6dcb2", emissiveIntensity: 1.3 }),
  };
  // surface detail: wood grain and leather relief from their own maps, smudged brass
  [M.walnut, M.walnutDk, M.oak, M.floor].forEach((m) => {
    m.bumpMap = m.map;
    m.bumpScale = 0.45;
  });
  [M.leatherRed, M.leatherBrn, M.velvet].forEach((m) => {
    m.bumpMap = T.leather;
    m.bumpScale = 0.6;
  });
  M.stone.bumpMap = T.stone;
  M.stone.bumpScale = 1.4;
  M.cobble.bumpMap = T.cobble;
  M.cobble.bumpScale = 1.2;
  {
    const smudge = tex(mottleC("#bdbdbd", 256, 256, 700, 0.18, "#000", "#fff", 10));
    [M.brass, M.brassDk].forEach((m) => {
      m.roughnessMap = smudge;
      m.roughness = Math.max(0.42, m.roughness);
    });
  }
  const basicAdd = (map, color = "#ffd7a0", op = 0.2) =>
    new THREE.MeshBasicMaterial({
      map,
      color,
      transparent: true,
      opacity: op,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });

  /* helpers */
  const G = () => new THREE.Group();
  function box(w, h, d, m, x, y, z, p, o = {}) {
    const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    me.position.set(x, y, z);
    me.castShadow = !!o.cast;
    me.receiveShadow = o.recv !== false;
    if (o.ry) me.rotation.y = o.ry;
    if (p) p.add(me);
    return me;
  }
  function cyl(rt, rb, h, m, x, y, z, p, o = {}) {
    const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || 20, 1, !!o.open, o.ts || 0, o.tl || Math.PI * 2), m);
    me.position.set(x, y, z);
    me.castShadow = !!o.cast;
    me.receiveShadow = true;
    if (o.rx) me.rotation.x = o.rx;
    if (o.rz) me.rotation.z = o.rz;
    if (p) p.add(me);
    return me;
  }
  function plane(w, h, m, p, x, y, z, rx = 0, ry = 0) {
    const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    me.position.set(x, y, z);
    me.rotation.set(rx, ry, 0);
    me.receiveShadow = true;
    if (p) p.add(me);
    return me;
  }
  const ASSETS = [];
  const MAN = cb.assets || [];
  function reg(id, obj, zone) {
    const a = MAN.find((x) => x.id === id);
    obj.name = id;
    obj.userData.assetId = id;
    ASSETS.push({ id, obj, zone, file: a ? a.file.split("/").pop() : id + ".glb", type: a ? a.type : "" });
    return obj;
  }

  await load(0.5, "Shelving the law books…");
  /* lights (constant count; intensities per zone) */
  const L = {};
  L.hemi = new THREE.HemisphereLight("#ffdcb0", "#1a0f08", 0.12);
  scene.add(L.hemi);
  const pt = (c, i, d, x, y, z) => {
    const l = new THREE.PointLight(c, i, d, 2);
    l.position.set(x, y, z);
    scene.add(l);
    return l;
  };
  const spot = (c, i, d, a, pen, pos, tgt, shadow) => {
    const l = new THREE.SpotLight(c, i, d, a, pen, 1.6);
    l.position.copy(pos);
    l.target.position.copy(tgt);
    scene.add(l, l.target);
    if (shadow) {
      l.castShadow = true;
      l.shadow.mapSize.set(MOB ? 512 : 1024, MOB ? 512 : 1024);
      l.shadow.bias = -0.0004;
      l.shadow.normalBias = 0.02;
      l.shadow.camera.near = 0.5;
      l.shadow.camera.far = 24;
    }
    return l;
  };
  L.lanL = pt("#ffb469", 5, 7, -1.55, 2.45, 1.35);
  L.lanR = pt("#ffb469", 5, 7, 1.55, 2.45, 1.35);
  L.spill = pt("#ffb870", 0, 12, 0, 1.9, -1.6);
  L.office = pt("#ffb46a", 0, 16, 0, 3.2, -7);
  L.insp = pt("#fff0da", 0, 3.2, 0, 1.6, -14);
  L.lampL = pt("#ffd09a", 0, 4.6, -0.95, 1.08, -12.5);
  L.lampR = pt("#ffd09a", 0, 3.2, 0.95, 1.05, -12.55);
  L.key = spot("#ffd6a8", 0, 14, 0.5, 0.65, V(0.7, 3.9, -10.4), V(0, 0.78, -12.1), true);
  L.hallA = pt("#ffb46a", 0, 11, 0, 4, -22);
  L.hallB = pt("#ffc27e", 0, 11, 0, 4.2, -35.2);
  L.door = spot("#ffe4bc", 0, 26, 0.7, 0.6, V(0, 3.2, -42), V(0, 1.2, -30), false);
  L.court = spot("#ffe1b8", 0, 32, 0.42, 0.55, V(0, 8, -49), V(0, 1.6, -57.6), true);
  L.court.shadow.camera.far = 30;
  L.rim = spot("#ffcf9a", 0, 14, 0.5, 0.5, V(0, 6.5, -61.5), V(0, 1.8, -57.8), false);
  L.fill = pt("#ffcf9e", 0, 30, 0, 5.5, -45);
  L.win = spot("#fff0d8", 0, 30, 0.55, 0.85, V(-12.5, 11.5, -49.4), V(-2.2, 0, -50.8), false);

  const putM = (grp, obj) => {
    mergeByMaterial(THREE, obj)
      .children.slice()
      .forEach((c) => grp.add(c));
    return grp;
  };
  // room shells never need to cast: they sit outside every shadow light's subject, and skipping them keeps the shadow pass small
  const noCast = (grp) => {
    grp.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
    return grp;
  };
  /* ============ ACT I — EXTERIOR ============ */
  const ext = G();
  scene.add(ext);
  // old flat cobble ground: sits under the modelled road now (it was flush with the setts at the gutter, so it z-fought with them on phones and read as a flat smear)
  plane(40, 24, M.cobble, ext, 0, -0.7, 12, -Math.PI / 2);
  // portrait screens see more ground below the door: a narrower pavement brings the kerb and road into frame
  const PAVE = buildPavement(THREE, { depth: W.innerHeight > W.innerWidth ? 2.5 : 3.2 });
  {
    const pv = reg("street_pavement", G(), ext);
    pv.position.set(0, -0.45, 0.4);
    ext.add(pv);
    mergeByMaterial(THREE, PAVE.pavement)
      .children.slice()
      .forEach((c) => pv.add(c));
  }
  // the street: pavement front edge sits at z = 0.4 + 3.82, road level y = -0.58 (kerb drop 0.13). Instanced, so it isn't merged.
  {
    const rd = reg("street_road", G(), ext);
    rd.position.set(0, -0.58, 0.4 + PAVE.frontZ);
    ext.add(rd);
    rd.add(buildRoad(THREE).road);
  }
  const fac = reg("law_firm_facade", G(), ext);
  ext.add(fac);
  {
    const fw = G();
    fw.position.set(0, -0.45, 0.4);
    fac.add(fw);
    noCast(putM(fw, buildFacade(THREE).facade));
  }
  box(0.16, 3.55, 0.14, M.walnutDk, -0.98, 1.72, 0.45, fac);
  box(0.16, 3.55, 0.14, M.walnutDk, 0.98, 1.72, 0.45, fac);
  box(2.3, 0.28, 0.18, M.walnutDk, 0, 3.55, 0.46, fac);
  box(3.6, 0.22, 0.5, M.stone, 0, 4.1, 0.6, fac);
  box(3.3, 0.12, 0.4, M.stone, 0, 3.94, 0.55, fac);
  [-1.55, 1.55].forEach((x) => {
    const pl = reg("wooden_pillar", G(), ext);
    pl.position.set(x, -0.45, 0.52);
    fac.add(pl);
    mergeByMaterial(THREE, buildPillar(THREE, { height: 4.45, materials: { wood: M.walnut, trim: M.walnutDk, brass: M.brassDk } }).pillar)
      .children.slice()
      .forEach((c) => pl.add(c));
  });
  [
    [-4.2, 2.3],
    [4.2, 2.3],
    [-4.2, 6.2],
    [4.2, 6.2],
  ].forEach(([x, y]) => {
    const wn = reg("facade_window", G(), ext);
    wn.position.set(x, y, 0.4);
    fac.add(wn);
    mergeByMaterial(
      THREE,
      buildWindow(THREE, { w: 1.5, h: 2.3, materials: { stone: M.stone, frame: M.walnutDk, glass: M.glowDim } }).window,
    )
      .children.slice()
      .forEach((c) => wn.add(c));
  });
  const steps = reg("entrance_steps", G(), ext);
  ext.add(steps);
  steps.position.set(0, -0.45, 0.4);
  mergeByMaterial(THREE, buildSteps(THREE).steps)
    .children.slice()
    .forEach((c) => steps.add(c));
  [-1, 1].forEach((s) => {
    const ln = reg("brass_wall_lantern", G(), ext);
    ln.position.set(s * 1.55, 2.5, 0.8);
    ext.add(ln);
    mergeByMaterial(THREE, buildLantern(THREE, { materials: { brass: M.brassDk, glass: M.lantern } }).lantern)
      .children.slice()
      .forEach((c) => ln.add(c));
  });
  const PERF = (W.__acPerf = { models: {} });
  let _t0 = 0;
  const triCount = (o) => {
    let n = 0;
    o.traverse((m) => {
      if (m.isMesh && m.geometry) {
        const g = m.geometry;
        n += ((g.index ? g.index.count : g.attributes.position.count) / 3) * (m.isInstancedMesh ? m.count : 1);
      }
    });
    return Math.round(n);
  };
  const rec = (k, t0, objs) => {
    const p = PERF.models[k] || (PERF.models[k] = { ms: 0, tris: 0, n: 0 });
    p.ms = +(p.ms + performance.now() - t0).toFixed(2);
    p.tris += objs.reduce((a, o) => a + triCount(o), 0);
    p.n++;
  };
  // door
  const doorPivot = reg("law_firm_entrance_door", G(), ext);
  doorPivot.position.set(-0.86, 0, 0);
  ext.add(doorPivot);
  const leaf = G();
  leaf.position.x = 0.86;
  doorPivot.add(leaf);
  const Mdoor = std({ map: T.walnut, roughness: 0.48, color: "#c9b4a2", envMapIntensity: 0.6 });
  box(1.72, 3.36, 0.1, Mdoor, 0, 1.68, 0, leaf, { cast: true });
  _t0 = performance.now();
  const DR = buildDoor(THREE, { materials: { wood: Mdoor, trim: M.walnutDk, brass: M.brass, black: M.black } });
  leaf.add(mergeByMaterial(THREE, DR.panels));
  rec("door", _t0, [DR.panels, DR.handle, DR.lock]);
  [0.4, 1.7, 3.0].forEach((y) => box(0.03, 0.18, 0.12, M.brassDk, -0.855, y, 0, leaf));
  const plaque = reg("brass_name_plaque", G(), ext);
  plaque.position.set(0, 1.6, 0.056);
  leaf.add(plaque);
  const plaqueMat = std({ map: T.plaque, metalness: 0.75, roughness: 0.34, envMapIntensity: 1.2 });
  putM(plaque, buildNamePlaque(THREE, { materials: { brass: M.brass, face: plaqueMat } }).plaque);
  const handle = reg("door_brass_handle", G(), ext);
  handle.position.set(0.64, 1.1, 0.06);
  leaf.add(handle);
  cyl(0.04, 0.04, 0.025, M.brass, 0, 0, 0.012, handle, { rx: Math.PI / 2 });
  cyl(0.012, 0.012, 0.05, M.brass, 0, 0, 0.04, handle, { rx: Math.PI / 2 });
  box(0.17, 0.026, 0.03, M.brass, -0.075, 0, 0.062, handle, { cast: true });
  handle.clear();
  mergeByMaterial(THREE, DR.handle)
    .children.slice()
    .forEach((c) => handle.add(c));
  const lock = reg("door_lock_escutcheon", G(), ext);
  lock.position.set(0.64, 0.9, 0.06);
  leaf.add(lock);
  box(0.055, 0.14, 0.01, M.brass, 0, 0, 0, lock);
  box(0.012, 0.03, 0.012, M.black, 0, -0.01, 0.002, lock);
  lock.clear();
  lock.position.z = 0.074;
  DR.lock.position.set(0, 0, 0);
  mergeByMaterial(THREE, DR.lock)
    .children.slice()
    .forEach((c) => lock.add(c));
  handle.position.z = 0.074;
  const bolt = box(0.05, 0.02, 0.02, M.brass, 0.87, 1.0, 0, leaf);
  // light spill
  const spillFx = reg("door_light_spill", G(), ext);
  ext.add(spillFx);
  const spillFloor = plane(2.2, 4.4, basicAdd(T.grad, "#ffc27a", 0), spillFx, 0, -0.28, 2.3, -Math.PI / 2);
  spillFloor.scale.x = 1.0;
  // portrait pavement is shallower: end the floor spill at the kerb so it never hangs in the air over the road
  if (W.innerHeight > W.innerWidth) {
    const L = Math.min(4.4, 0.4 + PAVE.frontZ - 0.36 - 0.1);
    spillFloor.scale.y = L / 4.4;
    spillFloor.position.z = 0.1 + L / 2;
  }
  const spillBeam = plane(1.7, 4.2, basicAdd(T.grad, "#ffd29a", 0), spillFx, 0, 1.25, 1.35, -1.05);

  /* ============ ACT II — OFFICE ============ */
  const off = G();
  scene.add(off);
  const shell = reg("law_office", G(), off);
  off.add(shell);
  plane(9.2, 17.4, M.floor, shell, 0, 0, -8.6, -Math.PI / 2);
  plane(9.2, 17.4, M.walnutDk, shell, 0, 4.2, -8.6, Math.PI / 2);
  [-2, -5, -8, -11, -14].forEach((z) => box(9, 0.28, 0.3, M.walnut, 0, 4.06, z, shell));
  const WL = { wood: M.walnut, trim: M.walnutDk, plaster: M.plasterRed };
  const wall = (id, x, z, ry, o) => {
    const wg = reg(id, G(), off);
    wg.position.set(x, 0, z);
    wg.rotation.y = ry;
    shell.add(wg);
    noCast(putM(wg, buildPanelledWall(THREE, Object.assign({ materials: WL }, o)).wall));
  };
  [-1, 1].forEach((s) => wall("office_side_wall", s * 4.55, -8.6, (-s * Math.PI) / 2, { w: 17.4, upper: "plaster" }));
  wall("office_back_wall", 0, -16.85, 0, { w: 9.2, openings: [{ x0: -1.06, x1: 1.06, y1: 3.1 }] });
  wall("office_front_wall", 0, -0.3, Math.PI, { w: 9.2, openings: [{ x0: -1.1, x1: 1.1, y1: 3.4 }], casing: false });
  const pocket = reg("office_pocket_doors", G(), off);
  off.add(pocket);
  const mkPD = (s) => {
    const p = G();
    p.position.set(s * 0.53, 1.55, -17);
    pocket.add(p);
    return putM(
      p,
      buildPocketDoor(THREE, { side: s, materials: { wood: M.walnut, trim: M.walnutDk, brass: M.brass, black: M.black } }).door,
    );
  };
  const pdL = mkPD(-1),
    pdR = mkPD(1);
  const rug = reg("office_rug", G(), off);
  off.add(rug);
  rug.position.z = -6.2;
  M.rug.bumpMap = T.rug;
  M.rug.bumpScale = 0.8;
  putM(
    rug,
    buildRug(THREE, {
      w: 3.6,
      d: 7,
      materials: { rug: M.rug, binding: std({ color: "#1e1410", roughness: 0.95 }), fringe: std({ color: "#b9ab8e", roughness: 1 }) },
    }).rug,
  );
  // bookshelves + instanced books
  const bookMats = [],
    bookCols = [];
  const LAWSETS = [
    ["#8a2c22", 0.3, 0.055, 0.24],
    ["#3a3530", 0.285, 0.05, 0.23],
    ["#46603f", 0.265, 0.046, 0.21],
    ["#a07a48", 0.32, 0.06, 0.25],
    ["#34436a", 0.275, 0.048, 0.22],
    ["#b8a47e", 0.25, 0.042, 0.2],
    ["#6e3a22", 0.3, 0.052, 0.24],
  ];
  const MIX = ["#8a2c22", "#46603f", "#34436a", "#a07a48", "#6e3a22", "#9a7a50", "#3a3530", "#6a3434", "#c8b894", "#3d5a44"];
  function shelfUnit(x, z, ry) {
    const u = reg("law_bookshelf", G(), off);
    u.position.set(x, 0, z);
    u.rotation.y = ry;
    off.add(u);
    const BC = buildBookcase(THREE, {
      w: 2.3,
      h: 3.3,
      d: 0.42,
      rows: 6,
      materials: { wood: M.walnut, trim: M.walnutDk, brass: M.brassDk },
    });
    mergeByMaterial(THREE, BC.bookcase)
      .children.slice()
      .forEach((c) => u.add(c));
    u.updateMatrixWorld(true);
    const D = 0.42,
      put = (px, py, pz, rz, sx, sy, sz, col) => {
        bookMats.push(
          u.matrixWorld
            .clone()
            .multiply(
              new THREE.Matrix4().compose(V(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), V(sx, sy, sz)),
            ),
        );
        bookCols.push(col);
      },
      mix = () => new THREE.Color(MIX[(rnd() * MIX.length) | 0]).multiplyScalar(0.75 + rnd() * 0.4);
    BC.shelfYs.forEach((y) =>
      BC.bays.forEach(([x0, x1]) => {
        let bx = x0;
        if (rnd() < 0.16) {
          const n = 3 + ((rnd() * 3) | 0),
            sw = 0.2 + rnd() * 0.05;
          let sy = y;
          for (let k = 0; k < n; k++) {
            const th = 0.03 + rnd() * 0.02;
            put(bx + sw / 2, sy + th / 2, -D / 2 + 0.155, Math.PI / 2, th, sw, 0.24, mix());
            sy += th;
          }
          bx += sw + 0.02;
        }
        const set = rnd() < 0.72 ? LAWSETS[(rnd() * LAWSETS.length) | 0] : null;
        while (bx < x1 - 0.01) {
          if (!set && rnd() < 0.03) {
            bx += 0.06;
            continue;
          }
          const bw = set ? set[2] * (0.96 + rnd() * 0.08) : 0.03 + rnd() * 0.045;
          if (bx + bw > x1) break;
          const bh = set ? set[1] * (0.99 + rnd() * 0.02) : 0.24 + rnd() * 0.1,
            bd = set ? set[3] : 0.2 + rnd() * 0.07;
          put(
            bx + bw / 2,
            y + bh / 2,
            -D / 2 + 0.03 + bd / 2,
            0,
            bw,
            bh,
            bd,
            set ? new THREE.Color(set[0]).multiplyScalar(0.9 + rnd() * 0.14) : mix(),
          );
          bx += bw + 0.0015;
          if (set && rnd() < 0.04) bx += 0.05;
        }
        if (x1 - bx > 0.07 && rnd() < 0.6) {
          const a = 0.32,
            bw = 0.035,
            bh = 0.26,
            cx = bx + 0.002 + (bw / 2) * Math.cos(a) + (bh / 2) * Math.sin(a);
          if (cx + (bw / 2) * Math.cos(a) + (bh / 2) * Math.sin(a) < x1)
            put(cx, y + (bw / 2) * Math.sin(a) + (bh / 2) * Math.cos(a), -D / 2 + 0.14, a, bw, bh, 0.22, mix());
        }
      }),
    );
  }
  for (let i = 0; i < 6; i++) {
    const z = -1.6 - i * 2.35;
    shelfUnit(-4.3, z, Math.PI / 2);
    if (i !== 3) shelfUnit(4.3, z, -Math.PI / 2);
  }
  const BK = ["#5b1a15", "#2f3a2a", "#1f2430", "#6b4a2a", "#3a2418", "#7a5a36", "#1c1a17", "#4a2a2a", "#b8aa90", "#233026"];
  const books = reg("law_books_set", new THREE.InstancedMesh(bookGeometry(THREE), M.book, bookMats.length), off);
  books.receiveShadow = true;
  bookMats.forEach((m, i) => {
    books.setMatrixAt(i, m);
    books.setColorAt(i, bookCols[i]);
  });
  off.add(books);
  {
    const ch = reg("office_chandelier", G(), off);
    ch.position.set(0, 4.2, -7);
    off.add(ch);
    const CH = buildChandelier(THREE, {
      materials: {
        brass: M.brass,
        shade: std({ color: "#fff4de", emissive: "#ffc778", emissiveIntensity: 1.3, roughness: 0.4 }),
        crystal: std({
          color: "#fff8ee",
          emissive: "#ffd49a",
          emissiveIntensity: 0.3,
          roughness: 0.04,
          metalness: 0.25,
          flatShading: true,
          envMapIntensity: 2,
        }),
        candle: M.cream,
      },
    });
    mergeByMaterial(THREE, CH.chandelier)
      .children.slice()
      .forEach((c) => ch.add(c));
  }
  // clock
  const clock = reg("antique_longcase_clock", G(), off);
  clock.position.set(4.22, 0, -8.65);
  clock.rotation.y = -Math.PI / 2;
  off.add(clock);
  _t0 = performance.now();
  const CK = buildClockCase(THREE, {
    materials: {
      wood: M.walnut,
      trim: M.walnutDk,
      brass: M.brass,
      glass: std({ color: "#0c0b0a", roughness: 0.08, transparent: true, opacity: 0.45 }),
    },
  });
  clock.add(mergeByMaterial(THREE, CK.clock));
  rec("clock", _t0, [CK.clock]);
  cyl(0.21, 0.21, 0.02, M.cream, 0, 2.06, 0.215, clock, { rx: Math.PI / 2, seg: 32 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.012, 8, 40), M.brass);
  ring.position.set(0, 2.06, 0.225);
  clock.add(ring);
  const hS = G();
  hS.position.set(0, 2.06, 0.242);
  clock.add(hS);
  box(0.008, 0.21, 0.003, M.wax, 0, 0.07, 0, hS);
  cyl(0.014, 0.014, 0.006, M.brass, 0, 0, 0.002, hS, { rx: Math.PI / 2 });
  const hH = G(),
    hM = G();
  hH.position.set(0, 2.06, 0.232);
  hM.position.set(0, 2.06, 0.236);
  clock.add(hH, hM);
  box(0.012, 0.11, 0.004, M.black, 0, 0.05, 0, hH);
  box(0.008, 0.17, 0.004, M.black, 0, 0.08, 0, hM);
  const pend = buildPendulum(THREE, { materials: { brass: M.brass, trim: M.walnutDk } });
  pend.position.set(0, 1.62, 0.04);
  clock.add(pend);
  // chairs, tables
  function clubChair(x, z, ry) {
    const c = reg("leather_club_chair", G(), off);
    c.position.set(x, 0, z);
    c.rotation.y = ry;
    off.add(c);
    _t0 = performance.now();
    mergeByMaterial(THREE, buildClubChair(THREE, { materials: { leather: M.leatherRed, wood: M.walnutDk, brass: M.brass } }).chair)
      .children.slice()
      .forEach((k) => c.add(k));
    rec("club_chair", _t0, [c]);
  }
  clubChair(-2.75, -3.9, 1.25);
  clubChair(-2.75, -6.5, 1.9);
  const st = reg("walnut_side_table", G(), off);
  st.position.set(-3.5, 0, -5.2);
  off.add(st);
  putM(st, buildSideTable(THREE, { materials: { wood: M.walnut, trim: M.walnutDk } }).table);
  box(0.2, 0.04, 0.26, M.paper, 0.05, 0.64, 0.02, st);
  const lt = reg("library_table", G(), off);
  lt.position.set(2.9, 0, -3.8);
  off.add(lt);
  putM(lt, buildLibraryTable(THREE, { materials: { wood: M.walnut, trim: M.walnutDk, brass: M.brass } }).table);
  [0, 1, 2, 3].forEach((i) =>
    box(0.34 - i * 0.02, 0.07, 0.25, std({ color: BK[i * 2], map: T.spine, roughness: 0.7 }), -0.2 + rnd() * 0.04, 0.8 + i * 0.07, 0, lt, {
      ry: (rnd() - 0.5) * 0.4,
    }),
  );
  {
    const who = cb.plateName && cb.plateName !== "AI COURTROOM" ? cb.plateName : "A. Mehra";
    const frameAt = (x, y, w, h, style, canvas, tilt) => {
      const f = reg("framed_certificate", G(), off);
      f.position.set(x, y, -16.8);
      f.rotation.z = tilt;
      off.add(f);
      const fm = style === "gilt" ? M.brass : style === "black" ? M.black : M.walnutDk,
        bw = style === "gilt" ? 0.055 : 0.032,
        ow = w + 0.08 + 2 * bw,
        oh = h + 0.08 + 2 * bw;
      const sh = new THREE.Shape();
      sh.moveTo(-ow / 2, -oh / 2);
      sh.lineTo(ow / 2, -oh / 2);
      sh.lineTo(ow / 2, oh / 2);
      sh.lineTo(-ow / 2, oh / 2);
      sh.closePath();
      const hl = new THREE.Path();
      hl.moveTo(-(w + 0.08) / 2, -(h + 0.08) / 2);
      hl.lineTo((w + 0.08) / 2, -(h + 0.08) / 2);
      hl.lineTo((w + 0.08) / 2, (h + 0.08) / 2);
      hl.lineTo(-(w + 0.08) / 2, (h + 0.08) / 2);
      hl.closePath();
      sh.holes.push(hl);
      const fr = new THREE.Mesh(
        new THREE.ExtrudeGeometry(sh, {
          depth: 0.018,
          bevelEnabled: true,
          bevelThickness: 0.008,
          bevelSize: style === "gilt" ? 0.012 : 0.006,
          bevelSegments: 2,
        }),
        fm,
      );
      fr.castShadow = true;
      f.add(fr);
      plane(w + 0.08, h + 0.08, M.cream, f, 0, 0, 0.006);
      plane(w, h, std({ map: tex(canvas), roughness: 0.85 }), f, 0, 0, 0.008);
    };
    frameAt(-3.05, 2.45, 0.7, 0.54, "gilt", wallDocC("degree", who), 0.004);
    frameAt(-1.85, 2.3, 0.42, 0.56, "black", wallDocC("enrol", who), -0.006);
    frameAt(-2.8, 1.66, 0.34, 0.26, "walnut", wallDocC("practice", who), 0.009);
    frameAt(1.95, 2.35, 0.5, 0.67, "walnut", wallDocC("preamble", who), -0.003);
    frameAt(3.3, 2.78, 0.4, 0.25, "black", wallDocC("quote", who), 0.007);
    const cal = reg("wall_calendar", G(), off);
    cal.position.set(3.3, 2.02, -16.806);
    cal.rotation.z = 0.018;
    off.add(cal);
    plane(0.3, 0.43, std({ map: tex(wallDocC("calendar", who)), roughness: 0.9, side: THREE.DoubleSide }), cal, 0, 0, 0.004);
    cyl(0.004, 0.004, 0.02, M.brassDk, 0, 0.225, 0.01, cal, { rx: Math.PI / 2 });
  }
  // desk
  const DZ = -12.2,
    TOP = 0.78;
  const desk = reg("oak_lawyer_desk", G(), off);
  desk.position.set(0, 0, DZ);
  off.add(desk);
  _t0 = performance.now();
  const DK = buildDesk(THREE, { materials: { oak: M.oak, walnut: M.walnut, brass: M.brass, leather: M.inlay } });
  mergeByMaterial(THREE, DK.desk)
    .children.slice()
    .forEach((c) => desk.add(c));
  rec("desk", _t0, [desk]);
  function bankerLamp(x, y, z, parent, zone) {
    const b = reg("banker_lamp", G(), zone);
    b.position.set(x, y, z);
    parent.add(b);
    _t0 = performance.now();
    const lampGlow = M.glow.clone();
    lampGlow.emissiveIntensity = 1.6;
    const LB = buildBankerLamp(THREE, { materials: { brass: M.brass, glass: M.glass, glow: lampGlow } });
    if (LB.lamp.children.length)
      mergeByMaterial(THREE, LB.lamp)
        .children.slice()
        .forEach((c) => b.add(c));
    rec("banker_lamp", _t0, [b]);
    return b;
  }
  bankerLamp(-0.95, TOP, DZ - 0.35, off, off);
  const ink = reg("inkwell_pen_set", G(), off);
  ink.position.set(0.68, TOP, DZ - 0.38);
  off.add(ink);
  putM(
    ink,
    buildInkwellSet(THREE, {
      materials: { wood: M.walnutDk, brass: M.brass, glass: std({ color: "#141a1c", roughness: 0.1, metalness: 0.2 }), black: M.black },
    }).set,
  );
  function paperStack(x, y, z, p, zone, n = 4) {
    const s = reg("paper_stack", G(), zone);
    s.position.set(x, y, z);
    p.add(s);
    for (let i = 0; i < n; i++)
      box(0.22, 0.012, 0.3, M.paperDim, (rnd() - 0.5) * 0.02, 0.006 + i * 0.012, (rnd() - 0.5) * 0.02, s, {
        ry: (rnd() - 0.5) * 0.12,
        cast: true,
      });
    return s;
  }
  paperStack(-0.93, TOP, DZ - 0.02, off, off);
  function officeChair(x, z, ry, parent, zone, id = "leather_office_chair") {
    const c = reg(id, G(), zone);
    c.position.set(x, 0, z);
    c.rotation.y = ry;
    parent.add(c);
    mergeByMaterial(THREE, buildOfficeChair(THREE, { materials: { wood: M.walnut, brass: M.brass, black: M.black } }).chair)
      .children.slice()
      .forEach((k) => c.add(k));
    return c;
  }
  officeChair(0, DZ - 0.95, 0, off, off);
  const dust1 = dust(MOB ? 110 : 220, [-1.5, 1.5], [0.8, 3.6], [-13, -10.5]);
  off.add(dust1);

  await load(0.66, "Sealing the case files…");
  /* ============ ACT III — CASE FILES ============ */
  const FW = 0.25,
    FD = 0.33;
  const SLOTS = MOB
    ? [
        [-0.3, DZ + 0.15, -0.05],
        [0, DZ + 0.13, 0.02],
        [0.3, DZ + 0.16, 0.06],
      ]
    : [
        [-0.52, DZ + 0.15, -0.08],
        [0, DZ + 0.13, 0.03],
        [0.52, DZ + 0.16, 0.1],
      ];
  const files = CASES.map((cs, i) => {
    const root = reg("case_file", G(), off);
    off.add(root);
    const coverTex = tex(coverC(cs)),
      side = std({ color: cs.cover.bg, roughness: 0.7 }),
      cover = std({ map: coverTex, roughness: 0.62, envMapIntensity: 0.5 }),
      inside = std({ map: tex(insideC(cs)), color: "#9d947f", envMapIntensity: 0.3, roughness: 0.85 });
    box(FW, 0.006, FD, side, 0, 0.003, 0, root, { cast: true });
    [
      [0, 0.009, 0],
      [0.004, 0.015, 0.0025],
      [0.002, 0.0205, -0.002],
    ].forEach(([ins, y, dx]) => box(FW - 0.012 - ins, 0.006, FD - 0.012 - ins, M.paperDim, dx, y, dx * 0.6, root, { cast: true }));
    box(0.006, 0.02, FD - 0.004, side, -FW / 2 + 0.003, 0.014, 0, root);
    const pivot = G();
    pivot.position.set(-FW / 2, 0.026, 0);
    root.add(pivot);
    inside.map.center.set(0.5, 0.5);
    inside.map.rotation = Math.PI;
    const cm = new THREE.Mesh(new THREE.BoxGeometry(FW, 0.004, FD), [side, side, cover, inside, side, side]);
    cm.position.x = FW / 2;
    cm.castShadow = true;
    pivot.add(cm);
    box(0.07, 0.004, 0.028, side, 0.05 + i * 0.07, 0, -FD / 2 - 0.012, pivot);
    const str = G();
    root.add(str);
    cyl(0.0017, 0.0017, FD + 0.008, M.thread, 0.075, 0.03, 0, str, { rx: Math.PI / 2, seg: 8 });
    const s2 = cyl(0.0017, 0.0017, FW + 0.008, M.thread, 0, 0.03, 0.02, str, { seg: 8 });
    s2.rotation.z = Math.PI / 2;
    const seal = reg("wax_seal", G(), off);
    seal.position.set(0.075 + FW / 2, 0.002, 0.02);
    pivot.add(seal);
    const WS = buildWaxSeal(THREE, { materials: { wax: M.wax } }),
      sa = WS.halfA,
      sb = WS.halfB;
    seal.add(sa, sb);
    root.traverse((o) => {
      if (o.isMesh) o.userData.pick = { k: "case", i };
    });
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(FW + 0.05, 0.12, FD + 0.05), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.set(SLOTS[i][0], TOP + 0.05, SLOTS[i][1]);
    proxy.rotation.y = SLOTS[i][2];
    proxy.userData.pick = { k: "case", i };
    off.add(proxy);
    return { root, pivot, cover, side, seal, sa, sb, str, proxy, hover: 0, slot: SLOTS[i] };
  });

  /* ============ ACT IV — EVIDENCE ============ */
  // phones: four sheets in a back row; the front row leaves the open case folder (x −0.38…0.13) clear, one sheet left of it, three right; all within ±0.62 of the lamp and the file stack
  const DESK_POSE = MOB
    ? [
        [-0.51, DZ + 0.2, 0.04],
        [0.39, DZ + 0.2, -0.05],
        [0.56, DZ + 0.2, 0.06],
        [-0.5, DZ - 0.22, -0.03],
        [-0.167, DZ - 0.22, 0.03],
        [0.167, DZ - 0.22, -0.02],
        [0.22, DZ + 0.2, 0.04],
        [0.5, DZ - 0.22, -0.04],
      ]
    : [
        [-0.62, DZ + 0.1, 0.1],
        [-0.45, DZ + 0.42, -0.18],
        [-0.8, DZ + 0.4, 0.5],
        [0.05, DZ - 0.3, 0.03],
        [0.34, DZ - 0.25, -0.08],
        [0.45, DZ + 0.2, -0.12],
        [0.3, DZ + 0.45, 0.22],
        [0.8, DZ + 0.35, -0.06],
      ];
  const BOARD_POSE = [
    [-2.6, 1.95, 2.1, 0.03],
    [-1.95, 2.3, 2.1, -0.06],
    [-2.15, 1.3, 2.1, 0.12],
    [-0.85, 1.85, 2.1, -0.02],
    [-0.25, 1.45, 2.0, 0.04],
    [0.85, 1.9, 1.9, 0.03],
    [1.4, 1.3, 2.1, -0.08],
    [2.15, 2.25, 2.0, 0.02],
  ];
  const FINAL_POSE = [2.55, 1.5, 2.0, -0.05];
  const DOC_IDS = [
    "police_report",
    "evidence_photo",
    "evidence_tag",
    "witness_statement",
    "interview_transcript",
    "newspaper_clipping",
    "handwritten_note",
    "legal_notice",
  ];
  function paperGeo(w, h) {
    const g = new THREE.PlaneGeometry(w, h, 6, 6),
      p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / (w / 2),
        y = p.getY(i) / (h / 2);
      p.setZ(i, 0.006 * x * x + 0.003 * y * y);
    }
    g.computeVertexNormals();
    return g;
  }
  const docs = DOCS.map((d, i) => {
    const m = new THREE.Mesh(paperGeo(d.w, d.h), std({ color: "#a39a87", roughness: 0.9, envMapIntensity: 0.3, side: THREE.DoubleSide }));
    m.castShadow = true;
    m.visible = false;
    m.userData.pick = { k: "doc", i };
    const g = reg(DOC_IDS[i], G(), off);
    g.add(m);
    scene.add(g);
    const hit = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.pick = m.userData.pick;
    scene.add(hit);
    return {
      g,
      m,
      hit,
      d,
      hover: 0,
      deskQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, DESK_POSE[i][2], 0, "YXZ")),
      boardQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, BOARD_POSE[i][3])),
    };
  });
  const finalDoc = (() => {
    const m = new THREE.Mesh(
      paperGeo(0.21, 0.28),
      std({ color: "#b3aa98", roughness: 0.88, envMapIntensity: 0.3, side: THREE.DoubleSide, transparent: true }),
    );
    m.castShadow = true;
    m.userData.pick = { k: "doc", i: 8 };
    const g = reg("critical_evidence", G(), off);
    g.add(m);
    scene.add(g);
    return { g, m, hover: 0 };
  })();

  /* ============ ACT V/VI — INVESTIGATION BOARD ============ */
  const BZ = -16.6;
  const board = reg("investigation_board", G(), off);
  board.position.set(0, -3.4, BZ);
  scene.add(board);
  _t0 = performance.now();
  const BF = buildBoardFrame(THREE, { materials: { walnut: M.walnut, trim: M.walnutDk, brass: M.brass } });
  mergeByMaterial(THREE, BF.frame)
    .children.slice()
    .forEach((c) => board.add(c));
  box(6.4, 2.52, 0.06, M.cork, 0, 1.94, 0.05, board);
  rec("board", _t0, [BF.frame]);
  const tlMat = std({ color: "#a39a87", roughness: 0.9, envMapIntensity: 0.3 });
  const tl = reg("board_timeline_strip", G(), off);
  tl.position.set(0, 0.79, 0.083);
  board.add(tl);
  plane(6.2, 0.288, tlMat, tl, 0, 0, 0);
  const cardMat = std({ color: "#fff", roughness: 0.85 });
  const card = reg("case_summary_card", G(), off);
  card.position.set(0, 2.9, 0.085);
  board.add(card);
  plane(0.9, 0.5, cardMat, card, 0, 0, 0);
  const pinG = new THREE.SphereGeometry(0.018, 12, 10);
  const pinMat = [std({ color: "#9b1f18", roughness: 0.35 }), M.brass];
  const pinAt = (x, y) => {
    const p = new THREE.Mesh(pinG, pinMat[((x * 10) | 0) % 2 ? 1 : 0]);
    p.position.set(x, y, 0.1);
    p.scale.setScalar(0.001);
    board.add(p);
    reg("push_pin", p, off);
    return p;
  };
  const anchors = BOARD_POSE.map((b, i) => V(b[0], b[1] + (DOCS[i].h * b[2]) / 2 - 0.035, 0.1));
  anchors.push(V(FINAL_POSE[0], FINAL_POSE[1] + (0.28 * FINAL_POSE[2]) / 2 - 0.035, 0.1));
  anchors.push(V(0, 2.9 + 0.2, 0.1));
  const pins = anchors.map((a) => pinAt(a.x, a.y));
  const CARD = 9,
    FIN = 8;
  const LINKS = [
    [CARD, 0, 0.622, 0.642],
    [0, 1, 0.63, 0.648],
    [0, 2, 0.636, 0.656],
    [1, 3, 0.664, 0.684],
    [3, 4, 0.676, 0.696],
    [4, 5, 0.704, 0.724],
    [5, 6, 0.712, 0.73],
    [3, 6, 0.72, 0.74],
    [CARD, 5, 0.724, 0.742],
    [6, 7, 0.748, 0.764],
    [7, FIN, 0.774, 0.784],
    [FIN, CARD, 0.788, 0.806],
  ];
  const threads = LINKS.map(([a, b, s, e]) => {
    const A = anchors[a],
      B = anchors[b],
      len = A.distanceTo(B);
    const mid = A.clone().lerp(B, 0.5);
    mid.y -= 0.05 + 0.05 * len;
    mid.z = 0.11;
    const curve = new THREE.CatmullRomCurve3([A, mid, B]);
    const geo = new THREE.TubeGeometry(curve, 40, b === CARD ? 0.007 : 0.005, 5, false);
    const mesh = new THREE.Mesh(geo, M.thread);
    geo.setDrawRange(0, 0);
    board.add(mesh);
    return { mesh, geo, s, e, total: geo.index.count };
  });
  reg("red_thread", threads[0].mesh, off);

  /* ============ ACT VII — CORRIDOR ============ */
  const hall = G();
  scene.add(hall);
  const hshell = reg("courtroom_hallway", G(), hall);
  hall.add(hshell);
  const hFloor = std({ map: T.floor.clone(), roughness: 0.42, envMapIntensity: 0.45 });
  hFloor.map.repeat.set(1.4, 7.4);
  hFloor.map.needsUpdate = true;
  plane(5, 21.6, hFloor, hshell, 0, 0, -27.8, -Math.PI / 2);
  plane(5, 21.6, M.walnutDk, hshell, 0, 6, -27.8, Math.PI / 2);
  [-1, 1].forEach((s) => {
    box(0.08, 1.3, 21.6, M.walnut, s * 2.5, 0.65, -27.8, hshell);
    box(0.06, 4.7, 21.6, M.walnutDk, s * 2.52, 3.65, -27.8, hshell);
    for (let z = -18.5; z > -38; z -= 3) box(0.26, 6, 0.16, M.walnut, s * 2.42, 3, z, hshell);
  });
  for (let z = -19; z > -38; z -= 3) box(5, 0.24, 0.26, M.walnut, 0, 5.88, z, hshell);
  const runner = reg("hallway_runner", G(), hall);
  hall.add(runner);
  plane(1.3, 21.4, M.runnerDk, runner, 0, 0.004, -27.8, -Math.PI / 2);
  const SCN = mergeByMaterial(THREE, buildSconce(THREE, { materials: { brass: M.brassDk, glow: M.glow } }).sconce);
  [-20, -24, -28, -32, -36].forEach((z) =>
    [-1, 1].forEach((s) => {
      const sc = reg("wall_sconce", G(), hall);
      sc.position.set(s * 2.49, 2.3, z);
      sc.rotation.y = (-s * Math.PI) / 2;
      hall.add(sc);
      SCN.children.forEach((c) => sc.add(c.clone()));
    }),
  );
  [
    [-22, -1],
    [-26, 1],
    [-30, -1],
    [-34, 1],
  ].forEach(([z, s]) => {
    const pf = reg("portrait_frame", G(), hall);
    pf.position.set(s * 2.49, 2.8, z);
    pf.rotation.y = (-s * Math.PI) / 2;
    hall.add(pf);
    putM(
      pf,
      buildPortraitFrame(THREE, {
        materials: {
          gilt: M.brassDk,
          trim: M.walnutDk,
          canvas: std({ map: tex(stripeC(380, 500, "PORTRAIT\ntexture slot")), roughness: 0.8 }),
        },
      }).frame,
    );
  });
  // courtroom facade + doors
  box(0.8, 6, 0.4, M.walnut, -2.1, 3, -38.5, hall);
  box(0.8, 6, 0.4, M.walnut, 2.1, 3, -38.5, hall);
  box(3.4, 1.2, 0.4, M.walnut, 0, 5.4, -38.5, hall);
  {
    const cp = reg("courtroom_plaque", G(), hall);
    cp.position.set(0, 5.34, -38.3);
    hall.add(cp);
    mergeByMaterial(
      THREE,
      buildCourtPlaque(THREE, {
        w: 3.1,
        h: 0.4,
        materials: { wood: M.walnutDk, brass: M.brass, face: std({ map: T.lintel, roughness: 0.5, metalness: 0.2 }) },
      }).plaque,
    )
      .children.slice()
      .forEach((c) => cp.add(c));
  }
  box(3.9, 0.16, 0.5, M.walnutDk, 0, 4.88, -38.3, hall);
  box(3.4, 0.02, 0.5, M.brass, 0, 0.01, -38.5, hall);
  const cDoors = reg("courtroom_doors", G(), hall);
  hall.add(cDoors);
  const mkLeaf = (s) => {
    const pv = G();
    pv.position.set(s * 1.7, 0, -38.5);
    cDoors.add(pv);
    const lf = G();
    lf.position.x = -s * 0.85;
    pv.add(lf);
    const CL = buildCourtDoorLeaf(THREE, { materials: { wood: Mdoor, trim: M.walnutDk, brass: M.brass, black: M.black } });
    mergeByMaterial(THREE, CL.leaf)
      .children.slice()
      .forEach((c) => lf.add(c));
    const hd = reg("courtroom_door_handle", G(), hall);
    hd.position.set(-s * 0.72, 1.15, 0.07);
    hd.scale.set(s > 0 ? -1.25 : 1.25, 1.25, 1.25);
    lf.add(hd);
    mergeByMaterial(THREE, CL.handle)
      .children.slice()
      .forEach((c) => hd.add(c));
    const lk = mergeByMaterial(THREE, CL.lock);
    lk.position.set(-s * 0.72, 0.93, 0.07);
    lk.scale.setScalar(1.25);
    lf.add(lk);
    return { pv, hd };
  };
  const dL = mkLeaf(-1),
    dR = mkLeaf(1);
  const doorFx = G();
  hall.add(doorFx);
  const doorBeam = plane(3.4, 7, basicAdd(T.grad, "#ffe2b4", 0), doorFx, 0, 1.2, -35.8, -1.2);
  const doorGlow = plane(3.4, 4.8, basicAdd(T.rad, "#fff0d0", 0), doorFx, 0, 2.4, -38.7);
  // main thread (world space)
  const mainCurve = new THREE.CatmullRomCurve3(
    [
      V(2.75, 1.645, BZ + 0.1),
      V(2.98, 0.9, BZ + 0.35),
      V(2.75, 0.03, BZ + 0.85),
      V(1.7, 0.03, -16.35),
      V(0.62, 0.03, -17.25),
      V(0.56, 0.03, -19.5),
      V(0.55, 0.03, -26),
      V(0.5, 0.03, -32),
      V(0.34, 0.03, -36),
      V(0.1, 0.02, -38.3),
      V(0, 0.012, -38.9),
    ],
    false,
    "centripetal",
  );
  const mainGeo = new THREE.TubeGeometry(mainCurve, 400, 0.008, 6, false);
  const mainThread = new THREE.Mesh(mainGeo, M.threadMain);
  mainGeo.setDrawRange(0, 0);
  scene.add(mainThread);

  /* ============ ACT VIII/IX — COURTROOM ============ */
  const court = G();
  scene.add(court);
  const cshell = reg("courtroom", G(), court);
  court.add(cshell);
  const cFloor = std({ map: T.floor.clone(), roughness: 0.38, color: "#d8c0a8", envMapIntensity: 0.5 });
  cFloor.map.repeat.set(5, 7);
  cFloor.map.needsUpdate = true;
  plane(16, 23.6, cFloor, cshell, 0, 0, -50.3, -Math.PI / 2);
  {
    const ZC = -50.4,
      CW = { wood: M.walnut, trim: M.walnutDk, plaster: M.plasterCream },
      CWin = { wood: M.walnutDk, trim: M.walnut, glass: M.windowDay };
    const walls = reg("courtroom_walls", G(), court);
    cshell.add(walls);
    const wins = reg("courtroom_windows", G(), court);
    cshell.add(wins);
    const place = (grp, obj, x, z, ry) => {
      const h = G();
      h.position.set(x, 0, z);
      h.rotation.y = ry;
      grp.add(h);
      putM(h, obj);
      return h;
    };
    [-1, 1].forEach((s) => {
      const lx = (z) => (s < 0 ? ZC - z : z - ZC),
        ry = (-s * Math.PI) / 2;
      place(
        walls,
        buildCourtWall(THREE, {
          materials: CW,
          w: 22.9,
          wains: 3,
          windows: [-44, -50, -56].map((z) => ({ x: lx(z), y0: 3.4, y1: 7.8, w: 1.8 })),
          pilasters: [-41, -47, -53, -59].map(lx),
          name: "courtroom_side_wall",
        }).wall,
        s * 7.95,
        ZC,
        ry,
      );
      [-44, -50, -56].forEach((z) => {
        const h = place(wins, buildCourtWindow(THREE, { materials: CWin, w: 1.8, h: 4.4 }).window, s * 7.95, z, ry);
        h.position.y = 5.6;
      });
    });
    place(
      walls,
      buildCourtWall(THREE, { materials: CW, w: 15.9, wains: 3, door: { x0: -1.7, x1: 1.7, y1: 6 }, name: "courtroom_entrance_wall" }).wall,
      0,
      -38.95,
      Math.PI,
    );
    place(walls, buildCourtWall(THREE, { materials: CW, w: 15.9, wains: 5.2, name: "courtroom_back_wall" }).wall, 0, -61.85, 0);
    const ceil = reg("courtroom_ceiling", G(), court);
    cshell.add(ceil);
    place(
      ceil,
      buildCourtCeiling(THREE, {
        materials: { wood: M.walnut, trim: M.walnutDk },
        w: 15.38,
        d: 22.38,
        h: 9,
        zs: [-41, -44, -47, -50, -53, -56, -59].map((z) => z - ZC),
      }).ceiling,
      0,
      ZC,
      0,
    );
    [walls, wins, ceil].forEach(noCast);
  }
  const aisle = reg("hallway_runner", G(), court);
  court.add(aisle);
  aisle.position.set(0, 0, -43.2);
  putM(
    aisle,
    buildAisleRunner(THREE, {
      w: 1.6,
      d: 9.2,
      materials: { carpet: M.carpet, binding: std({ color: "#2e0c09", roughness: 0.9 }), brass: M.brass },
    }).runner,
  );
  {
    const PB = mergeByMaterial(THREE, buildGalleryBench(THREE, { w: 5.2, materials: { wood: M.walnut, trim: M.walnutDk } }).bench),
      b = reg("gallery_bench", G(), court);
    court.add(b);
    const at = [];
    for (let r = 0; r < 5; r++) [-1, 1].forEach((s) => at.push(new THREE.Matrix4().makeTranslation(s * 3.85, 0, -41.2 - r * 1.15)));
    PB.children.forEach((c) => {
      const im = new THREE.InstancedMesh(c.geometry, c.material, at.length);
      at.forEach((mx, i) => im.setMatrixAt(i, mx));
      im.castShadow = im.receiveShadow = true;
      im.frustumCulled = false;
      b.add(im);
    });
  }
  const bar = reg("bar_rail", G(), court);
  court.add(bar);
  {
    const RW = { wood: M.walnut, trim: M.walnutDk, brass: M.brass },
      railM = mergeByMaterial(THREE, buildBarRail(THREE, { L: 6.88, materials: RW }).rail);
    [-1, 1].forEach((s) => {
      const r = railM.clone();
      r.position.set(s * 4.44, 0, -47.6);
      bar.add(r);
    });
    const gate = reg("bar_gate", G(), court);
    bar.add(gate);
    const gateM = mergeByMaterial(THREE, buildBarGate(THREE, { w: 0.9, materials: RW }).gate);
    [-1, 1].forEach((s) => {
      const l = gateM.clone();
      l.position.set(s * 0.93, 0, -47.6);
      l.rotation.y = s < 0 ? 0.35 : Math.PI - 0.35;
      gate.add(l);
    });
  }
  [
    [-3.1, "PLAINTIFF"],
    [3.1, "DEFENCE"],
  ].forEach(([x, lbl]) => {
    const t = reg("counsel_table", G(), court);
    t.position.set(x, 0, -50);
    court.add(t);
    putM(t, buildCounselTable(THREE, { materials: { wood: M.walnut, trim: M.walnutDk, brass: M.brass } }).table);
    const [pc, pg] = cv(512, 96);
    pg.fillStyle = "#b89250";
    pg.fillRect(0, 0, 512, 96);
    pg.fillStyle = "#2a1a0a";
    pg.font = `600 40px ${SANS}`;
    sp(pg, "14px");
    pg.textAlign = "center";
    pg.fillText(lbl, 256, 64);
    const pl = box(
      0.5,
      0.1,
      0.02,
      [M.brass, M.brass, M.brass, M.brass, std({ map: tex(pc), metalness: 0.7, roughness: 0.35 }), M.brass],
      0,
      0.84,
      0.35,
      t,
    );
    pl.rotation.x = -0.35;
    bankerLamp(-0.8, 0.79, -0.25, t, court);
    paperStack(0.5, 0.79, 0.1, t, court, 3);
    [-0.5, 0.5].forEach((cx) => officeChair(cx, 0.8, Math.PI, t, court, "leather_office_chair"));
  });
  [1, -1].forEach((s) => {
    const ws = reg("witness_stand", G(), court);
    ws.position.set(s * 4.9, 0, -54.8);
    ws.rotation.y = -s * 0.55;
    court.add(ws);
    _t0 = performance.now();
    mergeByMaterial(
      THREE,
      buildWitnessStand(THREE, { materials: { wood: M.walnut, trim: M.walnutDk, brass: M.brass, book: M.leatherRed } }).stand,
    )
      .children.slice()
      .forEach((c) => ws.add(c));
    rec("witness_stand", _t0, [ws]);
    officeChair(0, -0.25, 0, ws, court, "leather_office_chair").position.y = 0.42;
  });
  const steno = reg("stenographer_desk", G(), court);
  steno.position.set(-1.55, 0, -55.2);
  steno.rotation.y = 0.3;
  court.add(steno);
  mergeByMaterial(THREE, buildStenoDesk(THREE, { materials: { wood: M.walnut, trim: M.walnutDk, brass: M.brass } }).desk)
    .children.slice()
    .forEach((c) => steno.add(c));
  officeChair(0, -0.62, 0, steno, court, "leather_office_chair");
  const TW = buildTypewriter(THREE, {
    materials: {
      body: std({ color: "#141210", roughness: 0.3, metalness: 0.2 }),
      chrome: std({ color: "#c9c6c0", roughness: 0.22, metalness: 0.9 }),
      key: M.cream,
      rubber: M.black,
      paper: std({ color: "#efe8d8", roughness: 0.9, side: THREE.DoubleSide }),
    },
  });
  const twG = reg("stenographer_typewriter", TW.typewriter, court);
  twG.position.set(0, 0.775, -0.06);
  steno.add(twG);
  const bench = reg("judges_bench", G(), court);
  bench.position.set(0, 0, -57.6);
  court.add(bench);
  putM(bench, buildJudgesBench(THREE, { materials: { wood: M.walnut, trim: M.walnutDk, top: M.oak } }).bench);
  const seal1 = reg("court_seal", G(), court);
  seal1.position.set(0, 1.2, 1.33);
  bench.add(seal1);
  cyl(0.42, 0.42, 0.05, M.brass, 0, 0, 0, seal1, { rx: Math.PI / 2, seg: 48 });
  cyl(0.33, 0.33, 0.06, M.brassDk, 0, 0, 0, seal1, { rx: Math.PI / 2, seg: 48 });
  const jc = reg("judges_chair", G(), court);
  jc.position.set(0, 0.6, -58.75);
  court.add(jc);
  putM(jc, buildJudgesChair(THREE, { materials: { leather: M.leatherRed, wood: M.walnut, trim: M.walnutDk, brass: M.brass } }).chair);
  const block = reg("sound_block", G(), court);
  block.position.set(0.39, 1.915, -56.82);
  court.add(block);
  _t0 = performance.now();
  const GV = buildGavel(THREE, {
    materials: { walnut: M.walnut, walnutDark: M.walnutDk, brass: M.brass, felt: std({ color: "#2a3a2c", roughness: 1 }) },
  });
  rec("gavel", _t0, [GV.gavel, GV.block]);
  if (GV.block.children.length)
    mergeByMaterial(THREE, GV.block)
      .children.slice()
      .forEach((c) => block.add(c));
  const judge = reg("ai_judge", G(), court);
  judge.position.set(0, 1.32, -57.95);
  judge.scale.setScalar(1.3);
  court.add(judge);
  _t0 = performance.now();
  const JB = buildJudge(THREE, {
    materials: {
      robe: M.robe,
      cream: M.cream,
      head: M.head,
      wig: M.wig,
      visor: std({ color: "#1a1510", emissive: "#c9a45c", emissiveIntensity: 0.9, roughness: 0.3 }),
    },
  });
  JB.judge.remove(JB.arm);
  mergeByMaterial(THREE, JB.judge)
    .children.slice()
    .forEach((c) => judge.add(c));
  const arm = JB.arm;
  {
    const am = mergeByMaterial(THREE, arm);
    arm.clear();
    am.children.slice().forEach((c) => arm.add(c));
  }
  judge.add(arm);
  rec("judge", _t0, [judge]);
  const gavel = reg("courtroom_gavel", G(), court);
  gavel.position.set(0, -0.01, 0.6);
  arm.add(gavel);
  gavel.add(mergeByMaterial(THREE, GV.gavel));
  gavel.children[0].rotation.z = Math.PI / 2;
  const back = G();
  court.add(back);
  box(4.2, 6, 0.2, M.walnut, 0, 3.6, -61.75, back);
  const drapes = reg("court_drapes", G(), court);
  court.add(drapes);
  drapes.position.z = -61.6;
  putM(drapes, buildDrapes(THREE, { materials: { velvet: M.velvet, trim: M.walnutDk } }).drapes);
  const seal2 = reg("court_seal", G(), court);
  seal2.position.set(0, 4.7, -61.6);
  court.add(seal2);
  cyl(0.7, 0.7, 0.06, M.brass, 0, 0, 0, seal2, { rx: Math.PI / 2, seg: 64 });
  cyl(0.56, 0.56, 0.07, M.brassDk, 0, 0, 0, seal2, { rx: Math.PI / 2, seg: 64 });
  [
    [-2.2, 1.95, -57.2],
    [-1.9, 1.95, -57.25],
  ].forEach(([x, y, z], i) =>
    box(0.3, 0.06 + i * 0.02, 0.22, std({ color: BK[i], map: T.spine, roughness: 0.7 }), x, y + i * 0.07, z, court, { ry: i * 0.2 }),
  );
  const dust2 = dust(MOB ? 300 : 600, [-7, 7], [0.3, 8], [-40, -60]);
  court.add(dust2);
  // sun shafts through the left windows, with dust drifting inside them
  const beamMats = [],
    beamPts = [];
  const sunD = V(1, -1.1, -0.15),
    toFloor = (p) => p.clone().add(sunD.clone().multiplyScalar(p.y / -sunD.y));
  const paneTex = dataTex(256, 256, (u, v) => {
    const px = u * 256,
      py = v * 256,
      e = 6,
      sq = (p, o) => sstep(o - e, o + e, p) * (1 - sstep(o + 108 - e, o + 108 + e, p));
    const s = Math.max(sq(px, 14), sq(px, 134)) * Math.max(sq(py, 14), sq(py, 134));
    return [s, 1];
  });
  // shaft volumes fade where their faces turn edge-on to the camera, so the beam has soft sides instead of a hard sheet edge
  const shaftBase = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color("#fff0d4") }, uOpacity: { value: 0 } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexColors: true,
    vertexShader:
      "varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); vec3 v = normalize(-mv.xyz); vA = color.r * pow(abs(dot(n, v)), 2.0); gl_Position = projectionMatrix * mv; }",
    fragmentShader:
      "uniform vec3 uColor; uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(uColor * vA * uOpacity, 1.0); }",
  });
  const patchMat = basicAdd(paneTex, "#ffe9c4", 0);
  patchMat.userData.base = 0.2;
  beamMats.push(patchMat);
  [-44, -50, -56].forEach((z) => {
    // each shaft has its own material so it can thin out as the camera walks into it (a sheet of light seen edge-on from inside looks like a flat wedge).
    // Portrait phones use a much wider FOV and walk closer, so there the shafts stay faint and fade out sooner, or they read as a grey wedge over the left half of the screen.
    const shaftMat = shaftBase.clone();
    shaftMat.userData.base = 0.09;
    shaftMat.userData.near = V(-5.4, 3.2, z - 0.4);
    beamMats.push(shaftMat);
    const x0 = -7.9,
      y0 = 3.45,
      y1 = 7.75,
      z0 = z - 0.86,
      z1 = z + 0.86;
    const w = [V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0)],
      f = w.map(toFloor);
    const pos = [],
      col = [],
      quad = (a, b, c, d, ca, cb) => {
        [a, b, c, a, c, d].forEach((p) => pos.push(p.x, p.y, p.z));
        [ca, cb, cb, ca, cb, ca].forEach((k) => col.push(k, k, k));
      };
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quad(w[i], f[i], f[j], w[j], 1, 0.18);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    sg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    sg.computeVertexNormals();
    const shaft = new THREE.Mesh(sg, shaftMat);
    shaft.renderOrder = 2;
    court.add(shaft);
    const idx = [0, 1, 2, 0, 2, 3],
      uvs = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      pg = new THREE.BufferGeometry();
    pg.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        idx.flatMap((i) => [f[i].x, 0.012, f[i].z]),
        3,
      ),
    );
    pg.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        idx.flatMap((i) => uvs[i]),
        2,
      ),
    );
    const patch = new THREE.Mesh(pg, patchMat);
    patch.renderOrder = 2;
    court.add(patch);
    for (let i = 0; i < 170; i++) {
      const p = V(x0, lerp(y0, y1, rnd()), lerp(z0, z1, rnd())),
        q = p.clone().lerp(toFloor(p), rnd() * 0.9);
      beamPts.push(q.x, q.y, q.z);
    }
  });
  const dust3 = (() => {
    const g = new THREE.BufferGeometry(),
      a = new Float32Array(beamPts);
    g.setAttribute("position", new THREE.BufferAttribute(a, 3));
    const p = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 0.022,
        map: T.rad,
        color: "#fff2da",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    p.userData.base = a.slice();
    return p;
  })();
  court.add(dust3);

  function dust(n, xr, yr, zr) {
    const g = new THREE.BufferGeometry(),
      a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      a[i * 3] = lerp(xr[0], xr[1], rnd());
      a[i * 3 + 1] = lerp(yr[0], yr[1], rnd());
      a[i * 3 + 2] = lerp(zr[0], zr[1], rnd());
    }
    g.setAttribute("position", new THREE.BufferAttribute(a, 3));
    const p = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 0.014,
        map: T.rad,
        color: "#ffd9a8",
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    p.userData.base = a.slice();
    return p;
  }

  await load(0.84, "Lighting the courtroom…");
  // phones: bump maps shimmer into coloured speckle at distance on mobile GPUs (most visible on the courtroom's far walls and ceiling)
  // …but keep it on the street (flags, kerb, setts, road): it's close to the camera, so it reads as stone instead of flat colour
  // only the street's own materials are exempt; the courtroom shares stone/granite names, so match by owner, not name
  const KEEP_BUMP = /^(flagstone|granite_|cobble)/,
    keepSet = new Set();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    let n = o,
      street = false;
    while (n) {
      if (n.name === "street_pavement" || n.name === "street_road") {
        street = true;
        break;
      }
      n = n.parent;
    }
    if (street) [].concat(o.material).forEach((m) => m && KEEP_BUMP.test(m.name || "") && keepSet.add(m));
  });
  scene.traverse((o) => {
    if (!o.isMesh) return;
    let n = o,
      street = false;
    while (n) {
      if (n.name === "street_pavement" || n.name === "street_road") {
        street = true;
        break;
      }
      n = n.parent;
    }
    if (!street) [].concat(o.material).forEach((m) => keepSet.delete(m));
  });
  if (MOB)
    scene.traverse((o) => {
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (m && m.bumpMap && !keepSet.has(m)) {
          m.bumpMap = null;
          m.needsUpdate = true;
        }
      });
    });
  /* ---------------- post (bloom) ---------------- */
  let composer = null,
    bloom = null;
  try {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import("three/examples/jsm/postprocessing/EffectComposer.js"),
      import("three/examples/jsm/postprocessing/RenderPass.js"),
      import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
      import("three/examples/jsm/postprocessing/OutputPass.js"),
    ]);
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, cam));
    bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.3, 0.5, 1.05);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  } catch {
    composer = null;
  }

  await load(0.9, "Filing the evidence…");
  try {
    await swapModels(ASSETS, MAN);
  } catch {
    /* a model that fails to load keeps its placeholder */
  }
  const CASE_TEX = CASES.map((cs) => ({
    docs: DOCS.map((d) => tex(docC(d.k, cs))),
    final: tex(finalC(cs)),
    card: tex(cardC(cs)),
    tl: tex(timelineC(cs)),
  }));
  if (CASE_TEX.length) applyCase(0);
  await load(0.96, "Preparing the courtroom…");
  {
    const DENY = new Set([
      "case_file",
      "wax_seal",
      "push_pin",
      "board_timeline_strip",
      "case_summary_card",
      "courtroom_doors",
      "investigation_board",
      "antique_longcase_clock",
      "ai_judge",
      "courtroom_gavel",
      "law_firm_entrance_door",
      "door_brass_handle",
      "door_lock_escutcheon",
      "stenographer_typewriter",
      "wax_seal",
    ]);
    const denyObjs = new Set(ASSETS.filter((a) => DENY.has(a.id)).map((a) => a.obj)),
      assetObjs = new Set(ASSETS.map((a) => a.obj));
    const underDeny = (o) => {
      for (let a = o; a; a = a.parent) if (denyObjs.has(a)) return true;
      return false;
    };
    const ok = (m) =>
      m.isMesh &&
      !m.isInstancedMesh &&
      !m.isPoints &&
      !Array.isArray(m.material) &&
      !m.userData.pick &&
      !assetObjs.has(m) &&
      m.children.length === 0 &&
      m.visible &&
      !m.material.transparent &&
      m.material.blending === THREE.NormalBlending;
    const groups = [];
    scene.traverse((o) => {
      if (!o.isMesh && !o.isLight && !o.isCamera && o.children.length && !underDeny(o)) groups.push(o);
    });
    let before = 0,
      after = 0;
    groups.forEach((g) => {
      const leafs = g.children.filter(ok);
      if (leafs.length < 3) return;
      const tmp = new THREE.Group();
      leafs.forEach((m) => {
        g.remove(m);
        tmp.add(m);
      });
      const mg = mergeByMaterial(THREE, tmp, (g.name || "static") + "_merged");
      before += leafs.length;
      after += mg.children.length;
      g.add(mg);
    });
    PERF.merge = { meshesBefore: before, meshesAfter: after };
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
  }
  const _w0 = performance.now();
  const WZ = [
    [ext, -1, 0.2],
    [off, -1, 0.93],
    [board, 0.5, 0.86],
    [hall, 0.79, 2],
    [court, 0.9, 2],
    [mainThread, 0.8, 0.97],
  ];
  const warmStep = (p, rt) => {
    const hid = [];
    scene.traverse((o) => {
      if (!o.visible && !o.isLight && !WZ.some((z) => z[0] === o)) {
        hid.push(o);
        o.visible = true;
      }
    });
    const prev = WZ.map(([z]) => z.visible);
    WZ.forEach(([z, a, b]) => (z.visible = p > a && p < b));
    try {
      renderer.compile(scene, cam);
    } catch {
      /* shaders then compile on first render */
    }
    const fc = [];
    scene.traverse((o) => {
      if (o.isMesh && o.frustumCulled) {
        fc.push(o);
        o.frustumCulled = false;
      }
    });
    renderer.shadowMap.needsUpdate = true;
    try {
      if (rt) {
        renderer.setRenderTarget(rt);
        renderer.render(scene, cam);
        renderer.setRenderTarget(null);
      } else if (composer) composer.render();
      else renderer.render(scene, cam);
    } catch {
      /* warm-up only; the real frames render as usual */
    }
    fc.forEach((o) => (o.frustumCulled = true));
    hid.forEach((o) => (o.visible = false));
    WZ.forEach(([z], i) => (z.visible = prev[i]));
  };
  {
    const init = (t) => {
      try {
        if (t?.isTexture) renderer.initTexture(t);
      } catch {
        /* uploaded on first use instead */
      }
    };
    scene.traverse((o) => {
      if (o.material)
        []
          .concat(o.material)
          .forEach((m) =>
            ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "alphaMap", "bumpMap", "envMap"].forEach((k) => init(m[k])),
          );
    });
    CASE_TEX.forEach((c) => [...c.docs, c.final, c.card, c.tl].forEach(init));
    warmStep(0.05);
    await new Promise((r) => setTimeout(r, 0));
    PERF.sceneTris = triCount(scene);
    PERF.warmMs = Math.round(performance.now() - _w0);
    PERF.loadMs = Math.round(performance.now());
    WZ.forEach(([z, a, b]) => (z.visible = 0 > a && 0 < b));
  }
  // remaining rooms are prepared in the background once Act I has settled, off-screen, one per step
  {
    const rt = new THREE.WebGLRenderTarget(64, 64),
      rest = [0.4, 0.7, 0.82, 0.88, 0.95, 0.99];
    const next = () => {
      if (!rest.length) {
        rt.dispose();
        PERF.bgWarmMs = Math.round(performance.now());
        return;
      }
      if (!S.go || S.t - S.goT < 4.5 || (S.door && S.walkT < 1)) {
        setTimeout(next, 250);
        return;
      }
      warmStep(rest.shift(), rt);
      setTimeout(next, 220);
    };
    setTimeout(next, 400);
  }
  cb.onLoad?.(1, "Court is ready.");
  /* ---------------- camera path ---------------- */
  const K = [
    [0.0, [0, 1.2, 4.8], [0, 1.6, 0]],
    [0.03, [0, 1.45, 2.3], [0, 1.6, -3]],
    [0.078, [0, 1.6, -1.2], [0, 1.5, -8]],
    [0.14, [-0.3, 1.62, -4.0], [-3.6, 1.6, -6.2]],
    [0.2, [1.05, 1.62, -7.0], [4.2, 1.95, -8.65]],
    [0.27, [0, 1.6, -9.0], [0, 0.95, -12.2]],
    [0.36, [0, 1.52, -10.5], [0, 0.8, -12.1]],
    [0.42, [0, 1.3, -11.33], [0, 0.78, -12.03]],
    [0.47, [0, 1.3, -11.3], [0, 0.78, -12.06]],
    [0.555, [0, 1.6, -11.15], [0, 0.78, -12.2]],
    [0.6, [0, 1.75, -10.5], [0, 1.9, BZ]],
    [0.64, [-2.8, 1.92, -14.5], [-2.8, 1.58, BZ]],
    [0.685, [-1.1, 1.88, -14.6], [-1.1, 1.5, BZ]],
    [0.725, [0.5, 1.88, -14.6], [0.5, 1.48, BZ]],
    [0.765, [1.85, 1.9, -14.55], [1.85, 1.55, BZ]],
    [0.8, [0, 1.95, -11.9], [0, 1.95, BZ]],
    [0.84, [0, 1.7, -13.8], [0, 1.2, -17.8]],
    [0.875, [0, 1.6, -24], [0, 0.7, -32]],
    [0.905, [0, 1.7, -33.9], [0, 2.2, -38.5]],
    [0.935, [0, 1.7, -36.2], [0, 2.1, -42]],
    [0.955, [0, 1.65, -42.5], [0, 2.0, -57]],
    [0.978, [0, 1.62, -47.0], [0, 2.05, -57.5]],
    [1.0, [0, 1.6, -48.1], [0, 2.3, -57.5]],
  ];
  const posC = new THREE.CatmullRomCurve3(
      K.map((k) => V(...k[1])),
      false,
      "centripetal",
    ),
    lookC = new THREE.CatmullRomCurve3(
      K.map((k) => V(...k[2])),
      false,
      "centripetal",
    );
  const tmpP = V(0, 0, 0),
    tmpL = V(0, 0, 0),
    _dv = V(0, 0, 0);
  function camAt(p) {
    let i = 0;
    while (i < K.length - 2 && p > K[i + 1][0]) i++;
    let l = inv(K[i][0], K[i + 1][0], p);
    l = lerp(l, ss(l), 0.6);
    const u = (i + l) / (K.length - 1);
    posC.getPoint(u, tmpP);
    lookC.getPoint(u, tmpL);
  }

  /* ---------------- state ---------------- */
  const S = {
    movie: !!cb.movie,
    seen: new Set(),
    hovT: {},
    lastInt: -9,
    dwell: false,
    deskHold: false,
    deskIdle: 0,
    stopI: 0,
    dwellT: 0,
    hoverExt: -1,
    walkT: 0,
    intro: 0,
    go: false,
    stepPh: 0,
    bobA: 0,
    prog: 0,
    target: 0,
    door: false,
    doorT: 0,
    doorNudge: 0,
    sel: null,
    selT: 0,
    gavelT: -1,
    gavelDone: false,
    inspect: -1,
    inspectT: 0,
    handleHover: 0,
    handleHoverExt: false,
    bp: false,
    t: 0,
  };
  const snd = new Snd();
  const UI = {};
  const emit = (o) => {
    let ch = false;
    for (const k in o) {
      const a = JSON.stringify(UI[k]),
        b = JSON.stringify(o[k]);
      if (a !== b) {
        UI[k] = o[k];
        ch = true;
      }
    }
    if (ch && cb.onState) cb.onState({ ...UI });
  };

  function applyCase(i) {
    const t = CASE_TEX[i];
    if (!t) return;
    const set = (m, x) => {
      const had = !!m.map;
      m.map = x;
      if (!had) m.needsUpdate = true;
    };
    docs.forEach((d, j) => set(d.m.material, t.docs[j]));
    set(finalDoc.m.material, t.final);
    set(cardMat, t.card);
    set(tlMat, t.tl);
  }
  // sound is on at low volume by default; browsers only allow audio after the first gesture, so start it then
  const soundStart = () => {
    if (S.soundTouched) return;
    S.soundTouched = true;
    try {
      snd.setVol(0.2);
      snd.set(true);
      if (snd.ctx?.state === "suspended") snd.ctx.resume();
    } catch {
      /* no audio is fine */
    }
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((t) => W.removeEventListener(t, soundStart, true));
  };
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach((t) => W.addEventListener(t, soundStart, { capture: true, passive: true }));
  function openDoor() {
    if (S.door) return;
    S.door = true;
    S.doorT = 0;
    soundStart();
    snd.play("handle");
    setTimeout(() => snd.play("creak"), 250);
  }
  function select(i, instant) {
    if (S.sel !== null) return;
    S.sel = i;
    S.seen = new Set();
    S.hovT = {};
    S.selT = instant ? 1 : 0;
    applyCase(i);
    snd.play("paper");
    if (!instant) S.target = Math.max(S.target, 0.475);
  }
  function skip() {
    if (!S.door) {
      S.door = true;
      S.doorT = 1;
    }
    S.walkT = 1;
    if (S.sel === null) select(0, true);
    S.inspect = -1;
    S.prog = 0.945;
    S.target = 1;
  }

  const _sv = V(0, 0, 0);
  function onScreen() {
    const out = [],
      list = docs.map((d, i) => [d.m, i]);
    if (finalDoc.g.visible && S.prog > 0.775) list.push([finalDoc.m, 8]);
    list.forEach(([m, i]) => {
      for (let o = m; o; o = o.parent) if (o.visible === false) return;
      m.getWorldPosition(_sv).project(cam);
      if (_sv.z < 1 && Math.abs(_sv.x) < 0.92 && Math.abs(_sv.y) < 0.9) out.push(i);
    });
    return out;
  }
  /* ---------------- input ---------------- */
  const ptr = { ndc: new THREE.Vector2(9, 9), x: 0, y: 0, in: false, down: null, mx: 0, my: 0, sx: 0, sy: 0 };
  const push = (d) => {
    if (d) {
      S.lastDir = Math.sign(d);
      S.lastPushT = S.t;
    }
    if (S.inspect >= 0) {
      S.inspect = -1;
      return;
    }
    if (!S.door) {
      if (d > 0) {
        S.doorNudge += d;
        if (S.doorNudge > 0.004) openDoor();
      }
      return;
    }
    if (S.auto) {
      if (d < 0) {
        S.auto = false;
        S.autoHold = true;
        S.target = clamp(S.prog + d, 0, 1);
      }
      return;
    }
    S.target = clamp(S.target + d, 0, 1);
  };
  // UI layered over the scene (dialogs, menus, scrollable panels) keeps native scrolling
  const overUI = (t) => {
    if (!t || !t.closest) return false;
    if (t.closest("[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[aria-modal=true]")) return true;
    for (let el = t; el && el !== document.body; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return true;
    }
    return false;
  };
  const onWheel = (e) => {
    if (overUI(e.target)) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    push(clamp(dy, -120, 120) * 0.000055);
  };
  const onKey = (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    const k = e.key;
    if (!S.door && k === " " && !(e.target && /^(button|a)$/i.test(e.target.tagName))) {
      e.preventDefault();
      openDoor();
      return;
    }
    if (k === "Escape" && S.inspect >= 0) {
      S.inspect = -1;
      return;
    }
    if (k === "ArrowDown" || k === "PageDown" || k === " ") {
      e.preventDefault();
      push(0.012);
    }
    if (k === "ArrowUp" || k === "PageUp") {
      e.preventDefault();
      push(-0.012);
    }
  };
  let ty = null;
  const onTS = (e) => {
      ty = e.touches[0].clientY;
      S.fling = 0;
      S._tv = 0;
    },
    onTM = (e) => {
      if (ty == null) return;
      if (overUI(e.target)) return;
      const y = e.touches[0].clientY,
        d = (ty - y) * 0.00014;
      push(d);
      S._tv = lerp(S._tv || 0, d, 0.5);
      ty = y;
      e.preventDefault();
    },
    onTE = () => {
      if (ty != null && Math.abs(S._tv || 0) > 0.0004 && S.inspect < 0) S.fling = clamp(S._tv, -0.004, 0.004);
      ty = null;
    };
  const rect = () => cvs.getBoundingClientRect();
  const onMove = (e) => {
    if (ptr.down && ptr.lpT && Math.hypot(e.clientX - ptr.down[0], e.clientY - ptr.down[1]) > 10) {
      clearTimeout(ptr.lpT);
      ptr.lpT = 0;
    }
    const r = rect();
    ptr.x = e.clientX - r.left;
    ptr.y = e.clientY - r.top;
    ptr.ndc.set((ptr.x / r.width) * 2 - 1, -(ptr.y / r.height) * 2 + 1);
    ptr.in = true;
    ptr.mx = ptr.ndc.x;
    ptr.my = ptr.ndc.y;
  };
  const onLeave = () => {
    ptr.in = false;
    ptr.ndc.set(9, 9);
  };
  const onDown = (e) => {
    ptr.down = [e.clientX, e.clientY];
    ptr.lp = false;
    clearTimeout(ptr.lpT);
    ptr.lpT = 0;
    if (e.pointerType !== "mouse") {
      onMove(e);
      ptr.lpT = setTimeout(() => {
        ptr.lpT = 0;
        if (!ptr.down || S.sel !== null) return;
        const h = pick(S.prog);
        if (h && h.k === "case") {
          ptr.lp = true;
          if (S.tapCase !== h.i) snd.play("paper");
          S.tapCase = h.i;
          S.hoverExt = h.i;
        }
      }, 380);
    }
  };
  const onCancel = () => {
      clearTimeout(ptr.lpT);
      ptr.lpT = 0;
      ptr.down = null;
      ptr.lp = false;
    },
    noMenu = (e) => e.preventDefault();
  const onUp = (e) => {
    clearTimeout(ptr.lpT);
    ptr.lpT = 0;
    if (ptr.lp) {
      ptr.lp = false;
      ptr.down = null;
      return;
    }
    if (!ptr.down) return;
    const d = Math.hypot(e.clientX - ptr.down[0], e.clientY - ptr.down[1]);
    ptr.down = null;
    if (d > 10) return;
    const touch = e.pointerType !== "mouse",
      h = touch ? pick(S.prog) : S.hover;
    // touch has no hover: first tap on a case file previews it, a second tap takes it
    if (touch && S.sel === null) {
      if (h && h.k === "case" && S.tapCase !== h.i) {
        S.tapCase = h.i;
        S.hoverExt = h.i;
        snd.play("paper");
        return;
      }
      if (!h || h.k !== "case") {
        S.tapCase = -1;
        S.hoverExt = -1;
      }
    }
    if (h && h.k === "door") openDoor();
    else if (h && h.k === "case") {
      if (S.sel === null) select(h.i);
      else if (h.i === S.sel) {
        S.target = Math.max(S.target, 0.552);
        snd.play("paper");
      }
    } else if (h && h.k === "doc" && ((S.prog > 0.49 && S.prog < 0.585) || (S.prog > 0.625 && S.prog < 0.815))) {
      S.inspect = S.inspect === h.i ? -1 : h.i;
      S.seen.add(h.i);
      S.lastInt = S.t;
      snd.play("paper");
    } else if (S.inspect >= 0) S.inspect = -1;
  };
  W.addEventListener("wheel", onWheel, { passive: false });
  W.addEventListener("keydown", onKey);
  cvs.addEventListener("pointermove", onMove);
  cvs.addEventListener("pointerleave", onLeave);
  cvs.addEventListener("pointerdown", onDown);
  cvs.addEventListener("pointerup", onUp);
  cvs.addEventListener("pointercancel", onCancel);
  cvs.addEventListener("contextmenu", noMenu);
  W.addEventListener("touchstart", onTS, { passive: true });
  W.addEventListener("touchmove", onTM, { passive: false });
  W.addEventListener("touchend", onTE, { passive: true });
  cvs.style.touchAction = "none";
  const ray = new THREE.Raycaster();
  function pick(p) {
    if (!ptr.in) return null;
    ray.setFromCamera(ptr.ndc, cam);
    let list = null;
    if (!S.door && p < 0.01) list = [doorPivot];
    else if (S.door && S.sel === null && p > 0.32) list = files.map((f) => f.proxy);
    else if (S.sel !== null && p > 0.43 && p <= 0.495) list = [files[S.sel].root];
    else if (S.sel !== null && p > 0.495 && p < 0.585) list = docs.map((d) => d.hit);
    else if (p > 0.625 && p < 0.815) list = docs.map((d) => d.hit).concat(p > 0.775 ? [finalDoc.m] : []);
    if (!list) return null;
    const hit = ray.intersectObjects(list, true)[0];
    if (!hit) return null;
    if (list[0] === doorPivot) return { k: "door" };
    return hit.object.userData.pick || null;
  }

  /* ---------------- blueprint overlay ---------------- */
  const bpLayer = overlay && overlay.querySelector("[data-bp-layer]");
  const helpers = [];
  const labels = [];
  function setBlueprint(on) {
    S.bp = on;
    if (on && !helpers.length)
      ASSETS.forEach((a) => {
        const h = new THREE.BoxHelper(a.obj, 0xc9a45c);
        h.material.transparent = true;
        h.material.opacity = 0.55;
        h.material.fog = false;
        h.userData.a = a;
        scene.add(h);
        helpers.push(h);
      });
    helpers.forEach((h) => (h.visible = on));
    if (!on) labels.forEach((l) => (l.style.display = "none"));
  }
  const zoneOf = (a) => a.zone || scene;
  const box3 = new THREE.Box3(),
    cen = V(0, 0, 0),
    camDir = V(0, 0, 0);
  function updateBlueprint(frame) {
    if (!S.bp || !bpLayer || frame % 3) return;
    cam.getWorldDirection(camDir);
    const r = rect();
    const best = new Map();
    helpers.forEach((h) => {
      const a = h.userData.a;
      let vis = zoneOf(a).visible && a.obj.visible !== false;
      let o = a.obj;
      while (vis && o) {
        if (o.visible === false) vis = false;
        o = o.parent;
      }
      h.visible = vis;
      if (!vis) return;
      h.update();
      box3.setFromObject(a.obj);
      if (box3.isEmpty()) return;
      box3.getCenter(cen);
      const dist = cen.distanceTo(cam.position);
      if (dist > 11) return;
      const v = cen.clone().sub(cam.position);
      if (v.dot(camDir) < 0.2) return;
      const s = cen.clone().project(cam);
      if (Math.abs(s.x) > 0.95 || Math.abs(s.y) > 0.92) return;
      const prev = best.get(a.id);
      if (!prev || prev.dist > dist) best.set(a.id, { a, dist, x: ((s.x + 1) / 2) * r.width, y: ((1 - s.y) / 2) * r.height });
    });
    const arr = [...best.values()].sort((a, b) => a.dist - b.dist).slice(0, 16);
    while (labels.length < arr.length) {
      const el = document.createElement("div");
      el.style.cssText =
        'position:absolute;left:0;top:0;pointer-events:none;display:flex;align-items:center;gap:6px;font:500 10.5px "IBM Plex Mono",monospace;color:#f0e2c0;white-space:nowrap;';
      el.innerHTML =
        '<span style="width:6px;height:6px;border:1px solid #c9a45c;transform:rotate(45deg);background:rgba(201,164,92,.35)"></span><span style="background:rgba(10,7,5,.84);border:1px solid rgba(201,164,92,.55);padding:3px 7px"></span>';
      bpLayer.appendChild(el);
      labels.push(el);
    }
    labels.forEach((el, i) => {
      const it = arr[i];
      if (!it) {
        el.style.display = "none";
        return;
      }
      el.style.display = "flex";
      el.style.transform = `translate(${it.x - 3}px,${it.y - 8}px)`;
      el.lastChild.innerHTML = `${it.a.file}<span style="opacity:.55"> · ${it.a.type}</span>`;
    });
  }

  /* ---------------- resize ---------------- */
  function resize() {
    const r = container.getBoundingClientRect(),
      w = Math.max(1, r.width),
      h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    const asp = w / h;
    cam.fov = asp < 1.2 ? Math.min(78, Math.max(62, (2 * Math.atan(Math.tan((26 * Math.PI) / 180) / asp) * 180) / Math.PI)) : 50;
    S.dolly = asp < 0.8 ? 0.45 : asp < 1.2 ? 0.2 : 0;
    cam.updateProjectionMatrix();
    if (composer) {
      composer.setSize(w, h);
      if (bloom) bloom.resolution.set(w / (MOB ? 3 : 2), h / (MOB ? 3 : 2));
    }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const perfEl =
    /[?&]perf/.test(location.search) && overlay
      ? (() => {
          const d = document.createElement("div");
          d.style.cssText =
            'position:absolute;left:12px;bottom:12px;z-index:50;padding:6px 10px;background:rgba(7,5,4,.85);color:#c9a45c;font:500 11px "IBM Plex Mono",monospace;pointer-events:none;white-space:nowrap';
          overlay.appendChild(d);
          return d;
        })()
      : null;
  renderer.info.autoReset = false;
  const FK = [
    [0, 0],
    [0.9, 0],
    [0.93, 0.55],
    [1.0, 0.05],
    [1.12, 0.4],
    [1.16, 0],
    [1.32, 0.75],
    [1.44, 0.15],
    [1.52, 0.5],
    [1.56, 0.1],
    [1.75, 0.62],
    [1.8, 0.3],
    [1.98, 0.7],
  ];
  const lightAt = (t) => {
    if (t >= 1.98) return lerp(0.7, 1, eio(clamp((t - 1.98) / 1.6)));
    let v = 0;
    for (const [a, b] of FK) if (t >= a) v = b;
    return v;
  };
  W.__acTest = {
    bloom: (on) => {
      S.noBloom = !on;
    },
    shadows: (on) => {
      renderer.shadowMap.enabled = on;
      scene.traverse((o) => {
        if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true));
      });
    },
    pixelRatio: (v) => {
      renderer.setPixelRatio(v);
      if (composer) composer.setPixelRatio(v);
      resize();
    },
  };
  /* ---------------- frame ---------------- */
  let last = performance.now(),
    frame = 0,
    raf = 0,
    beatEls = [];
  const q = new THREE.Quaternion(),
    p0 = V(0, 0, 0),
    p1 = V(0, 0, 0),
    p2 = V(0, 0, 0),
    e0 = new THREE.Euler();
  function tick(now) {
    raf = requestAnimationFrame(tick);
    try {
      tickBody(now);
    } catch (err) {
      if (!W.__acErr) {
        W.__acErr = String((err && err.stack) || err);
        console.error("[AC] frame error", err);
      }
    }
  }
  function tickBody(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    S.t += dt;
    frame++;
    if (S.fling) {
      push(S.fling * dt * 60);
      S.fling *= Math.exp(-dt * 3.5);
      if (Math.abs(S.fling) < 0.00005) S.fling = 0;
    }
    // gates + auto-advance
    S.intro = !S.go ? 0 : RM ? 1 : Math.min(1, S.intro + dt / 4.2);
    if (S.door && S.doorT < 1) S.doorT = Math.min(1, S.doorT + dt / 2.4);
    let walkP = S.walkP || 0;
    if (S.door && S.walkT < 1 && S.doorT >= 0.12) {
      camAt(walkP);
      const a0 = tmpP.clone();
      camAt(walkP + 0.002);
      const mpu = Math.max(1, a0.distanceTo(tmpP) / 0.002);
      const rem = (0.072 - walkP) * mpu;
      const vT = Math.max(0.15, Math.min(1.7, Math.sqrt(2 * 1.4 * Math.max(0, rem))));
      S.wv = Math.min(vT, (S.wv || 0) + 2.6 * dt);
      walkP = Math.min(0.072, walkP + (S.wv / mpu) * dt);
      if (0.072 - walkP < 1e-4) {
        walkP = 0.072;
        S.walkT = 1;
      }
      S.walkP = walkP;
    }
    if (S.walkT >= 1) walkP = 0.072;
    if (S.sel !== null && S.selT < 1) S.selT = Math.min(1, S.selT + dt / 1.5);
    let maxP = !S.door ? 0 : S.walkT < 1 ? walkP : S.sel === null ? 0.36 : !S.gavelDone ? 0.962 : 1;
    S.target = clamp(Math.max(S.target, S.door ? walkP : 0), 0, maxP);
    if (S.movie && !S.auto && S.intro >= 0.6) {
      if (!S.door) {
        if (!S._movDoor) S._movDoor = S.t + 2.6;
        else if (S.t > S._movDoor) openDoor();
      } else if (S.walkT >= 1) {
        let r = 0;
        const STOPS = [0.64, 0.685, 0.725, 0.765, 0.8];
        if (S.sel === null) r = S.target < 0.36 ? 0.03 : 0;
        else if (S.inspect >= 0) r = 0;
        else if (!S._deskDone && S.target > 0.56) {
          S.deskHold = false;
          S._deskDone = true;
        } else if (!S._deskDone && S.target < 0.552) r = 0.014;
        else if (!S._deskDone) {
          if (!S.deskHold) {
            S.deskHold = true;
            S.deskIdle = 0;
          }
          S.deskIdle += dt;
          if (S.hover) S.deskIdle = 0;
          if (S.deskIdle > 14 || (DOCS.every((_, i) => S.seen.has(i)) && S.t - S.lastInt > 1.2)) {
            S.deskHold = false;
            S._deskDone = true;
          }
        } else if (S.target < 0.835) {
          if (S.dwell) {
            if (!S.hover) S.dwellT += dt;
            const vis = Math.abs(S.target - S.prog) < 0.003 ? onScreen() : [];
            const all = vis.length > 0 && vis.every((i) => S.seen.has(i));
            if (S.dwellT >= 5 || (all && S.dwellT > 1.2 && S.t - S.lastInt > 0.9)) S.dwell = false;
          } else {
            r = 0.009;
            while (S.stopI < STOPS.length && S.target > STOPS[S.stopI] + 0.002) S.stopI++;
            if (S.stopI < STOPS.length && S.target >= STOPS[S.stopI]) {
              S.target = STOPS[S.stopI];
              S.dwell = true;
              S.dwellT = 0;
              S.stopI++;
              r = 0;
            }
          }
        }
        S.target = Math.min(maxP, S.target + r * dt);
      }
    }
    if (S.prog < 0.54) {
      S._deskDone = false;
      S.deskHold = false;
    }
    if (S.prog < 0.6) {
      S.stopI = 0;
      S.dwellT = 0;
      S.dwell = false;
    }
    if (S.prog < 0.828) S.autoHold = false;
    if (S.prog >= 0.985) S.autoHold = true;
    if (!S.auto && !S.autoHold && S._pp !== undefined && S._pp < 0.835 && S.prog >= 0.835) S.auto = true;
    S._pp = S.prog;
    if (S.auto) {
      const r = S.prog < 0.9 ? 0.0105 : S.prog < 0.945 ? 0.012 : 0.009;
      S.target = Math.min(maxP, S.target + r * dt);
      if (S.prog >= 0.999) {
        S.auto = false;
        S.autoHold = true;
      }
    }
    if (S.door && S.walkT < 1) S.prog = S.target = walkP;
    else {
      let dp = (S.target - S.prog) * (1 - Math.exp(-dt * 2.3));
      if (S.prog > 0.08 && S.prog < 0.37) {
        camAt(S.prog);
        const a0 = tmpP.clone();
        camAt(Math.min(1, S.prog + 0.002));
        const mpu = Math.max(1, a0.distanceTo(tmpP) / 0.002);
        const vt = clamp(dp / Math.max(dt, 1e-3), -1.35 / mpu, 1.35 / mpu);
        S.pv = lerp(S.pv || 0, vt, 1 - Math.exp(-dt * 3));
        dp = Math.abs(S.pv * dt) > Math.abs(S.target - S.prog) ? S.target - S.prog : S.pv * dt;
      } else S.pv = 0;
      S.prog += dp;
      if (Math.abs(S.target - S.prog) < 1e-5) S.prog = S.target;
    }
    const p = S.prog;
    if (p > 0.955 && S.gavelT < 0) S.gavelT = 0;
    // zones
    ext.visible = p < 0.2;
    off.visible = p < 0.93;
    board.visible = p > 0.5 && p < 0.86;
    hall.visible = p > 0.79;
    court.visible = p > 0.9;
    mainThread.visible = p > 0.8 && p < 0.97;
    docs.forEach((d) => (d.g.visible = off.visible && S.sel !== null));
    finalDoc.g.visible = p > 0.76 && p < 0.86;
    // ---- door ----
    const dt0 = S.doorT;
    S.handleHover = lerp(S.handleHover, (S.hover && S.hover.k === "door") || S.handleHoverExt ? 1 : 0, 1 - Math.exp(-dt * 10));
    const hRot = S.door ? 0.55 * bump(dt0, 0, 0.08, 0.3) + 0.18 * (1 - R(dt0, 0, 0.08)) * S.handleHover : 0.18 * S.handleHover;
    handle.rotation.z = hRot;
    bolt.position.x = 0.87 - 0.03 * R(dt0, 0.05, 0.12);
    const open = eio(R(dt0, 0.12, 1));
    doorPivot.rotation.y = 1.7 * open + 0.012 * S.handleHover * (S.door ? 0 : 1);
    const camZ = cam.position.z,
      nearDoor = clamp((camZ - 0.8) / 2.2);
    spillFloor.material.opacity = 0.35 * open * ext.visible * clamp((camZ - 0.4) / 2);
    spillBeam.material.opacity = 0;
    spillBeam.visible = false;
    dust1.material.opacity = 0.5 * R(p, 0.16, 0.26);
    // ---- lights per zone ----
    const inOffice = open * (1 - R(p, 0.86, 0.93));
    const extOn = 1 - R(p, 0.07, 0.15);
    const flick = 1 + Math.sin(S.t * 13) * 0.03 + Math.sin(S.t * 7.3) * 0.03;
    L.lanL.intensity = L.lanR.intensity = 5 * extOn * flick * lerp(0.12, 1, nearDoor);
    L.spill.intensity = 10 * inOffice * (1 - R(p, 0.03, 0.1));
    L.office.intensity = 14 * inOffice;
    L.lampR.intensity = 0;
    L.lampL.intensity = (1 - 0.5 * bump(p, 0.42, 0.5, 0.58)) * 1.8 * inOffice;
    const toBoard = R(p, 0.56, 0.62);
    L.key.intensity = lerp(22, 45, toBoard) * (1 - 0.62 * R(p, 0.42, 0.48) * (1 - toBoard)) * inOffice * (1 - R(p, 0.82, 0.86));
    L.key.position.set(lerp(0.7, 0, toBoard), lerp(3.9, 3.95, toBoard), lerp(-10.4, -12.4, toBoard));
    L.key.target.position.set(0, lerp(0.78, 1.9, toBoard), lerp(-12.1, BZ, toBoard));
    L.key.angle = lerp(0.5 - 0.1 * R(p, 0.42, 0.48), 0.95, toBoard);
    {
      const ik = eio(S.inspectT || 0);
      L.insp.intensity = 1.4 * ik * inOffice;
      if (ik > 0.001) {
        cam.getWorldDirection(camDir);
        L.insp.position.copy(cam.position).addScaledVector(camDir, -0.15);
        L.insp.position.y += 0.35;
        L.insp.position.x += 0.3;
      }
    }
    const hallOn = R(p, 0.8, 0.86) * (1 - R(p, 0.96, 0.99));
    L.hallA.intensity = 24 * hallOn;
    L.hallB.intensity = 45 * hallOn * (1 - 0.6 * eio(R(p, 0.912, 0.94)));
    const dOpen = eio(R(p, 0.912, 0.94));
    const courtOn = R(p, 0.905, 0.945);
    L.door.intensity = 40 * dOpen * (1 - R(p, 0.95, 0.975) * 0.7);
    L.court.intensity = 150 * courtOn;
    L.rim.intensity = 120 * courtOn;
    L.fill.intensity = 40 * courtOn;
    L.win.intensity = 60 * courtOn;
    L.hemi.intensity = 0.1 + 0.12 * courtOn;
    beamMats.forEach((m) => {
      m.opacity =
        m.userData.base *
        courtOn *
        (1 - 0.35 * R(p, 0.985, 1)) *
        (m.userData.near
          ? cam.aspect < 1
            ? 0.3 * ss(clamp((cam.position.distanceTo(m.userData.near) - 5) / 6))
            : 0.25 + 0.75 * ss(clamp((cam.position.distanceTo(m.userData.near) - 3) / 4))
          : 1);
      if (m.uniforms) m.uniforms.uOpacity.value = m.opacity;
    });
    dust3.material.opacity = 0.8 * courtOn;
    const exposure = 1.0 - 0.08 * R(p, 0.84, 0.9) - 0.12 * R(p, 0.985, 1);
    const gt = S.go ? S.t - S.goT : 0,
      Lt = !S.go ? 0 : RM ? clamp(gt / 1.5) : lightAt(gt),
      txt = !S.go ? 0 : RM ? clamp((gt - 0.5) / 1.5) : Math.min(1, Lt / 0.72) * (0.22 + 0.78 * eio(clamp((gt - 0.9) / 2.8)));
    if (overlay && S._txt !== txt) {
      overlay.style.setProperty("--ac-text", txt.toFixed(3));
      S._txt = txt;
    }
    renderer.toneMappingExposure = exposure * lerp(0.04, 1, Lt);
    scene.fog.density = lerp(lerp(lerp(0.035, 0.03, R(p, 0.05, 0.12)), 0.022, R(p, 0.84, 0.88)), 0.016, courtOn);
    // clock
    const d = new Date(),
      sec = d.getSeconds(),
      ms = d.getMilliseconds(),
      tb = Math.min(1, ms / 150) - 1,
      tick1 = 1 + 2.7 * tb * tb * tb + 1.7 * tb * tb;
    hS.rotation.z = -((sec - 1 + tick1) / 60) * Math.PI * 2;
    hH.rotation.z = (-((d.getHours() % 12) + d.getMinutes() / 60) / 12) * Math.PI * 2;
    hM.rotation.z = -((d.getMinutes() + sec / 60) / 60) * Math.PI * 2;
    pend.rotation.z = Math.cos((sec + ms / 1000) * Math.PI) * 0.12;
    if (sec !== S._sec) {
      S._sec = sec;
      if (off.visible && p > 0.02 && p < 0.5) snd.play("tick");
    }
    // ---- case files ----
    const hv = S.hover;
    files.forEach((f, i) => {
      f.hover = lerp(f.hover, ((hv && hv.k === "case" && hv.i === i) || S.hoverExt === i) && S.sel === null ? 1 : 0, 1 - Math.exp(-dt * 9));
      const [sx, sz, sr] = f.slot;
      let x = sx,
        z = sz,
        yaw = sr,
        y = TOP,
        dim = 0;
      if (S.sel !== null) {
        const tS = eio(S.selT);
        if (i === S.sel) {
          x = lerp(sx, 0, tS);
          z = lerp(sz, DZ + 0.17, tS);
          yaw = lerp(sr, 0, tS);
          y = TOP + Math.sin(Math.PI * tS) * 0.06;
        } else {
          const k = i < S.sel ? i : i - 1;
          const other = [0.78, DZ - 0.08, k ? -0.07 : 0.05];
          const tk = eio(clamp(S.selT * 1.25 - k * 0.25));
          x = lerp(sx, other[0], tk);
          z = lerp(sz, other[1], tk);
          yaw = lerp(sr, other[2], tk);
          y = TOP + k * 0.041 * tk + Math.sin(Math.PI * tk) * (0.05 + k * 0.05);
          dim = tk;
        }
      }
      f.root.position.set(x, y + f.hover * 0.045, z);
      f.root.rotation.set(-0.09 * f.hover, yaw, 0);
      const c = 1 - 0.55 * dim;
      f.cover.color.setScalar(c);
      f.side.color.set(CASES[i].cover.bg).multiplyScalar(c);
      f.cover.emissive.setRGB(0.06 * f.hover, 0.035 * f.hover, 0.015 * f.hover);
      if (i === S.sel) {
        const br = R(p, 0.425, 0.44);
        const cb2 = eio(br);
        f.sa.position.set(0.005 * cb2, 0.0045 * cb2, 0);
        f.sb.position.set(-0.005 * cb2, 0.0045 * cb2, 0);
        f.sa.rotation.z = -0.14 * cb2;
        f.sb.rotation.z = 0.14 * cb2;
        f.str.visible = br < 0.5;
        f.str.scale.setScalar(1);
        f.pivot.rotation.z = 2.95 * eio(R(p, 0.44, 0.475));
        if (br > 0.05 && !f._cr) {
          f._cr = 1;
          snd.play("seal");
        }
      }
    });
    // ---- docs ----
    const boardY = lerp(-3.4, 0, eio(R(p, 0.555, 0.6))) - 3.4 * eio(R(p, 0.82, 0.852));
    board.position.y = boardY;
    if (S.sel !== null) {
      const fr = files[S.sel].root.position;
      S.inspectT = lerp(S.inspectT, S.inspect >= 0 ? 1 : 0, 1 - Math.exp(-dt * 7));
      cam.getWorldDirection(camDir);
      docs.forEach((dc, i) => {
        dc.hover = lerp(dc.hover, hv && hv.k === "doc" && hv.i === i ? 1 : 0, 1 - Math.exp(-dt * 10));
        const e = eout(R(p, 0.48 + i * 0.005, 0.515 + i * 0.005));
        dc.m.visible = e > 0.001;
        // scroll drives each flight as before; a paper already in the air finishes its move when scrolling stops (back to the desk if rewinding)
        const raw = R(p, 0.585 + i * 0.005, 0.615 + i * 0.005);
        if (dc.fT === undefined) dc.fT = raw;
        const idle = S.t - (S.lastPushT || 0) > 0.15,
          back = S.lastDir < 0;
        let ft;
        if (idle && dc.fT > 0 && dc.fT < 1) ft = back ? 0 : 1;
        else if (!back) ft = Math.max(raw, dc.fT);
        else ft = Math.min(raw, dc.fT);
        dc.fT = RM ? ft : dc.fT + clamp(ft - dc.fT, -dt / 0.45, dt / 0.45);
        const fl = eio(dc.fT);
        const dp = DESK_POSE[i],
          bp = BOARD_POSE[i];
        p0.set(lerp(fr.x, dp[0], e), TOP + 0.03 + i * 0.0016 + Math.sin(Math.PI * e) * 0.09, lerp(fr.z, dp[1], e));
        q.setFromEuler(e0.set(-Math.PI / 2, 0, 0, "YXZ")).slerp(dc.deskQ, e);
        let s = 1;
        if (fl > 0) {
          p1.set(bp[0], bp[1] + boardY, BZ + 0.086 + i * 0.0015);
          p0.lerp(p1, fl);
          p0.z += Math.sin(Math.PI * fl) * 0.9;
          p0.y += Math.sin(Math.PI * fl) * 0.35;
          q.slerp(dc.boardQ, fl);
          s = lerp(1, bp[2], fl);
          if (fl > 0.97 && !dc._pin) {
            dc._pin = 1;
            snd.play("pin");
          }
        }
        p2.copy(p0);
        let hs = s;
        if (fl < 0.5) {
          p0.y += dc.hover * 0.035;
          s *= 1 + dc.hover * 0.06;
        } else {
          p0.z += dc.hover * 0.06;
          s *= 1 + dc.hover * 0.05;
        }
        if (i === S.inspect || (S.inspectT > 0.01 && dc._insp)) {
          dc._insp = S.inspectT > 0.02 && i === (S.inspect >= 0 ? S.inspect : dc._lastI);
        }
        if (S.inspect === i) dc._lastI = i;
        if (dc._insp) {
          const k = eio(S.inspectT);
          p1.copy(cam.position).addScaledVector(camDir, 0.52);
          p0.lerp(p1, k);
          p2.lerp(p1, k);
          q.slerp(cam.quaternion, k);
          s = lerp(s, 1.25, k);
          hs = lerp(hs, 1.25, k);
        }
        dc.g.position.copy(p0);
        dc.g.quaternion.copy(q);
        dc.g.scale.setScalar(s);
        dc.hit.position.copy(p2);
        dc.hit.quaternion.copy(q);
        dc.hit.scale.setScalar(hs);
        const pn = pins[i];
        pn.scale.setScalar(Math.max(0.001, R(fl, 0.9, 1)));
      });
      if (!docs._paper && p > 0.49) {
        docs._paper = 1;
        snd.play("paper");
      }
      // final evidence
      const fe = R(p, 0.765, 0.78);
      finalDoc.hover = lerp(finalDoc.hover, hv && hv.k === "doc" && hv.i === 8 ? 1 : 0, 1 - Math.exp(-dt * 10));
      finalDoc.g.position.set(
        FINAL_POSE[0],
        FINAL_POSE[1] + boardY + (1 - eout(fe)) * 0.5,
        BZ + 0.09 + (1 - fe) * 0.5 + finalDoc.hover * 0.06,
      );
      finalDoc.g.rotation.set(0, 0, FINAL_POSE[3] + (1 - fe) * 0.3);
      finalDoc.g.scale.setScalar(FINAL_POSE[2] * (1 + finalDoc.hover * 0.05));
      finalDoc.m.material.opacity = fe;
      if (S.inspect === 8) finalDoc._insp = true;
      else if (S.inspectT < 0.02) finalDoc._insp = false;
      if (finalDoc._insp) {
        const k = eio(S.inspectT);
        p1.copy(cam.position).addScaledVector(camDir, 0.52);
        finalDoc.g.position.lerp(p1, k);
        finalDoc.g.quaternion.slerp(cam.quaternion, k);
        finalDoc.g.scale.setScalar(lerp(FINAL_POSE[2], 1.25, k));
      }
      pins[FIN].scale.setScalar(Math.max(0.001, R(p, 0.776, 0.782)));
    }
    pins[CARD].scale.setScalar(Math.max(0.001, R(p, 0.6, 0.62)));
    threads.forEach((t) => {
      t.k = t.k || 0;
      const tg = p >= t.s ? 1 : 0;
      if (t.k !== tg) t.k = clamp(t.k + (Math.sign(tg - t.k) * dt) / 1.1);
      t.geo.setDrawRange(0, Math.floor((eio(t.k) * t.total) / 30) * 30);
    });
    M.thread.emissiveIntensity = 0.8 + 2.2 * bump(p, 0.795, 0.81, 0.83);
    const mk = R(p, 0.815, 0.895),
      mt = 0.1 * R(p, 0.83, 0.862);
    const a0 = Math.floor(mt * 400) * 36;
    mainGeo.setDrawRange(a0, Math.max(0, Math.floor(mk * 400) * 36 - a0));
    pdL.position.x = -0.53 - 1.12 * eio(R(p, 0.826, 0.852));
    pdR.position.x = 0.53 + 1.12 * eio(R(p, 0.826, 0.852));
    // ---- courtroom doors ----
    const hd = R(p, 0.905, 0.914) * (1 - R(p, 0.93, 0.94));
    dL.hd.rotation.z = 0.6 * hd;
    dR.hd.rotation.z = -0.6 * hd;
    dL.pv.rotation.y = 1.45 * dOpen;
    dR.pv.rotation.y = -1.45 * dOpen;
    if (dOpen > 0.02 && !S._bd) {
      S._bd = 1;
      snd.play("bigdoor");
    }
    if (dOpen < 0.01) S._bd = 0;
    const dNear = clamp((tmpP.z + 38.7 - 1.5) / 3.5);
    doorBeam.material.opacity = 0.08 * dOpen * dNear * clamp((tmpP.z + 35.8 - 1.5) / 3) * (S.dolly ? 0.35 : 1);
    doorGlow.material.opacity = 0.22 * dOpen * dNear;
    // ---- stenographer ----
    if (!court.visible || p < 0.9) {
      S.twX = 0.09;
      S.twLine = 0;
      S.twRet = 0;
    } else {
      if (S.twX === undefined) S.twX = 0.09;
      const typing = p > 0.93 && (S.gavelT < 0 || S.gavelT < 0.75);
      if (typing && !S.twRet && S.t >= (S.typeNext || 0)) {
        if (S.twKey >= 0) TW.keys.setMatrixAt(S.twKey, TW.keyBase[S.twKey]);
        S.twKey = (Math.random() * TW.keyBase.length) | 0;
        S.twKeyT = S.t;
        S.twDown = null;
        S.twX -= 0.0045;
        snd.play(Math.random() < 0.15 ? "tspace" : "tkey");
        S.typeNext = S.t + 0.07 + Math.random() * 0.12 + (Math.random() < 0.1 ? 0.22 : 0);
        if (S.twX < -0.09) {
          S.twRet = S.t;
          S.twFrom = S.twX;
          snd.play("treturn");
        }
      }
      if (S.twKey >= 0) {
        const down = S.t - S.twKeyT < 0.06;
        if (down !== S.twDown) {
          S.twDown = down;
          const m = TW.keyBase[S.twKey].clone();
          if (down) m.premultiply(new THREE.Matrix4().makeTranslation(0, -0.0035, 0.0015));
          TW.keys.setMatrixAt(S.twKey, m);
          TW.keys.instanceMatrix.needsUpdate = true;
        }
      }
      if (S.twRet) {
        const r = clamp((S.t - S.twRet) / 0.4);
        TW.carriage.position.x = lerp(S.twFrom, 0.09, eio(r));
        if (r >= 1) {
          S.twRet = 0;
          S.twX = 0.09;
          S.twLine = (S.twLine || 0) + 1;
        }
      } else TW.carriage.position.x = lerp(TW.carriage.position.x, S.twX, 1 - Math.exp(-dt * 40));
      TW.paper.position.y = 0.045 + Math.min(0.08, (S.twLine || 0) * 0.006);
    }
    // ---- judge & gavel ----
    let th = 0.3;
    if (S.gavelT >= 0) {
      S.gavelT += dt;
      const g = S.gavelT;
      if (g < 0.8) th = lerp(0.3, -0.9, eio(g / 0.8));
      else if (g < 1.15) th = -0.9;
      else if (g < 1.27) th = lerp(-0.9, 0.34, Math.pow((g - 1.15) / 0.12, 2));
      else th = lerp(0.34, 0.3, eout(Math.min(1, (g - 1.27) / 0.4)));
      if (g >= 1.27 && !S._hit) {
        S._hit = 1;
        snd.play("gavel");
      }
      if (g > 1.8 && !S.gavelDone) {
        S.gavelDone = true;
        S.target = Math.max(S.target, 0.978);
      }
    }
    arm.rotation.x = th;
    judge.scale.y = 1.3 * (1 + Math.sin(S.t * 1.2) * 0.004);
    const impact = S._hit ? Math.max(0, 1 - (S.gavelT - 1.27) / 0.25) : 0;
    L.court.intensity *= 1 + impact * 0.35;
    const still = RM ? 0 : S.gavelDone ? 0.15 : 1;
    [dust1, dust2, dust3].forEach((pt) => {
      if (!pt.parent || !pt.parent.visible) return;
      const a = pt.geometry.attributes.position.array,
        b = pt.userData.base;
      for (let i = 0; i < a.length; i += 3) {
        a[i + 1] = b[i + 1] + Math.sin(S.t * 0.25 * still + i) * 0.08;
        a[i] = b[i] + Math.sin(S.t * 0.18 * still + i * 0.5) * 0.06;
      }
      pt.geometry.attributes.position.needsUpdate = true;
    });
    // ---- camera ----
    camAt(p);
    ptr.sx = lerp(ptr.sx, ptr.in ? ptr.mx : 0, 1 - Math.exp(-dt * 2));
    ptr.sy = lerp(ptr.sy, ptr.in ? ptr.my : 0, 1 - Math.exp(-dt * 2));
    cam.position.copy(tmpP);
    // portrait screens: step back along the view line so the framing keeps its width (capped so the camera stays inside the rooms)
    // …except over the case files, where it stays close so the folders read
    if (S.dolly) {
      const selZ = S.dolly > 0.3 ? R(p, 0.31, 0.355) * (1 - R(p, 0.37, 0.41)) : 0,
        dk = lerp(S.dolly, -0.3, selZ) * (1 - 0.8 * R(p, 0.37, 0.41) * (1 - R(p, 0.455, 0.5)));
      _dv.copy(tmpL).sub(tmpP);
      const dd = _dv.length();
      if (dd > 1e-3) cam.position.addScaledVector(_dv.multiplyScalar(1 / dd), -Math.min(dd * dk, 2.2));
    }
    {
      const mv = S._lp ? tmpP.distanceTo(S._lp) : 0;
      S._lp = (S._lp || V(0, 0, 0)).copy(tmpP);
      const spd = mv / Math.max(dt, 1e-3);
      S.bobA = lerp(S.bobA, clamp(spd / 0.9) * (1 - R(p, 0.33, 0.37)), 1 - Math.exp(-dt * 4));
      S.stepPh += (mv / 0.85) * Math.PI;
      if (S.intro < 1) {
        const k = 1 - eio(S.intro);
        cam.position.z += k * 0.9;
        cam.position.y += k * 0.12;
      }
    }
    cam.lookAt(tmpL);
    const par = RM ? 0 : S.inspect >= 0 ? 0.2 : 1;
    cam.rotateY(-ptr.sx * 0.03 * par);
    cam.rotateX(ptr.sy * 0.018 * par);
    // ---- hover + UI ----
    const h = pick(p);
    S.hover = h;
    if (S.inspect >= 0) S.lastInt = S.t;
    if (h && h.k === "doc") {
      S.lastInt = S.t;
      S.hovT[h.i] = (S.hovT[h.i] || 0) + dt;
      if (S.hovT[h.i] > 0.4) S.seen.add(h.i);
    }
    cvs.style.cursor = h ? "pointer" : "default";
    let hc = null;
    const hci = h && h.k === "case" ? h.i : S.hoverExt;
    if (hci >= 0 && S.sel === null) {
      const f = files[hci].root.position;
      const v = V(f.x, f.y + 0.05, f.z).project(cam);
      const r = rect();
      hc = { i: hci, x: Math.round(((v.x + 1) / 2) * r.width), y: Math.round(((1 - v.y) / 2) * r.height) };
    }
    let hd2 = null;
    if (h && h.k === "doc" && S.inspect < 0) {
      const cs = CASES[S.sel ?? 0];
      const label = h.i === 8 ? cs.final.label : cs.docs[DOCS[h.i].k][0];
      hd2 = { label, x: Math.round(Math.min(ptr.x, (W.innerWidth || 1200) - 240)), y: Math.round(ptr.y) };
    }
    const act = Math.max(
      0,
      ACTS.findIndex((a) => p >= a.a && p < a.b),
    );
    emit({
      ready: true,
      act,
      maxAct: (S.maxAct = Math.max(S.maxAct || 0, act)),
      atDoor: !S.door,
      atCaseGate: S.door && S.sel === null && p > 0.3,
      selected: S.sel,
      hoverCase: hc,
      hoverDoc: hd2,
      inspecting: S.inspect >= 0,
      final: p > 0.985,
      movie: S.movie,
      deskHold: S.movie && S.deskHold,
    });
    if (overlay) {
      if (frame % 30 === 1) beatEls = [...overlay.querySelectorAll("[data-beat]")];
      beatEls.forEach((el) => {
        const set = (k, v) => {
          if (el.style[k] !== v) el.style[k] = v;
        };
        const md = el.getAttribute("data-mode");
        if (md && md !== (S.movie ? "movie" : "scroll")) {
          set("opacity", "0");
          set("visibility", "hidden");
          set("pointerEvents", "none");
          return;
        }
        const r = (el.getAttribute("data-range") || "").split(",").map(Number);
        if (r.length < 4) return;
        const o =
          ss(inv(r[0], r[1], p)) *
          (r[3] >= 1 ? 1 : 1 - ss(inv(r[2], r[3], p))) *
          (1 - S.inspectT * (el.hasAttribute("data-inspect-hide") ? 1 : 0));
        set("opacity", String(+o.toFixed(3)));
        set("transform", `translateY(${((1 - o) * (RM ? 0 : 14)).toFixed(1)}px)`);
        set("visibility", o < 0.002 ? "hidden" : "visible");
        set("pointerEvents", o > 0.6 ? "auto" : "none");
      });
      const pf = overlay.querySelector("[data-progress-fill]");
      if (pf) pf.style.transform = `scaleY(${p.toFixed(4)})`;
    }
    updateBlueprint(frame);
    renderer.shadowMap.needsUpdate = S.shadowT === undefined || S.t - S.shadowT > 0.033 || S.intro < 1;
    if (renderer.shadowMap.needsUpdate) S.shadowT = S.t;
    if (composer && !S.noBloom) {
      renderer.info.reset();
      composer.render();
    } else {
      renderer.info.reset();
      renderer.render(scene, cam);
    }
    PERF.ms = dt <= 0 ? PERF.ms : PERF.ms ? lerp(PERF.ms, dt * 1000, 0.05) : dt * 1000;
    if (frame % 30 === 0 && PERF.ms) {
      PERF.fps = Math.round(1000 / PERF.ms);
      PERF.calls = renderer.info.render.calls;
      PERF.frameTris = renderer.info.render.triangles;
      if (perfEl)
        perfEl.textContent = `${PERF.fps} fps · ${PERF.ms.toFixed(1)} ms · ${PERF.calls} draws · ${(PERF.frameTris / 1000).toFixed(0)}k tris`;
    }
  }
  raf = requestAnimationFrame(tick);

  const api = {
    enterDoor: openDoor,
    reveal: () => {
      if (!S.go) {
        S.go = true;
        S.goT = S.t;
      }
    },
    skip,
    select: (i) => select(i),
    setBlueprint,
    setSound: (on) => {
      S.soundTouched = true;
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach((t) => W.removeEventListener(t, soundStart, true));
      snd.set(on);
    },
    seek: (p) => {
      if (!S.door) return;
      S.auto = false;
      S.inspect = -1;
      S.target = clamp(p, 0, 1);
    },
    setVolume: (v) => snd.setVol(v),
    setMotion,
    setMovie: (v) => {
      S.movie = !!v;
      S.deskHold = false;
    },
    movieContinue: () => {
      S.deskHold = false;
      S._deskDone = true;
      S.inspect = -1;
    },
    setHandleHover: (v) => {
      S.handleHoverExt = v;
    },
    hoverCase: (i) => {
      S.hoverExt = i;
    },
    setPlateName: (n) => {
      const old = plaqueMat.map;
      plaqueMat.map = tex(plaqueC(n));
      plaqueMat.needsUpdate = true;
      old?.dispose();
    },
    goTo: (p) => {
      if (!S.door) {
        S.door = true;
        S.doorT = 1;
      }
      S.walkT = 1;
      S.intro = 1;
      S.go = true;
      S.goT = -99;
      if (p > 0.37 && S.sel === null) select(0, true);
      S.prog = S.target = p;
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      W.removeEventListener("wheel", onWheel);
      W.removeEventListener("keydown", onKey);
      W.removeEventListener("touchstart", onTS);
      W.removeEventListener("touchmove", onTM);
      renderer.dispose();
      cvs.remove();
    },
  };
  W.__acExperience = api;
  return api;
}

// Replace placeholder geometry with production glTF when the manifest entry has a `src` URL.
async function swapModels(ASSETS, MAN) {
  const list = MAN.filter((a) => a.src);
  if (!list.length) return;
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const loader = new GLTFLoader();
  for (const a of list)
    loader.load(a.src, (gltf) => {
      ASSETS.filter((x) => x.id === a.id).forEach((x) => {
        x.obj.children.filter((c) => c.isMesh).forEach((c) => x.obj.remove(c));
        const m = gltf.scene.clone(true);
        m.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = o.receiveShadow = true;
          }
        });
        x.obj.add(m);
      });
    });
}

export { mount };
