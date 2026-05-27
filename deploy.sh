#!/usr/bin/env bash
# 一键部署 ranzi.space 主页到 CF Pages
# 用法：bash deploy.sh
# 自动触发：git commit 后由 .git/hooks/post-commit 调用
set -e
cd "$(dirname "$0")"

# 找 wrangler：交互 shell 用 PATH，post-commit hook 没 nvm init 用绝对路径
if ! command -v wrangler >/dev/null 2>&1; then
  # 找 nvm 安装的 node 版本，优先用最新
  NVM_NODE_BIN="$(ls -1d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
  if [ -n "$NVM_NODE_BIN" ] && [ -x "$NVM_NODE_BIN/wrangler" ]; then
    export PATH="$NVM_NODE_BIN:$PATH"
  else
    echo "[deploy.sh] wrangler not found and no nvm node bin available" >&2
    exit 1
  fi
fi

exec wrangler pages deploy . \
  --project-name=ranzi-space \
  --branch=main \
  --commit-dirty=true \
  --commit-message="$(git log -1 --pretty=%B 2>/dev/null | head -1 || echo 'manual deploy')"
