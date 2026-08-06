import type { EditorProject } from "../../shared/editor-project";

export interface PixelChange {
  index: number;
  before: number;
  after: number;
}

interface PixelHistoryEntry {
  kind: "pixels";
  actionId: string;
  frameId: string;
  layerId: string;
  changes: PixelChange[];
}

interface ProjectHistoryEntry {
  kind: "project";
  before: EditorProject;
  after: EditorProject;
}

type HistoryEntry = PixelHistoryEntry | ProjectHistoryEntry;

function findPixels(project: EditorProject, entry: PixelHistoryEntry): number[] | undefined {
  const action = project.actions.find((candidate) => candidate.id === entry.actionId);
  const frame = action?.frames.find((candidate) => candidate.id === entry.frameId);
  return frame?.cels[entry.layerId]?.pixels;
}

export class EditorHistory {
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];
  private readonly limit: number;

  constructor(limit = 120) {
    this.limit = limit;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  pushPixels(entry: Omit<PixelHistoryEntry, "kind">): void {
    if (!entry.changes.length) return;
    this.push({ kind: "pixels", ...entry });
  }

  pushProject(before: EditorProject, after: EditorProject): void {
    this.push({ kind: "project", before, after });
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  undo(project: EditorProject): EditorProject {
    const entry = this.undoStack.pop();
    if (!entry) return project;
    this.redoStack.push(entry);
    if (entry.kind === "project") return structuredClone(entry.before);
    const pixels = findPixels(project, entry);
    if (pixels) for (const change of entry.changes) pixels[change.index] = change.before;
    return project;
  }

  redo(project: EditorProject): EditorProject {
    const entry = this.redoStack.pop();
    if (!entry) return project;
    this.undoStack.push(entry);
    if (entry.kind === "project") return structuredClone(entry.after);
    const pixels = findPixels(project, entry);
    if (pixels) for (const change of entry.changes) pixels[change.index] = change.after;
    return project;
  }

  private push(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    this.redoStack.length = 0;
    if (this.undoStack.length > this.limit) this.undoStack.shift();
  }
}
