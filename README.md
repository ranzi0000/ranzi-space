# ranzi-space

ranzi.space 主域名的源代码 — CF Pages 部署的密码保护 PWA。

## 用途

- 📱 **iPhone 主屏 PWA 大屏**（2026-10-17 重构）— 从上到下四段：**今天**（异常三态：一切正常 / N 项异常 / 状态未知，今日提交动态，Codex 周额度）→「项目地图 / 知识作品集」双入口 → **业务**（活数据大卡 + 云服务器状态条）→ **工具**（纯入口卡按投资 / 创作 / 工具分组）→ **目录**。卡片清单来自 projects.json，活数据与「今天」来自 dash-collector 推送的 `/api/summary`。原 Kindle 四页看板的异常 / 到期 / 动态内容由「今天」区块承接
- 📋 **完整项目目录** `/projects/` — 数据驱动列表页（状态构成条 + filter chips + status 分组，清单见 projects.json）
- 🗺 **项目地图** `/maps` + `/maps/<id>`（2026-08-04 上线）— 内容由 Mac mini projectmap 管线渲染推 KV 现取现服务（**地图 HTML 不进本公开仓库**）；总览与单项目页只读展示地图和「Mac mini 在线」心跳灯（/api/agent-heartbeat）
- 🔒 **密码门** — CF Pages Functions middleware，未登录看不到内容

线上：https://ranzi.space（密码 cookie 30 天）

## 远程启动已退役（2026-09-22）

任务直接在 App 中创建。首页原双启动按钮已替换为项目地图与知识作品集，下方重复入口已移除；项目卡片只导航到现有地图或项目资料。地图页不再派活或触发 Agent 更新。

历史 `/api/claude-launch` 与 `/api/claude-launch-request` 均只返回 HTTP 410 和「请在App中创建任务」，不读写 KV、不返回待执行命令；原密码门保留。配套 claude-rc poller 继续提供 Kindle 控制与设备心跳。

本地验证：`node --test tests/remote-launch-retired.test.mjs`。本轮部署状态见 `PROGRESS.md`；隔离分支内的远程迁移方案不合并。

## 仓库结构

```
.
├── index.html             # 主屏 PWA 大屏骨架（今天 / 业务 / 工具 / 目录；只放结构与页面专属样式）
├── assets/
│   ├── base.css           # 四个页面共用：颜色变量（深浅两套）、字体、页脚主题按钮
│   ├── theme.js           # 主题切换（首页与 /projects 用；/services、/dbs 只跟随系统）
│   └── home/              # 首页 ES modules：data.js（缓存/拉取/定时刷新）render.js（画卡片与今天区块）today.js（三态与额度判定纯函数）
├── _headers               # /assets/* Cache-Control: no-cache（见「缓存」）
├── projects/index.html    # /projects 完整目录页（数据驱动，show_on_site=false 不展示）
├── projects.json          # ⭐ 项目清单单一真源（手动维护，新项目走 /new-project skill 自动 append）
├── functions/             # CF Pages Functions
│   ├── _middleware.js     # 密码门 + 活动接口 Bearer 白名单 + 历史拉取 URL 退役放行
│   └── api/               # /api/push /api/summary；claude-launch 与 claude-launch-request 仅返回 410
│                          # /api/dbs-deck（Bearer，Mac 推抽卡牌堆进 KV）/api/dbs-draw（cookie，抽卡+推 Bark，?id= 回看）
│                          # /api/dbs-config（cookie，读写推送时间）/api/dbs-config-pull（Bearer，Mac 闸门拉取）
├── dbs/index.html         # dbs 抽卡页 v2（问题先行 + md 阅读版式 + 本机抽卡历史 + 推送时间设置；牌堆来自 corpus/push_deck.py）
├── services/index.html    # Mac mini 服务列表页
├── manifest.json + sw.js  # PWA
├── icons/                 # PWA + favicon
├── deploy.sh              # wrangler 部署封装（nvm PATH fallback + 重试 + 自我验证 + --check）
├── scripts/               # dev_server.py 本地验收服务器；verify_p1.py / verify_p3.py 无头浏览器截图；compare_p1_pixels.py
├── tests/                 # node 测试 *.test.mjs + dev_server_test.py；fixtures/ 为全假数据样例
├── docs/verification/     # P1 / P3 验收截图与记录（注意会随部署上传，见「部署链路」）
├── hooks/post-commit      # 版本化的 git 钩子（core.hooksPath=hooks）
└── wrangler.toml          # CF Pages 配置（KV namespace 绑定）
```

## 项目清单单源（projects.json）

`projects.json` 是所有项目的元数据单一真源（schema v2）：slug / title / tagline / status / tier / github / live / tags / access + 首页卡片元数据 `dash`。站内两处消费，全部客户端 fetch 渲染，改 JSON 而不是 HTML：

- **首页大屏卡片**：`show_on_dashboard: true` + `dash: {key, title, sub, href, order, items, big, group}` 的条目生成卡片。有 `dash.key`（对应 dash-collector summary 的 key）或 `big: true` 的进「业务」区；其余是纯入口卡，进「工具」区并按 `group`（`invest` 投资 / `create` 创作 / `tool` 工具，缺省归工具）分组，组内按 `order` 排；`items: true` 走列表卡结构（rec 用）
- **`/projects/` 完整目录**：`show_on_site !== false` 的条目，按 status 分组 + tier 排序，顶部状态构成条自动汇总

（首页原「all projects」区块 2026-07-21 删除——与卡片重复；首页卡片下方的**云服务器状态条**不吃 projects.json，数据来自 `/api/summary` 的 `servers` 键，由 dash-collector `collect_servers()` 探活生成，服务器 IP/到期只存在 dash-collector 私库）

**新增一张首页卡片**：① 在 projects.json 对应条目设 `show_on_dashboard: true` 并补 `dash` 元数据，commit 自动部署；② 卡片要有活数据的话，在 dash-collector 的 `collect.py` 写 collector 函数并在 `CARDS` 表加一行 `(key, 函数)`，key 与 `dash.key` 一致。纯入口卡只做 ①。

**新起项目的标准流程**：在 App 的任务中说「/new-project my-bot "一句话描述"」，skill 会自动建本地目录、git init、写 README、gh repo create private、push、追加 entry 到这份 JSON、commit ranzi-space 触发部署。30 秒后 `/projects/` 出现新条目。

详细 skill 文档：`~/.agents/skills/new-project/SKILL.md`

**登记漂移对账**：首页横幅报「N 个未登记」（dash-collector 每 5 分钟对账本地 git 仓库 vs projects.json）时，走本仓库 `skills/sync-projects/`（SKILL.md + audit_projects.py；全局 `~/.claude/skills/sync-projects` 软链已不存在，直接读仓库真身）。写 projects.json 前先「读入再原样吐出」比对探出磁盘缩进（当前 2 空格），diff 只该新增条目行。

## 本地开发与验收

```bash
python3 scripts/dev_server.py --port 8000          # http://localhost:8000/?fixture=ok|alerts|unknown|error
node --test tests/*.test.mjs
python3 -B -m unittest tests/dev_server_test.py
P1_BROWSER_CHANNEL=chrome /opt/homebrew/opt/python@3.11/bin/python3.11 -B scripts/verify_p3.py   # 16 张截图 + 控制台检查
```

`dev_server.py` 静态服务仓库，`/projects.json` 读真文件，`/api/summary` 按首页 `?fixture=` 写入的本地 cookie 选 `tests/fixtures/` 下的假数据（ok 一切正常 / alerts 有异常 / unknown 状态未知 / error 全部读取失败），其余生产接口不代理。fixture 只放假数据——本仓库公开。Playwright 自带浏览器未装时用 `P1_BROWSER_CHANNEL=chrome` 调本机 Chrome 无头模式。验收记录：[P1](docs/verification/p1/README.md)、[P3](docs/verification/p3/README.md)。

**「今天」区块三态**（判定在 `assets/home/today.js`）：summary 的 `alerts` 字段存在、无 `error`、`unavailable` 为空、`items` 为空且 summary 未超过 15 分钟，才显示「一切正常」；缺字段 / 有 error / unavailable 非空 / 过期一律「状态未知」（已知异常照常列出）。额度新鲜度以 dash-collector 给的 `state` 为准，前端只在采样超过 1 小时或比本机时钟超前 5 分钟以上时判过期。

## 缓存

- `/assets/*` 由 `_headers` 设为 `Cache-Control: no-cache`：浏览器每次用 ETag 向服务器确认，未变只回 304。HTML 与 `projects.json` 是 `max-age=0, must-revalidate`，`/api/*` 是 `no-store`。
- 前提：Cloudflare 后台 ranzi.space → 缓存 → 配置 →「浏览器缓存 TTL」须为**遵循现有标头**（2026-10-17 由 4 小时改过来）。若改回固定时长，CF 会把 `_headers` 改写成 `max-age=<该时长>`，改版后老设备会出现新 HTML 配旧脚本（P3 上线时实测「今天」卡在“读取中”）。核对：登录态 `fetch('/assets/base.css',{cache:'reload'})` 看响应头。
- 该设置作用于整个 ranzi.space 域名，其他子站按各自源站缓存头执行。

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
注意：`wrangler pages deploy .` 会上传整个目录且**不认 `.assetsignore`**（2026-10-17 实测），`docs/verification/` 下的截图也会上线（在密码门后、均为假数据）。
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
| dash-collector | https://github.com/ranzi0000/dash-collector | Mac mini LaunchAgent，每 5 分钟采集各项目活数据、服务器状态，以及首页「今天」用的 `alerts` / `activity` / `quota`，push 到 CF KV；同一份写本地镜像给 Kindle 复习屏 |
| claude-rc | https://github.com/ranzi0000/claude-rc | Mac mini LaunchAgent，每 3 秒处理 Kindle 控制，每 5 分钟报告设备心跳 |
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
