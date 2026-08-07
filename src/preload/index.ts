import { contextBridge, ipcRenderer } from "electron";
import type { DesktopPetApi, RuntimePetProject, RuntimeState } from "../shared/contracts";
import type {
  EditorExportBundle,
  EditorExportResult,
  EditorProject,
  EditorProjectSummary
} from "../shared/editor-project";

const api: DesktopPetApi = {
  getState: () => ipcRenderer.invoke("pet:get-state") as Promise<RuntimeState>,
  selectPet: (petId) => ipcRenderer.invoke("pet:select", petId) as Promise<RuntimeState>,
  setAction: (actionId) => ipcRenderer.invoke("pet:set-action", actionId) as Promise<RuntimeState>,
  setAutoMode: (enabled) => ipcRenderer.invoke("pet:set-auto", enabled) as Promise<RuntimeState>,
  setPaused: (paused) => ipcRenderer.invoke("pet:set-paused", paused) as Promise<RuntimeState>,
  setSpeed: (speed) => ipcRenderer.invoke("pet:set-speed", speed) as Promise<RuntimeState>,
  setScale: (scale) => ipcRenderer.invoke("pet:set-scale", scale) as Promise<RuntimeState>,
  interact: () => ipcRenderer.invoke("pet:interact") as Promise<RuntimeState>,
  recall: () => ipcRenderer.invoke("pet:recall") as Promise<RuntimeState>,
  showControl: () => ipcRenderer.send("pet:show-control"),
  showEditor: (projectId) => ipcRenderer.send("editor:show", projectId),
  listEditorProjects: () => ipcRenderer.invoke("editor:list") as Promise<EditorProjectSummary[]>,
  loadPetProject: (projectId) =>
    ipcRenderer.invoke("pet:load-project", projectId) as Promise<RuntimePetProject | undefined>,
  loadEditorProject: (projectId) =>
    ipcRenderer.invoke("editor:load", projectId) as Promise<EditorProject | undefined>,
  saveEditorProject: (project) =>
    ipcRenderer.invoke("editor:save", project) as Promise<EditorProject>,
  exportEditorProject: (bundle) =>
    ipcRenderer.invoke("editor:export", bundle as EditorExportBundle) as Promise<EditorExportResult>,
  minimizeControl: () => ipcRenderer.send("control:minimize"),
  toggleMaximizeControl: () => ipcRenderer.send("control:toggle-maximize"),
  closeControl: () => ipcRenderer.send("control:close"),
  quit: () => ipcRenderer.send("pet:quit"),
  setClickThrough: (ignore) => ipcRenderer.send("pet:click-through", ignore),
  setDragging: (dragging) => ipcRenderer.send("pet:dragging", dragging),
  moveBy: (deltaX, deltaY) => ipcRenderer.send("pet:move-by", deltaX, deltaY),
  onStateChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: RuntimeState) => listener(state);
    ipcRenderer.on("pet:state-changed", handler);
    return () => ipcRenderer.removeListener("pet:state-changed", handler);
  },
  onEditorProjectChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, projectId: string) => listener(projectId);
    ipcRenderer.on("editor:project-changed", handler);
    return () => ipcRenderer.removeListener("editor:project-changed", handler);
  },
  onEditorProjectRequested: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, projectId: string) => listener(projectId);
    ipcRenderer.on("editor:open-project", handler);
    return () => ipcRenderer.removeListener("editor:open-project", handler);
  }
};

contextBridge.exposeInMainWorld("desktopPet", api);
