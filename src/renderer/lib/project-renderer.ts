import type { EditorAction, EditorFrame, EditorProject } from "../../shared/editor-project";

export interface DrawProjectOptions {
  maxSize: number;
  bottomPadding?: number;
  flip?: boolean;
}

export function findProjectAction(project: EditorProject, actionId: string): EditorAction {
  return project.actions.find((action) => action.id === actionId) ?? project.actions[0]!;
}

export function frameAtElapsed(
  action: EditorAction,
  elapsedMs: number,
  speed = 1
): EditorFrame | undefined {
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
  project: EditorProject,
  frame: EditorFrame | undefined,
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
  project: EditorProject
): void {
  const action = project.actions[0];
  drawProjectFrame(context, project, action?.frames[0], {
    maxSize: Math.min(context.canvas.width, context.canvas.height) - 8,
    bottomPadding: Math.max(4, Math.round((context.canvas.height - Math.min(context.canvas.width, context.canvas.height)) / 2))
  });
}
