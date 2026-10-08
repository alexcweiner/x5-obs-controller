#!/bin/zsh
# Starts the Vocal Studio server (if needed) and opens the remote in Chrome.
cd -- "${0:A:h}/.."
url=http://127.0.0.1:4791/
show(){ open -a "Google Chrome" "$url" 2>/dev/null || open "$url"; }
if lsof -nP -iTCP:4791 -sTCP:LISTEN >/dev/null 2>&1; then show; exit 0; fi
node=${commands[node]:-/opt/homebrew/bin/node}
(sleep 1; show) &
exec "$node" vocal/server.mjs
