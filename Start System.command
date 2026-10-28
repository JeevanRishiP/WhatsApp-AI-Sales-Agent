#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
osascript -e "tell application \"Terminal\" to do script \"cd \\\"${SCRIPT_DIR}\\\" && ./scripts/start-all.sh\""
