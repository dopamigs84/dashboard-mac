#!/bin/zsh
cd -- "${0:A:h}" || exit 1
if ! command -v node >/dev/null 2>&1; then
  # Finder does not inherit the interactive terminal's Node PATH.
  source "$HOME/.zprofile" 2>/dev/null
  source "$HOME/.zshrc" 2>/dev/null
fi
if ! command -v node >/dev/null 2>&1; then
  for dashboard_node in "$HOME"/.local/share/nodejs/node-*/bin/node(N) /opt/homebrew/bin/node /usr/local/bin/node; do
    if [[ -x "$dashboard_node" ]]; then
      export PATH="${dashboard_node:h}:$PATH"
      break
    fi
  done
fi
if ! command -v node >/dev/null 2>&1; then
  print 'Node.js 22 o successivo non trovato. Installa Node e riprova.'
  read '?Premi Invio per chiudere.'
  exit 1
fi
node launch.mjs
