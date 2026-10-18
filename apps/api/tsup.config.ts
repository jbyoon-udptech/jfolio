import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli/seed.ts"],
  format: ["cjs"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Bundle the workspace-only shared package (its `main` points at TS source).
  noExternal: ["@jfolio/shared"],
});
