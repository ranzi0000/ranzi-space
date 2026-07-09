#!/usr/bin/env bash
# 一键部署 ranzi.space 主页到 CF Pages
#
# 用法：
#   bash deploy.sh           部署 + 自我验证
#   bash deploy.sh --check   只检查线上跑的是不是本地 HEAD（不部署）
#
# 自动触发：git commit 后由 hooks/post-commit 调用（core.hooksPath=hooks）
#
# ── 为什么这个脚本这么啰嗦 ──
# 2026-07-09 踩过：commit 成功、部署因网络抖动失败（wrangler `TypeError: fetch failed`），
# 而 post-commit 钩子的退出码 git 是**不看**的 —— 于是线上和仓库悄悄脱节，没人知道。
# 所以这里做三件事：① 重试网络抖动 ② 部署完回查 CF API 确认 ③ 失败时大声喊 + 推 Bark。
set -uo pipefail
cd "$(dirname "$0")"

PROJECT=ranzi-space
RETRIES=3

# ── CF 凭证 ──
# 用 API token（持久），不用 wrangler OAuth（4 小时过期、非交互环境刷新不了）。
# ~/.cloudflare-ranzi.env 不进 git，内容形如：
#   export CLOUDFLARE_API_TOKEN=xxxxx
#   export CLOUDFLARE_ACCOUNT_ID=71e4dd729484545c2b992269733c7002
[ -f "$HOME/.cloudflare-ranzi.env" ] && source "$HOME/.cloudflare-ranzi.env"

# 凭证缺失时直接停。不然 wrangler 会悄悄退回过期的 OAuth，报一个看不懂的
# "Failed to fetch auth token: 400"，让人误以为是权限问题（真踩过）。
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "[deploy.sh] ✗ 缺 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID（看 ~/.cloudflare-ranzi.env）" >&2
  exit 1
fi

# ── 找 wrangler：交互 shell 用 PATH，post-commit hook 没 nvm init 用绝对路径 ──
if ! command -v wrangler >/dev/null 2>&1; then
  NVM_NODE_BIN="$(ls -1d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
  if [ -n "$NVM_NODE_BIN" ] && [ -x "$NVM_NODE_BIN/wrangler" ]; then
    export PATH="$NVM_NODE_BIN:$PATH"
  else
    echo "[deploy.sh] ✗ 找不到 wrangler，且 nvm 里也没有" >&2
    exit 1
  fi
fi

HEAD_SHA="$(git rev-parse HEAD)"
HEAD_MSG="$(git log -1 --pretty=%B | head -1)"

api() {  # api <path>
  curl -sS --max-time 25 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT$1"
}

# 线上最新一次部署的 "commit_hash 状态"
live_deployment() {
  api "/deployments?per_page=1" | python3 -c '
import json,sys
try:
    r = (json.load(sys.stdin).get("result") or [{}])[0]
    sha = ((r.get("deployment_trigger") or {}).get("metadata") or {}).get("commit_hash") or "-"
    st  = (r.get("latest_stage") or {}).get("status") or "?"
    print(sha, st)
except Exception:
    print("- error")'
}

notify_failure() {  # notify_failure <原因>
  local reason="$1" bark
  {
    echo ""
    echo "  ############################################################"
    echo "  #  x ranzi.space 部署失败：线上仍是旧版本                   #"
    echo "  ############################################################"
    echo "  原因：$reason"
    echo "  本地 HEAD：${HEAD_SHA:0:7}  $HEAD_MSG"
    echo "  重试：cd $(pwd) && bash deploy.sh"
    echo ""
  } >&2
  # 尽力推 Bark（没配就算了，不因此失败）
  bark="$(python3 -c "import json;print(json.load(open('$HOME/.filedrop/config.json')).get('bark_url',''))" 2>/dev/null || true)"
  if [ -n "$bark" ]; then
    curl -sS --max-time 8 -X POST "${bark%/}/" -H 'Content-Type: application/json' \
      -d "{\"title\":\"ranzi.space 部署失败\",\"body\":\"$reason（本地 ${HEAD_SHA:0:7}）\"}" >/dev/null 2>&1 || true
  fi
}

# ── --check：只验证，不部署 ──
if [ "${1:-}" = "--check" ]; then
  read -r live_sha live_status <<<"$(live_deployment)"
  if [ "$live_sha" = "$HEAD_SHA" ] && [ "$live_status" = "success" ]; then
    echo "[deploy.sh] ✓ 线上就是本地 HEAD（${HEAD_SHA:0:7}）"
    exit 0
  fi
  echo "[deploy.sh] ✗ 线上与本地不一致" >&2
  echo "    本地 HEAD ： ${HEAD_SHA:0:7}" >&2
  echo "    线上部署 ： ${live_sha:0:7} ($live_status)" >&2
  exit 1
fi

# ── 部署（网络抖动重试）──
attempt=1
while :; do
  echo "[deploy.sh] 部署中（第 $attempt/$RETRIES 次）…"
  if wrangler pages deploy . \
      --project-name="$PROJECT" \
      --branch=main \
      --commit-dirty=true \
      --commit-hash="$HEAD_SHA" \
      --commit-message="$HEAD_MSG"; then
    break
  fi
  if [ "$attempt" -ge "$RETRIES" ]; then
    notify_failure "wrangler 连续 $RETRIES 次失败（多半是网络：TypeError: fetch failed）"
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep $((attempt * 5))
done

# ── 部署完自我验证：回查 CF API，确认线上那次部署就是本地 HEAD ──
# 「执行」和「验证」必须是两个独立动作：wrangler 说成功不算数，CF 说了才算。
for _ in 1 2 3 4 5; do
  read -r live_sha live_status <<<"$(live_deployment)"
  if [ "$live_sha" = "$HEAD_SHA" ] && [ "$live_status" = "success" ]; then
    echo "[deploy.sh] ✓ 已验证：线上 = 本地 HEAD ${HEAD_SHA:0:7}"
    exit 0
  fi
  sleep 3
done

notify_failure "wrangler 报成功，但 CF 上最新部署不是 ${HEAD_SHA:0:7}（拿到 ${live_sha:0:7} / $live_status）"
exit 1
