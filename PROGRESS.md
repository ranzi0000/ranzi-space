# 当前状态（2026-10-16，P1 公共层隔离分支）

- 范围：`refactor/p1-common-layer`，基线 `main@5783650`；仅 P1 第 1–6 条，四页公共 CSS/主题、首页 ES modules、SW v3、本地假数据验收服务器。
- 已完成：抽取公共层，保留两页 head 防闪和 services/dbs 系统跟随；保留首页焦点与 services 字体差异；项目登记不变。
- 验证：`node --test tests/*.test.mjs` 为 8 passed / 0 failed；结构核对 9 项通过，module 语法与 diff 空白检查通过。
- 已验收（Claude 沙箱外执行）：32 张截图、四页控制台 0 报错；16 对像素对比 13 对一致、3 对仅文字抗锯齿抖动（最多 85 像素、色差 ≤16）。详见 `docs/verification/p1/README.md`。
- 提交：Codex 沙箱内提交被拒，由 Claude 核验后代为提交（`f31c9fb`、`b125dcb`），2026-10-17 经用户同意快进合入 main。
- 证据与矛盾清单：`docs/verification/p1/README.md`。不得将离线通过当作视觉验收通过。
- 下一步：P3 首页新 UI（依赖 P2 的 summary 新字段先上线）。
- 发布：2026-10-17 `deploy.sh` 部署，CF 回查确认线上 = `b125dcb`。登录态线上核验：首页加载 `/assets/base.css`、`theme.js`、`home/data.js`、`home/render.js` 均 200，8 张活数据卡与 10 个工具入口正常渲染；控制台仅有登录前 401 和 Cloudflare 访问统计脚本被网络拦截，均与本次改动无关。未 push GitHub。已知问题：`wrangler pages deploy` 不认 `.assetsignore`，验收截图（假数据、在密码门后）随部署上传。

# 历史状态（2026-10-16）

新增 binance-strength-monitor 项目条目及首页「强弱观察」纯入口卡，指向既有私人 Sites。项目目录也显示同一入口与 GitHub 私库链接。未添加实时采集器、改动其它项目顺序或恢复网页派活。

- 修改范围：projects.json 仅新增这一项；原有条目逐项一致。
- 代码备份：正式目录 /Users/chenguodong/Projects/binance-strength-monitor，GitHub 私库已创建并推送代码，网页原始提交历史保留。
- 发布验收：以认证读取生产 projects.json 和首页入口为准；本轮完整证据保存在 binance-strength-monitor 的 PROGRESS.md 与 docs/registration-verification.json，不能只用提交或推送成功代替发布验收。

# Crypto Scout 项目登记

2026-09-27：新增 crypto-scout 项目目录条目，指向 GitHub 私库；show_on_site=true、show_on_dashboard=false、live=null。应用目前为本机原型，未宣称公网服务上线。未调整其他项目条目或网页派活能力。

- 验证：JSON 原有条目逐项保持一致；本地路由唯一且 AGENTS/PROGRESS 可读。
- 部署：Pages 发布成功，认证读取生产 projects.json 确认 crypto-scout 唯一且字段正确；验收细节保存在 crypto-scout/docs/verification.md。

# 主页远程启动退役

2026-09-22：用户决定远程对话直接在 App 内进行，代码改造与本地验证已完成；实际线上部署 / 服务重启结果以 `~/Documents/Codex迁移/2026-09-22/主页与大屏调整/主页退役验收.md` 为准。

- 原双启动按钮替换为「项目地图」「知识作品集」，移除下方重复入口。
- 两张启动卡片改为现存项目资料 / 项目地图链接；地图页派活、Agent 更新入口已移除。
- 两个历史启动 URL 返回 410，不读写 KV；密码门继续保留。
- 本地验证：`node --test tests/remote-launch-retired.test.mjs`。
- 代码提交使用 `SKIP_DEPLOY=1`；隔离分支内的远程迁移方案不合并。
- 完整证据：`~/Documents/Codex迁移/2026-09-22/主页与大屏调整/主页退役验收.md`。
