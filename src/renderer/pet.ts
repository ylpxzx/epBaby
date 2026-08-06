import type { RuntimeState } from "../shared/contracts";
import type { EditorProject } from "../shared/editor-project";
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
let project: EditorProject | undefined;
let projectToken = 0;
let actionStartedAt = performance.now();
let lastActionKey = "";
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
  project = undefined;
  if (!projectId) return;
  try {
    const loaded = await window.desktopPet.loadEditorProject(projectId);
    if (token === projectToken) project = loaded;
  } catch (error) {
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
  if (previousPetId !== nextState.selectedPetId || !project) {
    void updateProject(nextState.selectedPetId);
  }
}

function render(now: number): void {
  if (state && project) {
    const action = findProjectAction(project, state.currentActionId);
    const elapsed = state.paused ? 0 : now - actionStartedAt;
    const frame = frameAtElapsed(action, elapsed, state.speed);
    drawProjectFrame(context, project, frame, {
      maxSize: Math.round(Math.min(244, 204 * state.scale)),
      bottomPadding: 4,
      flip: state.direction === -1
    });
  } else {
    context.clearRect(0, 0, canvas.width, canvas.height);
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
