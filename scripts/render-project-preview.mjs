import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const [, , projectFile, outputFile, requestedScale = "4", requestedActionId] = process.argv;
if (!projectFile || !outputFile) {
  console.error("Usage: node scripts/render-project-preview.mjs <project.json> <preview.png> [scale] [action-id]");
  process.exit(1);
}

const project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
const scale = Math.max(1, Math.min(16, Math.round(Number(requestedScale) || 4)));
const requestedAction = requestedActionId
  ? project.actions.find((action) => action.id === requestedActionId)
  : undefined;
if (requestedActionId && !requestedAction) {
  console.error(`Action not found: ${requestedActionId}`);
  process.exit(1);
}
const rows = 4;
const slots = requestedAction
  ? Array.from({ length: Math.ceil(requestedAction.frames.length / rows) }, (_, column) => ({
      action: requestedAction,
      sampleIndices: Array.from({ length: rows }, (_, row) =>
        Math.min(requestedAction.frames.length - 1, column * rows + row)
      )
    }))
  : project.actions.map((action) => ({
      action,
      sampleIndices: [0, 0.25, 0.5, 0.75].map((position) =>
        Math.min(action.frames.length - 1, Math.floor(action.frames.length * position))
      )
    }));
const columns = slots.length;
const cellWidth = project.canvas.width * scale;
const cellHeight = project.canvas.height * scale;
const width = cellWidth * columns;
const height = cellHeight * rows;
const rgba = Buffer.alloc(width * height * 4);

function parseColor(value) {
  const hex = value.replace(/^#/, "");
  if (hex.length === 8) {
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
      Number.parseInt(hex.slice(6, 8), 16)
    ];
  }
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
    255
  ];
}

const palette = project.palette.map(parseColor);
const background = [242, 240, 233, 255];
for (let offset = 0; offset < rgba.length; offset += 4) {
  rgba[offset] = background[0];
  rgba[offset + 1] = background[1];
  rgba[offset + 2] = background[2];
  rgba[offset + 3] = background[3];
}

function blendPixel(x, y, color) {
  const offset = (y * width + x) * 4;
  const alpha = color[3] / 255;
  const inverse = 1 - alpha;
  rgba[offset] = Math.round(color[0] * alpha + rgba[offset] * inverse);
  rgba[offset + 1] = Math.round(color[1] * alpha + rgba[offset + 1] * inverse);
  rgba[offset + 2] = Math.round(color[2] * alpha + rgba[offset + 2] * inverse);
  rgba[offset + 3] = 255;
}

for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
  const { action, sampleIndices } = slots[slotIndex];
  for (let row = 0; row < sampleIndices.length; row += 1) {
    const frame = action.frames[sampleIndices[row]];
    const composite = Array.from({ length: project.canvas.width * project.canvas.height }, () => 0);
    for (const layer of project.layers) {
      if (layer.visible === false || layer.opacity <= 0) continue;
      const cel = frame.cels[layer.id];
      if (!cel) continue;
      for (let index = 0; index < cel.pixels.length; index += 1) {
        const colorIndex = cel.pixels[index];
        if (colorIndex) composite[index] = colorIndex;
      }
    }
    for (let sourceY = 0; sourceY < project.canvas.height; sourceY += 1) {
      for (let sourceX = 0; sourceX < project.canvas.width; sourceX += 1) {
        const colorIndex = composite[sourceY * project.canvas.width + sourceX];
        if (!colorIndex) continue;
        const color = palette[colorIndex];
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            blendPixel(
              slotIndex * cellWidth + sourceX * scale + dx,
              row * cellHeight + sourceY * scale + dy,
              color
            );
          }
        }
      }
    }
  }
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const value of buffer) crc = (crc >>> 8) ^ crcTable[(crc ^ value) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 6;
const raw = Buffer.alloc((width * 4 + 1) * height);
for (let y = 0; y < height; y += 1) {
  const rowOffset = y * (width * 4 + 1);
  raw[rowOffset] = 0;
  rgba.copy(raw, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
}

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0))
]);
fs.mkdirSync(path.dirname(path.resolve(outputFile)), { recursive: true });
fs.writeFileSync(outputFile, png);
console.log(`Rendered ${outputFile}: ${width}x${height}`);
