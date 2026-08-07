import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGINAL_SOURCE_DIRECTORY = path.join(ROOT, "reference", "07_三刀流挥刀");
const ACTION_SOURCE_DIRECTORY = path.join(ROOT, "reference", "role1");
const OUTPUT = path.join(ROOT, "default-pets", "zoro-santoryu.json");

// Every source chart uses a 14 px raster cell and begins its bead grid at
// (60, 92). Source charts are copied cell-for-cell: no scaling, interpolation,
// palette approximation, or image generation is involved.
const GRID_LEFT = 60;
const GRID_TOP = 92;
const CELL_SIZE = 14;

// This is the smallest shared canvas that preserves every source chart while
// aligning all seven actions on one integer pivot. The common extents are:
// left=85, right=101, top=110, bottom=64.
const CANVAS = { width: 187, height: 175 };
const PIVOT = { x: 85, y: 110 };

const originalBeadColors = {
  A1: "#000000",
  A2: "#450002",
  A3: "#791621",
  A4: "#3F354C",
  A5: "#214814",
  A6: "#064C47",
  A7: "#B7303E",
  A8: "#655F30",
  A9: "#2B6D60",
  B1: "#935158",
  B2: "#47638F",
  B3: "#79707D",
  B4: "#3F8E38",
  B5: "#BF774A",
  B6: "#8B85E2",
  B7: "#7B92AB",
  B8: "#6EA93C",
  B9: "#CD8C90",
  C1: "#90BF8C",
  C2: "#CDBC50",
  C3: "#C9C5D8",
  C4: "#FFC890",
  C5: "#FFEDBF",
  C6: "#FFFFFF"
};

const actionBeadColors = {
  A1: "#000000",
  A2: "#390D17",
  A3: "#760411",
  A4: "#02363D",
  A5: "#3D4088",
  A6: "#82343E",
  A7: "#4C4818",
  A8: "#C02B2D",
  A9: "#466755",
  B1: "#0B8259",
  B2: "#98681D",
  B3: "#6D74DA",
  B4: "#817D66",
  B5: "#41A218",
  B6: "#D27764",
  B7: "#958EA8",
  B8: "#75AB3F",
  B9: "#D5969B",
  C1: "#BAAB27",
  C2: "#9CAAFF",
  C3: "#88C07F",
  C4: "#FFB470",
  C5: "#B7C4C2",
  C6: "#78E730",
  C7: "#B8F3FC",
  C8: "#FFEBAF",
  C9: "#FFFFFF"
};

const ORIGINAL_EXPECTED_COUNT_STRINGS = [
  "A1:754 A2:118 A3:45 A4:208 A5:11 A6:1443 A7:1 A8:168 A9:851 B1:29 B3:113 B4:11 B5:92 B7:61 B8:6 B9:8 C1:45 C2:4 C3:43 C4:143 C5:10 C6:4",
  "A1:638 A2:78 A3:32 A4:132 A5:5 A6:1014 A7:2 A8:162 A9:582 B1:24 B2:7 B3:99 B5:64 B6:3 B7:67 B9:10 C1:65 C2:5 C3:50 C4:138 C5:16 C6:22",
  "A1:774 A2:173 A3:72 A4:188 A5:12 A6:1426 A7:9 A8:143 A9:886 B1:28 B3:91 B4:7 B5:71 B7:49 B8:4 B9:19 C1:32 C2:3 C3:58 C4:89 C5:8",
  "A1:696 A2:133 A3:39 A4:223 A5:8 A6:1488 A7:2 A8:105 A9:868 B1:18 B2:14 B3:102 B5:40 B7:86 B9:29 C1:58 C3:164 C4:71 C5:25 C6:247",
  "A1:632 A2:90 A3:59 A4:223 A5:5 A6:1159 A7:5 A8:90 A9:663 B1:17 B2:18 B3:175 B5:40 B6:54 B7:161 B9:10 C1:69 C2:1 C3:672 C4:109 C5:5 C6:821",
  "A1:881 A2:158 A3:90 A4:244 A5:6 A6:1658 A7:34 A8:161 A9:796 B1:21 B3:94 B5:45 B7:37 B9:6 C1:37 C2:10 C3:24 C4:104 C5:11",
  "A1:701 A2:123 A3:52 A4:200 A5:17 A6:1268 A7:4 A8:157 A9:634 B1:27 B2:5 B3:92 B4:4 B5:92 B7:42 B8:2 B9:7 C1:70 C2:3 C3:91 C4:187 C5:7 C6:7",
  "A1:749 A2:114 A3:40 A4:213 A5:10 A6:1469 A8:159 A9:845 B1:34 B2:1 B3:100 B4:12 B5:89 B7:61 B8:5 B9:11 C1:43 C2:2 C3:46 C4:142 C5:7 C6:2"
];

function parseExpectedCounts(value) {
  return Object.fromEntries(value.split(" ").map((entry) => {
    const [code, count] = entry.split(":");
    return [code, Number(count)];
  }));
}

const originalExpectedCounts = ORIGINAL_EXPECTED_COUNT_STRINGS.map(parseExpectedCounts);

const sourceSpecs = [
  {
    actionId: "santoryu-slash",
    actionName: "三刀流·挥刀",
    frameIdPrefix: "zoro-santoryu-slash",
    directory: ORIGINAL_SOURCE_DIRECTORY,
    filename(index) {
      return `zoro-perler-v3-compact-chart-${String(index).padStart(2, "0")}.png`;
    },
    width: 165,
    height: 114,
    sourcePivot: { x: 71, y: 108 },
    colors: originalBeadColors,
    whiteCode: "C6",
    expectedCounts: originalExpectedCounts,
    paletteFamily: "original"
  },
  {
    actionId: "oni-giri-rush",
    actionName: "鬼斩式突进",
    frameIdPrefix: "zoro-oni-giri-rush",
    directory: path.join(ACTION_SOURCE_DIRECTORY, "01_鬼斩式突进"),
    filename(index) {
      return `01_oni_giri-chart-${String(index).padStart(2, "0")}.png`;
    },
    width: 158,
    height: 100,
    sourcePivot: { x: 85, y: 94 },
    colors: actionBeadColors,
    whiteCode: "C9",
    paletteFamily: "role1"
  },
  {
    actionId: "sanzen-sekai-spin",
    actionName: "三千世界回旋",
    frameIdPrefix: "zoro-sanzen-sekai-spin",
    directory: path.join(ACTION_SOURCE_DIRECTORY, "02_三千世界回旋"),
    filename(index) {
      return `02_sanzen_sekai-chart-${String(index).padStart(2, "0")}.png`;
    },
    width: 156,
    height: 98,
    sourcePivot: { x: 71, y: 93 },
    colors: actionBeadColors,
    whiteCode: "C9",
    paletteFamily: "role1"
  },
  {
    actionId: "shishi-sonson-iai",
    actionName: "狮子歌歌居合",
    frameIdPrefix: "zoro-shishi-sonson-iai",
    directory: path.join(ACTION_SOURCE_DIRECTORY, "03_狮子歌歌居合"),
    filename(index) {
      return `03_shishi_sonson-chart-${String(index).padStart(2, "0")}.png`;
    },
    width: 153,
    height: 116,
    sourcePivot: { x: 60, y: 110 },
    colors: actionBeadColors,
    whiteCode: "C9",
    paletteFamily: "role1"
  },
  {
    actionId: "pound-phoenix",
    actionName: "飞翔剑气",
    frameIdPrefix: "zoro-pound-phoenix",
    directory: path.join(ACTION_SOURCE_DIRECTORY, "04_飞翔剑气"),
    filename(index) {
      return `04_pound_phoenix-chart-${String(index).padStart(2, "0")}.png`;
    },
    width: 176,
    height: 101,
    sourcePivot: { x: 74, y: 95 },
    colors: actionBeadColors,
    whiteCode: "C9",
    paletteFamily: "role1"
  },
  {
    actionId: "parry-counter",
    actionName: "格挡反击",
    frameIdPrefix: "zoro-parry-counter",
    directory: path.join(ACTION_SOURCE_DIRECTORY, "05_格挡反击"),
    filename(index) {
      return `05_parry_counter-chart-${String(index).padStart(2, "0")}.png`;
    },
    width: 168,
    height: 115,
    sourcePivot: { x: 75, y: 109 },
    colors: actionBeadColors,
    whiteCode: "C9",
    paletteFamily: "role1"
  },
  {
    actionId: "aerial-twister",
    actionName: "空中龙卷下劈",
    frameIdPrefix: "zoro-aerial-twister",
    directory: path.join(ACTION_SOURCE_DIRECTORY, "06_空中龙卷下劈"),
    filename(index) {
      return `06_aerial_twister-chart-${String(index).padStart(2, "0")}.png`;
    },
    width: 143,
    height: 139,
    sourcePivot: { x: 73, y: 74 },
    colors: actionBeadColors,
    whiteCode: "C9",
    paletteFamily: "role1"
  }
];

const layers = [
  { id: "body", name: "轮廓与身体", visible: true, locked: false, opacity: 1 },
  { id: "costume", name: "服装与腰带", visible: true, locked: false, opacity: 1 },
  { id: "face", name: "头发与肤色", visible: true, locked: false, opacity: 1 },
  { id: "prop", name: "三把刀与特效", visible: true, locked: false, opacity: 1 }
];

const palette = ["#00000000"];
const paletteIndexByHex = new Map();
for (const colors of [originalBeadColors, actionBeadColors]) {
  for (const color of Object.values(colors)) {
    const normalized = color.toUpperCase();
    if (paletteIndexByHex.has(normalized)) continue;
    palette.push(normalized);
    paletteIndexByHex.set(normalized, palette.length - 1);
  }
}

function decodePng(filename) {
  const source = fs.readFileSync(filename);
  if (!source.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error(`${filename} is not a PNG image`);
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
    cursor += length + 12;
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
    throw new Error(`Unsupported PNG format: depth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`);
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

function colorKeyAt(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function createColorLookup(spec) {
  return new Map(
    Object.entries(spec.colors)
      .filter(([code]) => code !== spec.whiteCode)
      .map(([code, color]) => [color.slice(1).toUpperCase(), code])
  );
}

function readCell(image, column, row, colorLookup) {
  const left = GRID_LEFT + column * CELL_SIZE;
  const top = GRID_TOP + row * CELL_SIZE;
  const colorCounts = new Map();
  const rawColorCounts = new Map();
  let inkScore = 0;
  let whiteCount = 0;
  // Staying two pixels inside the cell excludes thin and ten-cell grid lines.
  // The printed two-character bead code remains, allowing white beads to be
  // distinguished from genuinely empty white cells.
  for (let y = top + 2; y <= top + 11; y += 1) {
    for (let x = left + 2; x <= left + 11; x += 1) {
      const key = colorKeyAt(image, x, y);
      if (key === "FFFFFF") whiteCount += 1;
      else rawColorCounts.set(key, (rawColorCounts.get(key) ?? 0) + 1);
      const code = colorLookup.get(key);
      if (code) colorCounts.set(code, (colorCounts.get(code) ?? 0) + 1);
      const red = Number.parseInt(key.slice(0, 2), 16);
      const green = Number.parseInt(key.slice(2, 4), 16);
      const blue = Number.parseInt(key.slice(4, 6), 16);
      if (Math.min(red, green, blue) < 225) inkScore += 1;
    }
  }
  let selectedCode;
  let selectedCount = 0;
  for (const [code, count] of colorCounts) {
    if (count > selectedCount) {
      selectedCode = code;
      selectedCount = count;
    }
  }
  let dominantRawKey;
  let dominantRawCount = 0;
  for (const [key, count] of rawColorCounts) {
    if (count > dominantRawCount) {
      dominantRawKey = key;
      dominantRawCount = count;
    }
  }
  return {
    column,
    row,
    code: selectedCode,
    inkScore,
    whiteCount,
    selectedCount,
    dominantRawKey,
    dominantRawCount
  };
}

function validateExpectedCounts(filename, cells, spec, expectedCounts) {
  const paletteCodes = Object.keys(spec.colors);
  const counts = Object.fromEntries(paletteCodes.map((code) => [code, 0]));
  for (const cell of cells) if (cell.code) counts[cell.code] += 1;
  for (const code of paletteCodes) {
    const expected = expectedCounts[code] ?? 0;
    if (counts[code] !== expected) {
      throw new Error(`${path.basename(filename)} ${code}: extracted ${counts[code]}, expected ${expected}`);
    }
  }
  return counts;
}

function extractChart(filename, spec, expectedCounts) {
  const image = decodePng(filename);
  const expectedWidth = GRID_LEFT + spec.width * CELL_SIZE + 28;
  const requiredHeight = GRID_TOP + spec.height * CELL_SIZE;
  if (image.width !== expectedWidth || image.height < requiredHeight) {
    throw new Error(
      `${path.basename(filename)} has unexpected page ${image.width}x${image.height}; ` +
      `expected width ${expectedWidth} and height >= ${requiredHeight}`
    );
  }

  const colorLookup = createColorLookup(spec);
  const cells = [];
  for (let row = 0; row < spec.height; row += 1) {
    for (let column = 0; column < spec.width; column += 1) {
      cells.push(readCell(image, column, row, colorLookup));
    }
  }

  const whiteCandidates = cells
    .filter((cell) => !cell.code && cell.whiteCount >= 16 && cell.inkScore >= 4)
    .sort((left, right) => left.row - right.row || left.column - right.column);

  if (expectedCounts) {
    const neededWhiteBeads = expectedCounts[spec.whiteCode] ?? 0;
    const rankedCandidates = cells
      .filter((cell) => !cell.code && cell.whiteCount >= 16)
      .sort((left, right) => right.inkScore - left.inkScore || left.row - right.row || left.column - right.column);
    const selected = rankedCandidates.slice(0, neededWhiteBeads);
    const rejected = rankedCandidates[neededWhiteBeads];
    const minimumSelectedScore = selected.at(-1)?.inkScore ?? Number.POSITIVE_INFINITY;
    const maximumRejectedScore = rejected?.inkScore ?? -1;
    if (neededWhiteBeads > 0 && (minimumSelectedScore < 4 || minimumSelectedScore <= maximumRejectedScore)) {
      throw new Error(
        `${path.basename(filename)} cannot separate ${neededWhiteBeads} white beads: ` +
        `selected score ${minimumSelectedScore}, rejected score ${maximumRejectedScore}`
      );
    }
    for (const cell of selected) cell.code = spec.whiteCode;
  } else {
    for (const cell of whiteCandidates) cell.code = spec.whiteCode;
  }

  const ambiguousEmptyCells = cells.filter((cell) => !cell.code && cell.inkScore > 0);
  if (ambiguousEmptyCells.length > 0) {
    const worst = ambiguousEmptyCells.sort((left, right) => right.inkScore - left.inkScore)[0];
    const unknownColors = [...new Set(
      ambiguousEmptyCells
        .filter((cell) => cell.whiteCount < 16 && cell.dominantRawKey)
        .map((cell) => `#${cell.dominantRawKey}`)
    )].slice(0, 12).join(", ");
    throw new Error(
      `${path.basename(filename)} has ${ambiguousEmptyCells.length} ambiguous empty cells; ` +
      `highest ink score ${worst.inkScore} at (${worst.column}, ${worst.row}); ` +
      `unknown dominant colors: ${unknownColors || "none"}`
    );
  }

  const coloredCells = cells.filter((cell) => cell.code && cell.code !== spec.whiteCode);
  const weakColoredCell = coloredCells.find((cell) => cell.selectedCount < 16);
  if (weakColoredCell) {
    throw new Error(
      `${path.basename(filename)} weak color match ${weakColoredCell.code} at ` +
      `(${weakColoredCell.column}, ${weakColoredCell.row}), count=${weakColoredCell.selectedCount}`
    );
  }

  const counts = expectedCounts
    ? validateExpectedCounts(filename, cells, spec, expectedCounts)
    : Object.fromEntries(Object.keys(spec.colors).map((code) => [
        code,
        cells.filter((cell) => cell.code === code).length
      ]));
  return {
    cells,
    counts,
    total: cells.filter((cell) => cell.code).length,
    whiteBeads: cells.filter((cell) => cell.code === spec.whiteCode).length
  };
}

function emptyPixels() {
  return Array.from({ length: CANVAS.width * CANVAS.height }, () => 0);
}

function layerFor(spec, code) {
  if (spec.paletteFamily === "original") {
    if (["A2", "A3", "A5", "A6", "A7", "A9", "B4", "B8"].includes(code)) return "costume";
    if (["B5", "B9", "C1", "C4", "C5"].includes(code)) return "face";
    if (["A8", "B2", "B3", "B6", "B7", "C2", "C3", "C6"].includes(code)) return "prop";
    return "body";
  }
  if (["A2", "A3", "A4", "A6", "A8", "A9", "B1", "B5", "B8", "C6"].includes(code)) return "costume";
  if (["B2", "B6", "B9", "C3", "C4", "C8"].includes(code)) return "face";
  if (["A5", "A7", "B3", "B4", "B7", "C1", "C2", "C5", "C7", "C9"].includes(code)) return "prop";
  return "body";
}

function buildAction(spec) {
  const offsetX = PIVOT.x - spec.sourcePivot.x;
  const offsetY = PIVOT.y - spec.sourcePivot.y;
  if (
    offsetX < 0 || offsetY < 0 ||
    offsetX + spec.width > CANVAS.width ||
    offsetY + spec.height > CANVAS.height
  ) {
    throw new Error(`${spec.actionId} does not fit the shared canvas at offset ${offsetX},${offsetY}`);
  }

  const extractedFrames = Array.from({ length: 8 }, (_, frameIndex) => {
    const filename = path.join(spec.directory, spec.filename(frameIndex + 1));
    if (!fs.existsSync(filename)) throw new Error(`Missing source chart: ${filename}`);
    return {
      filename,
      ...extractChart(filename, spec, spec.expectedCounts?.[frameIndex])
    };
  });

  const frames = extractedFrames.map(({ cells }, frameIndex) => {
    const layerPixels = Object.fromEntries(layers.map((layer) => [layer.id, emptyPixels()]));
    for (const cell of cells) {
      if (!cell.code) continue;
      const x = cell.column + offsetX;
      const y = cell.row + offsetY;
      const color = spec.colors[cell.code].toUpperCase();
      const paletteIndex = paletteIndexByHex.get(color);
      if (!paletteIndex) throw new Error(`Missing project palette color ${color}`);
      layerPixels[layerFor(spec, cell.code)][y * CANVAS.width + x] = paletteIndex;
    }
    return {
      id: `${spec.frameIdPrefix}-${String(frameIndex + 1).padStart(2, "0")}`,
      name: `帧 ${frameIndex + 1}`,
      durationMs: 100,
      cels: Object.fromEntries(layers.map((layer) => [layer.id, {
        pixels: layerPixels[layer.id],
        offsetX: 0,
        offsetY: 0
      }])),
      pivot: { ...PIVOT }
    };
  });

  return {
    action: {
      id: spec.actionId,
      name: spec.actionName,
      loop: true,
      frames
    },
    extractedFrames,
    offsetX,
    offsetY
  };
}

const builtActions = sourceSpecs.map(buildAction);
const now = "2026-08-07T00:00:00.000Z";
const project = {
  version: 1,
  id: "zoro-santoryu",
  name: "索隆·三刀流",
  createdAt: now,
  updatedAt: now,
  canvas: { ...CANVAS },
  palette,
  layers,
  actions: builtActions.map(({ action }) => action)
};

const frameIds = project.actions.flatMap((action) => action.frames.map((frame) => frame.id));
if (new Set(frameIds).size !== frameIds.length) throw new Error("Duplicate frame IDs detected");
if (palette.length > 256) throw new Error(`Project palette has ${palette.length} entries; maximum is 256`);
for (const action of project.actions) {
  if (action.frames.length !== 8) throw new Error(`${action.id} must contain exactly 8 approved source frames`);
  for (const frame of action.frames) {
    if (frame.pivot.x !== PIVOT.x || frame.pivot.y !== PIVOT.y) {
      throw new Error(`${frame.id} has a moving pivot`);
    }
    for (const layer of layers) {
      if (frame.cels[layer.id].pixels.length !== CANVAS.width * CANVAS.height) {
        throw new Error(`${frame.id}/${layer.id} has an invalid cel length`);
      }
    }
  }
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(project), "utf8");
console.log(
  `Generated ${OUTPUT}: ${CANVAS.width}x${CANVAS.height}, ` +
  `${project.actions.length} actions, ${frameIds.length} frames, ${palette.length} palette entries`
);
for (let actionIndex = 0; actionIndex < builtActions.length; actionIndex += 1) {
  const spec = sourceSpecs[actionIndex];
  const built = builtActions[actionIndex];
  const frameSummary = built.extractedFrames
    .map((frame, index) => `${index + 1}:${frame.total}${frame.whiteBeads ? `(white=${frame.whiteBeads})` : ""}`)
    .join(" ");
  console.log(
    `${spec.actionId} source=${spec.width}x${spec.height} offset=${built.offsetX},${built.offsetY} ` +
    `pivot=${PIVOT.x},${PIVOT.y} totals=[${frameSummary}]`
  );
}
