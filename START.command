#!/bin/zsh
set -e
cd "$(dirname "$0")"

if command -v node >/dev/null 2>&1; then
  node_bin="$(command -v node)"
else
  node_bin="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
pnpm_bin="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm"

if [ ! -x "$node_bin" ]; then
  print "Нужен Node.js 24. Откройте проект в Codex и попросите запустить приложение."
  read -k 1
  exit 1
fi
export PATH="$(dirname "$node_bin"):$PATH"
if command -v pnpm >/dev/null 2>&1; then
  pnpm_bin="$(command -v pnpm)"
fi
if [ ! -x "$pnpm_bin" ] || [ ! -d node_modules ]; then
  print "Сначала откройте проект в Codex и попросите установить зависимости."
  read -k 1
  exit 1
fi
if "$node_bin" --input-type=module -e '
  try {
    const response = await fetch("http://127.0.0.1:5173/", {signal: AbortSignal.timeout(1500)});
    const html = await response.text();
    process.exit(response.ok && html.includes("<title>Вдвоём") ? 0 : 1);
  } catch { process.exit(1); }
'; then
  /usr/bin/open "http://127.0.0.1:5173/"
  exit 0
fi
"$pnpm_bin" dev --port 5173 --strictPort --open
