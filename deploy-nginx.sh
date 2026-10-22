#!/usr/bin/env bash
#
# jFolio nginx + TLS bootstrap.
#
#   ./deploy-nginx.sh production
#
# One-time (and idempotent) infrastructure setup for a deployment target:
#
#   1. installs nginx / certbot on the server when missing
#   2. publishes an HTTP-only vhost that serves the ACME webroot challenge
#   3. issues a Let's Encrypt certificate (webroot plugin, auto-renewed by the
#      packaged systemd timer) and installs the HTTP->HTTPS reverse proxy that
#      forwards to the Next.js server on 127.0.0.1:<DEPLOY_WEB_PORT>
#
# The session and CSRF cookies are issued with `Secure` in production, so the
# app must be reached over HTTPS. Running it on plain HTTP makes browsers drop
# the cookies and every login attempt fails with
# "A valid CSRF token is required".
#
# Configuration (deploy/<target>.env, next to the deploy settings):
#   NGINX_DOMAIN      public FQDN that points at DEPLOY_HOST
#   NGINX_ACME_EMAIL  Let's Encrypt contact address
#
# Requires: nginx already installed (or apt available on the server),
# passwordless sudo for DEPLOY_USER, ports 80/443 open.

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
Usage: ./deploy-nginx.sh [target] [options]

  target        Deployment target name (default: production).
                Loads deploy/<target>.env.

Options:
  --force       Skip the DNS check (DNS may live behind a CDN/proxy).
  -h, --help    Show this help.

Requires NGINX_DOMAIN and NGINX_ACME_EMAIL in deploy/<target>.env.

Examples:
  ./deploy-nginx.sh production
  ./deploy-nginx.sh production --force
EOF
}

# ---------- args ----------
TARGET="production"
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force)   FORCE=1 ;;
    -h|--help) usage; exit 0 ;;
    -*)        die "unknown option: $arg (try --help)" ;;
    *)         TARGET="$arg" ;;
  esac
done

CONFIG_FILE="$REPO_ROOT/deploy/${TARGET}.env"
[[ -f "$CONFIG_FILE" ]] || die "missing deploy config: deploy/${TARGET}.env"

# ---------- config ----------
set -a
# shellcheck disable=SC1090
source "$CONFIG_FILE"
set +a

NGINX_DOMAIN="${NGINX_DOMAIN:-}"
NGINX_ACME_EMAIL="${NGINX_ACME_EMAIL:-}"
[[ -n "$NGINX_DOMAIN" ]] || die "NGINX_DOMAIN is required in deploy/${TARGET}.env (public FQDN)"
[[ -n "$NGINX_ACME_EMAIL" ]] || die "NGINX_ACME_EMAIL is required in deploy/${TARGET}.env"
[[ "$NGINX_DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$ ]] \
  || die "NGINX_DOMAIN does not look like a FQDN: $NGINX_DOMAIN"
[[ "$NGINX_ACME_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$ ]] \
  || die "NGINX_ACME_EMAIL does not look like an email address: $NGINX_ACME_EMAIL"

DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-}"
DEPLOY_WEB_PORT="${DEPLOY_WEB_PORT:-3000}"
[[ -n "$DEPLOY_HOST" ]] || die "DEPLOY_HOST is required in deploy/${TARGET}.env"

ACME_ROOT="/var/www/certbot"
SITE_NAME="jfolio"
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

SSH_OPTS=(-p "$DEPLOY_PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o BatchMode=yes)
SCP_OPTS=(-P "$DEPLOY_PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o BatchMode=yes)
if [[ -n "$DEPLOY_SSH_KEY" ]]; then
  key="${DEPLOY_SSH_KEY/#\~/$HOME}"
  [[ -f "$key" ]] || die "SSH key not found: $key"
  SSH_OPTS+=(-i "$key")
  SCP_OPTS+=(-i "$key")
fi

remote() { ssh "${SSH_OPTS[@]}" "$REMOTE" "$@"; }

# ---------- preflight ----------
for cmd in ssh scp getent mktemp sed curl; do
  command -v "$cmd" >/dev/null 2>&1 || die "required command not found: $cmd"
done

log "target=$TARGET  remote=$REMOTE  domain=$NGINX_DOMAIN"

resolve_ipv4() {
  if [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf '%s\n' "$1"
    return 0
  fi
  getent ahostsv4 "$1" 2>/dev/null | awk '{print $1}' | sort -u
}

if [[ $FORCE -eq 0 ]]; then
  log "checking DNS for $NGINX_DOMAIN"
  domain_ips="$(resolve_ipv4 "$NGINX_DOMAIN" || true)"
  host_ips="$(resolve_ipv4 "$DEPLOY_HOST" || true)"
  [[ -n "$domain_ips" ]] || die "$NGINX_DOMAIN does not resolve yet.
  Add an A record: $NGINX_DOMAIN -> $(printf '%s' "$host_ips" | head -1)
  Then re-run this script (or pass --force if DNS is proxied elsewhere)."
  match=0
  while read -r ip; do
    [[ -z "$ip" ]] && continue
    if grep -qx "$ip" <<<"$host_ips"; then match=1; fi
  done <<<"$domain_ips"
  if [[ $match -eq 1 ]]; then
    ok "$NGINX_DOMAIN -> $(printf '%s' "$domain_ips" | tr '\n' ' ')"
  else
    die "$NGINX_DOMAIN resolves to [$(printf '%s' "$domain_ips" | tr '\n' ' ')], not to $DEPLOY_HOST [$(printf '%s' "$host_ips" | tr '\n' ' ')].
  Let's Encrypt must validate over the public IP of this server. Fix the DNS
  record, or pass --force when validation happens through another edge."
  fi
fi

log "checking SSH connectivity"
remote true || die "cannot connect to $REMOTE (check DEPLOY_HOST/USER/PORT/KEY)"

# ---------- packages ----------
log "checking nginx and certbot on the server"
remote 'set -e
if ! command -v nginx >/dev/null 2>&1; then
  echo "[deploy-nginx] installing nginx"
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx
fi
if ! command -v certbot >/dev/null 2>&1; then
  echo "[deploy-nginx] installing certbot"
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot
fi'
ok "nginx + certbot available"

remote "sudo install -d -m 0755 '$ACME_ROOT'"

# ---------- helpers ----------
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

render() {
  sed -e "s|__DOMAIN__|${NGINX_DOMAIN}|g" \
      -e "s|__ACME_ROOT__|${ACME_ROOT}|g" \
      -e "s|__WEB_PORT__|${DEPLOY_WEB_PORT}|g" \
      "$1"
}

install_site() {
  local rendered="$1"
  scp -q "${SCP_OPTS[@]}" "$rendered" "$REMOTE:/tmp/${SITE_NAME}.conf"
  remote "set -e
sudo install -m 0644 /tmp/${SITE_NAME}.conf /etc/nginx/sites-available/${SITE_NAME}
sudo ln -sfn /etc/nginx/sites-available/${SITE_NAME} /etc/nginx/sites-enabled/${SITE_NAME}
rm -f /tmp/${SITE_NAME}.conf
sudo nginx -t
sudo systemctl reload nginx"
}

# ---------- step 1: HTTP vhost for the ACME challenge ----------
log "publishing the HTTP vhost (ACME challenge + redirect)"
render "$REPO_ROOT/deploy/nginx/http.conf.template" >"$TMP_DIR/http.conf"
install_site "$TMP_DIR/http.conf"
ok "HTTP vhost installed"

# ---------- step 2: certificate ----------
if remote "sudo test -f /etc/letsencrypt/live/${NGINX_DOMAIN}/fullchain.pem"; then
  ok "certificate already present for $NGINX_DOMAIN"
else
  log "requesting a Let's Encrypt certificate for $NGINX_DOMAIN"
  remote "sudo certbot certonly --webroot -w '$ACME_ROOT' -d '$NGINX_DOMAIN' \
    --non-interactive --agree-tos -m '$NGINX_ACME_EMAIL' \
    --deploy-hook 'systemctl reload nginx'"
  ok "certificate issued"
fi

# ---------- step 3: HTTPS reverse proxy ----------
log "installing the HTTPS reverse proxy"
render "$REPO_ROOT/deploy/nginx/jfolio.conf.template" >"$TMP_DIR/https.conf"
install_site "$TMP_DIR/https.conf"
ok "HTTPS vhost installed and nginx reloaded"

# ---------- step 4: verify from the developer machine ----------
log "verifying https://$NGINX_DOMAIN"
if ! home_headers="$(curl -sS -m 20 -D - -o /dev/null "https://${NGINX_DOMAIN}/" 2>&1)"; then
  warn "could not reach https://$NGINX_DOMAIN — check ports 80/443 in the OCI security list"
else
  code="$(head -1 <<<"$home_headers" | awk '{print $2}')"
  case "$code" in
    2*|3*) ok "web responds over HTTPS (${code})" ;;
    *)     warn "unexpected status over HTTPS: ${code}" ;;
  esac
fi

csrf_headers="$(curl -sS -m 20 -D - -o /dev/null "https://${NGINX_DOMAIN}/api/auth/csrf" 2>/dev/null | tr -d '\r' || true)"
if grep -qi '^set-cookie: jfolio\.csrf=.*secure' <<<"$csrf_headers"; then
  ok "Secure CSRF cookie issued over HTTPS"
else
  warn "no Secure jfolio.csrf cookie seen; login will fail with a CSRF error"
fi
if grep -qi '^set-cookie: jfolio\.sid=' <<<"$csrf_headers"; then
  ok "session cookie accepted (Secure cookies work)"
else
  warn "no jfolio.sid cookie seen; check SESSION_COOKIE_SECURE / SESSION_TRUST_PROXY"
fi

cat <<EOF

Next steps
  1. Redeploy so Next.js binds to loopback only:
       ./deploy.sh ${TARGET} --skip-build
  2. Close port ${DEPLOY_WEB_PORT} in the OCI security list / firewall — only
     80 and 443 should be public.
  3. Renewal is handled by the packaged certbot systemd timer; verify with:
       ssh ${REMOTE} 'sudo certbot renew --dry-run'
  4. Open https://${NGINX_DOMAIN} and sign in.
EOF
