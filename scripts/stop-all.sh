#!/usr/bin/env bash

# Resolve project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

# Ensure standard user binary paths are in PATH
export PATH="$HOME/.local/bin:$HOME/.local/share/pnpm:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

echo "=================================================="
echo "🛑 Stopping AI WhatsApp Sales Agent System"
echo "=================================================="

# 1. Kill any processes listening on application ports
echo "🔌 Freeing web application & API ports (3001, 3002, 3005)..."
for port in 3001 3002 3005; do
  pids=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "  ⚠️  Killing process on port :$port (PID: $pids)..."
    kill -9 $pids 2>/dev/null || true
  fi
done

# 2. Kill ngrok tunnels
echo "🌐 Stopping ngrok tunnels..."
pkill -f "ngrok http" 2>/dev/null || true

# 3. Kill lingering background node/turbo workers
echo "⚡ Stopping background node/turbo workers..."
pkill -f "turbo run dev" 2>/dev/null || true
pkill -f "tsx watch src/index.ts" 2>/dev/null || true

# 4. Stop Docker containers cleanly (without destroying database volumes)
echo "📦 Stopping Docker containers (PostgreSQL, Redis, Evolution API)..."
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker compose stop
  echo "✅ Docker containers stopped cleanly."
else
  echo "ℹ️  Docker is not running or already stopped."
fi

echo "=================================================="
echo "✅ All system services stopped successfully."
echo "=================================================="

