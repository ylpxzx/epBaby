import { promises as fs } from "node:fs";
import path from "node:path";
import {
  normalizeEditorProject,
  projectSummary,
  type EditorProject,
  type EditorProjectSummary
} from "../shared/editor-project";

export class EditorProjectStore {
  private readonly directory: string;

  constructor(userDataDirectory: string) {
    this.directory = path.join(userDataDirectory, "editor-projects");
  }

  async clearAllOnce(migrationId: string): Promise<boolean> {
    await fs.mkdir(this.directory, { recursive: true });
    const safeMigrationId = migrationId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeMigrationId) throw new Error("Invalid project cleanup migration id");
    const marker = path.join(this.directory, `.${safeMigrationId}`);
    try {
      await fs.access(marker);
      return false;
    } catch {
      const entries = await fs.readdir(this.directory, { withFileTypes: true });
      await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
          .map((entry) => fs.rm(path.join(this.directory, entry.name)))
      );
      await fs.writeFile(marker, new Date().toISOString(), "utf8");
      return true;
    }
  }

  async seedProjectFile(sourceFile: string): Promise<EditorProject> {
    await fs.mkdir(this.directory, { recursive: true });
    const value = JSON.parse((await fs.readFile(sourceFile, "utf8")).replace(/^\uFEFF/, ""));
    const project = normalizeEditorProject(value);
    const target = this.projectPath(project.id);
    try {
      const existing = await this.load(project.id);
      if (existing) return existing;
    } catch {
      // A malformed local copy is replaced by the valid bundled default.
    }
    await fs.writeFile(target, JSON.stringify(project, null, 2), "utf8");
    return project;
  }

  async replaceProjectFileOnce(
    sourceFile: string,
    migrationId: string,
    expectedProjectId?: string
  ): Promise<EditorProject | undefined> {
    await fs.mkdir(this.directory, { recursive: true });
    const safeMigrationId = migrationId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeMigrationId) throw new Error("Invalid project replacement migration id");
    const marker = path.join(this.directory, `.${safeMigrationId}`);
    try {
      await fs.access(marker);
      if (expectedProjectId) {
        try {
          await fs.access(this.projectPath(expectedProjectId));
          return undefined;
        } catch {
          // Re-seed a bundled project if its local file was removed.
        }
      }
      return this.seedProjectFile(sourceFile);
    } catch {
      const value = JSON.parse((await fs.readFile(sourceFile, "utf8")).replace(/^\uFEFF/, ""));
      const project = normalizeEditorProject(value);
      await fs.writeFile(this.projectPath(project.id), JSON.stringify(project, null, 2), "utf8");
      await fs.writeFile(marker, new Date().toISOString(), "utf8");
      return project;
    }
  }

  async removeProjectOnce(projectId: string, migrationId: string): Promise<boolean> {
    await fs.mkdir(this.directory, { recursive: true });
    const safeMigrationId = migrationId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeMigrationId) throw new Error("Invalid project removal migration id");
    const marker = path.join(this.directory, `.${safeMigrationId}`);
    try {
      await fs.access(marker);
      return false;
    } catch {
      await fs.rm(this.projectPath(projectId), { force: true });
      await fs.writeFile(marker, new Date().toISOString(), "utf8");
      return true;
    }
  }

  async list(): Promise<EditorProjectSummary[]> {
    return (await this.loadAll())
      .map(projectSummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadAll(): Promise<EditorProject[]> {
    await fs.mkdir(this.directory, { recursive: true });
    const entries = await fs.readdir(this.directory, { withFileTypes: true });
    const projects = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          try {
            const value = JSON.parse(
              (await fs.readFile(path.join(this.directory, entry.name), "utf8")).replace(/^\uFEFF/, "")
            );
            return normalizeEditorProject(value);
          } catch {
            return undefined;
          }
        })
    );
    return projects.filter((project): project is EditorProject => Boolean(project));
  }

  async load(projectId: string): Promise<EditorProject | undefined> {
    const filename = this.projectPath(projectId);
    try {
      return normalizeEditorProject(
        JSON.parse((await fs.readFile(filename, "utf8")).replace(/^\uFEFF/, ""))
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async save(value: EditorProject): Promise<EditorProject> {
    await fs.mkdir(this.directory, { recursive: true });
    const project = normalizeEditorProject(value);
    project.updatedAt = new Date().toISOString();
    const target = this.projectPath(project.id);
    const temporary = `${target}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(project, null, 2), "utf8");
    await fs.rename(temporary, target);
    return project;
  }

  private projectPath(projectId: string): string {
    const safeId = projectId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeId) throw new Error("Invalid editor project id");
    return path.join(this.directory, `${safeId}.json`);
  }
}
