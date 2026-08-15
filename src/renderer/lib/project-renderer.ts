interface DrawableFrame {
  id: string;
  durationMs: number;
  cels: Record<string, { pixels: ArrayLike<number>; offsetX: number; offsetY: number }>;
}

interface DrawableAction {
  id: string;
  name: string;
  loop: boolean;
  frames: DrawableFrame[];
}

interface DrawableProject {
  canvas: { width: number; height: number };
  palette: string[];
  layers: Array<{ id: string; visible: boolean; opacity: number }>;
  actions: DrawableAction[];
  cover?: { actionId: string; frameId: string };
}

export interface DrawProjectOptions {
  maxSize: number;
  bottomPadding?: number;
  flip?: boolean;
}

export function findProjectAction(project: DrawableProject, actionId: string): DrawableAction {
  return project.actions.find((action) => action.id === actionId) ?? project.actions[0]!;
}

export function frameAtElapsed(
  action: DrawableAction,
  elapsedMs: number,
  speed = 1
): DrawableFrame | undefined {
  if (!action.frames.length) return undefined;
  const duration = action.frames.reduce((total, frame) => total + frame.durationMs, 0);
  if (duration <= 0) return action.frames[0];
  let cursor = Math.max(0, elapsedMs * speed);
  if (action.loop) cursor %= duration;
  else cursor = Math.min(cursor, duration - 1);
  for (const frame of action.frames) {
    cursor -= frame.durationMs;
    if (cursor < 0) return frame;
  }
  return action.frames.at(-1);
}

export function drawProjectFrame(
  context: CanvasRenderingContext2D,
  project: DrawableProject,
  frame: DrawableFrame | undefined,
  options: DrawProjectOptions
): void {
  const canvasWidth = context.canvas.width;
  const canvasHeight = context.canvas.height;
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  if (!frame) return;

  const logicalWidth = project.canvas.width;
  const logicalHeight = project.canvas.height;
  const bottomPadding = options.bottomPadding ?? 4;
  const requestedPixelSize = Math.max(
    1,
    Math.round(options.maxSize / Math.max(logicalWidth, logicalHeight))
  );
  const fittingPixelSize = Math.max(
    1,
    Math.floor(Math.min(canvasWidth / logicalWidth, (canvasHeight - bottomPadding) / logicalHeight))
  );
  const pixelSize = Math.min(requestedPixelSize, fittingPixelSize);
  const width = logicalWidth * pixelSize;
  const height = logicalHeight * pixelSize;
  const destinationX = Math.round((canvasWidth - width) / 2);
  const destinationY = Math.round(canvasHeight - height - bottomPadding);

  context.save();
  context.imageSmoothingEnabled = false;
  if (options.flip) {
    context.translate(canvasWidth, 0);
    context.scale(-1, 1);
  }
  const originX = options.flip ? canvasWidth - destinationX - width : destinationX;
  for (const layer of project.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const cel = frame.cels[layer.id];
    if (!cel) continue;
    context.globalAlpha = layer.opacity;
    for (let index = 0; index < cel.pixels.length; index += 1) {
      const colorIndex = cel.pixels[index] ?? 0;
      if (colorIndex === 0) continue;
      const color = project.palette[colorIndex];
      if (!color || color === "#00000000") continue;
      const x = (index % logicalWidth) + cel.offsetX;
      const y = Math.floor(index / logicalWidth) + cel.offsetY;
      if (x < 0 || y < 0 || x >= logicalWidth || y >= logicalHeight) continue;
      context.fillStyle = color;
      context.fillRect(originX + x * pixelSize, destinationY + y * pixelSize, pixelSize, pixelSize);
    }
  }
  context.restore();
}

export function drawProjectThumbnail(
  context: CanvasRenderingContext2D,
  project: DrawableProject,
  selectedFrame?: DrawableFrame
): void {
  const action = project.actions.find((candidate) => candidate.id === project.cover?.actionId)
    ?? project.actions[0];
  const frame = selectedFrame
    ?? action?.frames.find((candidate) => candidate.id === project.cover?.frameId)
    ?? action?.frames[0];
  const canvasWidth = context.canvas.width;
  const canvasHeight = context.canvas.height;
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  if (!frame) return;

  // Cover frames may use negative cel offsets or extend beyond the logical
  // project canvas (weapons and effects commonly do). The normal renderer
  // intentionally clips those pixels, but a library thumbnail should fit the
  // complete visible silhouette instead.
  const visiblePixels: Array<{ x: number; y: number; color: string; opacity: number }> = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const layer of project.layers) {
    if (!layer.visible) continue;
    const cel = frame.cels[layer.id];
    if (!cel) continue;
    for (let index = 0; index < cel.pixels.length; index += 1) {
      const paletteIndex = cel.pixels[index] ?? 0;
      if (!paletteIndex) continue;
      const color = project.palette[paletteIndex];
      if (!color || color === "#00000000") continue;
      const x = (index % project.canvas.width) + cel.offsetX;
      const y = Math.floor(index / project.canvas.width) + cel.offsetY;
      visiblePixels.push({ x, y, color, opacity: layer.opacity });
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!visiblePixels.length) return;
  const padding = 10;
  const contentWidth = maxX - minX + 1;
  const contentHeight = maxY - minY + 1;
  const pixelSize = Math.max(
    1,
    Math.floor(Math.min((canvasWidth - padding * 2) / contentWidth, (canvasHeight - padding * 2) / contentHeight))
  );
  const drawWidth = contentWidth * pixelSize;
  const drawHeight = contentHeight * pixelSize;
  const originX = Math.floor((canvasWidth - drawWidth) / 2) - minX * pixelSize;
  const originY = Math.floor((canvasHeight - drawHeight) / 2) - minY * pixelSize;

  context.save();
  context.imageSmoothingEnabled = false;
  for (const pixel of visiblePixels) {
    context.globalAlpha = pixel.opacity;
    context.fillStyle = pixel.color;
    context.fillRect(originX + pixel.x * pixelSize, originY + pixel.y * pixelSize, pixelSize, pixelSize);
  }
  context.restore();
}
