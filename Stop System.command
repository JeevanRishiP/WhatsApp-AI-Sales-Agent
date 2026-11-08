#!/usr/bin/env bash

# Resolve project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${PROJECT_DIR}"

# Execute shutdown sequence directly in this Terminal window
bash "${PROJECT_DIR}/scripts/stop-all.sh"

echo ""
echo "Press any key to close this window..."
read -n 1 -s -r -p ""
echo ""

