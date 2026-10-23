import { readFileSync } from "node:fs";

// Build metadata. Both values are inlined into the server and client bundles at
// build time, so the sidebar can read them from either side without a prop
// chain. The version stays single-sourced in this package's `package.json`.
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared package is consumed as TypeScript source (no build step).
  transpilePackages: ["@jfolio/shared"],
  // Next 16 writes agent instructions into AGENTS.md by default. The repo keeps
  // a single root AGENTS.md, so opt out of the per-app generated file.
  agentRules: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    // Build artifact instant, not deploy/restart time: it only changes when a
    // new bundle is built. `deploy.sh` may pin it for reproducible builds.
    NEXT_PUBLIC_BUILD_TIME:
      process.env.NEXT_PUBLIC_BUILD_TIME ?? new Date().toISOString(),
  },
};

export default nextConfig;
