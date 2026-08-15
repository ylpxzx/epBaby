<template>
  <div ref="speechElement" class="speech" :class="{ visible: speechVisible }" aria-live="polite">
    {{ speechMessage }}
  </div>
  <canvas
    ref="canvasElement"
    class="pet-canvas"
    width="280"
    height="260"
    aria-label="桌面像素宠物"
    @pointermove="handlePointerMove"
    @pointerdown="handlePointerDown"
    @wheel.prevent="handleWheel"
    @contextmenu.prevent="desktopPet.showControl()"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import type { RuntimePetProject, RuntimeState } from "../../shared/contracts";
import { drawProjectFrame, findProjectAction, frameAtElapsed } from "../lib/project-renderer";

const desktopPet = window.desktopPet;
const canvasElement = ref<HTMLCanvasElement>();
const speechElement = ref<HTMLDivElement>();
const speechMessage = ref("");
const speechVisible = ref(false);
const state = shallowRef<RuntimeState>();
const project = shallowRef<RuntimePetProject>();

let context: CanvasRenderingContext2D;
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
let clickTimer: number | undefined;
let clickCount = 0;
let pointerDownAt = 0;
let lastWheelAt = 0;
let animationFrame = 0;
let removeStateListener: (() => void) | undefined;
let removeProjectListener: (() => void) | undefined;

function setClickThrough(ignore: boolean): void {
  if (clickThrough === ignore) return;
  clickThrough = ignore;
  desktopPet.setClickThrough(ignore);
}

function showSpeech(message: string): void {
  speechMessage.value = message;
  speechVisible.value = true;
  if (speechTimer) window.clearTimeout(speechTimer);
  speechTimer = window.setTimeout(() => {
    speechVisible.value = false;
  }, 1500);
}

function isOpaqueAt(x: number, y: number): boolean {
  const canvas = canvasElement.value;
  if (!canvas || x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false;
  return context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3]! > 24;
}

async function updateProject(projectId: string): Promise<void> {
  const canvas = canvasElement.value;
  if (!canvas) return;
  const token = ++projectToken;
  loadingProjectId = projectId;
  project.value = undefined;
  lastRenderKey = "";
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!projectId) return;
  try {
    const loaded = await desktopPet.loadPetProject(projectId);
    if (token === projectToken) {
      project.value = loaded;
      projectRenderVersion += 1;
    }
  } catch (error) {
    if (token === projectToken) loadingProjectId = "";
    console.error(error);
    showSpeech("宠物工程加载失败");
  }
}

function applyState(nextState: RuntimeState): void {
  const previousPetId = state.value?.selectedPetId;
  const nextKey = `${nextState.selectedPetId}:${nextState.currentActionId}`;
  state.value = nextState;
  if (nextKey !== lastActionKey) {
    actionStartedAt = performance.now();
    lastActionKey = nextKey;
  }
  if (previousPetId !== nextState.selectedPetId || (!project.value && loadingProjectId !== nextState.selectedPetId)) {
    void updateProject(nextState.selectedPetId);
  }
}

function render(now: number): void {
  const canvas = canvasElement.value;
  const currentState = state.value;
  const currentProject = project.value;
  if (canvas && currentState && currentProject) {
    const action = findProjectAction(currentProject, currentState.currentActionId);
    const elapsed = currentState.paused ? 0 : now - actionStartedAt;
    const frame = frameAtElapsed(action, elapsed, currentState.speed);
    const maxSize = Math.round(Math.min(244, 204 * currentState.scale));
    const renderKey = `${projectRenderVersion}:${frame?.id ?? ""}:${maxSize}:${currentState.direction}`;
    if (renderKey !== lastRenderKey) {
      drawProjectFrame(context, currentProject, frame, {
        maxSize,
        bottomPadding: 4,
        flip: currentState.direction === -1
      });
      lastRenderKey = renderKey;
    }
  } else if (canvas && lastRenderKey) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    lastRenderKey = "";
  }
  animationFrame = requestAnimationFrame(render);
}

function handlePointerMove(event: PointerEvent): void {
  if (dragging) {
    if ((event.buttons & 1) === 0) {
      dragging = false;
      desktopPet.setDragging(false);
      return;
    }
    const deltaX = event.screenX - lastScreenPoint.x;
    const deltaY = event.screenY - lastScreenPoint.y;
    dragDistance += Math.abs(deltaX) + Math.abs(deltaY);
    lastScreenPoint = { x: event.screenX, y: event.screenY };
    desktopPet.moveBy(deltaX, deltaY);
    return;
  }
  setClickThrough(!isOpaqueAt(event.offsetX, event.offsetY));
}

function handlePointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !isOpaqueAt(event.offsetX, event.offsetY)) return;
  event.preventDefault();
  canvasElement.value?.setPointerCapture(event.pointerId);
  dragging = true;
  pointerDownAt = performance.now();
  dragDistance = 0;
  lastScreenPoint = { x: event.screenX, y: event.screenY };
  desktopPet.setDragging(true);
  // Do not rely on the cached hover state here. Electron must stop ignoring
  // mouse input before the first drag delta is sent.
  clickThrough = false;
  desktopPet.setClickThrough(false);
}

function handlePointerUp(event: PointerEvent): void {
  if (!dragging) return;
  if (canvasElement.value?.hasPointerCapture(event.pointerId)) {
    canvasElement.value.releasePointerCapture(event.pointerId);
  }
  dragging = false;
  desktopPet.setDragging(false);
  if (dragDistance >= 8) {
    void desktopPet.interact("drag-release").then(applyState);
    return;
  }
  if (performance.now() - pointerDownAt >= 650) {
    clickCount = 0;
    if (clickTimer) window.clearTimeout(clickTimer);
    void desktopPet.interact("long-press").then(applyState);
    showSpeech("长按互动");
    return;
  }
  clickCount += 1;
  if (clickTimer) window.clearTimeout(clickTimer);
  if (clickCount >= 3) {
    clickCount = 0;
    void desktopPet.interact("triple-click").then(applyState);
    showSpeech("连击触发！");
    return;
  }
  clickTimer = window.setTimeout(() => {
    const kind = clickCount === 2 ? "double-click" : "click";
    clickCount = 0;
    void desktopPet.interact(kind).then(applyState);
  }, 320);
}

function handleWheel(event: WheelEvent): void {
  const now = performance.now();
  if (now - lastWheelAt < 450) return;
  lastWheelAt = now;
  void desktopPet.interact(event.deltaY < 0 ? "wheel-up" : "wheel-down").then(applyState);
}

function handleMouseLeave(): void {
  if (!dragging) setClickThrough(true);
}

onMounted(() => {
  const canvas = canvasElement.value;
  const nextContext = canvas?.getContext("2d", { willReadFrequently: true });
  if (!canvas || !nextContext) throw new Error("Canvas 2D is unavailable");
  context = nextContext;
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointercancel", handlePointerUp);
  window.addEventListener("mouseleave", handleMouseLeave);
  removeStateListener = desktopPet.onStateChanged(applyState);
  removeProjectListener = desktopPet.onEditorProjectChanged((projectId) => {
    if (state.value?.selectedPetId === projectId) void updateProject(projectId);
  });
  void desktopPet.getState().then(applyState);
  desktopPet.setClickThrough(true);
  animationFrame = requestAnimationFrame(render);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerup", handlePointerUp);
  window.removeEventListener("pointercancel", handlePointerUp);
  window.removeEventListener("mouseleave", handleMouseLeave);
  removeStateListener?.();
  removeProjectListener?.();
  cancelAnimationFrame(animationFrame);
  if (speechTimer) window.clearTimeout(speechTimer);
  if (clickTimer) window.clearTimeout(clickTimer);
});
</script>
