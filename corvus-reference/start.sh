#!/usr/bin/env bash
# Corvus Story Core — Linux/macOS launcher
# Runs the dev server (server + client with HMR). For a production-style run,
# set CORVUS_PROD=1 to skip the client dev server and serve only the built bundle.
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   CORVUS STORY CORE — starting           ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# --- Sanity checks ---------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is not installed or not on PATH. Run ./install.sh first."
  exit 1
fi

if [ ! -d "node_modules" ] || [ ! -d "client/node_modules" ]; then
  echo "Dependencies missing — running install first..."
  bash "$SCRIPT_DIR/install.sh"
fi

# --- Network info ----------------------------------------------------------
PORT="${PORT:-3000}"
HOST="${HOST:-127.0.0.1}"
echo "Server will listen on http://${HOST}:${PORT}"
echo "Press Ctrl+C to stop."
echo ""

# --- Launch ----------------------------------------------------------------
if [ "${CORVUS_PROD:-0}" = "1" ]; then
  echo "Mode: production (serving built client)"
  PORT="$PORT" HOST="$HOST" npm run start
else
  echo "Mode: dev (server + Vite HMR)"
  PORT="$PORT" HOST="$HOST" npm run dev
fi
