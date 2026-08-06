import type { RuntimeState } from "../shared/contracts";
import type { EditorProject, EditorProjectSummary } from "../shared/editor-project";
import {
  drawProjectFrame,
  drawProjectThumbnail,
  findProjectAction,
  frameAtElapsed
} from "./lib/project-renderer";
import "./styles/control.css";

type Locale = "zh-CN" | "en";
type Theme = "light" | "dark";

const COPY = {
  "zh-CN": {
    brand: "小伴", pageTitle: "我的桌面伙伴", loading: "载入中", currentAction: "当前动作",
    actionControl: "动作控制", speed: "速度", size: "大小", autoCompanion: "自动陪伴",
    designPet: "设计宠物", recall: "召回桌面", pauseActivity: "暂停活动",
    resumeActivity: "继续活动", toggleTheme: "切换主题", toggleLanguage: "切换语言",
    windowControls: "窗口控制", minimize: "最小化", maximize: "最大化", close: "关闭",
    localeLabel: "简体中文", title: "小伴控制台", emptyTitle: "还没有桌面宠物",
    emptyDescription: "从一张空白像素画布开始，设计你的第一个伙伴。", createPet: "创建像素宠物",
    emptyLibrary: "宠物库为空", customPet: "自定义像素宠物", noAction: "暂无动作"
  },
  en: {
    brand: "Buddy", pageTitle: "My desktop companions", loading: "Loading", currentAction: "Current action",
    actionControl: "Action control", speed: "Speed", size: "Size", autoCompanion: "Auto companion",
    designPet: "Design pet", recall: "Recall to desktop", pauseActivity: "Pause activity",
    resumeActivity: "Resume activity", toggleTheme: "Toggle theme", toggleLanguage: "Switch language",
    windowControls: "Window controls", minimize: "Minimize", maximize: "Maximize", close: "Close",
    localeLabel: "English", title: "Buddy Console", emptyTitle: "No desktop pets yet",
    emptyDescription: "Start with a blank pixel canvas and design your first companion.", createPet: "Create pixel pet",
    emptyLibrary: "Pet library is empty", customPet: "Custom pixel pet", noAction: "No actions"
  }
} as const;

type CopyKey = keyof (typeof COPY)["zh-CN"];

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing control element: ${selector}`);
  return element;
}

function getContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  return context;
}

const petList = required<HTMLDivElement>("#pet-list");
const actionList = required<HTMLDivElement>("#action-list");
const petName = required<HTMLHeadingElement>("#pet-name");
const petKind = required<HTMLParagraphElement>("#pet-kind");
const petDescription = required<HTMLParagraphElement>("#pet-description");
const currentAction = required<HTMLElement>("#current-action");
const emptyState = required<HTMLDivElement>("#empty-state");
const autoToggle = required<HTMLInputElement>("#auto-mode");
const pauseButton = required<HTMLButtonElement>("#pause-button");
const recallButton = required<HTMLButtonElement>("#recall-button");
const speedInput = required<HTMLInputElement>("#speed");
const scaleInput = required<HTMLInputElement>("#scale");
const speedValue = required<HTMLOutputElement>("#speed-value");
const scaleValue = required<HTMLOutputElement>("#scale-value");
const localeButton = required<HTMLButtonElement>("#locale-button");
const localeLabel = required<HTMLSpanElement>("#locale-label");
const themeButton = required<HTMLButtonElement>("#theme-button");
const editorButton = required<HTMLButtonElement>("#editor-button");
const stageCanvas = required<HTMLCanvasElement>("#stage-canvas");
const stageContext = getContext2d(stageCanvas);

const savedLocale = window.localStorage.getItem("ep-baby.locale");
let locale: Locale = savedLocale === "zh-CN" || savedLocale === "en"
  ? savedLocale
  : navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
const savedTheme = window.localStorage.getItem("ep-baby.theme");
let theme: Theme = savedTheme === "light" || savedTheme === "dark"
  ? savedTheme
  : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

let state: RuntimeState | undefined;
let projectSummaries: EditorProjectSummary[] = [];
let projects = new Map<string, EditorProject>();
let stageProject: EditorProject | undefined;
let projectRequest = 0;
let actionStartedAt = performance.now();
let lastActionKey = "";

function t(key: CopyKey): string {
  return COPY[locale][key];
}

function setRangeProgress(input: HTMLInputElement): void {
  const progress = ((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
  input.style.setProperty("--range-progress", `${progress}%`);
}

function setControlsDisabled(disabled: boolean): void {
  for (const control of [autoToggle, pauseButton, recallButton, speedInput, scaleInput]) {
    control.disabled = disabled;
  }
}

function buildPetCards(): void {
  petList.replaceChildren();
  if (!projectSummaries.length) {
    const message = document.createElement("p");
    message.className = "pet-library-empty";
    message.textContent = t("emptyLibrary");
    petList.append(message);
    return;
  }

  for (const summary of projectSummaries) {
    const project = projects.get(summary.id);
    if (!project) continue;
    const button = document.createElement("button");
    button.className = "pet-card";
    button.type = "button";
    button.dataset.petId = project.id;
    button.setAttribute("aria-label", project.name);
    const previewHolder = document.createElement("span");
    previewHolder.className = "pet-preview";
    previewHolder.setAttribute("aria-hidden", "true");
    const preview = document.createElement("canvas");
    preview.width = 220;
    preview.height = 150;
    const label = document.createElement("strong");
    label.textContent = project.name;
    previewHolder.append(preview);
    button.append(previewHolder, label);
    const previewContext = preview.getContext("2d");
    if (previewContext) drawProjectThumbnail(previewContext, project);
    button.addEventListener("click", () => void window.desktopPet.selectPet(project.id).then(applyState));
    petList.append(button);
  }
}

function buildActionButtons(project: EditorProject | undefined, nextState: RuntimeState): void {
  actionList.replaceChildren();
  if (!project) return;
  for (const action of project.actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action-button";
    button.classList.toggle("active", action.id === nextState.currentActionId);
    button.setAttribute("aria-pressed", String(action.id === nextState.currentActionId));
    button.title = action.name;
    button.textContent = action.name;
    button.addEventListener("click", () => void window.desktopPet.setAction(action.id).then(applyState));
    actionList.append(button);
  }
  actionList.style.gridTemplateColumns = `repeat(${Math.max(1, Math.min(6, project.actions.length))}, minmax(0, 1fr))`;
}

async function updateStageProject(projectId: string): Promise<void> {
  const request = ++projectRequest;
  stageProject = undefined;
  if (!projectId) {
    stageCanvas.classList.remove("loading");
    return;
  }
  stageCanvas.classList.add("loading");
  try {
    const project = projects.get(projectId) ?? await window.desktopPet.loadEditorProject(projectId);
    if (request !== projectRequest) return;
    stageProject = project;
  } finally {
    if (request === projectRequest) stageCanvas.classList.remove("loading");
  }
}

function applyState(nextState: RuntimeState): void {
  const previousPetId = state?.selectedPetId;
  const actionKey = `${nextState.selectedPetId}:${nextState.currentActionId}`;
  state = nextState;
  if (actionKey !== lastActionKey) {
    actionStartedAt = performance.now();
    lastActionKey = actionKey;
  }

  const project = projects.get(nextState.selectedPetId);
  const action = project ? findProjectAction(project, nextState.currentActionId) : undefined;
  const isEmpty = !project;
  document.body.classList.toggle("library-empty", isEmpty);
  emptyState.hidden = !isEmpty;
  petName.textContent = project?.name ?? t("emptyTitle");
  petKind.textContent = project ? t("customPet") : "";
  petDescription.textContent = project ? `${project.canvas.width} × ${project.canvas.height}` : t("emptyDescription");
  currentAction.textContent = action?.name ?? t("noAction");
  autoToggle.checked = nextState.autoMode;
  pauseButton.classList.toggle("active", nextState.paused);
  pauseButton.setAttribute("aria-label", nextState.paused ? t("resumeActivity") : t("pauseActivity"));
  speedInput.value = String(nextState.speed);
  scaleInput.value = String(nextState.scale);
  speedValue.value = `${nextState.speed.toFixed(1)}×`;
  scaleValue.value = `${Math.round(nextState.scale * 100)}%`;
  setRangeProgress(speedInput);
  setRangeProgress(scaleInput);
  setControlsDisabled(isEmpty);
  buildActionButtons(project, nextState);

  for (const card of petList.querySelectorAll<HTMLButtonElement>(".pet-card")) {
    const selected = card.dataset.petId === nextState.selectedPetId;
    card.classList.toggle("selected", selected);
    card.setAttribute("aria-pressed", String(selected));
  }
  if (previousPetId !== nextState.selectedPetId || stageProject?.id !== project?.id) {
    void updateStageProject(project?.id ?? "");
  }
}

function drawStageFrame(now: number): void {
  stageContext.clearRect(0, 0, stageCanvas.width, stageCanvas.height);
  if (state && stageProject) {
    const action = findProjectAction(stageProject, state.currentActionId);
    const frame = frameAtElapsed(action, state.paused ? 0 : now - actionStartedAt, state.speed);
    drawProjectFrame(stageContext, stageProject, frame, {
      maxSize: Math.min(370, 320 * state.scale),
      bottomPadding: 58,
      flip: state.direction === -1
    });
  }
  window.requestAnimationFrame(drawStageFrame);
}

async function refreshProjects(): Promise<void> {
  projectSummaries = await window.desktopPet.listEditorProjects();
  const loaded = await Promise.all(projectSummaries.map((summary) => window.desktopPet.loadEditorProject(summary.id)));
  projects = new Map(loaded.filter((project): project is EditorProject => Boolean(project)).map((project) => [project.id, project]));
  buildPetCards();
  if (state) applyState(state);
}

function applyTheme(nextTheme: Theme): void {
  theme = nextTheme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem("ep-baby.theme", theme);
  themeButton.classList.toggle("dark-active", theme === "dark");
}

function renderStaticCopy(): void {
  document.documentElement.lang = locale;
  document.title = t("title");
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n as CopyKey | undefined;
    if (key && key in COPY[locale]) element.textContent = t(key);
  }
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n-aria]")) {
    const key = element.dataset.i18nAria as CopyKey | undefined;
    if (key && key in COPY[locale]) element.setAttribute("aria-label", t(key));
  }
  localeLabel.textContent = t("localeLabel");
}

function setLocale(nextLocale: Locale): void {
  locale = nextLocale;
  window.localStorage.setItem("ep-baby.locale", locale);
  renderStaticCopy();
  buildPetCards();
  if (state) applyState(state);
}

autoToggle.addEventListener("change", () => void window.desktopPet.setAutoMode(autoToggle.checked).then(applyState));
pauseButton.addEventListener("click", () => void window.desktopPet.setPaused(!(state?.paused ?? false)).then(applyState));
recallButton.addEventListener("click", () => void window.desktopPet.recall().then(applyState));
speedInput.addEventListener("input", () => {
  speedValue.value = `${Number(speedInput.value).toFixed(1)}×`;
  setRangeProgress(speedInput);
});
speedInput.addEventListener("change", () => void window.desktopPet.setSpeed(Number(speedInput.value)).then(applyState));
scaleInput.addEventListener("input", () => {
  scaleValue.value = `${Math.round(Number(scaleInput.value) * 100)}%`;
  setRangeProgress(scaleInput);
});
scaleInput.addEventListener("change", () => void window.desktopPet.setScale(Number(scaleInput.value)).then(applyState));
localeButton.addEventListener("click", () => setLocale(locale === "zh-CN" ? "en" : "zh-CN"));
themeButton.addEventListener("click", () => applyTheme(theme === "light" ? "dark" : "light"));
editorButton.addEventListener("click", () => window.desktopPet.showEditor(state?.selectedPetId || undefined));
required<HTMLButtonElement>("#empty-create").addEventListener("click", () => window.desktopPet.showEditor());
required<HTMLButtonElement>("#window-minimize").addEventListener("click", () => window.desktopPet.minimizeControl());
required<HTMLButtonElement>("#window-maximize").addEventListener("click", () => window.desktopPet.toggleMaximizeControl());
required<HTMLButtonElement>("#window-close").addEventListener("click", () => window.desktopPet.closeControl());

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.key.toLowerCase() === "r" && state?.selectedPetId) void window.desktopPet.recall().then(applyState);
  if (event.code === "Space" && state?.selectedPetId) {
    event.preventDefault();
    void window.desktopPet.setPaused(!(state?.paused ?? false)).then(applyState);
  }
});

window.desktopPet.onStateChanged(applyState);
window.desktopPet.onEditorProjectChanged((projectId) => {
  void window.desktopPet.loadEditorProject(projectId).then((project) => {
    if (!project) return;
    projects.set(project.id, project);
    const existing = projectSummaries.find((summary) => summary.id === project.id);
    const summary = {
      id: project.id, name: project.name, updatedAt: project.updatedAt,
      width: project.canvas.width, height: project.canvas.height, actionCount: project.actions.length
    };
    projectSummaries = [summary, ...projectSummaries.filter((candidate) => candidate !== existing && candidate.id !== project.id)];
    buildPetCards();
    if (state) applyState(state);
  });
});

async function initialize(): Promise<void> {
  applyTheme(theme);
  renderStaticCopy();
  await refreshProjects();
  applyState(await window.desktopPet.getState());
}

void initialize();
window.requestAnimationFrame(drawStageFrame);
