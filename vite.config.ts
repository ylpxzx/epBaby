import path from "node:path";
import fs from "node:fs";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.resolve(import.meta.dirname, "src/renderer"),
  publicDir: false,
  base: "./",
  plugins: [
    {
      name: "copy-default-pets",
      closeBundle() {
        fs.cpSync(
          path.resolve(import.meta.dirname, "default-pets"),
          path.resolve(import.meta.dirname, "dist/renderer/default-pets"),
          { recursive: true }
        );
      }
    }
  ],
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/renderer"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        pet: path.resolve(import.meta.dirname, "src/renderer/pet.html"),
        control: path.resolve(import.meta.dirname, "src/renderer/control.html"),
        editor: path.resolve(import.meta.dirname, "src/renderer/editor.html")
      }
    }
  }
});
