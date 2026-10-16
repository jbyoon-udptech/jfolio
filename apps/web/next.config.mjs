/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared package is consumed as TypeScript source (no build step).
  transpilePackages: ["@jfolio/shared"],
  eslint: {
    // Linting is run from the repo root with the shared ESLint config.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
