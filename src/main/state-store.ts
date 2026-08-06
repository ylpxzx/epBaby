import fs from "node:fs";
import path from "node:path";
import type { StoredSettings } from "../shared/contracts";

const DEFAULT_SETTINGS: StoredSettings = {
  selectedPetId: "",
  autoMode: true,
  paused: false,
  speed: 1,
  scale: 1
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class StateStore {
  private readonly filePath: string;
  private writeTimer: NodeJS.Timeout | undefined;

  constructor(userDataDirectory: string) {
    this.filePath = path.join(userDataDirectory, "pet-state.json");
  }

  load(): StoredSettings {
    try {
      const candidate = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<StoredSettings>;
      const selectedPetId = typeof candidate.selectedPetId === "string" ? candidate.selectedPetId : "";
      const position = candidate.position;

      return {
        selectedPetId,
        autoMode: candidate.autoMode !== false,
        paused: candidate.paused === true,
        speed: clamp(Number(candidate.speed) || 1, 0.5, 2),
        scale: clamp(Number(candidate.scale) || 1, 0.7, 1.35),
        position:
          position && Number.isFinite(position.x) && Number.isFinite(position.y)
            ? { x: Math.round(position.x), y: Math.round(position.y) }
            : undefined
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  scheduleSave(settings: StoredSettings): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.saveNow(settings), 250);
  }

  saveNow(settings: StoredSettings): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = undefined;
    }

    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(settings, null, 2), "utf8");
    } catch (error) {
      console.error("Unable to save pet state", error);
    }
  }
}
