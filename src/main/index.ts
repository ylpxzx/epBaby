import path from "node:path";
import { promises as fs } from "node:fs";
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  screen,
  Tray,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Rectangle
} from "electron";
import type { PetInteractionKind, RuntimePetProject, RuntimeState, StoredSettings } from "../shared/contracts";
import { projectSummary, type EditorExportBundle, type EditorProject } from "../shared/editor-project";
import { isLocomotionAction, type Direction } from "../shared/pets";
import { EditorProjectStore } from "./editor-project-store";
import { StateStore } from "./state-store";

const PET_WINDOW_SIZE = { width: 280, height: 260 };
const MOVEMENT_TICK_MS = 50;
const APP_USER_MODEL_ID = "com.epbaby.desktop";

function createAppIcon(size: 16 | 32 | 64 = 64) {
  const pixels = Buffer.alloc(size * size * 4);
  const unit = size / 16;
  const dark = [17, 20, 27, 255] as const;
  const body = [170, 210, 142, 255] as const;
  const highlight = [117, 240, 75, 255] as const;
  const base = [63, 113, 61, 255] as const;

  const paint = (x: number, y: number, width: number, height: number, color: readonly number[]) => {
    for (let row = y * unit; row < (y + height) * unit; row += 1) {
      for (let column = x * unit; column < (x + width) * unit; column += 1) {
        const offset = (row * size + column) * 4;
        pixels[offset] = color[0]!;
        pixels[offset + 1] = color[1]!;
        pixels[offset + 2] = color[2]!;
        pixels[offset + 3] = color[3]!;
      }
    }
  };

  paint(5, 1, 6, 1, dark);
  paint(3, 2, 10, 1, dark);
  paint(2, 3, 12, 2, dark);
  paint(1, 5, 14, 8, dark);
  paint(2, 13, 12, 2, dark);
  paint(4, 15, 8, 1, dark);
  paint(5, 2, 6, 1, body);
  paint(3, 3, 10, 2, body);
  paint(2, 5, 12, 7, body);
  paint(3, 12, 10, 1, base);
  paint(4, 13, 8, 2, base);
  paint(5, 3, 4, 2, highlight);
  paint(3, 10, 3, 2, highlight);
  paint(4, 7, 2, 3, dark);
  paint(10, 7, 2, 3, dark);
  paint(5, 11, 2, 1, dark);
  paint(7, 12, 3, 1, dark);
  paint(10, 11, 2, 1, dark);

  return nativeImage.createFromBitmap(pixels, { width: size, height: size, scaleFactor: 1 });
}

let petWindow: BrowserWindow | null = null;
let controlWindow: BrowserWindow | null = null;
let editorWindow: BrowserWindow | null = null;
let editorReady = false;
let pendingEditorProjectId: string | undefined;
let tray: Tray | null = null;
let store: StateStore;
let editorStore: EditorProjectStore;
const runtimeProjects = new Map<string, EditorProject>();
const runtimePetProjects = new Map<string, RuntimePetProject>();
let settings: StoredSettings;
let currentActionId = "";
let direction: Direction = 1;
let behaviorTimer: NodeJS.Timeout | undefined;
let movementTimer: NodeJS.Timeout | undefined;
let lastMovementAt = Date.now();
let dragging = false;
let quitting = false;

function snapshot(): RuntimeState {
  return { ...settings, currentActionId, direction };
}

function activeProject(projectId = settings.selectedPetId): EditorProject | undefined {
  return runtimeProjects.get(projectId);
}

function activeAction(project: EditorProject | undefined, actionId = currentActionId) {
  return project?.actions.find((action) => action.id === actionId) ?? project?.actions[0];
}

function actionDuration(project: EditorProject | undefined, actionId: string): number {
  const action = activeAction(project, actionId);
  return action?.frames.reduce((total, frame) => total + frame.durationMs, 0) ?? 1200;
}

async function refreshRuntimeProjects(): Promise<void> {
  runtimeProjects.clear();
  runtimePetProjects.clear();
  const projects = await editorStore.loadAll();
  for (const project of projects) {
    if (project) runtimeProjects.set(project.id, project);
  }
}

function compactPetProject(project: EditorProject): RuntimePetProject {
  return {
    id: project.id,
    name: project.name,
    canvas: { ...project.canvas },
    palette: [...project.palette],
    layers: project.layers.map((layer) => ({ ...layer })),
    actions: project.actions.map((action) => ({
      id: action.id,
      name: action.name,
      loop: action.loop,
      frames: action.frames.map((frame) => ({
        id: frame.id,
        durationMs: frame.durationMs,
        cels: Object.fromEntries(
          Object.entries(frame.cels).map(([layerId, cel]) => [
            layerId,
            {
              pixels: Uint8Array.from(cel.pixels),
              offsetX: cel.offsetX,
              offsetY: cel.offsetY
            }
          ])
        )
      }))
    }))
  };
}

function runtimePetProject(projectId: string): RuntimePetProject | undefined {
  const cached = runtimePetProjects.get(projectId);
  if (cached) return cached;
  const project = runtimeProjects.get(projectId);
  if (!project) return undefined;
  const compact = compactPetProject(project);
  runtimePetProjects.set(projectId, compact);
  return compact;
}

function persist(): void {
  store.scheduleSave({ ...settings });
}

function isTrusted(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return (
    event.sender === petWindow?.webContents ||
    event.sender === controlWindow?.webContents ||
    event.sender === editorWindow?.webContents
  );
}

function broadcast(): void {
  const state = snapshot();
  for (const window of [petWindow, controlWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send("pet:state-changed", state);
  }
  refreshTrayMenu();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function electronCoordinate(value: number, fallback = 0): number {
  const finite = Number.isFinite(value) ? value : fallback;
  const rounded = Math.round(clamp(finite, -2_147_483_648, 2_147_483_647));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function visibleAreaOnDisplay(x: number, y: number, workArea: Rectangle): number {
  const overlapWidth = Math.max(0, Math.min(x + PET_WINDOW_SIZE.width, workArea.x + workArea.width) - Math.max(x, workArea.x));
  const overlapHeight = Math.max(0, Math.min(y + PET_WINDOW_SIZE.height, workArea.y + workArea.height) - Math.max(y, workArea.y));
  return overlapWidth * overlapHeight;
}

function clampToWorkArea(
  x: number,
  y: number,
  allowDisplayTransition = false
): { x: number; y: number; workArea: Rectangle } {
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const center = {
    x: electronCoordinate(safeX + PET_WINDOW_SIZE.width / 2),
    y: electronCoordinate(safeY + PET_WINDOW_SIZE.height / 2)
  };
  const workArea = screen.getDisplayNearestPoint(center).workArea;
  const visibleArea = allowDisplayTransition
    ? screen.getAllDisplays().reduce(
        (total, display) => total + visibleAreaOnDisplay(safeX, safeY, display.workArea),
        0
      )
    : 0;
  if (allowDisplayTransition && visibleArea >= PET_WINDOW_SIZE.width * PET_WINDOW_SIZE.height * 0.2) {
    return {
      x: electronCoordinate(safeX),
      y: electronCoordinate(safeY),
      workArea
    };
  }
  return {
    x: electronCoordinate(clamp(safeX, workArea.x, workArea.x + workArea.width - PET_WINDOW_SIZE.width), workArea.x),
    y: electronCoordinate(clamp(safeY, workArea.y, workArea.y + workArea.height - PET_WINDOW_SIZE.height), workArea.y),
    workArea
  };
}

function setPetWindowPosition(x: number, y: number): boolean {
  if (!petWindow || petWindow.isDestroyed()) return false;
  const safeX = electronCoordinate(x);
  const safeY = electronCoordinate(y);
  try {
    petWindow.setPosition(safeX, safeY, false);
    return true;
  } catch (error) {
    console.error("Unable to move pet window", { x: safeX, y: safeY, error });
    return false;
  }
}

function movePetTo(x: number, y: number, allowDisplayTransition = false): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  const next = clampToWorkArea(x, y, allowDisplayTransition);
  if (setPetWindowPosition(next.x, next.y)) {
    settings.position = { x: next.x, y: next.y };
    persist();
  }
}

function clampWalkingPosition(x: number, y: number, walkingDirection: Direction, currentX: number) {
  // Pick the display under the pet's leading edge. Using the window center
  // traps the pet on the current display because clamping happens before the
  // center can cross the boundary.
  const leadingPoint = {
    x: electronCoordinate(walkingDirection === 1 ? x + PET_WINDOW_SIZE.width : x),
    y: electronCoordinate(y + PET_WINDOW_SIZE.height / 2)
  };
  const targetDisplay = screen.getDisplayNearestPoint(leadingPoint);
  const currentDisplay = screen.getDisplayNearestPoint({
    x: electronCoordinate(currentX + PET_WINDOW_SIZE.width / 2),
    y: electronCoordinate(y + PET_WINDOW_SIZE.height / 2)
  });
  const workArea = targetDisplay.workArea;
  return {
    x: electronCoordinate(clamp(x, workArea.x, workArea.x + workArea.width - PET_WINDOW_SIZE.width), workArea.x),
    y: electronCoordinate(clamp(y, workArea.y, workArea.y + workArea.height - PET_WINDOW_SIZE.height), workArea.y),
    workArea,
    crossedDisplay: targetDisplay.id !== currentDisplay.id
  };
}

function recallPet(): RuntimeState {
  const cursor = screen.getCursorScreenPoint();
  movePetTo(cursor.x - PET_WINDOW_SIZE.width / 2, cursor.y - PET_WINDOW_SIZE.height / 2);
  petWindow?.showInactive();
  return snapshot();
}

function showControl(): void {
  if (!controlWindow || controlWindow.isDestroyed()) {
    controlWindow = createControlWindow();
    const window = controlWindow;
    window.webContents.once("did-finish-load", () => {
      if (!window.isDestroyed()) {
        window.show();
        window.focus();
      }
    });
    return;
  }
  controlWindow.show();
  controlWindow.focus();
}

function showEditor(projectId?: string): void {
  if (projectId) pendingEditorProjectId = projectId;
  if (!editorWindow || editorWindow.isDestroyed()) editorWindow = createEditorWindow();
  editorWindow.show();
  editorWindow.focus();
  if (editorReady && pendingEditorProjectId) {
    editorWindow.webContents.send("editor:open-project", pendingEditorProjectId);
    pendingEditorProjectId = undefined;
  }
}

function loadRenderer(window: BrowserWindow, page: "pet.html" | "control.html" | "editor.html"): void {
  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    void window.loadURL(`${devServer}/${page}`);
  } else {
    void window.loadFile(path.join(__dirname, "../renderer", page));
  }
}

function createEditorWindow(): BrowserWindow {
  editorReady = false;
  const window = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    title: "小伴像素宠物编辑器",
    backgroundColor: "#171a1f",
    icon: createAppIcon(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on("closed", () => {
    editorWindow = null;
    editorReady = false;
  });
  window.webContents.on("did-finish-load", () => {
    editorReady = true;
    if (pendingEditorProjectId) {
      window.webContents.send("editor:open-project", pendingEditorProjectId);
      pendingEditorProjectId = undefined;
    }
  });
  loadRenderer(window, "editor.html");
  return window;
}

function broadcastProjectChanged(projectId: string): void {
  for (const window of [petWindow, controlWindow, editorWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send("editor:project-changed", projectId);
    }
  }
}

function defaultPetProjectFile(filename: string): string {
  return process.env.VITE_DEV_SERVER_URL
    ? path.join(app.getAppPath(), "default-pets", filename)
    : path.join(__dirname, "../renderer/default-pets", filename);
}

function createPetWindow(): BrowserWindow {
  const initialWorkArea = screen.getPrimaryDisplay().workArea;
  const fallback = {
    x: initialWorkArea.x + initialWorkArea.width - PET_WINDOW_SIZE.width - 24,
    y: initialWorkArea.y + initialWorkArea.height - PET_WINDOW_SIZE.height
  };
  const initial = settings.position ?? fallback;
  const position = clampToWorkArea(initial.x, initial.y);

  const window = new BrowserWindow({
    ...PET_WINDOW_SIZE,
    x: position.x,
    y: position.y,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: false,
    icon: createAppIcon(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  window.setAlwaysOnTop(true, "floating");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setIgnoreMouseEvents(true, { forward: true });
  window.on("closed", () => {
    petWindow = null;
  });
  window.webContents.on("did-finish-load", () => {
    void window.webContents.insertCSS(
      "html,body{overflow:hidden!important;scrollbar-width:none!important}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}"
    );
    window.webContents.send("pet:state-changed", snapshot());
    window.showInactive();
  });
  loadRenderer(window, "pet.html");
  return window;
}

function createControlWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    frame: false,
    title: "小伴控制台",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1c2026" : "#f5f7fa",
    icon: createAppIcon(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on("closed", () => {
    controlWindow = null;
  });
  window.webContents.on("did-finish-load", () => {
    window.webContents.send("pet:state-changed", snapshot());
  });
  loadRenderer(window, "control.html");
  return window;
}

function refreshTrayMenu(): void {
  if (!tray) return;
  const project = activeProject();
  tray.setToolTip(project ? `EP Baby · ${project.name}` : "EP Baby · 暂无宠物");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: project?.name ?? "暂无宠物，请先打开编辑器创建", enabled: false },
      { type: "separator" },
      { label: "打开控制台", click: showControl },
      { label: "召回宠物", click: () => void recallPet() },
      {
        label: settings.paused ? "继续活动" : "暂停活动",
        click: () => {
          settings.paused = !settings.paused;
          persist();
          broadcast();
        }
      },
      { type: "separator" },
      { label: "退出 EP Baby", click: () => app.quit() }
    ])
  );
}

function createTray(): void {
  tray = new Tray(createAppIcon(16));
  tray.on("double-click", showControl);
  refreshTrayMenu();
}

async function exportEditorBundle(bundle: EditorExportBundle) {
  const result = editorWindow
    ? await dialog.showOpenDialog(editorWindow, {
        title: "选择宠物包导出目录",
        properties: ["openDirectory", "createDirectory"]
      })
    : await dialog.showOpenDialog({
        title: "选择宠物包导出目录",
        properties: ["openDirectory", "createDirectory"]
      });
  const parentDirectory = result.filePaths[0];
  if (result.canceled || !parentDirectory) return { canceled: true };

  const safeName = (bundle.manifest.name || bundle.manifest.id)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 64) || "pixel-pet";
  let targetDirectory = path.join(parentDirectory, safeName);
  let suffix = 2;
  while (true) {
    try {
      await fs.access(targetDirectory);
      targetDirectory = path.join(parentDirectory, `${safeName}-${suffix}`);
      suffix += 1;
    } catch {
      break;
    }
  }

  await fs.mkdir(targetDirectory, { recursive: true });
  for (const image of bundle.images.slice(0, 2000)) {
    const relativePath = image.file.replace(/\\/g, "/");
    if (relativePath.startsWith("/") || relativePath.includes("../")) continue;
    const match = image.dataUrl.match(/^data:image\/png;base64,([a-zA-Z0-9+/=]+)$/);
    if (!match) continue;
    const target = path.join(targetDirectory, ...relativePath.split("/"));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, Buffer.from(match[1]!, "base64"));
  }
  await fs.writeFile(
    path.join(targetDirectory, "manifest.json"),
    JSON.stringify(bundle.manifest, null, 2),
    "utf8"
  );
  return { canceled: false, path: targetDirectory };
}

function selectAction(actionId: string, disableAuto = false): RuntimeState {
  const project = activeProject();
  currentActionId = activeAction(project, actionId)?.id ?? "";
  if (disableAuto) settings.autoMode = false;
  persist();
  broadcast();
  scheduleBehavior();
  return snapshot();
}

const INTERACTION_KEYWORDS: Partial<Record<PetInteractionKind, string[]>> = {
  click: ["react", "happy", "smile", "互动", "开心", "回应"],
  "double-click": ["show", "pose", "card", "表演", "展示", "亮相"],
  "triple-click": ["attack", "rush", "slash", "斩", "攻击", "突进"],
  "long-press": ["sleep", "rest", "idle", "睡", "休息", "待机"],
  "drag-release": ["jump", "land", "落地", "跳"],
  "wheel-up": ["aerial", "fly", "jump", "空中", "飞", "跳"],
  "wheel-down": ["crouch", "sit", "sleep", "蹲", "坐", "休息"],
  "typing-burst": ["dance", "cheer", "show", "card", "舞", "欢呼", "表演"]
};

function interactionAction(project: EditorProject, kind: PetInteractionKind) {
  const hotkeyIndex = kind === "hotkey-1" ? 1 : kind === "hotkey-2" ? 2 : kind === "hotkey-3" ? 3 : -1;
  if (hotkeyIndex >= 0) return project.actions[hotkeyIndex] ?? project.actions[0];
  const keywords = INTERACTION_KEYWORDS[kind] ?? [];
  const matched = project.actions.find((action) => {
    const searchable = `${action.id} ${action.name}`.toLowerCase();
    return keywords.some((keyword) => searchable.includes(keyword.toLowerCase()));
  });
  if (matched) return matched;
  const reactions = project.actions.filter(
    (action) => !isLocomotionAction(action.id, action.name) && action.id !== project.actions[0]?.id
  );
  const fallbackIndex = Math.abs([...kind].reduce((total, character) => total + character.charCodeAt(0), 0));
  return reactions[fallbackIndex % Math.max(1, reactions.length)] ?? project.actions[0];
}

function triggerInteraction(kind: PetInteractionKind): RuntimeState {
  const project = activeProject();
  if (!project?.actions.length) return snapshot();
  const action = interactionAction(project, kind) ?? project.actions[0]!;
  currentActionId = action.id;
  broadcast();
  scheduleBehavior(actionDuration(project, action.id) / settings.speed);
  return snapshot();
}

function registerGlobalShortcuts(): void {
  const shortcuts: Array<[string, () => void]> = [
    ["CommandOrControl+Alt+1", () => void triggerInteraction("hotkey-1")],
    ["CommandOrControl+Alt+2", () => void triggerInteraction("hotkey-2")],
    ["CommandOrControl+Alt+3", () => void triggerInteraction("hotkey-3")],
    ["CommandOrControl+Alt+R", () => void recallPet()],
    ["CommandOrControl+Alt+P", () => {
      settings.paused = !settings.paused;
      persist();
      broadcast();
    }]
  ];
  for (const [accelerator, handler] of shortcuts) {
    if (!globalShortcut.register(accelerator, handler)) {
      console.warn(`Unable to register global shortcut: ${accelerator}`);
    }
  }
}

function chooseNextAction(): void {
  if (!settings.autoMode || settings.paused) {
    scheduleBehavior(1200);
    return;
  }
  const project = activeProject();
  if (!project?.actions.length) {
    currentActionId = "";
    scheduleBehavior(1200);
    return;
  }
  const pool = [...project.actions, project.actions[0]!, project.actions[0]!];
  const next = pool[Math.floor(Math.random() * pool.length)] ?? project.actions[0]!;
  currentActionId = next.id;
  broadcast();
  scheduleBehavior(actionDuration(project, next.id) / settings.speed);
}

function scheduleBehavior(delayMs = 900): void {
  if (behaviorTimer) clearTimeout(behaviorTimer);
  behaviorTimer = setTimeout(chooseNextAction, Math.max(500, delayMs));
}

function startMovementLoop(): void {
  if (movementTimer) clearInterval(movementTimer);
  lastMovementAt = Date.now();
  movementTimer = setInterval(() => {
    const now = Date.now();
    const elapsedSeconds = Math.min(0.15, (now - lastMovementAt) / 1000);
    lastMovementAt = now;
    if (!petWindow || dragging || settings.paused) return;

    const project = activeProject();
    const action = activeAction(project);
    if (!action || !isLocomotionAction(action.id, action.name)) return;

    const position = petWindow.getPosition();
    const x = position[0] ?? 0;
    const y = position[1] ?? 0;
    const speed = 56 * settings.speed;
    let nextX = x + speed * elapsedSeconds * direction;
    const clamped = clampWalkingPosition(nextX, y, direction, x);
    const hitEdge = !clamped.crossedDisplay && clamped.x !== electronCoordinate(nextX);
    if (hitEdge) {
      direction = direction === 1 ? -1 : 1;
      broadcast();
    }
    if (setPetWindowPosition(clamped.x, clamped.y)) {
      settings.position = { x: clamped.x, y: clamped.y };
    }
  }, MOVEMENT_TICK_MS);
}

function registerIpc(): void {
  ipcMain.handle("pet:get-state", (event) => (isTrusted(event) ? snapshot() : null));

  ipcMain.handle("pet:select", (event, petId: unknown) => {
    if (!isTrusted(event)) return snapshot();
    const requestedId = typeof petId === "string" ? petId : "";
    const project = runtimeProjects.get(requestedId);
    settings.selectedPetId = project?.id ?? "";
    currentActionId = project?.actions[0]?.id ?? "";
    persist();
    broadcast();
    scheduleBehavior();
    return snapshot();
  });

  ipcMain.handle("pet:set-action", (event, actionId: unknown) => {
    if (!isTrusted(event)) return snapshot();
    return selectAction(typeof actionId === "string" ? actionId : "", true);
  });

  ipcMain.handle("pet:set-auto", (event, enabled: unknown) => {
    if (!isTrusted(event)) return snapshot();
    settings.autoMode = enabled === true;
    persist();
    broadcast();
    if (settings.autoMode) scheduleBehavior(300);
    return snapshot();
  });

  ipcMain.handle("pet:set-paused", (event, paused: unknown) => {
    if (!isTrusted(event)) return snapshot();
    settings.paused = paused === true;
    persist();
    broadcast();
    scheduleBehavior();
    return snapshot();
  });

  ipcMain.handle("pet:set-speed", (event, value: unknown) => {
    if (!isTrusted(event)) return snapshot();
    settings.speed = clamp(Number(value) || 1, 0.5, 2);
    persist();
    broadcast();
    return snapshot();
  });

  ipcMain.handle("pet:set-scale", (event, value: unknown) => {
    if (!isTrusted(event)) return snapshot();
    settings.scale = clamp(Number(value) || 1, 0.7, 1.35);
    persist();
    broadcast();
    return snapshot();
  });

  ipcMain.handle("pet:interact", (event, requestedKind: unknown) => {
    if (!isTrusted(event)) return snapshot();
    const allowed: PetInteractionKind[] = ["click", "double-click", "triple-click", "long-press", "drag-release", "wheel-up", "wheel-down", "typing-burst", "hotkey-1", "hotkey-2", "hotkey-3"];
    const kind = allowed.includes(requestedKind as PetInteractionKind)
      ? requestedKind as PetInteractionKind
      : "click";
    return triggerInteraction(kind);
  });

  ipcMain.handle("pet:recall", (event) => (isTrusted(event) ? recallPet() : snapshot()));

  ipcMain.on("pet:show-control", (event) => {
    if (isTrusted(event)) showControl();
  });
  ipcMain.on("editor:show", (event, projectId: unknown) => {
    if (isTrusted(event)) showEditor(typeof projectId === "string" ? projectId : undefined);
  });
  ipcMain.handle("pet:load-project", (event, projectId: unknown) => {
    if (event.sender !== petWindow?.webContents || typeof projectId !== "string") return undefined;
    return runtimePetProject(projectId);
  });
  ipcMain.handle("editor:list", (event) =>
    isTrusted(event)
      ? [...runtimeProjects.values()].map(projectSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      : []
  );
  ipcMain.handle("editor:load", (event, projectId: unknown) => {
    if (!isTrusted(event) || typeof projectId !== "string") return undefined;
    return runtimeProjects.get(projectId);
  });
  ipcMain.handle("editor:save", async (event, project: unknown) => {
    if (!isTrusted(event)) throw new Error("Untrusted editor save request");
    const saved = await editorStore.save(project as EditorProject);
    runtimeProjects.set(saved.id, saved);
    runtimePetProjects.delete(saved.id);
    if (!activeProject()) settings.selectedPetId = saved.id;
    if (settings.selectedPetId === saved.id) {
      currentActionId = activeAction(saved)?.id ?? "";
      persist();
      broadcast();
      scheduleBehavior();
    }
    broadcastProjectChanged(saved.id);
    return saved;
  });
  ipcMain.handle(
    "editor:set-cover",
    async (event, projectId: unknown, actionId: unknown, frameId: unknown) => {
      if (
        !isTrusted(event) ||
        typeof projectId !== "string" ||
        typeof actionId !== "string" ||
        typeof frameId !== "string"
      ) return undefined;
      const project = runtimeProjects.get(projectId);
      const action = project?.actions.find((candidate) => candidate.id === actionId);
      const frame = action?.frames.find((candidate) => candidate.id === frameId);
      if (!project || !action || !frame) return undefined;
      const saved = await editorStore.save({
        ...project,
        cover: { actionId: action.id, frameId: frame.id }
      });
      runtimeProjects.set(saved.id, saved);
      runtimePetProjects.delete(saved.id);
      broadcastProjectChanged(saved.id);
      return projectSummary(saved);
    }
  );
  ipcMain.handle("editor:delete", async (event, projectId: unknown) => {
    if (!isTrusted(event) || typeof projectId !== "string") return snapshot();
    const project = runtimeProjects.get(projectId);
    if (!project) return snapshot();
    await editorStore.remove(project.id);
    runtimeProjects.delete(project.id);
    runtimePetProjects.delete(project.id);
    if (settings.selectedPetId === project.id) {
      const nextProject = [...runtimeProjects.values()]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      settings.selectedPetId = nextProject?.id ?? "";
      currentActionId = nextProject?.actions[0]?.id ?? "";
      persist();
      broadcast();
      scheduleBehavior();
    }
    broadcastProjectChanged(project.id);
    return snapshot();
  });
  ipcMain.handle("editor:export", (event, bundle: unknown) => {
    if (event.sender !== editorWindow?.webContents) throw new Error("Untrusted editor export request");
    return exportEditorBundle(bundle as EditorExportBundle);
  });
  ipcMain.on("control:minimize", (event) => {
    if (event.sender === controlWindow?.webContents) controlWindow.minimize();
  });
  ipcMain.on("control:toggle-maximize", (event) => {
    if (event.sender !== controlWindow?.webContents) return;
    if (controlWindow.isMaximized()) controlWindow.unmaximize();
    else controlWindow.maximize();
  });
  ipcMain.on("control:close", (event) => {
    if (event.sender === controlWindow?.webContents) controlWindow.close();
  });
  ipcMain.on("pet:quit", (event) => {
    if (isTrusted(event)) app.quit();
  });
  ipcMain.on("pet:click-through", (event, ignore: unknown) => {
    if (event.sender !== petWindow?.webContents || !petWindow) return;
    petWindow.setIgnoreMouseEvents(ignore === true, { forward: true });
  });
  ipcMain.on("pet:dragging", (event, value: unknown) => {
    if (event.sender === petWindow?.webContents) dragging = value === true;
  });
  ipcMain.on("pet:move-by", (event, deltaX: unknown, deltaY: unknown) => {
    if (event.sender !== petWindow?.webContents || !petWindow) return;
    const dx = clamp(Number(deltaX) || 0, -100, 100);
    const dy = clamp(Number(deltaY) || 0, -100, 100);
    const position = petWindow.getPosition();
    const x = position[0] ?? 0;
    const y = position[1] ?? 0;
    movePetTo(x + dx, y + dy, true);
  });
}

const hasLock = app.requestSingleInstanceLock();
app.setAppUserModelId(APP_USER_MODEL_ID);
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showControl();
    recallPet();
  });

  app.whenReady().then(async () => {
    store = new StateStore(app.getPath("userData"));
    editorStore = new EditorProjectStore(app.getPath("userData"));
    await editorStore.clearAllOnce("empty-library-v1");
    await editorStore.removeProjectOnce("cyber-cat", "remove-cyber-cat-v1");
    await editorStore.replaceProjectFileOnce(
      defaultPetProjectFile("lime-slime.json"),
      "default-lime-slime-v1",
      "lime-slime"
    );
    await editorStore.replaceProjectFileOnce(
      defaultPetProjectFile("moss-jester-cat.json"),
      "default-moss-jester-cat-v10",
      "moss-jester-cat"
    );
    await editorStore.replaceProjectFileOnce(
      defaultPetProjectFile("zoro-santoryu.json"),
      "default-zoro-santoryu-v2",
      "zoro-santoryu"
    );
    await refreshRuntimeProjects();
    settings = store.load();
    if (!runtimeProjects.has(settings.selectedPetId)) {
      settings.selectedPetId = runtimeProjects.keys().next().value ?? "";
    }
    currentActionId = activeProject()?.actions[0]?.id ?? "";
    store.saveNow(settings);
    registerIpc();
    petWindow = createPetWindow();
    createTray();
    registerGlobalShortcuts();
    startMovementLoop();
    scheduleBehavior(1200);
  });
}

app.on("window-all-closed", () => {
  // Tray applications intentionally stay alive without visible windows.
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  quitting = true;
  if (behaviorTimer) clearTimeout(behaviorTimer);
  if (movementTimer) clearInterval(movementTimer);
  if (store && settings) store.saveNow(settings);
});
