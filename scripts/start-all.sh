#!/usr/bin/env bash
set -e

# Resolve project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

# Ensure standard user binary paths are in PATH
export PATH="/Users/jeevanriship/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

echo "=================================================="
echo "🚀 Starting AI WhatsApp Sales Agent System"
echo "=================================================="

# Cleanup handler on exit (kill background processes started by this script)
cleanup() {
  if [ -n "${NGROK_PID:-}" ] && kill -0 "${NGROK_PID}" 2>/dev/null; then
    echo "Stopping ngrok (PID: ${NGROK_PID})..."
    kill "${NGROK_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# 1. Check and start Docker Desktop if not running
if ! docker info >/dev/null 2>&1; then
  echo "⏳ Docker is not running. Launching Docker Desktop..."
  open -a Docker
  
  echo "⏳ Waiting for Docker engine to become ready..."
  MAX_RETRIES=40
  COUNT=0
  while ! docker info >/dev/null 2>&1; do
    sleep 2
    COUNT=$((COUNT + 1))
    if [ $COUNT -ge $MAX_RETRIES ]; then
      echo "❌ Error: Docker took too long to start. Please check Docker Desktop manually."
      exit 1
    fi
    printf "."
  done
  echo ""
  echo " Docker is ready!"
else
  echo " Docker is already running."
fi

# 2. Start container services in background
echo "📦 Starting Docker containers (PostgreSQL, Redis, Evolution API)..."
docker compose up -d

echo " Containers started successfully."

# 3. Start ngrok tunnel for public endpoints & payments
NGROK_DOMAIN="departed-jailbreak-sandpaper.ngrok-free.dev"
if pgrep -x "ngrok" >/dev/null 2>&1; then
  echo "🌐 ngrok is already running."
else
  echo "🌐 Launching ngrok tunnel (http://localhost:3002 -> https://${NGROK_DOMAIN})..."
  ngrok http 3002 --url "${NGROK_DOMAIN}" --log=stdout > /dev/null 2>&1 &
  NGROK_PID=$!
  sleep 2
  echo " ngrok tunnel online at https://${NGROK_DOMAIN}"
fi

# 4. Launch the development servers (API, Dashboard, Worker)
echo "⚡ Starting web apps and API servers..."
echo "👉 Dashboard: http://localhost:3001"
echo "👉 API:       http://localhost:3002"
echo "👉 Evolution: http://localhost:8080"
echo "👉 Tunnel:    https://${NGROK_DOMAIN}"
echo "=================================================="

# Automatically open the dashboard in default browser once ready
(
  for i in {1..25}; do
    if curl -s -o /dev/null "http://localhost:3001" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  open "http://localhost:3001"
) &

# Run dev servers in foreground
pnpm dev
