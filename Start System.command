#!/usr/bin/env bash

# Resolve project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${PROJECT_DIR}"

# Execute startup sequence directly in this Terminal window
bash "${PROJECT_DIR}/scripts/start-all.sh"
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "⚠️ System stopped with exit code: ${EXIT_CODE}"
  echo "Press any key to close this window..."
  read -n 1 -s -r -p ""
  echo ""
fi
