// PM2 process definition for the jFolio production release.
//
// deploy.sh uploads the release to <DEPLOY_PATH> and runs:
//   pm2 startOrReload ecosystem.config.cjs --update-env
//
// The application environment is read from <DEPLOY_PATH>/.env (uploaded by
// deploy.sh) and injected into both processes.
const path = require("path");

try {
  require("dotenv").config({ path: path.join(__dirname, ".env") });
} catch (error) {
  console.warn("[ecosystem] dotenv unavailable, relying on the current process.env");
}

const root = __dirname;
const appEnv = { ...process.env, NODE_ENV: "production" };

module.exports = {
  apps: [
    {
      name: "jfolio-api",
      cwd: path.join(root, "apps", "api"),
      script: path.join(root, "apps", "api", "dist", "index.js"),
      interpreter: "node",
      env: appEnv,
      autorestart: true,
      max_memory_restart: "512M",
      kill_timeout: 5000,
      time: true,
    },
    {
      name: "jfolio-web",
      cwd: path.join(root, "apps", "web"),
      script: path.join(root, "node_modules", "next", "dist", "bin", "next"),
      // Loopback only: nginx terminates TLS on 443 and proxies to this port.
      // Run ./deploy-nginx.sh <target> once before exposing the site.
      args: `start -H 127.0.0.1 -p ${process.env.WEB_PORT || 3000}`,
      interpreter: "node",
      env: appEnv,
      autorestart: true,
      max_memory_restart: "512M",
      kill_timeout: 5000,
      time: true,
    },
  ],
};
