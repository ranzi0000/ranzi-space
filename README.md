# ranzi-space

ranzi.space 主域名的源代码 — CF Pages 部署的密码保护 PWA。

## 用途

- 📱 **iPhone 主屏 PWA 大屏** — 项目活数据卡片（crypto / invest / rec / relay + auth / private-live 入口卡）+ 一键启动 Claude 远程会话按钮
- 📋 **完整项目目录** `/projects/` — 数据驱动列表页（filter chips + status 分组，清单见 projects.json）
- 🔒 **密码门** — CF Pages Functions middleware，未登录看不到内容

线上：https://ranzi.space（密码 cookie 30 天）

## 仓库结构

```
.
├── index.html             # 主屏 PWA 大屏
├── projects/index.html    # /projects 完整目录页（数据驱动）
├── projects.json          # ⭐ 项目清单单一真源（手动维护，新项目走 /new-project skill 自动 append）
├── functions/             # CF Pages Functions
│   ├── _middleware.js     # 密码门 + Bearer 白名单
│   └── api/               # /api/push /api/summary /api/claude-launch /api/claude-launch-request
├── manifest.json + sw.js  # PWA
├── icons/                 # PWA + favicon
├── deploy.sh              # wrangler 部署封装（含 nvm node PATH fallback）
└── wrangler.toml          # CF Pages 配置（KV namespace 绑定）
```

## 项目清单单源（projects.json）

`projects.json` 是 27 个项目的元数据：slug / title / tagline / status / tier / github / live / tags。`/projects/index.html` 客户端 fetch 这份 JSON 渲染列表，新增项目改 JSON 而不是 HTML。

**新起项目的标准流程**：在另一个 Claude 会话里说「/new-project my-bot "一句话描述"」，skill 会自动建本地目录、git init、写 README、gh repo create private、push、追加 entry 到这份 JSON、commit ranzi-space 触发部署。30 秒后 `/projects/` 出现新条目。

详细 skill 文档：`~/.claude/skills/new-project/SKILL.md`

## 部署链路

```
本地 git commit
    ↓
.git/hooks/post-commit
    ↓
bash deploy.sh
    ↓
wrangler pages deploy . --project-name=ranzi-space --branch=main
    ↓
~30 秒后线上 production 生效
```

**关键陷阱（已修）**：post-commit hook 是 git 子进程，**没有 nvm init**，wrangler/node 不在默认 PATH。`deploy.sh` 自动 fallback 找 `~/.nvm/versions/node/*/bin/`，所以日常 git commit 不用关心。

跳过部署：`SKIP_DEPLOY=1 git commit ...`

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
