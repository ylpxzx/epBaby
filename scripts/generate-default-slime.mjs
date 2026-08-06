import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH = 48;
const HEIGHT = 48;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "default-pets", "lime-slime.json");

const palette = [
  "#00000000", "#101512", "#AAD28E", "#91C878", "#75F04B", "#C3E8AA",
  "#568E4D", "#3F713D", "#E99BA1", "#DDF5CE", "#F2BE4F", "#E45858",
  "#82D96A", "#FFFFFF", "#79533A", "#B7E7A0"
];

const layers = [
  { id: "body", name: "史莱姆主体", visible: true, locked: false, opacity: 1 },
  { id: "highlight", name: "高光与阴影", visible: true, locked: false, opacity: 1 },
  { id: "face", name: "表情", visible: true, locked: false, opacity: 1 },
  { id: "effect", name: "动作特效", visible: true, locked: false, opacity: 1 }
];

function grid() {
  return Array.from({ length: WIDTH * HEIGHT }, () => 0);
}

function set(pixels, x, y, color) {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT) pixels[y * WIDTH + x] = color;
}

function rect(pixels, x, y, width, height, color) {
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) set(pixels, x + column, y + row, color);
  }
}

function line(pixels, x0, y0, x1, y1, color, thickness = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    const radius = Math.floor(thickness / 2);
    rect(pixels, x0 - radius, y0 - radius, thickness, thickness, color);
    if (x0 === x1 && y0 === y1) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
}

function polygon(pixels, points, color) {
  const minY = Math.floor(Math.min(...points.map((point) => point[1])));
  const maxY = Math.ceil(Math.max(...points.map((point) => point[1])));
  for (let y = minY; y <= maxY; y += 1) {
    const crossings = [];
    for (let index = 0; index < points.length; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      if ((start[1] <= y && end[1] > y) || (end[1] <= y && start[1] > y)) {
        crossings.push(start[0] + ((y - start[1]) * (end[0] - start[0])) / (end[1] - start[1]));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let index = 0; index < crossings.length; index += 2) {
      if (crossings[index + 1] === undefined) continue;
      for (let x = Math.ceil(crossings[index]); x <= Math.floor(crossings[index + 1]); x += 1) set(pixels, x, y, color);
    }
  }
}

function blobHalfWidth(localY, width, height) {
  const progress = Math.max(0, Math.min(1, localY / Math.max(1, height - 1)));
  const domeCurve = Math.sqrt(Math.max(0, 1 - (1 - progress) ** 2));
  let ratio = 0.3 + 0.7 * domeCurve;
  if (progress > 0.78) ratio *= 1 - 0.13 * ((progress - 0.78) / 0.22);
  return Math.max(1, Math.round((width * ratio) / 2));
}

function fillBlob(pixels, cx, base, width, height, color) {
  const top = base - height + 1;
  for (let y = top; y <= base; y += 1) {
    const half = blobHalfWidth(y - top, width, height);
    rect(pixels, cx - half, y, half * 2 + 1, 1, color);
  }
}

function drawFace(pixels, cx, base, height, scale = 1, expression = "smile") {
  const top = base - height + 1;
  const eyeY = Math.round(top + height * 0.45);
  const mouthY = Math.round(top + height * 0.7);
  const eyeOffset = Math.max(4, Math.round(8 * scale));
  const eyeWidth = Math.max(2, Math.round(3 * scale));
  const eyeHeight = Math.max(2, Math.round(5 * scale));

  if (expression === "sleep") {
    rect(pixels, cx - eyeOffset - 2, eyeY + 2, 5, 1, 1);
    rect(pixels, cx + eyeOffset - 2, eyeY + 2, 5, 1, 1);
    rect(pixels, cx - 1, mouthY + 1, 3, 1, 1);
    return;
  }
  if (expression === "hurt") {
    line(pixels, cx - eyeOffset - 2, eyeY, cx - eyeOffset + 2, eyeY + 4, 1);
    line(pixels, cx - eyeOffset + 2, eyeY, cx - eyeOffset - 2, eyeY + 4, 1);
    line(pixels, cx + eyeOffset - 2, eyeY, cx + eyeOffset + 2, eyeY + 4, 1);
    line(pixels, cx + eyeOffset + 2, eyeY, cx + eyeOffset - 2, eyeY + 4, 1);
    rect(pixels, cx - 2, mouthY + 1, 5, 2, 1);
    return;
  }
  if (expression === "blink") {
    rect(pixels, cx - eyeOffset - 2, eyeY + 2, 5, 1, 1);
    rect(pixels, cx + eyeOffset - 2, eyeY + 2, 5, 1, 1);
  } else {
    rect(pixels, cx - eyeOffset - Math.floor(eyeWidth / 2), eyeY, eyeWidth, eyeHeight, 1);
    rect(pixels, cx + eyeOffset - Math.floor(eyeWidth / 2), eyeY, eyeWidth, eyeHeight, 1);
  }

  if (expression === "eat") {
    rect(pixels, cx - 2, mouthY - 1, 5, 4, 1);
    rect(pixels, cx - 1, mouthY, 3, 2, 8);
  } else if (expression === "surprise") {
    rect(pixels, cx - 1, mouthY, 3, 4, 1);
  } else {
    rect(pixels, cx - 6, mouthY - 1, 2, 2, 1);
    rect(pixels, cx + 5, mouthY - 1, 2, 2, 1);
    rect(pixels, cx - 4, mouthY + 1, 9, 2, 1);
    rect(pixels, cx - 2, mouthY + 3, 5, 2, 1);
  }
}

function drawSlime(parts, options = {}) {
  const cx = options.cx ?? 24;
  const base = options.base ?? 44;
  const width = options.width ?? 42;
  const height = options.height ?? 33;
  const faceScale = options.faceScale ?? Math.max(0.58, Math.min(1, width / 42));
  const expression = options.expression ?? "smile";
  const highlightShift = options.highlightShift ?? 0;

  fillBlob(parts.body, cx, base, width, height, 7);
  fillBlob(parts.body, cx, base - 2, Math.max(5, width - 4), Math.max(5, height - 3), 2);

  const top = base - height + 1;
  for (let y = Math.max(top + 3, base - 8); y <= base - 3; y += 1) {
    const half = Math.max(1, blobHalfWidth(y - top, width, height) - 2);
    const bandHeight = Math.max(2, Math.round(height * 0.18));
    if (y >= base - bandHeight - 2) rect(parts.highlight, cx - half, y, half * 2 + 1, 1, 6);
  }
  rect(parts.highlight, cx - Math.round(width * 0.2) + highlightShift, top + 3, Math.max(3, Math.round(width * 0.22)), 3, 4);
  rect(parts.highlight, cx - Math.round(width * 0.1) + highlightShift, top + 2, Math.max(2, Math.round(width * 0.12)), 2, 5);
  set(parts.highlight, cx + Math.round(width * 0.08), top + 4, 12);
  drawFace(parts.face, cx, base, height, faceScale, expression);
}

function frameParts() {
  return { body: grid(), highlight: grid(), face: grid(), effect: grid() };
}

function makeFrame(actionId, index, durationMs, draw) {
  const parts = frameParts();
  draw(parts);
  return {
    id: `lime-slime-${actionId}-${String(index + 1).padStart(2, "0")}`,
    name: `帧 ${index + 1}`,
    durationMs,
    cels: Object.fromEntries(layers.map((layer) => [layer.id, { pixels: parts[layer.id], offsetX: 0, offsetY: 0 }])),
    pivot: { x: 24, y: 45 }
  };
}

const wave20 = (index, amplitude = 1) => Math.sin((index / 20) * Math.PI * 2) * amplitude;
const ease = (value) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, value)))) / 2;

const idleFrames = Array.from({ length: 20 }, (_, index) => makeFrame("idle", index, 110, (parts) => {
  const breathe = Math.round(wave20(index, 1));
  drawSlime(parts, { width: 42 - breathe, height: 33 + breathe, expression: index === 8 || index === 9 ? "blink" : "smile", highlightShift: index % 10 > 5 ? 1 : 0 });
}));

const bounceFrames = Array.from({ length: 20 }, (_, index) => makeFrame("bounce", index, 80, (parts) => {
  const cycle = (index % 10) / 10;
  const lift = Math.round(Math.sin(cycle * Math.PI) * 5);
  const contact = index % 10 === 0 || index % 10 === 9;
  drawSlime(parts, {
    base: 44 - lift,
    width: contact ? 44 : 40,
    height: contact ? 29 : 35,
    expression: "smile",
    highlightShift: index % 2
  });
}));

const jumpCurve = [0,0,1,0,-3,-7,-11,-14,-16,-17,-17,-16,-14,-11,-7,-3,0,1,1,0];
const jumpFrames = jumpCurve.map((offset, index) => makeFrame("jump", index, 80, (parts) => {
  const landing = index <= 2 || index >= 16;
  drawSlime(parts, {
    base: 44 + offset,
    width: landing ? 44 : 38,
    height: landing ? 29 : 37,
    expression: index >= 7 && index <= 12 ? "surprise" : "smile"
  });
  if (index >= 4 && index <= 15) {
    set(parts.effect, 8, 42, 9); set(parts.effect, 39, 42, 9);
  }
}));

const squishFrames = Array.from({ length: 20 }, (_, index) => makeFrame("squish", index, 90, (parts) => {
  const phase = index <= 9 ? ease(index / 9) : ease((19 - index) / 10);
  drawSlime(parts, {
    width: Math.round(42 + phase * 4),
    height: Math.round(33 - phase * 17),
    expression: phase > 0.65 ? "blink" : "smile",
    faceScale: 1 + phase * 0.15
  });
}));

const stretchFrames = Array.from({ length: 20 }, (_, index) => makeFrame("stretch", index, 90, (parts) => {
  const phase = index <= 9 ? ease(index / 9) : ease((19 - index) / 10);
  drawSlime(parts, {
    width: Math.round(42 - phase * 14),
    height: Math.round(33 + phase * 10),
    expression: phase > 0.65 ? "surprise" : "smile",
    faceScale: 1 - phase * 0.18
  });
}));

const waveFrames = Array.from({ length: 20 }, (_, index) => makeFrame("wave", index, 95, (parts) => {
  drawSlime(parts, { expression: index === 10 ? "blink" : "smile" });
  const handX = 42 + Math.round(wave20(index, 2));
  const handY = 23 + Math.round(Math.cos((index / 20) * Math.PI * 2) * 2);
  line(parts.body, 39, 32, handX, handY, 7, 7);
  line(parts.body, 39, 32, handX, handY, 2, 5);
  rect(parts.highlight, handX - 1, handY - 2, 2, 2, 4);
}));

const splitFrames = Array.from({ length: 20 }, (_, index) => makeFrame("split", index, 100, (parts) => {
  if (index < 6) {
    drawSlime(parts, { width: 42 + index, height: 33 - index, expression: index >= 4 ? "surprise" : "smile" });
    if (index >= 3) line(parts.effect, 24, 19, 24, 40, 9, 1);
    return;
  }
  const separation = Math.round(ease((index - 6) / 8) * 5);
  const height = 23 + Math.max(0, 3 - Math.abs(12 - index));
  drawSlime(parts, { cx: 15 - separation, width: 22, height, faceScale: 0.58, expression: "smile", highlightShift: -1 });
  drawSlime(parts, { cx: 33 + separation, width: 22, height, faceScale: 0.58, expression: index === 12 ? "blink" : "smile", highlightShift: 1 });
  if (index < 11) {
    set(parts.effect, 23, 32, 9); set(parts.effect, 25, 30, 9); set(parts.effect, 24, 27, 9);
  }
}));

const eatFrames = Array.from({ length: 20 }, (_, index) => makeFrame("eat", index, 95, (parts) => {
  const chewing = index >= 10 && index <= 16;
  drawSlime(parts, {
    width: chewing && index % 2 === 0 ? 44 : 42,
    height: chewing && index % 2 === 0 ? 32 : 33,
    expression: index >= 7 && index <= 11 ? "eat" : "smile"
  });
  if (index < 10) {
    const foodX = 46 - index * 2;
    const foodY = 31 + Math.round(Math.sin(index * 0.9) * 2);
    rect(parts.effect, foodX - 2, foodY - 2, 4, 4, 14);
    rect(parts.effect, foodX - 1, foodY - 3, 2, 2, 10);
  } else if (index === 11 || index === 13 || index === 15) {
    set(parts.effect, 36, 20, 10); set(parts.effect, 39, 18, 10);
  }
}));

const hurtFrames = Array.from({ length: 20 }, (_, index) => makeFrame("hurt", index, 85, (parts) => {
  const impact = index >= 3 && index <= 12;
  const impactPhase = impact ? Math.sin(((index - 3) / 9) * Math.PI) : 0;
  const jitter = impact ? Math.round(Math.sin(index * 2.2) * impactPhase * 3) : 0;
  drawSlime(parts, {
    cx: 24 + jitter,
    width: impact ? 42 - Math.round(impactPhase * 5) : 42,
    height: impact ? 33 + Math.round(impactPhase * 4) : 33,
    expression: impact ? "hurt" : "smile"
  });
  if (impact) {
    const side = index % 2 === 0 ? 5 : 43;
    const flare = Math.round(impactPhase * 3);
    line(parts.effect, side, 18 + flare, side + (side < 24 ? 4 : -4), 23 + flare, 11, 2);
    line(parts.effect, side, 29 - flare, side + (side < 24 ? 5 : -5), 27 - flare, 11, 2);
  }
}));

const sleepFrames = Array.from({ length: 20 }, (_, index) => makeFrame("sleep", index, 140, (parts) => {
  const breathe = Math.round(wave20(index, 1));
  drawSlime(parts, { width: 44 - breathe, height: 25 + breathe, expression: "sleep" });
  const drift = Math.floor(index / 5);
  if (index >= 3) {
    rect(parts.effect, 35 + drift, 19 - drift, 4, 1, 9);
    rect(parts.effect, 38 + drift, 20 - drift, 1, 2, 9);
    rect(parts.effect, 35 + drift, 22 - drift, 4, 1, 9);
  }
  if (index >= 10) {
    rect(parts.effect, 39, 11, 5, 1, 15); rect(parts.effect, 43, 12, 1, 2, 15); rect(parts.effect, 39, 14, 5, 1, 15);
  }
}));

const now = new Date().toISOString();
const project = {
  version: 1,
  id: "lime-slime",
  name: "青团",
  createdAt: now,
  updatedAt: now,
  canvas: { width: WIDTH, height: HEIGHT },
  palette,
  layers,
  actions: [
    { id: "idle", name: "待机呼吸", loop: true, frames: idleFrames },
    { id: "bounce", name: "弹跳行走", loop: true, frames: bounceFrames },
    { id: "jump", name: "大跳", loop: false, frames: jumpFrames },
    { id: "squish", name: "挤压", loop: false, frames: squishFrames },
    { id: "stretch", name: "拉伸", loop: false, frames: stretchFrames },
    { id: "wave", name: "挥手", loop: true, frames: waveFrames },
    { id: "split", name: "分裂", loop: false, frames: splitFrames },
    { id: "eat", name: "进食", loop: false, frames: eatFrames },
    { id: "hurt", name: "受击", loop: false, frames: hurtFrames },
    { id: "sleep", name: "睡觉", loop: true, frames: sleepFrames }
  ]
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(project), "utf8");
console.log(`Generated ${OUTPUT}: ${project.actions.length} actions, ${project.actions.reduce((sum, action) => sum + action.frames.length, 0)} frames`);
