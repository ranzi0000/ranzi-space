# ranzi-space

ranzi.space 主域名的源代码 — CF Pages 部署的密码保护 PWA。

## 用途

- 📱 **iPhone 主屏 PWA 大屏** — 项目活数据卡片 + 纯入口卡（清单来自 projects.json，活数据来自 dash-collector）+ 一键启动 Claude 远程会话按钮
- 📋 **完整项目目录** `/projects/` — 数据驱动列表页（filter chips + status 分组，清单见 projects.json）
- 🔒 **密码门** — CF Pages Functions middleware，未登录看不到内容

线上：https://ranzi.space（密码 cookie 30 天）

## 仓库结构

```
.
├── index.html             # 主屏 PWA 大屏（卡片 + 底部列表从 projects.json 生成）
├── projects/index.html    # /projects 完整目录页（数据驱动，show_on_site=false 不展示）
├── projects.json          # ⭐ 项目清单单一真源（手动维护，新项目走 /new-project skill 自动 append）
├── functions/             # CF Pages Functions
│   ├── _middleware.js     # 密码门 + Bearer 白名单（/api/push /api/claude-launch-request /api/dbs-deck）
│   └── api/               # /api/push /api/summary /api/claude-launch /api/claude-launch-request
│                          # /api/dbs-deck（Bearer，Mac 推抽卡牌堆进 KV）/api/dbs-draw（cookie，抽卡+推 Bark 留档）
├── dbs/index.html         # dbs 抽卡页（先显问题再揭答案；牌堆来自 dontbesilent-corpus/scripts/push_deck.py）
├── services/index.html    # Mac mini 服务列表页
├── manifest.json + sw.js  # PWA
├── icons/                 # PWA + favicon
├── deploy.sh              # wrangler 部署封装（nvm PATH fallback + 重试 + 自我验证 + --check）
├── hooks/post-commit      # 版本化的 git 钩子（core.hooksPath=hooks）
└── wrangler.toml          # CF Pages 配置（KV namespace 绑定）
```

## 项目清单单源（projects.json）

`projects.json` 是所有项目的元数据单一真源（schema v2）：slug / title / tagline / status / tier / github / live / tags / access + 首页卡片元数据 `dash`。站内三处消费，全部客户端 fetch 渲染，改 JSON 而不是 HTML：

- **首页大屏卡片**：`show_on_dashboard: true` + `dash: {key, title, sub, href, order, items}` 的条目按 order 生成卡片。`dash.key` 对应 dash-collector push 的 summary key；纯入口卡（无活数据，如 auth-hub / private-live）不填 key；`items: true` 走列表卡结构（rec 用）
- **首页底部 all projects**：`show_on_site !== false` 且 `status=active` 且有链接（`dash.href` 优先，其次 `live`）的条目；`access` 字段渲染成右侧标签
- **`/projects/` 完整目录**：`show_on_site !== false` 的条目，按 status 分组 + tier 排序

**新增一张首页卡片**：① 在 projects.json 对应条目设 `show_on_dashboard: true` 并补 `dash` 元数据，commit 自动部署；② 卡片要有活数据的话，在 dash-collector 的 `collect.py` 写 collector 函数并在 `CARDS` 表加一行 `(key, 函数)`，key 与 `dash.key` 一致。纯入口卡只做 ①。

**新起项目的标准流程**：在另一个 Claude 会话里说「/new-project my-bot "一句话描述"」，skill 会自动建本地目录、git init、写 README、gh repo create private、push、追加 entry 到这份 JSON、commit ranzi-space 触发部署。30 秒后 `/projects/` 出现新条目。

详细 skill 文档：`~/.claude/skills/new-project/SKILL.md`

## 部署链路

```
本地 git commit
    ↓
hooks/post-commit          ← 版本化在仓库里（core.hooksPath=hooks）
    ↓
bash deploy.sh             ← 重试 3 次 + 部署完回查 CF API 自我验证
    ↓
wrangler pages deploy . --commit-hash=<HEAD>
    ↓
~30 秒后线上 production 生效；失败则打横幅 + 推 Bark
```

**重新 clone 之后要跑一次**（`core.hooksPath` 是本地 git 配置，不随仓库走）：

```bash
git config core.hooksPath hooks
```

跳过部署：`SKIP_DEPLOY=1 git commit ...`
随时核对线上是否与本地一致：`bash deploy.sh --check`（一致返回 0，漂移返回 1）

### 踩过的坑（都已修）

1. **post-commit hook 没有 nvm init**，wrangler/node 不在默认 PATH → `deploy.sh` 自动 fallback 找 `~/.nvm/versions/node/*/bin/`。
2. **git 不看 post-commit 的退出码**：部署失败，commit 照样成功。2026-07-09 网络抖动
   （wrangler `TypeError: fetch failed`）导致部署失败，线上和仓库悄悄脱节了几十分钟没人发现。
   现在：deploy.sh 重试 3 次 → 仍失败就打横幅 + 推 Bark；部署完还要回查 CF API 确认
   最新部署的 commit hash == 本地 HEAD（**wrangler 说成功不算数，CF 说了才算**）。
3. **兜底**：LaunchAgent `com.chenguodong.ranzi-space-drift` 每天 10:30 跑一次
   `deploy.sh --check`，发现漂移才推 Bark（一致就静默）。plist 在 dotfiles-mac。
4. **凭证**：用 `~/.cloudflare-ranzi.env` 里的 API token（持久）。wrangler 自己的 OAuth
   4 小时过期、非交互环境刷不了新的，缺凭证时它会退回 OAuth 报一个看不懂的
   `Failed to fetch auth token: 400`，容易误判成权限问题 —— 所以 deploy.sh 现在缺凭证直接停。

## 配套子系统（不在本 repo）

| 子系统 | repo | 作用 |
|---|---|---|
| dash-collector | https://github.com/ranzi0000/dash-collector | Mac mini LaunchAgent，5min 拉 5 个项目数据 push 到 CF KV |
| claude-rc | https://github.com/ranzi0000/claude-rc | Mac mini LaunchAgent，3s 拉 KV，看到时间戳变了开 iTerm 跑 claude |
| heartbeat | https://github.com/ranzi0000/heartbeat | 共享心跳客户端库（dash-collector 不直接用，是其他业务项目用的） |

部署 plist 在 https://github.com/ranzi0000/dotfiles-mac

## CF Pages 关键资源

| 项 | 值 |
|---|---|
| 项目名 | `ranzi-space` |
| account ID | `71e4dd729484545c2b992269733c7002` |
| zone | `ranzi.space`，zone_tag `33cecf6e1834ec5751f19f63fee6aa11` |
| KV namespace | `DASHBOARD` id `fbf6f5a6489d4f858026ea11059f3126` |
| Secrets | `SITE_PASSWORD`（cookie 鉴权）+ `PUSH_TOKEN`（collector/poller 共用 Bearer） |

DNS：CF zone 内 apex + www 都 CNAME 到 `ranzi-space.pages.dev`，已代理。

## 验证线上

```bash
# 拿 cookie
curl -s -i -X POST https://ranzi.space/__login \
  -d "password=<your-pass>&redirect=/" | grep set-cookie

# 验证项目列表
COOKIE="ranzi_auth=<hash>"
curl -s "https://ranzi.space/projects.json" -H "Cookie: $COOKIE" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d['projects']),'projects')"
```
