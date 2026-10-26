import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/cli/seed.ts",
    "src/cli/create-user.ts",
    "src/cli/backfill.ts",
    "src/cli/backup.ts",
    "src/cli/restore.ts",
  ],
  format: ["cjs"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Bundle the workspace-only shared package (its `main` points at TS source).
  noExternal: ["@jfolio/shared"],
});
