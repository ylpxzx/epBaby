import type { Direction } from "./pets";
import type {
  EditorExportBundle,
  EditorExportResult,
  EditorLayer,
  EditorProject,
  EditorProjectSummary
} from "./editor-project";

export interface PetPosition {
  x: number;
  y: number;
}

export interface StoredSettings {
  selectedPetId: string;
  autoMode: boolean;
  paused: boolean;
  speed: number;
  scale: number;
  position?: PetPosition;
}

export interface RuntimeState extends StoredSettings {
  currentActionId: string;
  direction: Direction;
}

export interface RuntimePetProject {
  id: string;
  name: string;
  canvas: { width: number; height: number };
  palette: string[];
  layers: EditorLayer[];
  actions: Array<{
    id: string;
    name: string;
    loop: boolean;
    frames: Array<{
      id: string;
      durationMs: number;
      cels: Record<
        string,
        { pixels: Uint8Array; offsetX: number; offsetY: number }
      >;
    }>;
  }>;
}

export interface DesktopPetApi {
  getState(): Promise<RuntimeState>;
  selectPet(petId: string): Promise<RuntimeState>;
  setAction(actionId: string): Promise<RuntimeState>;
  setAutoMode(enabled: boolean): Promise<RuntimeState>;
  setPaused(paused: boolean): Promise<RuntimeState>;
  setSpeed(speed: number): Promise<RuntimeState>;
  setScale(scale: number): Promise<RuntimeState>;
  interact(): Promise<RuntimeState>;
  recall(): Promise<RuntimeState>;
  showControl(): void;
  showEditor(projectId?: string): void;
  listEditorProjects(): Promise<EditorProjectSummary[]>;
  loadPetProject(projectId: string): Promise<RuntimePetProject | undefined>;
  loadEditorProject(projectId: string): Promise<EditorProject | undefined>;
  saveEditorProject(project: EditorProject): Promise<EditorProject>;
  exportEditorProject(bundle: EditorExportBundle): Promise<EditorExportResult>;
  minimizeControl(): void;
  toggleMaximizeControl(): void;
  closeControl(): void;
  quit(): void;
  setClickThrough(ignore: boolean): void;
  setDragging(dragging: boolean): void;
  moveBy(deltaX: number, deltaY: number): void;
  onStateChanged(listener: (state: RuntimeState) => void): () => void;
  onEditorProjectChanged(listener: (projectId: string) => void): () => void;
  onEditorProjectRequested(listener: (projectId: string) => void): () => void;
}
