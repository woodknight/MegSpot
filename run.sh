#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  # Load nvm in non-interactive shells so the repo can select its pinned Node version.
  # shellcheck disable=SC1090
  source "$HOME/.nvm/nvm.sh"
fi

if command -v nvm >/dev/null 2>&1 && [[ -f ".nvmrc" ]]; then
  nvm use >/dev/null || nvm install
fi

unset ELECTRON_RUN_AS_NODE

printf '\n[megspot] Ensuring dependencies are installed...\n'
INSTALL_LOG="$(mktemp -t megspot-install.XXXXXX.log)"
if ! npm_config_loglevel=error yarn install --frozen-lockfile --silent >"$INSTALL_LOG" 2>&1; then
  cat "$INSTALL_LOG"
  rm -f "$INSTALL_LOG"
  exit 1
fi
rm -f "$INSTALL_LOG"

printf '[megspot] Starting dev app...\n\n'
export YARN_SILENT=1
yarn --silent dev 2>&1 | awk '
  /DONE  clear done/ { next }
  /Project is running at http:\/\/localhost:/ { next }
  /webpack output is served from undefined/ { next }
  /Content not from webpack is served from/ { next }
  { print }
'
