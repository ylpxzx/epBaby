import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const WIDTH = 128;
const HEIGHT = 128;
const SOURCE_SCALE = 0.25;
const GROUND_Y = 121;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "reference", "role", "pixel-cat-action-concept.png");
const OUTPUT = path.join(ROOT, "default-pets", "moss-jester-cat.json");

// Palette zero is transparent. The remaining colors were selected directly from the concept art.
const palette = [
  "#00000000", "#171219", "#30331D", "#56612B", "#7D8A3C", "#A4AD62",
  "#FFF1D2", "#E7D2AC", "#B92D34", "#35283D", "#503B5A", "#6D5377",
  "#4F5D25", "#728338", "#A0AE54", "#E89635", "#F1AF55", "#28252D",
  "#4A4650", "#F18A6C", "#E7C0A4", "#4D9BC0", "#7AC5DD", "#8B552E",
  "#B97A45", "#EAD8AB", "#F4E8C9", "#EBC44A", "#D46A75", "#FFFFFF",
  "#98939D", "#655F69"
];

const paletteRgb = palette.map((color) => {
  const hex = color.slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ];
});

const layers = [
  { id: "body", name: "头发与猫耳", visible: true, locked: false, opacity: 1 },
  { id: "costume", name: "服装与身体", visible: true, locked: false, opacity: 1 },
  { id: "face", name: "脸部与笑容", visible: true, locked: false, opacity: 1 },
  { id: "prop", name: "道具与特效", visible: true, locked: false, opacity: 1 }
];

const poseSpecs = [
  { id: "idle", name: "待机微笑", loop: true, x0: 0, x1: 260, duration: 110 },
  { id: "laugh", name: "开怀大笑", loop: true, x0: 260, x1: 498, duration: 80 },
  { id: "cane-walk", name: "手杖行走", loop: true, mirror: true, x0: 505, x1: 780, duration: 55 },
  { id: "umbrella-walk", name: "撑伞踏水", loop: true, x0: 780, x1: 1055, duration: 60 },
  { id: "card-show", name: "展示卡牌", loop: false, x0: 1055, x1: 1318, duration: 100 },
  { id: "scooter-ride", name: "骑踏板车", loop: true, mirror: true, x0: 1318, x1: 1615, duration: 75 },
  { id: "cat-paws", name: "猫爪卖萌", loop: true, x0: 1615, x1: 1855, duration: 95 }
];

function decodePng(filename) {
  const source = fs.readFileSync(filename);
  const signature = source.subarray(0, 8);
  if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("The role concept is not a PNG image");
  }
  let cursor = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const dataChunks = [];
  while (cursor < source.length) {
    const length = source.readUInt32BE(cursor);
    const type = source.toString("ascii", cursor + 4, cursor + 8);
    const data = source.subarray(cursor + 8, cursor + 8 + length);
    cursor += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      dataChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported concept PNG format: depth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(dataChunks));
  const decoded = Buffer.alloc(stride * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset + x];
      const left = x >= channels ? decoded[rowOffset + x - channels] : 0;
      const up = y > 0 ? decoded[rowOffset - stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? decoded[rowOffset - stride + x - channels] : 0;
      let value = raw;
      if (filter === 1) value = (raw + left) & 0xFF;
      else if (filter === 2) value = (raw + up) & 0xFF;
      else if (filter === 3) value = (raw + Math.floor((left + up) / 2)) & 0xFF;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const leftDistance = Math.abs(estimate - left);
        const upDistance = Math.abs(estimate - up);
        const diagonalDistance = Math.abs(estimate - upLeft);
        const predictor = leftDistance <= upDistance && leftDistance <= diagonalDistance
          ? left
          : upDistance <= diagonalDistance ? up : upLeft;
        value = (raw + predictor) & 0xFF;
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG row filter ${filter}`);
      }
      decoded[rowOffset + x] = value;
    }
    inputOffset += stride;
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = decoded[index * channels];
    rgba[index * 4 + 1] = decoded[index * channels + 1];
    rgba[index * 4 + 2] = decoded[index * channels + 2];
    rgba[index * 4 + 3] = channels === 4 ? decoded[index * channels + 3] : 255;
  }
  return { width, height, rgba };
}

function backgroundMask(image) {
  const { width, height, rgba } = image;
  const mask = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const candidate = (index) => {
    const offset = index * 4;
    if (rgba[offset + 3] < 16) return true;
    const red = rgba[offset];
    const green = rgba[offset + 1];
    const blue = rgba[offset + 2];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    return minimum >= 214 && maximum - minimum <= 18;
  };
  const push = (index) => {
    if (mask[index] || !candidate(index)) return;
    mask[index] = 1;
    queue[tail] = index;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) push(index - 1);
    if (x + 1 < width) push(index + 1);
    if (y > 0) push(index - width);
    if (y + 1 < height) push(index + width);
  }
  return mask;
}

function nearestPalette(red, green, blue) {
  let nearest = 1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < paletteRgb.length; index += 1) {
    const color = paletteRgb[index];
    const redDelta = red - color[0];
    const greenDelta = green - color[1];
    const blueDelta = blue - color[2];
    const distance = redDelta * redDelta * 0.3 + greenDelta * greenDelta * 0.59 + blueDelta * blueDelta * 0.11;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = index;
    }
  }
  return nearest;
}

function poseForeground(image, background, spec) {
  const visited = new Uint8Array(image.width * image.height);
  const queue = new Int32Array((spec.x1 - spec.x0) * image.height);
  const components = [];
  const push = (index, tail) => {
    if (visited[index] || background[index]) return tail;
    const x = index % image.width;
    if (x < spec.x0 || x >= Math.min(spec.x1, image.width)) return tail;
    visited[index] = 1;
    queue[tail] = index;
    return tail + 1;
  };
  for (let y = 0; y < image.height; y += 1) {
    for (let x = spec.x0; x < Math.min(spec.x1, image.width); x += 1) {
      const start = y * image.width + x;
      if (visited[start] || background[start]) continue;
      let head = 0;
      let tail = 0;
      tail = push(start, tail);
      const pixels = [];
      while (head < tail) {
        const index = queue[head];
        head += 1;
        pixels.push(index);
        const currentX = index % image.width;
        const currentY = Math.floor(index / image.width);
        if (currentX > spec.x0) tail = push(index - 1, tail);
        if (currentX + 1 < spec.x1 && currentX + 1 < image.width) tail = push(index + 1, tail);
        if (currentY > 0) tail = push(index - image.width, tail);
        if (currentY + 1 < image.height) tail = push(index + image.width, tail);
      }
      components.push(pixels);
    }
  }
  components.sort((left, right) => right.length - left.length);
  const largest = components[0]?.length ?? 0;
  const minimumSize = Math.max(60, Math.round(largest * 0.03));
  const foreground = new Uint8Array(image.width * image.height);
  for (const component of components) {
    if (component.length < minimumSize) continue;
    for (const index of component) foreground[index] = 1;
  }
  return foreground;
}

function poseBounds(image, foreground, spec) {
  let minX = spec.x1;
  let minY = image.height;
  let maxX = spec.x0;
  let maxY = 0;
  let count = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = spec.x0; x < Math.min(spec.x1, image.width); x += 1) {
      const index = y * image.width + x;
      if (!foreground[index]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      count += 1;
    }
  }
  if (!count) throw new Error(`No foreground pixels found for ${spec.id}`);
  return { minX, minY, maxX, maxY, count };
}

function grid() {
  return Array.from({ length: WIDTH * HEIGHT }, () => 0);
}

function extractPose(image, background, spec) {
  const foreground = poseForeground(image, background, spec);
  const bounds = poseBounds(image, foreground, spec);
  const sourceWidth = bounds.maxX - bounds.minX + 1;
  const sourceHeight = bounds.maxY - bounds.minY + 1;
  const width = Math.max(1, Math.round(sourceWidth * SOURCE_SCALE));
  const height = Math.max(1, Math.round(sourceHeight * SOURCE_SCALE));
  const left = Math.round((WIDTH - width) / 2);
  const top = GROUND_Y - height;
  const pixels = grid();
  const sampleSize = Math.max(1, Math.round(1 / SOURCE_SCALE));

  for (let destinationY = 0; destinationY < height; destinationY += 1) {
    for (let destinationX = 0; destinationX < width; destinationX += 1) {
      const sourceStartX = bounds.minX + Math.floor(destinationX / SOURCE_SCALE);
      const sourceStartY = bounds.minY + Math.floor(destinationY / SOURCE_SCALE);
      const counts = new Map();
      for (let sampleY = 0; sampleY < sampleSize; sampleY += 1) {
        for (let sampleX = 0; sampleX < sampleSize; sampleX += 1) {
          const sourceX = Math.min(bounds.maxX, sourceStartX + sampleX);
          const sourceY = Math.min(bounds.maxY, sourceStartY + sampleY);
          const sourceIndex = sourceY * image.width + sourceX;
          if (!foreground[sourceIndex]) continue;
          const offset = sourceIndex * 4;
          const paletteIndex = nearestPalette(image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]);
          counts.set(paletteIndex, (counts.get(paletteIndex) ?? 0) + 1);
        }
      }
      let selected = 0;
      let selectedCount = 0;
      for (const [paletteIndex, count] of counts) {
        if (count > selectedCount || (count === selectedCount && paletteIndex === 1)) {
          selected = paletteIndex;
          selectedCount = count;
        }
      }
      const x = left + destinationX;
      const y = top + destinationY;
      if (selected && x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT) pixels[y * WIDTH + x] = selected;
    }
  }
  return { pixels, left, top, width, height, bounds };
}

function mirrorPose(pose) {
  const pixels = grid();
  for (let index = 0; index < pose.pixels.length; index += 1) {
    const value = pose.pixels[index];
    if (!value) continue;
    const sourceX = index % WIDTH;
    const sourceY = Math.floor(index / WIDTH);
    pixels[sourceY * WIDTH + (WIDTH - 1 - sourceX)] = value;
  }
  return {
    ...pose,
    pixels,
    left: WIDTH - pose.left - pose.width,
    mirrored: true
  };
}

function isPropPixel(actionId, paletteIndex, x, y, pose) {
  const relativeX = (x - pose.left) / Math.max(1, pose.width);
  const relativeY = (y - pose.top) / Math.max(1, pose.height);
  if (paletteIndex === 21 || paletteIndex === 22) return true;
  // Keep the complete cane, its dark outline, and the gripping paw in one rigid component.
  // Moving this region independently used to split the paw and deform the hooked handle.
  if (
    actionId === "cane-walk"
    && (pose.mirrored ? relativeX > 0.63 : relativeX < 0.37)
    && relativeY > 0.3
    && relativeY < 0.88
  ) return true;
  if (actionId === "umbrella-walk" && (relativeY < 0.34 || paletteIndex === 21 || paletteIndex === 22)) return true;
  if (actionId === "card-show" && relativeX < 0.27 && relativeY > 0.27 && relativeY < 0.67) return true;
  if (actionId === "scooter-ride") {
    if ([23, 24, 25, 26, 27].includes(paletteIndex)) return true;
    if (relativeY > 0.63) return true;
    if ((pose.mirrored ? relativeX < 0.32 : relativeX > 0.68) && relativeY > 0.25) return true;
  }
  return false;
}

function splitLayers(spec, pose) {
  const result = { body: grid(), costume: grid(), face: grid(), prop: grid() };
  const hairColors = new Set([2, 3, 4, 5, 19, 20]);
  const faceColors = new Set([6, 7, 8, 28, 29]);
  for (let index = 0; index < pose.pixels.length; index += 1) {
    const paletteIndex = pose.pixels[index];
    if (!paletteIndex) continue;
    const x = index % WIDTH;
    const y = Math.floor(index / WIDTH);
    const relativeX = (x - pose.left) / Math.max(1, pose.width);
    const relativeY = (y - pose.top) / Math.max(1, pose.height);
    if (isPropPixel(spec.id, paletteIndex, x, y, pose)) {
      result.prop[index] = paletteIndex;
    } else if (faceColors.has(paletteIndex)) {
      result.face[index] = paletteIndex;
    } else if (hairColors.has(paletteIndex) || (paletteIndex === 1 && relativeY < 0.5 && (relativeX < 0.28 || relativeX > 0.72))) {
      result.body[index] = paletteIndex;
    } else if ((paletteIndex === 1 || paletteIndex === 17) && relativeY < 0.5 && relativeX >= 0.28 && relativeX <= 0.72) {
      result.face[index] = paletteIndex;
    } else {
      result.costume[index] = paletteIndex;
    }
  }
  return result;
}

function shift(source, offsetX, offsetY) {
  const target = grid();
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index];
    if (!value) continue;
    const sourceX = index % WIDTH;
    const sourceY = Math.floor(index / WIDTH);
    const x = sourceX + Math.round(offsetX);
    const y = sourceY + Math.round(offsetY);
    if (x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT) target[y * WIDTH + x] = value;
  }
  return target;
}

function shiftUmbrellaProp(source, offsetX, offsetY) {
  const target = grid();
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index];
    if (!value) continue;
    const sourceX = index % WIDTH;
    const sourceY = Math.floor(index / WIDTH);
    const isGroundWater = sourceY >= GROUND_Y - 5;
    const x = sourceX + Math.round(isGroundWater ? 0 : offsetX);
    const y = sourceY + Math.round(isGroundWater ? 0 : offsetY);
    if (x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT) target[y * WIDTH + x] = value;
  }
  return target;
}

function walkCycleState(index, options = {}) {
  const phase = (index / 20) * Math.PI * 2;
  const stride = Math.cos(phase);
  const swing = Math.sin(phase);
  const stridePixels = options.stridePixels ?? 6;
  const footLiftPixels = options.footLiftPixels ?? 5;
  const kneeBendPixels = options.kneeBendPixels ?? 5;
  // contact -> down -> passing -> up, then repeat on the opposite leg
  const bodyOffsets = [0, 1, 1, 0, -1, -2, -2, -1, 0, 0, 0, 1, 1, 0, -1, -2, -2, -1, 0, 0];
  const leftSwing = Math.max(0, -swing);
  const rightSwing = Math.max(0, swing);
  return {
    bodyOffsetY: bodyOffsets[index] ?? 0,
    leftFootOffsetX: Math.round(stride * stridePixels),
    rightFootOffsetX: Math.round(-stride * stridePixels),
    leftFootOffsetY: -Math.round(leftSwing * footLiftPixels),
    rightFootOffsetY: -Math.round(rightSwing * footLiftPixels),
    leftKneeOffsetX: Math.round(leftSwing * kneeBendPixels),
    rightKneeOffsetX: Math.round(rightSwing * kneeBendPixels),
    leftSwing,
    rightSwing
  };
}

function renderGaitLeg(target, source, mask, hipY, footOffsetX, footOffsetY, kneeOffsetX, bodyOffsetY) {
  const legLength = Math.max(1, GROUND_Y - hipY);
  const verticalScale = Math.max(0.7, 1 + footOffsetY / legLength);
  const destinationHipY = hipY + bodyOffsetY;
  for (let destinationY = 0; destinationY < HEIGHT; destinationY += 1) {
    for (let destinationX = 0; destinationX < WIDTH; destinationX += 1) {
      const sourceYFloat = hipY + (destinationY - destinationHipY) / verticalScale;
      const influence = Math.max(0, Math.min(1, (sourceYFloat - hipY) / legLength));
      const kneeInfluence = 4 * influence * (1 - influence);
      const sourceX = Math.round(destinationX - footOffsetX * influence - kneeOffsetX * kneeInfluence);
      const sourceY = Math.round(sourceYFloat);
      if (sourceX < 0 || sourceY < 0 || sourceX >= WIDTH || sourceY >= HEIGHT) continue;
      const sourceIndex = sourceY * WIDTH + sourceX;
      if (!mask[sourceIndex]) continue;
      const value = source[sourceIndex];
      if (value) target[destinationY * WIDTH + destinationX] = value;
    }
  }
}

function animateWalkLayer(source, pose, index, options = {}) {
  const target = grid();
  const gait = walkCycleState(index, options);
  const hipY = Math.round(pose.top + pose.height * (options.hipRatio ?? 0.66));
  const characterCenter = Math.round(pose.left + pose.width * (options.centerRatio ?? 0.5));
  const legRadius = options.legRadius ?? 18;
  const legLeft = characterCenter - legRadius;
  const legRight = characterCenter + legRadius;
  const leftMask = new Uint8Array(WIDTH * HEIGHT);
  const rightMask = new Uint8Array(WIDTH * HEIGHT);

  for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex += 1) {
    const value = source[sourceIndex];
    if (!value) continue;
    const sourceX = sourceIndex % WIDTH;
    const sourceY = Math.floor(sourceIndex / WIDTH);
    const isLegPixel = sourceY >= hipY && sourceX >= legLeft && sourceX <= legRight;
    if (isLegPixel) {
      (sourceX < characterCenter ? leftMask : rightMask)[sourceIndex] = 1;
      continue;
    }
    const destinationY = sourceY + gait.bodyOffsetY;
    if (destinationY >= 0 && destinationY < HEIGHT) target[destinationY * WIDTH + sourceX] = value;
  }

  const renderLeft = () => renderGaitLeg(
    target,
    source,
    leftMask,
    hipY,
    gait.leftFootOffsetX,
    gait.leftFootOffsetY,
    gait.leftKneeOffsetX,
    gait.bodyOffsetY
  );
  const renderRight = () => renderGaitLeg(
    target,
    source,
    rightMask,
    hipY,
    gait.rightFootOffsetX,
    gait.rightFootOffsetY,
    gait.rightKneeOffsetX,
    gait.bodyOffsetY
  );

  // The swinging leg passes in front of the supporting leg.
  if (gait.leftSwing > gait.rightSwing) {
    renderRight();
    renderLeft();
  } else {
    renderLeft();
    renderRight();
  }
  return target;
}

function set(pixels, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px >= 0 && py >= 0 && px < WIDTH && py < HEIGHT) pixels[py * WIDTH + px] = color;
}

function line(pixels, x0, y0, x1, y1, color) {
  let startX = Math.round(x0);
  let startY = Math.round(y0);
  const endX = Math.round(x1);
  const endY = Math.round(y1);
  const dx = Math.abs(endX - startX);
  const sx = startX < endX ? 1 : -1;
  const dy = -Math.abs(endY - startY);
  const sy = startY < endY ? 1 : -1;
  let error = dx + dy;
  while (true) {
    set(pixels, startX, startY, color);
    if (startX === endX && startY === endY) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; startX += sx; }
    if (twice <= dx) { error += dx; startY += sy; }
  }
}

function characterComponents(cels) {
  const characterLayerIds = ["body", "costume", "face"];
  const occupied = new Uint8Array(WIDTH * HEIGHT);
  for (const layerId of characterLayerIds) {
    const pixels = cels[layerId].pixels;
    for (let index = 0; index < pixels.length; index += 1) {
      if (pixels[index]) occupied[index] = 1;
    }
  }

  const visited = new Uint8Array(WIDTH * HEIGHT);
  const components = [];
  for (let start = 0; start < occupied.length; start += 1) {
    if (!occupied[start] || visited[start]) continue;
    const queue = [start];
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      const x = index % WIDTH;
      const y = Math.floor(index / WIDTH);
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextY < 0 || nextX >= WIDTH || nextY >= HEIGHT) continue;
          const next = nextY * WIDTH + nextX;
          if (occupied[next] && !visited[next]) {
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
    }
    components.push(queue);
  }
  components.sort((left, right) => right.length - left.length);
  return components;
}

function characterColorAt(cels, index) {
  return cels.face.pixels[index]
    || cels.costume.pixels[index]
    || cels.body.pixels[index]
    || 1;
}

function bridgeCharacterGap(cels, startIndex, endIndex, color) {
  let startX = startIndex % WIDTH;
  let startY = Math.floor(startIndex / WIDTH);
  const endX = endIndex % WIDTH;
  const endY = Math.floor(endIndex / WIDTH);
  const deltaX = Math.abs(endX - startX);
  const stepX = startX < endX ? 1 : -1;
  const deltaY = -Math.abs(endY - startY);
  const stepY = startY < endY ? 1 : -1;
  let error = deltaX + deltaY;
  while (true) {
    const index = startY * WIDTH + startX;
    const occupied = cels.body.pixels[index] || cels.costume.pixels[index] || cels.face.pixels[index];
    if (!occupied) cels.costume.pixels[index] = color;
    if (startX === endX && startY === endY) break;
    const twice = error * 2;
    if (twice >= deltaY) { error += deltaY; startX += stepX; }
    if (twice <= deltaX) { error += deltaX; startY += stepY; }
  }
}

function repairCharacterSeams(cels) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const components = characterComponents(cels);
    if (components.length <= 1) return;
    const main = components[0];
    const detached = components[1];
    let nearestMain = -1;
    let nearestDetached = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const detachedIndex of detached) {
      const detachedX = detachedIndex % WIDTH;
      const detachedY = Math.floor(detachedIndex / WIDTH);
      for (const mainIndex of main) {
        const mainX = mainIndex % WIDTH;
        const mainY = Math.floor(mainIndex / WIDTH);
        const distance = Math.max(Math.abs(detachedX - mainX), Math.abs(detachedY - mainY));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestMain = mainIndex;
          nearestDetached = detachedIndex;
        }
      }
    }
    if (nearestDistance > 8 || nearestMain < 0 || nearestDetached < 0) return;
    const mainColor = characterColorAt(cels, nearestMain);
    const detachedColor = characterColorAt(cels, nearestDetached);
    const bridgeColor = mainColor === 1 || detachedColor === 1 ? 1 : detachedColor;
    bridgeCharacterGap(cels, nearestMain, nearestDetached, bridgeColor);
  }
}

function compositeCharacterColor(cels, index) {
  return cels.prop.pixels[index]
    || cels.face.pixels[index]
    || cels.costume.pixels[index]
    || cels.body.pixels[index]
    || 0;
}

function fillTinyInternalHoles(cels, bounds, maximumSize = 12) {
  const occupied = new Uint8Array(WIDTH * HEIGHT);
  for (let index = 0; index < occupied.length; index += 1) {
    if (compositeCharacterColor(cels, index)) occupied[index] = 1;
  }
  const visited = new Uint8Array(WIDTH * HEIGHT);
  for (let start = 0; start < occupied.length; start += 1) {
    if (occupied[start] || visited[start]) continue;
    const queue = [start];
    let reachesCanvasEdge = false;
    let staysInsideBounds = true;
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      const x = index % WIDTH;
      const y = Math.floor(index / WIDTH);
      if (x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1) reachesCanvasEdge = true;
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) staysInsideBounds = false;
      for (const [offsetX, offsetY] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextY < 0 || nextX >= WIDTH || nextY >= HEIGHT) continue;
        const next = nextY * WIDTH + nextX;
        if (!occupied[next] && !visited[next]) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    if (reachesCanvasEdge || !staysInsideBounds || queue.length > maximumSize) continue;

    const colorCounts = new Map();
    for (const index of queue) {
      const x = index % WIDTH;
      const y = Math.floor(index / WIDTH);
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextY < 0 || nextX >= WIDTH || nextY >= HEIGHT) continue;
          const color = compositeCharacterColor(cels, nextY * WIDTH + nextX);
          if (color) colorCounts.set(color, (colorCounts.get(color) ?? 0) + 1);
        }
      }
    }
    let fillColor = 1;
    let fillCount = -1;
    for (const [color, count] of colorCounts) {
      if (count > fillCount || (count === fillCount && color === 1)) {
        fillColor = color;
        fillCount = count;
      }
    }
    for (const index of queue) cels.costume.pixels[index] = fillColor;
  }
}

function frameOffsets(actionId, index) {
  const radians = (index / 20) * Math.PI * 2;
  if (actionId === "idle") {
    const breathe = Math.round((1 - Math.cos(radians)) / 2);
    return { body: [0, -breathe], face: [0, -breathe], costume: [0, -breathe], prop: [0, -breathe] };
  }
  if (actionId === "laugh") {
    const lift = Math.round(Math.max(0, Math.sin(radians)) * 6);
    return { body: [0, -lift], face: [0, -lift], costume: [0, -lift], prop: [0, -lift] };
  }
  if (actionId === "cane-walk") {
    const bodyOffsetY = walkCycleState(index, { bodyLiftPixels: 2 }).bodyOffsetY;
    return { body: [0, bodyOffsetY], face: [0, bodyOffsetY], costume: [0, bodyOffsetY], prop: [0, bodyOffsetY] };
  }
  if (actionId === "umbrella-walk") {
    const bodyOffsetY = walkCycleState(index, { bodyLiftPixels: 2 }).bodyOffsetY;
    return { body: [0, bodyOffsetY], face: [0, bodyOffsetY], costume: [0, bodyOffsetY], prop: [0, bodyOffsetY] };
  }
  if (actionId === "card-show") {
    return { body: [0, 0], face: [0, 0], costume: [0, 0], prop: [0, 0] };
  }
  if (actionId === "scooter-ride") {
    const bob = index % 5 === 0 ? -2 : index % 5 === 1 ? -1 : 0;
    return { body: [0, bob], face: [0, bob], costume: [0, bob], prop: [0, bob] };
  }
  const sway = Math.round(Math.sin(radians * 2) * 1);
  return { body: [sway, 0], face: [sway, 0], costume: [sway, 0], prop: [sway, 0] };
}

function addEffects(actionId, index, prop) {
  if (actionId === "laugh" && index >= 4 && index <= 14) {
    line(prop, 45, 120, 43 - (index % 3), 124, 30);
    line(prop, 83, 120, 85 + (index % 3), 124, 30);
  }
  if (actionId === "umbrella-walk") {
    const localStep = index % 10;
    const contactSide = Math.floor(index / 10) % 2 === 0 ? -1 : 1;
    const contactX = 64 + contactSide * 11;
    const splashHeight = [1, 5, 8, 7, 4, 2, 0, 0, 0, 0][localStep];
    const splashSpread = [2, 4, 6, 8, 9, 10, 0, 0, 0, 0][localStep];
    line(prop, 38, 121, 51, 121, 21);
    line(prop, 77, 121, 91, 121, 21);
    if (splashHeight > 0) {
      line(prop, contactX, 120, contactX - splashSpread, 120 - Math.max(1, splashHeight - 2), 21);
      line(prop, contactX, 120, contactX + splashSpread, 120 - Math.max(1, splashHeight - 3), 22);
      set(prop, contactX - splashSpread - 2, 118 - splashHeight, 22);
      set(prop, contactX + splashSpread + 2, 119 - splashHeight, 21);
      if (localStep >= 2 && localStep <= 4) {
        set(prop, contactX - Math.round(splashSpread / 2), 116 - splashHeight, 22);
        set(prop, contactX + Math.round(splashSpread / 2), 117 - splashHeight, 22);
      }
    }
  }
  if (actionId === "card-show" && index >= 8 && index <= 15) {
    set(prop, 41, 54 + (index % 2), 27);
    set(prop, 37, 58 - (index % 2), 29);
  }
  if (actionId === "scooter-ride" && index % 4 < 2) {
    line(prop, 15, 110, 28, 110, 30);
    line(prop, 8, 116, 25, 116, 30);
  }
  if (actionId === "cat-paws" && index >= 7 && index <= 14) {
    set(prop, 42, 50 - (index % 3), 28);
    set(prop, 86, 50 + (index % 3), 28);
  }
}

function makeFrames(spec, pose, baseLayers) {
  return Array.from({ length: 20 }, (_, index) => {
    const offsets = frameOffsets(spec.id, index);
    const cels = {};
    const walkOptions = spec.id === "cane-walk"
      ? { centerRatio: 0.5, hipRatio: 0.64, legRadius: 18, stridePixels: 6, footLiftPixels: 5, kneeBendPixels: 5 }
      : { centerRatio: 0.5, hipRatio: 0.68, legRadius: 20, stridePixels: 6, footLiftPixels: 5, kneeBendPixels: 5 };
    for (const layer of layers) {
      const [offsetX, offsetY] = offsets[layer.id];
      const isWalkingBodyLayer = layer.id === "costume" && (spec.id === "cane-walk" || spec.id === "umbrella-walk");
      const pixels = isWalkingBodyLayer
        ? animateWalkLayer(baseLayers[layer.id], pose, index, walkOptions)
        : spec.id === "umbrella-walk" && layer.id === "prop"
          ? shiftUmbrellaProp(baseLayers[layer.id], offsetX, offsetY)
          : shift(baseLayers[layer.id], offsetX, offsetY);
      if (layer.id === "prop") addEffects(spec.id, index, pixels);
      cels[layer.id] = { pixels, offsetX: 0, offsetY: 0 };
    }
    if (spec.id === "cane-walk" || spec.id === "umbrella-walk") repairCharacterSeams(cels);
    if (spec.id === "cane-walk") {
      const center = Math.round(pose.left + pose.width * walkOptions.centerRatio);
      const hipY = Math.round(pose.top + pose.height * walkOptions.hipRatio);
      fillTinyInternalHoles(cels, {
        left: center - walkOptions.legRadius - 2,
        right: center + walkOptions.legRadius + 2,
        top: hipY,
        bottom: GROUND_Y
      });
    }
    return {
      id: `moss-jester-cat-${spec.id}-${String(index + 1).padStart(2, "0")}`,
      name: `帧 ${index + 1}`,
      durationMs: spec.duration,
      cels,
      pivot: { x: 64, y: 121 }
    };
  });
}

const image = decodePng(SOURCE);
const background = backgroundMask(image);
const extracted = poseSpecs.map((spec) => {
  const extractedPose = extractPose(image, background, spec);
  const pose = spec.mirror ? mirrorPose(extractedPose) : extractedPose;
  return { spec, pose, baseLayers: splitLayers(spec, pose) };
});

const now = new Date().toISOString();
const project = {
  version: 1,
  id: "moss-jester-cat",
  name: "苔影笑猫",
  createdAt: now,
  updatedAt: now,
  canvas: { width: WIDTH, height: HEIGHT },
  palette,
  layers,
  actions: extracted.map(({ spec, pose, baseLayers }) => ({
    id: spec.id,
    name: spec.name,
    loop: spec.loop,
    frames: makeFrames(spec, pose, baseLayers)
  }))
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(project), "utf8");
console.log(`Generated ${OUTPUT}: ${project.canvas.width}x${project.canvas.height}, ${project.actions.length} actions, ${project.actions.reduce((sum, action) => sum + action.frames.length, 0)} frames`);
for (const { spec, pose } of extracted) {
  console.log(`${spec.id}: source ${pose.bounds.minX},${pose.bounds.minY}-${pose.bounds.maxX},${pose.bounds.maxY} -> ${pose.width}x${pose.height}`);
}
