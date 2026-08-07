import type { RuntimePetProject, RuntimeState } from "../shared/contracts";
import { drawProjectFrame, findProjectAction, frameAtElapsed } from "./lib/project-renderer";
import "./styles/pet.css";

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing pet renderer element: ${selector}`);
  return element;
}

function getContext2d(element: HTMLCanvasElement): CanvasRenderingContext2D {
  const value = element.getContext("2d", { willReadFrequently: true });
  if (!value) throw new Error("Canvas 2D is unavailable");
  return value;
}

const canvas = required<HTMLCanvasElement>("#pet-canvas");
const speech = required<HTMLDivElement>("#speech");
const context = getContext2d(canvas);

let state: RuntimeState | undefined;
let project: RuntimePetProject | undefined;
let projectToken = 0;
let projectRenderVersion = 0;
let loadingProjectId = "";
let actionStartedAt = performance.now();
let lastActionKey = "";
let lastRenderKey = "";
let clickThrough = true;
let dragging = false;
let dragDistance = 0;
let lastScreenPoint = { x: 0, y: 0 };
let speechTimer: number | undefined;

function setClickThrough(ignore: boolean): void {
  if (clickThrough === ignore) return;
  clickThrough = ignore;
  window.desktopPet.setClickThrough(ignore);
}

function showSpeech(message: string): void {
  speech.textContent = message;
  speech.classList.add("visible");
  if (speechTimer) window.clearTimeout(speechTimer);
  speechTimer = window.setTimeout(() => speech.classList.remove("visible"), 1500);
}

function isOpaqueAt(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false;
  return context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3]! > 24;
}

async function updateProject(projectId: string): Promise<void> {
  const token = ++projectToken;
  loadingProjectId = projectId;
  project = undefined;
  lastRenderKey = "";
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!projectId) return;
  try {
    const loaded = await window.desktopPet.loadPetProject(projectId);
    if (token === projectToken) {
      project = loaded;
      projectRenderVersion += 1;
    }
  } catch (error) {
    if (token === projectToken) loadingProjectId = "";
    console.error(error);
    showSpeech("宠物工程加载失败");
  }
}

function applyState(nextState: RuntimeState): void {
  const previousPetId = state?.selectedPetId;
  const nextKey = `${nextState.selectedPetId}:${nextState.currentActionId}`;
  state = nextState;
  if (nextKey !== lastActionKey) {
    actionStartedAt = performance.now();
    lastActionKey = nextKey;
  }
  if (
    previousPetId !== nextState.selectedPetId ||
    (!project && loadingProjectId !== nextState.selectedPetId)
  ) {
    void updateProject(nextState.selectedPetId);
  }
}

function render(now: number): void {
  if (state && project) {
    const action = findProjectAction(project, state.currentActionId);
    const elapsed = state.paused ? 0 : now - actionStartedAt;
    const frame = frameAtElapsed(action, elapsed, state.speed);
    const maxSize = Math.round(Math.min(244, 204 * state.scale));
    const renderKey = `${projectRenderVersion}:${frame?.id ?? ""}:${maxSize}:${state.direction}`;
    if (renderKey !== lastRenderKey) {
      drawProjectFrame(context, project, frame, {
        maxSize,
        bottomPadding: 4,
        flip: state.direction === -1
      });
      lastRenderKey = renderKey;
    }
  } else if (lastRenderKey) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    lastRenderKey = "";
  }
  requestAnimationFrame(render);
}

canvas.addEventListener("mousemove", (event) => {
  if (dragging) {
    if ((event.buttons & 1) === 0) {
      dragging = false;
      window.desktopPet.setDragging(false);
      return;
    }
    const deltaX = event.screenX - lastScreenPoint.x;
    const deltaY = event.screenY - lastScreenPoint.y;
    dragDistance += Math.abs(deltaX) + Math.abs(deltaY);
    lastScreenPoint = { x: event.screenX, y: event.screenY };
    window.desktopPet.moveBy(deltaX, deltaY);
    return;
  }
  setClickThrough(!isOpaqueAt(event.offsetX, event.offsetY));
});

canvas.addEventListener("mousedown", (event) => {
  if (event.button !== 0 || !isOpaqueAt(event.offsetX, event.offsetY)) return;
  dragging = true;
  dragDistance = 0;
  lastScreenPoint = { x: event.screenX, y: event.screenY };
  window.desktopPet.setDragging(true);
  setClickThrough(false);
});

window.addEventListener("mouseup", () => {
  if (!dragging) return;
  dragging = false;
  window.desktopPet.setDragging(false);
  if (dragDistance < 8) {
    void window.desktopPet.interact().then(applyState);
  }
});

canvas.addEventListener("dblclick", () => window.desktopPet.showControl());
canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  window.desktopPet.showControl();
});
window.addEventListener("mouseleave", () => {
  if (!dragging) setClickThrough(true);
});

window.desktopPet.onStateChanged(applyState);
window.desktopPet.onEditorProjectChanged((projectId) => {
  if (state?.selectedPetId === projectId) void updateProject(projectId);
});
void window.desktopPet.getState().then(applyState);
window.desktopPet.setClickThrough(true);
requestAnimationFrame(render);
