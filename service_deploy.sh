#!/usr/bin/env bash
#
# service_deploy.sh — run every Memorial AI service locally with one command.
#
#   ./service_deploy.sh start          # redis + tts + video + server + client
#   ./service_deploy.sh stop
#   ./service_deploy.sh restart
#   ./service_deploy.sh status
#   ./service_deploy.sh logs [tts|video|server|client]
#
# Logs and pidfiles are written to logs/ (gitignored). Node comes from nvm and
# uv from ~/.local/bin when they are not already on PATH.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT/logs"

CLIENT_PORT=5173
SERVER_PORT=3001
TTS_PORT=8200
VIDEO_PORT=8300

SERVICES=(tts video server client)

# ---------------------------------------------------------------- output ----

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  BOLD=''; RED=''; GREEN=''; YELLOW=''; DIM=''; RESET=''
fi

info() { printf '%s\n' "${BOLD}==>${RESET} $*"; }
ok()   { printf '%s\n' "  ${GREEN}✓${RESET} $*"; }
warn() { printf '%s\n' "  ${YELLOW}!${RESET} $*"; }
err()  { printf '%s\n' "  ${RED}✗${RESET} $*" >&2; }

# --------------------------------------------------------------- helpers ----

health_url() {
  case "$1" in
    tts)    echo "http://localhost:$TTS_PORT/health" ;;
    video)  echo "http://localhost:$VIDEO_PORT/api/v1/health" ;;
    server) echo "http://localhost:$SERVER_PORT/api/health" ;;
    client) echo "http://localhost:$CLIENT_PORT/" ;;
  esac
}

port_of() {
  case "$1" in
    tts) echo "$TTS_PORT" ;; video) echo "$VIDEO_PORT" ;;
    server) echo "$SERVER_PORT" ;; client) echo "$CLIENT_PORT" ;;
  esac
}

listeners_on() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true; }

# Free a port even if the owner is an orphan from an earlier session.
free_port() {
  local port="$1" pids
  pids="$(listeners_on "$port")"
  [[ -z "$pids" ]] && return 0
  kill $pids 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    sleep 0.4
    [[ -z "$(listeners_on "$port")" ]] && return 0
  done
  pids="$(listeners_on "$port")"
  [[ -n "$pids" ]] && kill -9 $pids 2>/dev/null || true
}

ensure_node() {
  if ! command -v npm >/dev/null 2>&1 && [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    set +u
    # shellcheck disable=SC1091
    source "$HOME/.nvm/nvm.sh"
    nvm use 20 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
    set -u
  fi
  command -v npm >/dev/null 2>&1 || {
    err "npm not found. Install Node 20+ (or 'nvm install 20')."
    return 1
  }
}

ensure_uv() {
  command -v uv >/dev/null 2>&1 || PATH="$HOME/.local/bin:$PATH"
  export PATH
  command -v uv >/dev/null 2>&1 || {
    err "uv not found. Install it: curl -LsSf https://astral.sh/uv/install.sh | sh"
    return 1
  }
}

ensure_detach() {
  DETACH_PY="$(command -v python3 || true)"
  [[ -n "$DETACH_PY" ]] || {
    err "python3 not found — needed to start services detached from this shell."
    return 1
  }
}

# The three env files are easy to forget and fail confusingly at request time.
check_env_files() {
  local ok_all=0
  for svc in "" tts-service video-service; do
    local dir="${svc:+$svc/}" file="$ROOT/${svc:+$svc/}.env"
    if [[ ! -f "$file" ]]; then
      err "missing ${dir}.env — run: cp ${dir}.env.example ${dir}.env"
      ok_all=1
    fi
  done
  for svc in tts-service video-service; do
    local file="$ROOT/$svc/.env"
    [[ -f "$file" ]] || continue
    if ! grep -qE '^DASHSCOPE_API_KEY=.+' "$file"; then
      warn "$svc/.env has no DASHSCOPE_API_KEY — that service will fail on real requests"
    fi
  done
  return $ok_all
}

wait_healthy() {
  local name="$1" tries="${2:-45}" url
  url="$(health_url "$name")"
  for ((i = 1; i <= tries; i++)); do
    if curl -fsS -m 2 "$url" >/dev/null 2>&1; then
      ok "$name is up  ${DIM}$url${RESET}"
      return 0
    fi
    sleep 1
  done
  err "$name never became healthy — check logs/$name.log"
  return 1
}

# Launch each service in a new session so it outlives this script and the
# terminal that ran it. nohup/disown are not enough: closing the shell still
# tears the services down. A session leader's pid doubles as its process group
# id, which is what lets stop kill the child processes (vite, tsx) as well.
#
# macOS has no setsid(1), so python3 provides start_new_session.
spawn() {
  local name="$1" dir="$2" envfile="$3"; shift 3
  DETACH_DIR="$dir" DETACH_LOG="$LOG_DIR/$name.log" DETACH_ENV_FILE="$envfile" \
    "$DETACH_PY" -c '
import os, subprocess, sys

# Drop inherited copies of everything the service .env defines. Both
# python-dotenv and pydantic-settings let the real environment win, so a stale
# export in the launching shell would silently shadow the file (e.g. an old
# DASHSCOPE_API_KEY, which surfaces much later as a 401 InvalidApiKey).
env = os.environ.copy()
with open(os.environ["DETACH_ENV_FILE"]) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            env.pop(line.split("=", 1)[0].strip(), None)

log = open(os.environ["DETACH_LOG"], "ab", buffering=0)
proc = subprocess.Popen(
    sys.argv[1:], cwd=os.environ["DETACH_DIR"], env=env,
    stdout=log, stderr=log, stdin=subprocess.DEVNULL,
    start_new_session=True,
)
print(proc.pid)
' "$@" >"$LOG_DIR/$name.pid"
}

# ----------------------------------------------------------------- start ----

cmd_start() {
  mkdir -p "$LOG_DIR"
  ensure_node
  ensure_uv
  ensure_detach
  check_env_files || { err "fix the env files above, then rerun"; exit 1; }

  info "Reclaiming ports"
  for svc in "${SERVICES[@]}"; do
    port="$(port_of "$svc")"
    if [[ -n "$(listeners_on "$port")" ]]; then
      warn "port $port was in use ($svc) — stopping the old process"
      free_port "$port"
    fi
  done
  ok "ports $TTS_PORT, $VIDEO_PORT, $SERVER_PORT, $CLIENT_PORT free"

  info "Starting Redis"
  if ! command -v docker >/dev/null 2>&1; then
    warn "docker not installed — skipping redis (only needed for the BullMQ queue)"
  elif docker compose -f "$ROOT/docker-compose.yml" up -d redis >>"$LOG_DIR/redis.log" 2>&1; then
    ok "redis running"
  else
    warn "docker is installed but not running — skipping redis, see logs/redis.log"
  fi

  info "Syncing Python dependencies"
  for svc in tts-service video-service; do
    ( cd "$ROOT/$svc" && uv sync --quiet ) && ok "$svc deps ready"
  done

  info "Starting services"
  spawn tts    "$ROOT/tts-service"   "$ROOT/tts-service/.env"   \
    uv run uvicorn app.main:app --host 127.0.0.1 --port "$TTS_PORT"
  spawn video  "$ROOT/video-service" "$ROOT/video-service/.env" \
    uv run uvicorn app.main:app --host 127.0.0.1 --port "$VIDEO_PORT"
  spawn server "$ROOT"               "$ROOT/.env"               npm run dev:server
  spawn client "$ROOT"               "$ROOT/.env"               npm run dev:client

  info "Waiting for health checks"
  local failed=0
  for svc in "${SERVICES[@]}"; do
    wait_healthy "$svc" || failed=1
  done

  echo
  if [[ $failed -eq 0 ]]; then
    info "All services running"
  else
    info "Some services failed to start"
  fi
  cmd_status
  [[ $failed -eq 0 ]] || exit 1
}

# ------------------------------------------------------------------ stop ----

cmd_stop() {
  info "Stopping services"
  for svc in "${SERVICES[@]}"; do
    local pidfile="$LOG_DIR/$svc.pid"
    if [[ -f "$pidfile" ]]; then
      local pid; pid="$(cat "$pidfile")"
      # Negative pid targets the whole process group (vite/tsx spawn children).
      kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
      rm -f "$pidfile"
    fi
    free_port "$(port_of "$svc")"
    ok "$svc stopped"
  done
  if command -v docker >/dev/null 2>&1 && docker compose ps -q redis 2>/dev/null | grep -q .; then
    warn "redis is left running — stop it with: docker compose down"
  fi
}

# ---------------------------------------------------------------- status ----

cmd_status() {
  printf '%s\n' "${BOLD}service   port    status${RESET}"
  for svc in "${SERVICES[@]}"; do
    local port url state
    port="$(port_of "$svc")"
    url="$(health_url "$svc")"
    if curl -fsS -m 2 "$url" >/dev/null 2>&1; then
      state="${GREEN}healthy${RESET}   $url"
    elif [[ -n "$(listeners_on "$port")" ]]; then
      state="${YELLOW}listening but unhealthy${RESET}"
    else
      state="${RED}down${RESET}"
    fi
    printf '%-9s %-7s %s\n' "$svc" "$port" "$state"
  done
}

# ------------------------------------------------------------------ logs ----

cmd_logs() {
  local target="${1:-}"
  if [[ -n "$target" ]]; then
    [[ -f "$LOG_DIR/$target.log" ]] || { err "no logs/$target.log"; exit 1; }
    tail -f "$LOG_DIR/$target.log"
  else
    tail -f "$LOG_DIR"/*.log
  fi
}

# ------------------------------------------------------------------ main ----

case "${1:-start}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_stop; echo; cmd_start ;;
  status)  cmd_status ;;
  logs)    shift; cmd_logs "${1:-}" ;;
  *)
    sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
