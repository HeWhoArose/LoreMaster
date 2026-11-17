#!/usr/bin/env bash
# Corvus Story Core — Linux/macOS installer
# Installs root + client deps and builds the client.
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   CORVUS STORY CORE — installer          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# --- Node check ------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is not installed or not on PATH."
  echo "Install Node.js 18+ from https://nodejs.org/ and re-run this script."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERROR: Node $NODE_MAJOR detected. Corvus needs Node 18 or newer."
  exit 1
fi
echo "Node $(node -v) detected."

# --- npm check -------------------------------------------------------------
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is not installed or not on PATH."
  exit 1
fi
echo "npm $(npm -v) detected."
echo ""

# --- Root deps -------------------------------------------------------------
echo "[1/3] Installing server dependencies..."
npm install --no-audit --no-fund

# --- Client deps -----------------------------------------------------------
echo ""
echo "[2/3] Installing client dependencies..."
( cd client && npm install --no-audit --no-fund )

# --- Build client ----------------------------------------------------------
echo ""
echo "[3/3] Building client..."
npm run build

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Install complete.                      ║"
echo "║   Start Corvus with:  ./start.sh         ║"
echo "╚══════════════════════════════════════════╝"
echo ""
