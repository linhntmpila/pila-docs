#!/bin/bash
# Installs the superpowers and ui-ux-pro-max plugins at the start of cloud sessions.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

command -v claude >/dev/null 2>&1 || { echo "claude CLI not found, skipping plugin install" >&2; exit 0; }

install_plugin() {
  local repo="$1" marketplace="$2" plugin="$3"
  claude plugin marketplace add "$repo" >/dev/null 2>&1 || true
  if claude plugin list 2>/dev/null | grep -q "${plugin}@${marketplace}"; then
    echo "$plugin already installed"
  else
    claude plugin install "${plugin}@${marketplace}" --scope project \
      || echo "Failed to install $plugin" >&2
  fi
}

install_plugin obra/superpowers superpowers-dev superpowers
install_plugin nextlevelbuilder/ui-ux-pro-max-skill ui-ux-pro-max-skill ui-ux-pro-max
