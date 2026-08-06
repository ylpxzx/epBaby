import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "src/main/index.ts",
    preload: "src/preload/index.ts"
  },
  format: ["cjs"],
  outDir: "dist/electron",
  outExtension: () => ({ js: ".cjs" }),
  platform: "node",
  target: "node22",
  sourcemap: true,
  clean: true,
  external: ["electron"]
});
