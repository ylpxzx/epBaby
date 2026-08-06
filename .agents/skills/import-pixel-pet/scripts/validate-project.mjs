import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [, , projectFile, requestedFrameCount] = process.argv;
if (!projectFile) {
  console.error("Usage: node validate-project.mjs <project.json> [expected-frames-per-action]");
  process.exit(1);
}

const filename = path.resolve(projectFile);
const project = JSON.parse(fs.readFileSync(filename, "utf8").replace(/^\uFEFF/, ""));
const expectedFrames = requestedFrameCount === undefined ? undefined : Number(requestedFrameCount);
const errors = [];
const actionReport = {};

if (project.version !== 1) errors.push("version must be 1");
if (!project.id || !/^[a-zA-Z0-9_-]+$/.test(project.id)) errors.push("project id is invalid");
if (!Number.isInteger(project.canvas?.width) || project.canvas.width < 1 || project.canvas.width > 128) errors.push("canvas width must be an integer from 1 to 128");
if (!Number.isInteger(project.canvas?.height) || project.canvas.height < 1 || project.canvas.height > 128) errors.push("canvas height must be an integer from 1 to 128");
if (!Array.isArray(project.palette) || project.palette.length < 2 || project.palette.length > 256) errors.push("palette must contain 2 to 256 colors");
else if (project.palette[0] !== "#00000000") errors.push("palette index 0 must be #00000000");
if (!Array.isArray(project.layers) || !project.layers.length) errors.push("project has no layers");
if (!Array.isArray(project.actions) || !project.actions.length) errors.push("project has no actions");

const width = Number(project.canvas?.width) || 0;
const height = Number(project.canvas?.height) || 0;
const expectedPixels = width * height;
const layerIds = new Set();
for (const layer of project.layers ?? []) {
  if (!layer.id || layerIds.has(layer.id)) errors.push(`duplicate or empty layer id: ${layer.id ?? ""}`);
  layerIds.add(layer.id);
}

for (const action of project.actions ?? []) {
  const hashes = new Set();
  const frames = Array.isArray(action.frames) ? action.frames : [];
  if (!frames.length) errors.push(`${action.id}: action has no frames`);
  if (expectedFrames !== undefined && frames.length !== expectedFrames) errors.push(`${action.id}: expected ${expectedFrames} frames, found ${frames.length}`);
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];
    if (!Number.isFinite(frame.durationMs) || frame.durationMs < 20 || frame.durationMs > 5000) errors.push(`${action.id}/${frameIndex}: invalid duration`);
    if (!Number.isInteger(frame.pivot?.x) || !Number.isInteger(frame.pivot?.y) || frame.pivot.x < 0 || frame.pivot.y < 0 || frame.pivot.x >= width || frame.pivot.y >= height) errors.push(`${action.id}/${frameIndex}: pivot is outside the canvas`);
    const framePixels = [];
    for (const layer of project.layers ?? []) {
      const cel = frame.cels?.[layer.id];
      if (!cel || !Array.isArray(cel.pixels) || cel.pixels.length !== expectedPixels) {
        errors.push(`${action.id}/${frameIndex}/${layer.id}: expected ${expectedPixels} pixels`);
        continue;
      }
      if (!Number.isInteger(cel.offsetX) || !Number.isInteger(cel.offsetY)) errors.push(`${action.id}/${frameIndex}/${layer.id}: cel offsets must be integers`);
      for (const value of cel.pixels) {
        if (!Number.isInteger(value) || value < 0 || value >= project.palette.length) {
          errors.push(`${action.id}/${frameIndex}/${layer.id}: invalid palette index ${value}`);
          break;
        }
      }
      framePixels.push(cel.pixels);
    }
    hashes.add(crypto.createHash("sha1").update(JSON.stringify(framePixels)).digest("hex"));
  }
  actionReport[action.id] = { frames: frames.length, uniqueCompositeStates: hashes.size };
}

const report = {
  file: filename,
  id: project.id,
  name: project.name,
  canvas: project.canvas,
  paletteColors: project.palette?.length ?? 0,
  layers: project.layers?.length ?? 0,
  actions: actionReport,
  totalFrames: (project.actions ?? []).reduce((total, action) => total + (action.frames?.length ?? 0), 0),
  bytes: fs.statSync(filename).size,
  errors
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
