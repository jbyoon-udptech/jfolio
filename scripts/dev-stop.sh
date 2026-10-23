#!/usr/bin/env bash
#
# Stop the local dev servers listening on the web/API ports.
#
# The dev stack is normally started as two independent sessions:
#   setsid nohup yarn dev:api > /tmp/opencode/dev-api.log 2>&1 &
#   setsid nohup yarn dev:web > /tmp/opencode/dev-web.log 2>&1 &
#
# Killing only the listener (the node child) leaves the `tsx watch` / `next dev`
# supervisor behind, so this script resolves each listener's process group and
# terminates the whole group. Plain SIGTERM first; SIGKILL only for leftovers.
#
set -u

WEB_PORT="${WEB_PORT:-3000}"
API_PORT="${API_PORT:-3001}"
PORTS=("$API_PORT" "$WEB_PORT")

if ! command -v ss >/dev/null 2>&1; then
  echo "[dev:stop] 'ss' is required (iproute2)" >&2
  exit 1
fi

self_pgid="$(ps -o pgid= -p "$$" 2>/dev/null | tr -d '[:space:]')"

listener_pids() {
  ss -H -ltnp "sport = :$1" 2>/dev/null \
    | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' \
    | sort -u
}

port_in_use() {
  [ -n "$(ss -H -ltn "sport = :$1" 2>/dev/null)" ]
}

targets=()
unresolved=()
for port in "${PORTS[@]}"; do
  pids="$(listener_pids "$port")"
  if [ -z "$pids" ] && port_in_use "$port"; then
    unresolved+=("$port")
  fi
  while IFS= read -r pid; do
    [ -n "$pid" ] && targets+=("$pid")
  done <<< "$pids"
done

if [ "${#unresolved[@]}" -gt 0 ]; then
  echo "[dev:stop] port(s) ${unresolved[*]} are in use but their PID could not be resolved" >&2
  exit 1
fi

if [ "${#targets[@]}" -eq 0 ]; then
  echo "[dev:stop] no dev server listening on ports ${PORTS[*]}"
  exit 0
fi

echo "[dev:stop] stopping: ${targets[*]}"

declare -A pgids=()
for pid in "${targets[@]}"; do
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]')"
  [ -n "$pgid" ] && pgids["$pgid"]=1
done

for pgid in "${!pgids[@]}"; do
  if [ "$pgid" = "$self_pgid" ]; then
    # Never kill the shell that runs this script: stop the listeners only.
    for pid in "${targets[@]}"; do
      pid_pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]')"
      [ "$pid_pgid" = "$pgid" ] && kill -TERM "$pid" 2>/dev/null
    done
  else
    kill -TERM -- "-$pgid" 2>/dev/null
  fi
done

# Wait up to ~5s for a graceful shutdown before force-killing leftovers.
for _ in $(seq 1 20); do
  busy=0
  for port in "${PORTS[@]}"; do
    port_in_use "$port" && busy=1
  done
  [ "$busy" -eq 0 ] && break
  sleep 0.25
done

for port in "${PORTS[@]}"; do
  while IFS= read -r pid; do
    [ -z "$pid" ] && continue
    pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]')"
    if [ -n "$pgid" ] && [ "$pgid" != "$self_pgid" ]; then
      kill -KILL -- "-$pgid" 2>/dev/null
    else
      kill -KILL "$pid" 2>/dev/null
    fi
  done <<< "$(listener_pids "$port")"
done

sleep 0.3

exit_code=0
for port in "${PORTS[@]}"; do
  if port_in_use "$port"; then
    echo "[dev:stop] port $port is still in use" >&2
    exit_code=1
  fi
done

if [ "$exit_code" -eq 0 ]; then
  echo "[dev:stop] stopped (ports ${PORTS[*]} are free)"
fi
exit "$exit_code"
