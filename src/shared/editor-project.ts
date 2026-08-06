export const EDITOR_PROJECT_VERSION = 1;
export const MAX_EDITOR_CANVAS_SIZE = 128;

export interface EditorCanvasSize {
  width: number;
  height: number;
}

export type EditorCanvasAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export interface EditorLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export interface EditorCelData {
  pixels: number[];
  offsetX: number;
  offsetY: number;
}

export interface EditorFrame {
  id: string;
  name: string;
  durationMs: number;
  cels: Record<string, EditorCelData>;
  pivot: { x: number; y: number };
}

export interface EditorAction {
  id: string;
  name: string;
  loop: boolean;
  frames: EditorFrame[];
}

export interface EditorProject {
  version: typeof EDITOR_PROJECT_VERSION;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  canvas: EditorCanvasSize;
  palette: string[];
  layers: EditorLayer[];
  actions: EditorAction[];
}

export interface EditorProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  width: number;
  height: number;
  actionCount: number;
}

export interface EditorPetManifest {
  version: 1;
  id: string;
  name: string;
  canvas: EditorCanvasSize;
  actions: Array<{
    id: string;
    name: string;
    loop: boolean;
    frames: Array<{
      file: string;
      durationMs: number;
      pivot: { x: number; y: number };
    }>;
  }>;
}

export interface EditorExportBundle {
  manifest: EditorPetManifest;
  images: Array<{ file: string; dataUrl: string }>;
}

export interface EditorExportResult {
  canceled: boolean;
  path?: string;
}

const DEFAULT_PALETTE = [
  "#00000000",
  "#171a1f",
  "#ffffff",
  "#b8ee49",
  "#7dbb27",
  "#f6c36b",
  "#f28c62",
  "#e35d6a",
  "#84c7b3",
  "#5d947f",
  "#8aa8d8",
  "#756bb1",
  "#d2b7a0",
  "#9d6d55",
  "#8f969f",
  "#4e555e"
];

export function createEditorId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

export function createEmptyCel(canvas: EditorCanvasSize): EditorCelData {
  return {
    pixels: Array.from({ length: canvas.width * canvas.height }, () => 0),
    offsetX: 0,
    offsetY: 0
  };
}

export function createEditorFrame(
  canvas: EditorCanvasSize,
  layers: EditorLayer[],
  name = "帧 1"
): EditorFrame {
  return {
    id: createEditorId("frame"),
    name,
    durationMs: 180,
    cels: Object.fromEntries(layers.map((layer) => [layer.id, createEmptyCel(canvas)])),
    pivot: { x: Math.floor(canvas.width / 2), y: canvas.height - 1 }
  };
}

export function createEditorProject(
  name = "我的像素宠物",
  canvas: EditorCanvasSize = { width: 32, height: 32 }
): EditorProject {
  const safeCanvas = {
    width: Math.max(1, Math.min(MAX_EDITOR_CANVAS_SIZE, Math.round(canvas.width))),
    height: Math.max(1, Math.min(MAX_EDITOR_CANVAS_SIZE, Math.round(canvas.height)))
  };
  const now = new Date().toISOString();
  const baseLayer: EditorLayer = {
    id: createEditorId("layer"),
    name: "主体",
    visible: true,
    locked: false,
    opacity: 1
  };
  return {
    version: EDITOR_PROJECT_VERSION,
    id: createEditorId("pet"),
    name,
    createdAt: now,
    updatedAt: now,
    canvas: safeCanvas,
    palette: [...DEFAULT_PALETTE],
    layers: [baseLayer],
    actions: [
      {
        id: createEditorId("action"),
        name: "待机",
        loop: true,
        frames: [createEditorFrame(safeCanvas, [baseLayer])]
      }
    ]
  };
}

export function cloneEditorProject(project: EditorProject): EditorProject {
  return structuredClone(project);
}

function anchorOffset(delta: number, placement: "start" | "center" | "end"): number {
  if (placement === "start") return 0;
  if (placement === "end") return delta;
  return Math.floor(delta / 2);
}

export function resizeEditorProject(
  source: EditorProject,
  requestedCanvas: EditorCanvasSize,
  anchor: EditorCanvasAnchor = "center"
): EditorProject {
  const project = cloneEditorProject(source);
  const previousCanvas = { ...project.canvas };
  const canvas = {
    width: Math.max(1, Math.min(MAX_EDITOR_CANVAS_SIZE, Math.round(requestedCanvas.width))),
    height: Math.max(1, Math.min(MAX_EDITOR_CANVAS_SIZE, Math.round(requestedCanvas.height)))
  };
  if (canvas.width === previousCanvas.width && canvas.height === previousCanvas.height) return project;

  const horizontal = anchor.endsWith("left") || anchor === "left"
    ? "start"
    : anchor.endsWith("right") || anchor === "right"
      ? "end"
      : "center";
  const vertical = anchor.startsWith("top")
    ? "start"
    : anchor.startsWith("bottom")
      ? "end"
      : "center";
  const shiftX = anchorOffset(canvas.width - previousCanvas.width, horizontal);
  const shiftY = anchorOffset(canvas.height - previousCanvas.height, vertical);

  for (const action of project.actions) {
    for (const frame of action.frames) {
      for (const layer of project.layers) {
        const cel = frame.cels[layer.id];
        if (!cel) continue;
        const pixels = Array.from({ length: canvas.width * canvas.height }, () => 0);
        for (let index = 0; index < cel.pixels.length; index += 1) {
          const paletteIndex = cel.pixels[index] ?? 0;
          if (!paletteIndex) continue;
          const sourceX = index % previousCanvas.width;
          const sourceY = Math.floor(index / previousCanvas.width);
          const targetX = sourceX + cel.offsetX + shiftX;
          const targetY = sourceY + cel.offsetY + shiftY;
          if (targetX < 0 || targetY < 0 || targetX >= canvas.width || targetY >= canvas.height) continue;
          pixels[targetY * canvas.width + targetX] = paletteIndex;
        }
        cel.pixels = pixels;
        cel.offsetX = 0;
        cel.offsetY = 0;
      }
      frame.pivot = {
        x: Math.max(0, Math.min(canvas.width - 1, frame.pivot.x + shiftX)),
        y: Math.max(0, Math.min(canvas.height - 1, frame.pivot.y + shiftY))
      };
    }
  }
  project.canvas = canvas;
  project.updatedAt = new Date().toISOString();
  return project;
}

export function normalizeEditorProject(value: unknown): EditorProject {
  if (!value || typeof value !== "object") return createEditorProject();
  const source = value as Partial<EditorProject>;
  const canvas = {
    width: Math.max(1, Math.min(MAX_EDITOR_CANVAS_SIZE, Math.round(Number(source.canvas?.width) || 32))),
    height: Math.max(1, Math.min(MAX_EDITOR_CANVAS_SIZE, Math.round(Number(source.canvas?.height) || 32)))
  };
  const project = createEditorProject(
    typeof source.name === "string" && source.name.trim() ? source.name.trim() : "我的像素宠物",
    canvas
  );
  project.id = typeof source.id === "string" && source.id ? source.id : project.id;
  project.createdAt = typeof source.createdAt === "string" ? source.createdAt : project.createdAt;
  project.updatedAt = typeof source.updatedAt === "string" ? source.updatedAt : project.updatedAt;
  project.palette = Array.isArray(source.palette)
    ? source.palette.slice(0, 256).map((color) => (typeof color === "string" ? color : "#00000000"))
    : project.palette;
  if (project.palette[0] !== "#00000000") project.palette[0] = "#00000000";

  const sourceLayers = Array.isArray(source.layers) ? source.layers : [];
  if (sourceLayers.length) {
    project.layers = sourceLayers.map((layer, index) => ({
      id: typeof layer.id === "string" && layer.id ? layer.id : createEditorId("layer"),
      name: typeof layer.name === "string" && layer.name ? layer.name : `图层 ${index + 1}`,
      visible: layer.visible !== false,
      locked: layer.locked === true,
      opacity: Math.max(0, Math.min(1, layer.opacity === undefined ? 1 : Number(layer.opacity)))
    }));
  }

  const expectedPixels = canvas.width * canvas.height;
  const sourceActions = Array.isArray(source.actions) ? source.actions : [];
  if (sourceActions.length) {
    project.actions = sourceActions.map((action, actionIndex) => {
      const frames = Array.isArray(action.frames) && action.frames.length ? action.frames : [];
      return {
        id: typeof action.id === "string" && action.id ? action.id : createEditorId("action"),
        name: typeof action.name === "string" && action.name ? action.name : `动作 ${actionIndex + 1}`,
        loop: action.loop !== false,
        frames: (frames.length ? frames : [createEditorFrame(canvas, project.layers)]).map((frame, frameIndex) => ({
          id: typeof frame.id === "string" && frame.id ? frame.id : createEditorId("frame"),
          name: typeof frame.name === "string" && frame.name ? frame.name : `帧 ${frameIndex + 1}`,
          durationMs: Math.max(20, Math.min(5000, Math.round(Number(frame.durationMs) || 180))),
          pivot: {
            x: Math.max(0, Math.min(canvas.width - 1, Math.round(Number(frame.pivot?.x) || 0))),
            y: Math.max(0, Math.min(canvas.height - 1, Math.round(Number(frame.pivot?.y) || 0)))
          },
          cels: Object.fromEntries(
            project.layers.map((layer) => {
              const sourceCel = frame.cels?.[layer.id];
              const pixels = Array.isArray(sourceCel?.pixels)
                ? sourceCel.pixels.slice(0, expectedPixels).map((pixel) =>
                    Math.max(0, Math.min(project.palette.length - 1, Math.round(Number(pixel) || 0)))
                  )
                : [];
              while (pixels.length < expectedPixels) pixels.push(0);
              return [
                layer.id,
                {
                  pixels,
                  offsetX: Math.round(Number(sourceCel?.offsetX) || 0),
                  offsetY: Math.round(Number(sourceCel?.offsetY) || 0)
                }
              ];
            })
          )
        }))
      };
    });
  }

  return project;
}

export function projectSummary(project: EditorProject): EditorProjectSummary {
  return {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    width: project.canvas.width,
    height: project.canvas.height,
    actionCount: project.actions.length
  };
}
