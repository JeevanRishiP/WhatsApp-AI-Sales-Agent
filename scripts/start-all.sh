#!/usr/bin/env bash
set -e

# Resolve project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

# Ensure standard user binary paths are in PATH
export PATH="$HOME/.local/bin:$HOME/.local/share/pnpm:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

echo "=================================================="
echo "🚀 Starting AI WhatsApp Sales Agent System"
echo "=================================================="

# Cleanup handler on exit (kill background processes started by this script)
cleanup() {
  echo ""
  echo "🛑 Cleaning up background processes..."
  if [ -n "${BROWSER_PID:-}" ] && kill -0 "${BROWSER_PID}" 2>/dev/null; then
    kill "${BROWSER_PID}" 2>/dev/null || true
  fi
  if [ -n "${NGROK_PID:-}" ] && kill -0 "${NGROK_PID}" 2>/dev/null; then
    echo "Stopping ngrok (PID: ${NGROK_PID})..."
    kill "${NGROK_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# 1. Verify pnpm is available
if ! command -v pnpm >/dev/null 2>&1; then
  echo "❌ Error: 'pnpm' was not found in PATH."
  echo "Please verify your Node/pnpm installation."
  exit 1
fi

# 2. Check and start Docker Desktop if not running
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Error: 'docker' command was not found."
  echo "Please install Docker Desktop for Mac from https://www.docker.com/products/docker-desktop"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "⏳ Docker engine is not running. Launching Docker Desktop..."
  if [ -d "/Applications/Docker.app" ]; then
    open -a "/Applications/Docker.app"
  else
    open -a Docker
  fi
  
  echo "⏳ Waiting for Docker engine to become ready..."
  MAX_RETRIES=45
  COUNT=0
  while ! docker info >/dev/null 2>&1; do
    sleep 2
    COUNT=$((COUNT + 1))
    if [ $COUNT -ge $MAX_RETRIES ]; then
      echo ""
      echo "❌ Error: Docker took too long to start. Please check Docker Desktop manually."
      exit 1
    fi
    printf "."
  done
  echo ""
  echo "✅ Docker is ready!"
else
  echo "✅ Docker is running."
fi

# 3. Start container services in background
echo "📦 Starting Docker containers (PostgreSQL, Redis, Evolution API)..."
docker compose up -d

echo "✅ Containers started successfully."

# 3b. Verify Evolution API is up and ensure WhatsApp session is active
echo "⏳ Checking WhatsApp gateway connection..."
for i in {1..20}; do
  if curl -s -f -m 2 "http://localhost:8080/instance/connectionState/wa_aura_luxe_01" -H "apikey: 429683C4C97CA36CA8211152D4C54" >/dev/null 2>&1; then
    # Refresh instance session to clear any stale Signal ratchets
    curl -s -X POST -m 5 "http://localhost:8080/instance/restart/wa_aura_luxe_01" -H "apikey: 429683C4C97CA36CA8211152D4C54" >/dev/null 2>&1 || true
    echo "✅ WhatsApp instance 'wa_aura_luxe_01' is connected and active."
    break
  fi
  sleep 1
done

# 4. Clean up any stale/lingering processes on application ports (3001, 3002, 3005)
for port in 3001 3002 3005; do
  pids=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "⚠️  Freeing occupied port :$port (PID: $pids)..."
    kill -9 $pids 2>/dev/null || true
  fi
done

# 5. Start ngrok tunnel for public endpoints & payments
NGROK_DOMAIN="departed-jailbreak-sandpaper.ngrok-free.dev"
mkdir -p "${PROJECT_ROOT}/logs"

if command -v ngrok >/dev/null 2>&1; then
  if pgrep -x "ngrok" >/dev/null 2>&1; then
    echo "🌐 ngrok is already running."
  else
    echo "🌐 Launching ngrok tunnel (http://localhost:3002 -> https://${NGROK_DOMAIN})..."
    ngrok http 3002 --url "${NGROK_DOMAIN}" --log="${PROJECT_ROOT}/logs/ngrok.log" >/dev/null 2>&1 &
    NGROK_PID=$!
    sleep 2
    if kill -0 "${NGROK_PID}" 2>/dev/null; then
      echo "✅ ngrok tunnel online at https://${NGROK_DOMAIN}"
    else
      echo "⚠️  ngrok tunnel could not start (check logs/ngrok.log). Continuing locally..."
    fi
  fi
else
  echo "⚠️  ngrok not installed. Webhooks will only work locally."
fi

# 6. Launch the development servers (API, Dashboard, Storefront, Worker)
echo "⚡ Starting web apps and API servers..."
echo "👉 Storefront: http://localhost:3005/aura-luxe"
echo "👉 Dashboard:  http://localhost:3001"
echo "👉 API:        http://localhost:3002"
echo "👉 Evolution:  http://localhost:8080"
echo "👉 Tunnel:     https://${NGROK_DOMAIN}"
echo "=================================================="

# Automatically open storefront and dashboard in default browser once ready
(
  for i in {1..35}; do
    if curl -s -o /dev/null -m 2 "http://localhost:3005/aura-luxe" 2>/dev/null && curl -s -o /dev/null -m 2 "http://localhost:3001" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  open "http://localhost:3005/aura-luxe" 2>/dev/null || true
  open "http://localhost:3001" 2>/dev/null || true
) &
BROWSER_PID=$!

# Run dev servers in foreground
pnpm dev
