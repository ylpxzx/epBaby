import {
  MAX_EDITOR_CANVAS_SIZE,
  cloneEditorProject,
  createEditorFrame,
  createEditorId,
  createEditorProject,
  createEmptyCel,
  normalizeEditorProject,
  resizeEditorProject,
  type EditorCanvasAnchor,
  type EditorAction,
  type EditorExportBundle,
  type EditorFrame,
  type EditorLayer,
  type EditorProject
} from "../../shared/editor-project";
import { EditorHistory, type PixelChange } from "./history";
import "../styles/editor.css";

type Tool = "pencil" | "eraser" | "fill" | "eyedropper";

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing editor element: ${selector}`);
  return element;
}

const canvas = required<HTMLCanvasElement>("#editor-canvas");
const previewCanvas = required<HTMLCanvasElement>("#preview-canvas");

function canvas2d(element: HTMLCanvasElement): CanvasRenderingContext2D {
  const value = element.getContext("2d", { alpha: true });
  if (!value) throw new Error("Canvas 2D is unavailable");
  return value;
}

const context = canvas2d(canvas);
const previewContext = canvas2d(previewCanvas);

const projectName = required<HTMLInputElement>("#project-name");
const projectPicker = required<HTMLSelectElement>("#project-picker");
const saveStatus = required<HTMLElement>("#save-status");
const canvasSummary = required<HTMLElement>("#canvas-summary");
const pointerPosition = required<HTMLElement>("#pointer-position");
const zoomInput = required<HTMLInputElement>("#zoom");
const zoomValue = required<HTMLOutputElement>("#zoom-value");
const actionPicker = required<HTMLSelectElement>("#action-picker");
const actionName = required<HTMLInputElement>("#action-name");
const actionLoop = required<HTMLInputElement>("#action-loop");
const layerList = required<HTMLDivElement>("#layer-list");
const layerName = required<HTMLInputElement>("#layer-name");
const paletteElement = required<HTMLDivElement>("#palette");
const customColor = required<HTMLInputElement>("#custom-color");
const frameList = required<HTMLDivElement>("#frame-list");
const frameDuration = required<HTMLInputElement>("#frame-duration");
const timelineMeta = required<HTMLElement>("#timeline-meta");
const activeActionLabel = required<HTMLElement>("#active-action-label");
const activeFrameLabel = required<HTMLElement>("#active-frame-label");
const onionSkin = required<HTMLInputElement>("#onion-skin");
const previewToggle = required<HTMLButtonElement>("#preview-toggle");
const undoButton = required<HTMLButtonElement>("#undo");
const redoButton = required<HTMLButtonElement>("#redo");
const newProjectDialog = required<HTMLDialogElement>("#new-project-dialog");
const newProjectForm = required<HTMLFormElement>("#new-project-form");
const newProjectName = required<HTMLInputElement>("#new-project-name");
const newCanvasWidth = required<HTMLInputElement>("#new-canvas-width");
const newCanvasHeight = required<HTMLInputElement>("#new-canvas-height");
const newCanvasSquare = required<HTMLInputElement>("#new-canvas-square");
const newActionName = required<HTMLInputElement>("#new-action-name");
const newPalette = required<HTMLSelectElement>("#new-palette");
const resizeCanvasDialog = required<HTMLDialogElement>("#resize-canvas-dialog");
const resizeCanvasForm = required<HTMLFormElement>("#resize-canvas-form");
const resizeCanvasWidth = required<HTMLInputElement>("#resize-canvas-width");
const resizeCanvasHeight = required<HTMLInputElement>("#resize-canvas-height");
const resizeCanvasSquare = required<HTMLInputElement>("#resize-canvas-square");
const resizeSummary = required<HTMLElement>("#resize-summary");
const resizeWarning = required<HTMLElement>("#resize-warning");

let project = createEditorProject();
let selectedActionId = project.actions[0]!.id;
let selectedFrameId = project.actions[0]!.frames[0]!.id;
let selectedLayerId = project.layers[0]!.id;
let selectedColorIndex = 3;
let activeTool: Tool = "pencil";
let zoom = 16;
let drawing = false;
let dirty = true;
let strokeChanges = new Map<number, PixelChange>();
let previewPlaying = false;
let previewFrameIndex = 0;
let previewFrameStartedAt = performance.now();
let requestedProjectId: string | undefined;
let initialized = false;
let selectedCanvasAnchor: EditorCanvasAnchor = "center";
const history = new EditorHistory();

const ALTERNATE_PALETTES: Record<string, string[]> = {
  pastel: [
    "#00000000", "#25232b", "#fff9f0", "#b8dfa1", "#6fa888", "#f4cf8f", "#e99a82",
    "#d86f82", "#9ecdd1", "#6f9cab", "#a7addb", "#8278ad", "#d7b9a7", "#a57867",
    "#a8adb5", "#5d626b"
  ],
  mono: [
    "#00000000", "#151719", "#35393d", "#5b6065", "#858b90", "#b2b7ba", "#d9dddf",
    "#ffffff"
  ]
};

function activeAction(): EditorAction {
  return project.actions.find((action) => action.id === selectedActionId) ?? project.actions[0]!;
}

function activeFrame(): EditorFrame {
  const action = activeAction();
  return action.frames.find((frame) => frame.id === selectedFrameId) ?? action.frames[0]!;
}

function activeLayer(): EditorLayer {
  return project.layers.find((layer) => layer.id === selectedLayerId) ?? project.layers[0]!;
}

function activePixels(): number[] {
  return activeFrame().cels[activeLayer().id]!.pixels;
}

function ensureSelection(): void {
  const action = project.actions.find((candidate) => candidate.id === selectedActionId) ?? project.actions[0]!;
  selectedActionId = action.id;
  const frame = action.frames.find((candidate) => candidate.id === selectedFrameId) ?? action.frames[0]!;
  selectedFrameId = frame.id;
  const layer = project.layers.find((candidate) => candidate.id === selectedLayerId) ?? project.layers[0]!;
  selectedLayerId = layer.id;
  selectedColorIndex = Math.max(0, Math.min(project.palette.length - 1, selectedColorIndex));
}

function markDirty(): void {
  dirty = true;
  saveStatus.textContent = "未保存";
  saveStatus.classList.remove("saved");
  project.updatedAt = new Date().toISOString();
}

function markSaved(): void {
  dirty = false;
  saveStatus.textContent = "已保存";
  saveStatus.classList.add("saved");
}

function parseColor(color: string): [number, number, number, number] {
  const normalized = color.replace("#", "");
  if (normalized.length !== 6 && normalized.length !== 8) return [0, 0, 0, 0];
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) : 255
  ];
}

function drawFrame(
  target: CanvasRenderingContext2D,
  frame: EditorFrame,
  targetWidth: number,
  targetHeight: number,
  opacityScale = 1,
  clear = true
): void {
  if (clear) target.clearRect(0, 0, targetWidth, targetHeight);
  const scale = Math.max(1, Math.floor(Math.min(targetWidth / project.canvas.width, targetHeight / project.canvas.height)));
  const drawWidth = project.canvas.width * scale;
  const drawHeight = project.canvas.height * scale;
  const originX = Math.floor((targetWidth - drawWidth) / 2);
  const originY = Math.floor((targetHeight - drawHeight) / 2);
  target.imageSmoothingEnabled = false;

  for (const layer of project.layers) {
    if (!layer.visible) continue;
    const cel = frame.cels[layer.id];
    if (!cel) continue;
    target.globalAlpha = layer.opacity * opacityScale;
    for (let index = 0; index < cel.pixels.length; index += 1) {
      const paletteIndex = cel.pixels[index] ?? 0;
      if (!paletteIndex) continue;
      const color = project.palette[paletteIndex];
      if (!color) continue;
      target.fillStyle = color;
      const x = (index % project.canvas.width) + cel.offsetX;
      const y = Math.floor(index / project.canvas.width) + cel.offsetY;
      if (x < 0 || y < 0 || x >= project.canvas.width || y >= project.canvas.height) continue;
      target.fillRect(originX + x * scale, originY + y * scale, scale, scale);
    }
  }
  target.globalAlpha = 1;
}

function renderEditorCanvas(): void {
  const width = project.canvas.width;
  const height = project.canvas.height;
  canvas.width = width * zoom;
  canvas.height = height * zoom;
  context.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      context.fillStyle = (x + y) % 2 === 0 ? "#d9dde1" : "#c8cdd2";
      context.fillRect(x * zoom, y * zoom, zoom, zoom);
    }
  }

  if (onionSkin.checked) {
    const action = activeAction();
    const frameIndex = action.frames.findIndex((frame) => frame.id === selectedFrameId);
    const previousFrame = frameIndex > 0 ? action.frames[frameIndex - 1] : undefined;
    if (previousFrame) drawFrame(context, previousFrame, canvas.width, canvas.height, 0.18, false);
  }

  drawFrame(context, activeFrame(), canvas.width, canvas.height, 1, false);

  if (zoom >= 8) {
    context.beginPath();
    context.strokeStyle = "rgba(57, 64, 73, 0.24)";
    context.lineWidth = 1;
    for (let x = 1; x < width; x += 1) {
      const position = x * zoom + 0.5;
      context.moveTo(position, 0);
      context.lineTo(position, canvas.height);
    }
    for (let y = 1; y < height; y += 1) {
      const position = y * zoom + 0.5;
      context.moveTo(0, position);
      context.lineTo(canvas.width, position);
    }
    context.stroke();
  }
}

function renderPreview(frame = activeFrame()): void {
  drawFrame(previewContext, frame, previewCanvas.width, previewCanvas.height);
}

function renderPalette(): void {
  paletteElement.replaceChildren();
  project.palette.forEach((color, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "palette-color";
    button.classList.toggle("transparent", index === 0);
    button.classList.toggle("selected", index === selectedColorIndex);
    button.style.setProperty("--swatch", color);
    button.title = index === 0 ? "透明" : color;
    button.addEventListener("click", () => {
      selectedColorIndex = index;
      if (index > 0) customColor.value = color.slice(0, 7);
      renderPalette();
    });
    paletteElement.append(button);
  });
}

function renderLayers(): void {
  layerList.replaceChildren();
  [...project.layers].reverse().forEach((layer) => {
    const row = document.createElement("div");
    row.className = "layer-row";
    row.classList.toggle("selected", layer.id === selectedLayerId);

    const visibility = document.createElement("button");
    visibility.type = "button";
    visibility.textContent = layer.visible ? "◉" : "○";
    visibility.title = layer.visible ? "隐藏图层" : "显示图层";
    visibility.addEventListener("click", () => {
      mutateProject(() => {
        layer.visible = !layer.visible;
      });
    });

    const select = document.createElement("button");
    select.type = "button";
    select.className = "layer-select";
    select.textContent = `${layer.locked ? "🔒 " : ""}${layer.name}`;
    select.addEventListener("click", () => {
      selectedLayerId = layer.id;
      renderLayers();
    });
    select.addEventListener("dblclick", () => {
      mutateProject(() => {
        layer.locked = !layer.locked;
      });
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "layer-delete";
    remove.textContent = "×";
    remove.title = "删除图层";
    remove.disabled = project.layers.length <= 1;
    remove.addEventListener("click", () => deleteLayer(layer.id));

    row.append(visibility, select, remove);
    layerList.append(row);
  });
  layerName.value = activeLayer().name;
}

function renderActions(): void {
  const action = activeAction();
  actionPicker.replaceChildren();
  project.actions.forEach((candidate) => {
    const option = document.createElement("option");
    option.value = candidate.id;
    option.textContent = candidate.name;
    option.selected = candidate.id === action.id;
    actionPicker.append(option);
  });
  actionLoop.checked = action.loop;
  actionName.value = action.name;
  activeActionLabel.textContent = action.name;
}

function renderTimeline(): void {
  const action = activeAction();
  const frame = activeFrame();
  frameList.replaceChildren();
  action.frames.forEach((candidate, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "frame-card";
    button.classList.toggle("selected", candidate.id === frame.id);
    const thumbnail = document.createElement("canvas");
    thumbnail.width = 96;
    thumbnail.height = 96;
    const thumbnailContext = thumbnail.getContext("2d");
    if (thumbnailContext) drawFrame(thumbnailContext, candidate, 96, 96);
    const label = document.createElement("span");
    label.textContent = `${index + 1}  ·  ${candidate.durationMs} ms`;
    button.append(thumbnail, label);
    button.addEventListener("click", () => {
      selectedFrameId = candidate.id;
      previewFrameIndex = index;
      previewFrameStartedAt = performance.now();
      renderAll();
    });
    frameList.append(button);
  });
  frameDuration.value = String(frame.durationMs);
  timelineMeta.textContent = `${action.frames.length} 帧`;
  activeFrameLabel.textContent = frame.name;
  required<HTMLButtonElement>("#delete-frame").disabled = action.frames.length <= 1;
}

function renderHeader(): void {
  projectName.value = project.name;
  canvasSummary.textContent = `${project.canvas.width} × ${project.canvas.height}`;
  zoomInput.value = String(zoom);
  zoomValue.value = `${zoom}×`;
  undoButton.disabled = !history.canUndo;
  redoButton.disabled = !history.canRedo;
}

function renderAll(): void {
  ensureSelection();
  renderHeader();
  renderActions();
  renderLayers();
  renderPalette();
  renderTimeline();
  renderEditorCanvas();
  renderPreview();
}

function mutateProject(change: () => void): void {
  const before = cloneEditorProject(project);
  change();
  markDirty();
  history.pushProject(before, cloneEditorProject(project));
  ensureSelection();
  renderAll();
}

function canvasCell(event: PointerEvent): { x: number; y: number; index: number } | undefined {
  const bounds = canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - bounds.left) / bounds.width) * project.canvas.width);
  const y = Math.floor(((event.clientY - bounds.top) / bounds.height) * project.canvas.height);
  if (x < 0 || y < 0 || x >= project.canvas.width || y >= project.canvas.height) return undefined;
  return { x, y, index: y * project.canvas.width + x };
}

function recordPixel(index: number, nextValue: number): void {
  const layer = activeLayer();
  if (layer.locked || !layer.visible) return;
  const pixels = activePixels();
  const previous = pixels[index] ?? 0;
  if (previous === nextValue) return;
  const existing = strokeChanges.get(index);
  strokeChanges.set(index, {
    index,
    before: existing?.before ?? previous,
    after: nextValue
  });
  pixels[index] = nextValue;
  markDirty();
}

function pickColor(index: number): void {
  const frame = activeFrame();
  for (let layerIndex = project.layers.length - 1; layerIndex >= 0; layerIndex -= 1) {
    const layer = project.layers[layerIndex]!;
    if (!layer.visible) continue;
    const value = frame.cels[layer.id]?.pixels[index] ?? 0;
    if (value > 0) {
      selectedColorIndex = value;
      customColor.value = project.palette[value]!.slice(0, 7);
      renderPalette();
      return;
    }
  }
  selectedColorIndex = 0;
  renderPalette();
}

function fillArea(startIndex: number): void {
  const layer = activeLayer();
  if (layer.locked || !layer.visible) return;
  const pixels = activePixels();
  const target = pixels[startIndex] ?? 0;
  const replacement = selectedColorIndex;
  if (target === replacement) return;
  strokeChanges.clear();
  const queue = new Int32Array(pixels.length);
  const queued = new Uint8Array(pixels.length);
  let head = 0;
  let tail = 0;
  queue[tail++] = startIndex;
  queued[startIndex] = 1;
  while (head < tail) {
    const index = queue[head++]!;
    if ((pixels[index] ?? 0) !== target) continue;
    recordPixel(index, replacement);
    const x = index % project.canvas.width;
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x < project.canvas.width - 1 ? index + 1 : -1,
      index >= project.canvas.width ? index - project.canvas.width : -1,
      index < pixels.length - project.canvas.width ? index + project.canvas.width : -1
    ];
    for (const neighbor of neighbors) {
      if (neighbor >= 0 && !queued[neighbor] && pixels[neighbor] === target) {
        queued[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
  }
  finishStroke();
}

function paintCell(cell: { index: number }): void {
  if (activeTool === "eyedropper") {
    pickColor(cell.index);
    return;
  }
  if (activeTool === "fill") {
    fillArea(cell.index);
    return;
  }
  recordPixel(cell.index, activeTool === "eraser" ? 0 : selectedColorIndex);
  renderEditorCanvas();
  renderPreview();
}

function finishStroke(): void {
  if (!strokeChanges.size) return;
  history.pushPixels({
    actionId: activeAction().id,
    frameId: activeFrame().id,
    layerId: activeLayer().id,
    changes: [...strokeChanges.values()]
  });
  strokeChanges.clear();
  renderAll();
}

function addLayer(): void {
  mutateProject(() => {
    const layer: EditorLayer = {
      id: createEditorId("layer"),
      name: `图层 ${project.layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1
    };
    project.layers.push(layer);
    for (const action of project.actions) {
      for (const frame of action.frames) frame.cels[layer.id] = createEmptyCel(project.canvas);
    }
    selectedLayerId = layer.id;
  });
}

function deleteLayer(layerId: string): void {
  if (project.layers.length <= 1) return;
  mutateProject(() => {
    project.layers = project.layers.filter((layer) => layer.id !== layerId);
    for (const action of project.actions) {
      for (const frame of action.frames) delete frame.cels[layerId];
    }
    selectedLayerId = project.layers.at(-1)!.id;
  });
}

function addAction(): void {
  mutateProject(() => {
    const action: EditorAction = {
      id: createEditorId("action"),
      name: `动作 ${project.actions.length + 1}`,
      loop: true,
      frames: [createEditorFrame(project.canvas, project.layers)]
    };
    project.actions.push(action);
    selectedActionId = action.id;
    selectedFrameId = action.frames[0]!.id;
  });
}

function addFrame(copyCurrent: boolean): void {
  mutateProject(() => {
    const action = activeAction();
    const source = activeFrame();
    const frame = copyCurrent
      ? structuredClone(source)
      : createEditorFrame(project.canvas, project.layers, `帧 ${action.frames.length + 1}`);
    frame.id = createEditorId("frame");
    frame.name = `帧 ${action.frames.length + 1}`;
    action.frames.push(frame);
    selectedFrameId = frame.id;
  });
}

function deleteFrame(): void {
  const action = activeAction();
  if (action.frames.length <= 1) return;
  mutateProject(() => {
    const index = action.frames.findIndex((frame) => frame.id === selectedFrameId);
    action.frames.splice(index, 1);
    selectedFrameId = action.frames[Math.max(0, index - 1)]!.id;
  });
}

async function refreshProjectPicker(selectedId = project.id): Promise<void> {
  const summaries = await window.desktopPet.listEditorProjects();
  projectPicker.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = summaries.length ? "选择本地项目" : "暂无本地项目";
  projectPicker.append(placeholder);
  summaries.forEach((summary) => {
    const option = document.createElement("option");
    option.value = summary.id;
    option.textContent = `${summary.name}  ${summary.width}×${summary.height}`;
    option.selected = summary.id === selectedId;
    projectPicker.append(option);
  });
}

async function saveProject(): Promise<void> {
  project.name = projectName.value.trim() || "我的像素宠物";
  saveStatus.textContent = "保存中…";
  const saved = await window.desktopPet.saveEditorProject(project);
  project = normalizeEditorProject(saved);
  markSaved();
  await refreshProjectPicker(project.id);
  renderAll();
}

async function exportProject(): Promise<void> {
  const images: EditorExportBundle["images"] = [];
  const actions: EditorExportBundle["manifest"]["actions"] = [];
  for (const action of project.actions) {
    const exportedFrames: EditorExportBundle["manifest"]["actions"][number]["frames"] = [];
    for (let index = 0; index < action.frames.length; index += 1) {
      const frame = action.frames[index]!;
      const output = document.createElement("canvas");
      output.width = project.canvas.width;
      output.height = project.canvas.height;
      const outputContext = canvas2d(output);
      drawFrame(outputContext, frame, output.width, output.height);
      const file = `actions/${action.id}/frame-${String(index + 1).padStart(3, "0")}.png`;
      images.push({ file, dataUrl: output.toDataURL("image/png") });
      exportedFrames.push({ file, durationMs: frame.durationMs, pivot: { ...frame.pivot } });
    }
    actions.push({ id: action.id, name: action.name, loop: action.loop, frames: exportedFrames });
  }
  const bundle: EditorExportBundle = {
    manifest: {
      version: 1,
      id: project.id,
      name: project.name,
      canvas: { ...project.canvas },
      actions
    },
    images
  };
  saveStatus.textContent = "正在导出…";
  const result = await window.desktopPet.exportEditorProject(bundle);
  saveStatus.textContent = result.canceled ? (dirty ? "未保存" : "已保存") : `已导出：${result.path ?? ""}`;
  saveStatus.classList.toggle("saved", !result.canceled);
}

async function loadProject(projectId: string): Promise<void> {
  if (!projectId) return;
  const loaded = await window.desktopPet.loadEditorProject(projectId);
  if (!loaded) return;
  project = normalizeEditorProject(loaded);
  selectedActionId = project.actions[0]!.id;
  selectedFrameId = project.actions[0]!.frames[0]!.id;
  selectedLayerId = project.layers[0]!.id;
  history.clear();
  markSaved();
  renderAll();
}

function safeCanvasDimension(value: string): number {
  return Math.max(1, Math.min(MAX_EDITOR_CANVAS_SIZE, Math.round(Number(value) || 32)));
}

function updateNewSizePreset(): void {
  const width = safeCanvasDimension(newCanvasWidth.value);
  const height = safeCanvasDimension(newCanvasHeight.value);
  for (const button of newProjectDialog.querySelectorAll<HTMLButtonElement>("[data-canvas-size]")) {
    const size = Number(button.dataset.canvasSize);
    button.classList.toggle("active", width === size && height === size);
  }
}

function openNewProjectDialog(): void {
  if (dirty && !window.confirm("当前项目尚未保存，确定新建吗？")) return;
  newProjectForm.reset();
  newProjectName.value = "我的像素宠物";
  newCanvasWidth.value = "32";
  newCanvasHeight.value = "32";
  newCanvasSquare.checked = true;
  newActionName.value = "待机";
  newPalette.value = "classic";
  updateNewSizePreset();
  newProjectDialog.showModal();
  newProjectName.select();
}

function createConfiguredProject(): void {
  const width = safeCanvasDimension(newCanvasWidth.value);
  const height = safeCanvasDimension(newCanvasHeight.value);
  const layerNames = [
    ...newProjectForm.querySelectorAll<HTMLInputElement>('input[name="default-layer"]:checked')
  ].map((input) => input.value);
  if (!layerNames.length) {
    window.alert("请至少选择一个默认图层。");
    return;
  }

  const next = createEditorProject(newProjectName.value.trim() || "我的像素宠物", { width, height });
  next.layers = layerNames.map((name) => ({
    id: createEditorId("layer"),
    name,
    visible: true,
    locked: false,
    opacity: 1
  }));
  next.actions[0]!.name = newActionName.value.trim() || "待机";
  next.actions[0]!.frames[0]!.cels = Object.fromEntries(
    next.layers.map((layer) => [layer.id, createEmptyCel(next.canvas)])
  );
  const selectedPalette = ALTERNATE_PALETTES[newPalette.value];
  if (selectedPalette) next.palette = [...selectedPalette];

  project = next;
  selectedActionId = project.actions[0]!.id;
  selectedFrameId = project.actions[0]!.frames[0]!.id;
  selectedLayerId = project.layers.find((layer) => layer.name === "主体")?.id ?? project.layers[0]!.id;
  selectedColorIndex = Math.min(3, project.palette.length - 1);
  zoom = Math.max(6, Math.min(16, Math.floor(512 / Math.max(width, height))));
  history.clear();
  markDirty();
  renderAll();
  newProjectDialog.close();
}

function updateResizeSummary(): void {
  const width = safeCanvasDimension(resizeCanvasWidth.value);
  const height = safeCanvasDimension(resizeCanvasHeight.value);
  resizeSummary.textContent = `${project.canvas.width} × ${project.canvas.height} → ${width} × ${height}`;
  const willCrop = width < project.canvas.width || height < project.canvas.height;
  resizeWarning.textContent = willCrop
    ? "缩小画布会裁掉边界之外的像素。该操作可以撤销。"
    : "画布扩展后新增区域保持透明。该操作可以撤销。";
  resizeWarning.classList.toggle("safe", !willCrop);
}

function openResizeCanvasDialog(): void {
  resizeCanvasWidth.value = String(project.canvas.width);
  resizeCanvasHeight.value = String(project.canvas.height);
  resizeCanvasSquare.checked = project.canvas.width === project.canvas.height;
  selectedCanvasAnchor = "center";
  for (const button of resizeCanvasDialog.querySelectorAll<HTMLButtonElement>("[data-anchor]")) {
    button.classList.toggle("active", button.dataset.anchor === selectedCanvasAnchor);
  }
  updateResizeSummary();
  resizeCanvasDialog.showModal();
}

function applyCanvasResize(): void {
  const width = safeCanvasDimension(resizeCanvasWidth.value);
  const height = safeCanvasDimension(resizeCanvasHeight.value);
  if (width !== project.canvas.width || height !== project.canvas.height) {
    mutateProject(() => {
      project = resizeEditorProject(project, { width, height }, selectedCanvasAnchor);
    });
  }
  resizeCanvasDialog.close();
}

function setTool(tool: Tool): void {
  activeTool = tool;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    button.classList.toggle("active", button.dataset.tool === tool);
  }
}

function undo(): void {
  project = history.undo(project);
  ensureSelection();
  markDirty();
  renderAll();
}

function redo(): void {
  project = history.redo(project);
  ensureSelection();
  markDirty();
  renderAll();
}

canvas.addEventListener("pointerdown", (event) => {
  const cell = canvasCell(event);
  if (!cell) return;
  canvas.setPointerCapture(event.pointerId);
  drawing = activeTool === "pencil" || activeTool === "eraser";
  strokeChanges.clear();
  paintCell(cell);
  if (!drawing) finishStroke();
});

canvas.addEventListener("pointermove", (event) => {
  const cell = canvasCell(event);
  if (!cell) return;
  pointerPosition.textContent = `X ${cell.x + 1}  Y ${cell.y + 1}`;
  if (drawing) paintCell(cell);
});

canvas.addEventListener("pointerup", () => {
  drawing = false;
  finishStroke();
});
canvas.addEventListener("pointercancel", () => {
  drawing = false;
  finishStroke();
});

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
  button.addEventListener("click", () => setTool(button.dataset.tool as Tool));
}

zoomInput.addEventListener("input", () => {
  zoom = Number(zoomInput.value);
  renderHeader();
  renderEditorCanvas();
});
onionSkin.addEventListener("change", renderEditorCanvas);

actionPicker.addEventListener("change", () => {
  selectedActionId = actionPicker.value;
  selectedFrameId = activeAction().frames[0]!.id;
  previewFrameIndex = 0;
  previewFrameStartedAt = performance.now();
  renderAll();
});
actionLoop.addEventListener("change", () => {
  mutateProject(() => {
    activeAction().loop = actionLoop.checked;
  });
});
actionName.addEventListener("change", () => {
  const value = actionName.value.trim();
  if (!value || value === activeAction().name) return;
  mutateProject(() => {
    activeAction().name = value;
  });
});
layerName.addEventListener("change", () => {
  const value = layerName.value.trim();
  if (!value || value === activeLayer().name) return;
  mutateProject(() => {
    activeLayer().name = value;
  });
});

projectName.addEventListener("change", () => {
  const value = projectName.value.trim();
  if (!value || value === project.name) return;
  mutateProject(() => {
    project.name = value;
  });
});

customColor.addEventListener("input", () => {
  if (selectedColorIndex === 0) selectedColorIndex = 3;
  project.palette[selectedColorIndex] = customColor.value;
  markDirty();
  renderPalette();
  renderEditorCanvas();
  renderPreview();
});

frameDuration.addEventListener("change", () => {
  const duration = Math.max(20, Math.min(5000, Math.round(Number(frameDuration.value) || 180)));
  mutateProject(() => {
    activeFrame().durationMs = duration;
  });
});

required<HTMLButtonElement>("#add-layer").addEventListener("click", addLayer);
required<HTMLButtonElement>("#add-action").addEventListener("click", addAction);
required<HTMLButtonElement>("#add-frame").addEventListener("click", () => addFrame(false));
required<HTMLButtonElement>("#duplicate-frame").addEventListener("click", () => addFrame(true));
required<HTMLButtonElement>("#delete-frame").addEventListener("click", deleteFrame);
required<HTMLButtonElement>("#save-project").addEventListener("click", () => void saveProject());
required<HTMLButtonElement>("#export-project").addEventListener("click", () => void exportProject());
required<HTMLButtonElement>("#load-project").addEventListener("click", () => void loadProject(projectPicker.value));
required<HTMLButtonElement>("#new-project").addEventListener("click", openNewProjectDialog);
required<HTMLButtonElement>("#resize-canvas").addEventListener("click", openResizeCanvasDialog);
undoButton.addEventListener("click", undo);
redoButton.addEventListener("click", redo);

newProjectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  createConfiguredProject();
});

for (const button of newProjectDialog.querySelectorAll<HTMLButtonElement>("[data-canvas-size]")) {
  button.addEventListener("click", () => {
    const size = safeCanvasDimension(button.dataset.canvasSize ?? "32");
    newCanvasWidth.value = String(size);
    newCanvasHeight.value = String(size);
    updateNewSizePreset();
  });
}

newCanvasWidth.addEventListener("input", () => {
  if (newCanvasSquare.checked) newCanvasHeight.value = newCanvasWidth.value;
  updateNewSizePreset();
});
newCanvasHeight.addEventListener("input", () => {
  if (newCanvasSquare.checked) newCanvasWidth.value = newCanvasHeight.value;
  updateNewSizePreset();
});
newCanvasSquare.addEventListener("change", () => {
  if (newCanvasSquare.checked) newCanvasHeight.value = newCanvasWidth.value;
  updateNewSizePreset();
});

resizeCanvasForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applyCanvasResize();
});
resizeCanvasWidth.addEventListener("input", () => {
  if (resizeCanvasSquare.checked) resizeCanvasHeight.value = resizeCanvasWidth.value;
  updateResizeSummary();
});
resizeCanvasHeight.addEventListener("input", () => {
  if (resizeCanvasSquare.checked) resizeCanvasWidth.value = resizeCanvasHeight.value;
  updateResizeSummary();
});
resizeCanvasSquare.addEventListener("change", () => {
  if (resizeCanvasSquare.checked) resizeCanvasHeight.value = resizeCanvasWidth.value;
  updateResizeSummary();
});

for (const button of resizeCanvasDialog.querySelectorAll<HTMLButtonElement>("[data-anchor]")) {
  button.addEventListener("click", () => {
    selectedCanvasAnchor = button.dataset.anchor as EditorCanvasAnchor;
    for (const candidate of resizeCanvasDialog.querySelectorAll<HTMLButtonElement>("[data-anchor]")) {
      candidate.classList.toggle("active", candidate === button);
    }
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-close-dialog]")) {
  button.addEventListener("click", () => button.closest<HTMLDialogElement>("dialog")?.close());
}

previewToggle.addEventListener("click", () => {
  previewPlaying = !previewPlaying;
  previewToggle.textContent = previewPlaying ? "暂停" : "播放";
  previewFrameIndex = Math.max(0, activeAction().frames.findIndex((frame) => frame.id === selectedFrameId));
  previewFrameStartedAt = performance.now();
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.ctrlKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undo();
  } else if (event.ctrlKey && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
  } else if (event.ctrlKey && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void saveProject();
  } else {
    const toolByKey: Record<string, Tool> = { b: "pencil", e: "eraser", g: "fill", i: "eyedropper" };
    const tool = toolByKey[event.key.toLowerCase()];
    if (tool) setTool(tool);
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
});

function previewLoop(now: number): void {
  if (previewPlaying) {
    const action = activeAction();
    const frame = action.frames[previewFrameIndex] ?? action.frames[0]!;
    if (now - previewFrameStartedAt >= frame.durationMs) {
      const atEnd = previewFrameIndex >= action.frames.length - 1;
      if (atEnd && !action.loop) {
        previewPlaying = false;
        previewToggle.textContent = "播放";
      } else {
        previewFrameIndex = atEnd ? 0 : previewFrameIndex + 1;
        previewFrameStartedAt = now;
      }
    }
    renderPreview(action.frames[previewFrameIndex] ?? action.frames[0]!);
  }
  window.requestAnimationFrame(previewLoop);
}

async function initialize(): Promise<void> {
  renderAll();
  await refreshProjectPicker();
  const initialId = requestedProjectId ?? projectPicker.options[1]?.value;
  if (initialId) await loadProject(initialId);
  initialized = true;
  if (requestedProjectId && project.id !== requestedProjectId) {
    await loadProject(requestedProjectId);
  }
}

window.desktopPet.onEditorProjectRequested((projectId) => {
  requestedProjectId = projectId;
  if (initialized && projectId !== project.id) void loadProject(projectId);
});
void initialize();
window.requestAnimationFrame(previewLoop);
