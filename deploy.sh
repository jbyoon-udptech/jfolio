#!/usr/bin/env bash
#
# jFolio deployer.
#
#   ./deploy.sh production
#
# Builds the monorepo on this developer machine, assembles a production release
# (API dist + Next.js build + production-only node_modules) and syncs it to an
# OCI instance, where PM2 (re)starts the API and web processes.
#
# Configuration lives in deploy/<target>.env (deploy connection + build-time
# vars) and deploy/<target>.app.env (runtime application env, uploaded as
# .env on the server). Both are gitignored; see the *.example templates.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# ---------- pretty output ----------
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_BLUE=$'\033[34m'; C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
else
  C_RESET=""; C_BLUE=""; C_GREEN=""; C_YELLOW=""; C_RED=""
fi
log()  { printf '%s==>%s %s\n'  "$C_BLUE"   "$C_RESET" "$*"; }
ok()   { printf '%s  ok%s %s\n' "$C_GREEN"  "$C_RESET" "$*"; }
warn() { printf '%swarn%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die()  { printf '%sERROR%s %s\n' "$C_RED"   "$C_RESET" "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [target] [options]

  target            Deployment target name (default: production).
                    Loads deploy/<target>.env and deploy/<target>.app.env.

Options:
  --skip-build      Reuse existing build output (apps/api/dist, apps/web/.next).
  --skip-restart    Sync files only; do not restart PM2 processes.
  --seed            Run the instrument/portfolio seed on the server after sync.
  -h, --help        Show this help.

Examples:
  ./deploy.sh production
  ./deploy.sh production --skip-build
  ./deploy.sh production --seed
EOF
}

# ---------- args ----------
TARGET="production"
SKIP_BUILD=0
SKIP_RESTART=0
RUN_SEED=0
for arg in "$@"; do
  case "$arg" in
    --skip-build)   SKIP_BUILD=1 ;;
    --skip-restart) SKIP_RESTART=1 ;;
    --seed)         RUN_SEED=1 ;;
    -h|--help)      usage; exit 0 ;;
    -*)             die "unknown option: $arg (try --help)" ;;
    *)              TARGET="$arg" ;;
  esac
done

CONFIG_FILE="$REPO_ROOT/deploy/${TARGET}.env"
DEFAULT_APP_ENV_FILE="$REPO_ROOT/deploy/${TARGET}.app.env"

# ---------- config ----------
[[ -f "$CONFIG_FILE" ]] || die "missing deploy config: deploy/${TARGET}.env
  cp deploy/production.env.example deploy/${TARGET}.env  # then edit it"

# Export deploy config (also carries build-time NEXT_PUBLIC_* vars).
set -a
# shellcheck disable=SC1090
source "$CONFIG_FILE"
set +a

[[ -n "${DEPLOY_HOST:-}" ]] || die "DEPLOY_HOST is required in deploy/${TARGET}.env"
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/${DEPLOY_USER}/jfolio}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-}"
DEPLOY_APP_ENV_FILE="${DEPLOY_APP_ENV_FILE:-$DEFAULT_APP_ENV_FILE}"
DEPLOY_API_PORT="${DEPLOY_API_PORT:-3001}"
DEPLOY_WEB_PORT="${DEPLOY_WEB_PORT:-3000}"

APP_ENV_FILE="$DEPLOY_APP_ENV_FILE"
[[ -f "$APP_ENV_FILE" ]] || die "missing application env file: $APP_ENV_FILE
  cp deploy/production.app.env.example deploy/${TARGET}.app.env  # then edit it"

# ---------- preflight ----------
for cmd in node yarn rsync ssh scp; do
  command -v "$cmd" >/dev/null 2>&1 || die "required command not found: $cmd"
done

SSH_OPTS=(-p "$DEPLOY_PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
# scp uses -P (uppercase) for the port; lowercase -p means preserve timestamps.
SCP_OPTS=(-P "$DEPLOY_PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
if [[ -n "$DEPLOY_SSH_KEY" ]]; then
  key="${DEPLOY_SSH_KEY/#\~/$HOME}"
  [[ -f "$key" ]] || die "SSH key not found: $key"
  SSH_OPTS+=(-i "$key")
  SCP_OPTS+=(-i "$key")
fi
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

log "target=$TARGET  remote=$REMOTE  path=$DEPLOY_PATH"

# ---------- build ----------
if [[ $SKIP_BUILD -eq 0 ]]; then
  log "installing workspace dependencies"
  yarn install --frozen-lockfile
  log "building API and web (build-time NEXT_PUBLIC_* come from deploy/${TARGET}.env)"
  yarn build
  ok "build complete"
else
  warn "--skip-build: reusing existing apps/api/dist and apps/web/.next"
fi

[[ -f "$REPO_ROOT/apps/api/dist/index.js" ]] || die "apps/api/dist/index.js not found; run a build first"
[[ -d "$REPO_ROOT/apps/web/.next" ]] || die "apps/web/.next not found; run a build first"
if [[ $RUN_SEED -eq 1 && ! -f "$REPO_ROOT/apps/api/dist/cli/seed.js" ]]; then
  die "--seed requires apps/api/dist/cli/seed.js; run a full build (omit --skip-build)"
fi

# ---------- assemble release ----------
STAGE_DIR="$REPO_ROOT/.deploy/${TARGET}"
log "assembling release in .deploy/${TARGET}"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

rsync -a \
  --exclude node_modules \
  --exclude .git \
  --exclude .next \
  --exclude dist \
  --exclude /.deploy \
  --exclude /deploy \
  --exclude coverage \
  --exclude '*.log' \
  "$REPO_ROOT/" "$STAGE_DIR/"

cp -r "$REPO_ROOT/apps/api/dist" "$STAGE_DIR/apps/api/dist"
cp -r "$REPO_ROOT/apps/web/.next" "$STAGE_DIR/apps/web/.next"

log "installing production-only dependencies for the release"
( cd "$STAGE_DIR" && yarn install --production --frozen-lockfile )
ok "release assembled ($(du -sh "$STAGE_DIR" | cut -f1))"

# ---------- connectivity ----------
log "checking SSH connectivity"
ssh "${SSH_OPTS[@]}" "$REMOTE" true || die "cannot connect to $REMOTE (check DEPLOY_HOST/USER/PORT/KEY)"

# ---------- sync ----------
log "syncing release to $REMOTE:$DEPLOY_PATH"
ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p '$DEPLOY_PATH'"
# Keep the server-side .env across deploys; it is uploaded explicitly below.
rsync -az --delete --exclude '.env' \
  -e "ssh $(printf '%q ' "${SSH_OPTS[@]}")" \
  "$STAGE_DIR/" "$REMOTE:$DEPLOY_PATH/"

log "uploading application environment (.env)"
scp "${SCP_OPTS[@]}" "$APP_ENV_FILE" "$REMOTE:$DEPLOY_PATH/.env" >/dev/null
ssh "${SSH_OPTS[@]}" "$REMOTE" "chmod 600 '$DEPLOY_PATH/.env'"
ok "files synced"

# ---------- seed (optional) ----------
if [[ $RUN_SEED -eq 1 ]]; then
  log "seeding database on $REMOTE"
  ssh "${SSH_OPTS[@]}" "$REMOTE" bash -s <<REMOTE
set -euo pipefail
# Non-interactive SSH skips ~/.bashrc; load nvm-managed node when present.
export NVM_DIR="\$HOME/.nvm"
if [ -s "\$NVM_DIR/nvm.sh" ]; then
  . "\$NVM_DIR/nvm.sh"
fi
cd '$DEPLOY_PATH'
node apps/api/dist/cli/seed.js
REMOTE
  ok "database seeded"
fi

# ---------- restart ----------
if [[ $SKIP_RESTART -eq 0 ]]; then
  log "restarting PM2 processes"
  ssh "${SSH_OPTS[@]}" "$REMOTE" bash -s <<REMOTE
set -euo pipefail
# Non-interactive SSH skips ~/.bashrc, so nvm-managed node/npm/pm2 are not on
# PATH. Load nvm explicitly when present.
export NVM_DIR="\$HOME/.nvm"
if [ -s "\$NVM_DIR/nvm.sh" ]; then
  . "\$NVM_DIR/nvm.sh"
fi
cd '$DEPLOY_PATH'
if ! command -v pm2 >/dev/null 2>&1; then
  echo "[deploy] pm2 not found; installing globally with npm..."
  npm install -g pm2 || {
    echo "[deploy] could not install pm2 automatically."
    echo "[deploy] run 'sudo npm install -g pm2' on the server, then re-run:"
    echo "[deploy]   ./deploy.sh $TARGET --skip-build"
    exit 1
  }
fi
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
REMOTE
  ok "PM2 reloaded"

  log "health check"
  for i in $(seq 1 15); do
    if ssh "${SSH_OPTS[@]}" "$REMOTE" "curl -fsS http://127.0.0.1:${DEPLOY_API_PORT}/health >/dev/null 2>&1"; then
      ok "API healthy on :${DEPLOY_API_PORT}"
      break
    fi
    if [[ $i -eq 15 ]]; then
      warn "API did not become healthy; check 'pm2 logs jfolio-api' on the server"
    fi
    sleep 2
  done
  for i in $(seq 1 15); do
    if ssh "${SSH_OPTS[@]}" "$REMOTE" "curl -fsS http://127.0.0.1:${DEPLOY_WEB_PORT}/ >/dev/null 2>&1"; then
      ok "web responding on :${DEPLOY_WEB_PORT}"
      break
    fi
    if [[ $i -eq 15 ]]; then
      warn "web did not respond; check 'pm2 logs jfolio-web' on the server"
    fi
    sleep 2
  done
else
  warn "--skip-restart: files synced, processes not restarted"
fi

log "done"
