#!/usr/bin/env bash
# 一键部署 ranzi.space 主页到 CF Pages
# 用法：bash deploy.sh
# 自动触发：git commit 后由 .git/hooks/post-commit 调用
set -e
cd "$(dirname "$0")"
exec wrangler pages deploy . \
  --project-name=ranzi-space \
  --branch=main \
  --commit-dirty=true \
  --commit-message="$(git log -1 --pretty=%B 2>/dev/null | head -1 || echo 'manual deploy')"
