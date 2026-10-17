# 当前状态（2026-10-17，P3 首页 UI 已上线）

- 范围：`feat/p3-home-ui`，仅 P3；首页重排为今天 / 业务 / 工具 / 目录，主要入口位于今天与业务之间。业务保留 7 张活数据卡、1 张静态大卡及服务器状态条，10 个纯入口按投资 / 创作 / 工具分组。
- 已完成：独立纯函数实现三态、异常排序及额度时效 / 本地重置时间；15 秒刷新复算状态，离线和来源缺失保留异常。18 个指定登记只增加 group，并改两处重复 order，其他字节有离线测试约束。
- 样例与核验：新增四份全假数据，dev_server 用首页 `?fixture=` 写本地 cookie 选样例，页面不识别参数；新增独立无头截图脚本 verify_p3.py（16 组）。
- 已验证：Node 15 passed / 0 failed；Python 5 tests OK；JS / Python 语法和 git diff 空白检查通过。
- 已验收（Claude 沙箱外执行）：`P1_BROWSER_CHANNEL=chrome python3.11 -B scripts/verify_p3.py` 退出 0，四份样例 × 390/1280 × 深浅共 16 张截图，控制台、页面和断言错误 0；人工查看有异常和状态未知两种情况的截图无误。Claude 另修一处：额度新旧以采集器 state 为准，前端只在超过 1 小时或时钟超前 5 分钟以上时判过期（原先 10 分钟即标旧数据，正常情况下会频繁误标）。
- 上线：2026-10-17 快进合入 main 并部署（`38ae903`，回滚点 `1dd00c4`）。登录态线上核验：「今天」显示 5 项异常（bad 在前）、今日提交动态与最近两条、Codex 周额度 69% 与本地重置时间；工具区分「投资 / 创作 / 工具」三组。部署刚完成时 `/api/summary` 有一次 503，随后连续 200，属瞬时抖动。
- 静态资源缓存（已解决，2026-10-17）：原先 `/assets/` 下 JS/CSS 被浏览器缓存 4 小时而 HTML 每次重取，改版后老设备会新 HTML 配旧脚本（P3 上线时实测「今天」卡在“读取中”）。根因是 Cloudflare 域名设置「浏览器缓存 TTL」为 4 小时，会改写 `_headers`（`861ac6f`）给出的 `no-cache`。经用户授权，Claude 在 Cloudflare 后台 ranzi.space → 缓存 → 配置 把它改为「遵循现有标头」（Respect Existing Headers）。核验：登录态请求 `/assets/` 下 5 个文件均返回 `Cache-Control: no-cache`，首页 HTML 仍为 `public, max-age=0, must-revalidate`，`/api/summary` 仍为 `no-store`。注意：该设置作用于整个 ranzi.space 域名，其他子站现在按各自源站的缓存头执行。

# 历史状态（2026-10-16，P1 公共层隔离分支）

- 范围：`refactor/p1-common-layer`，基线 `main@5783650`；仅 P1 第 1–6 条，四页公共 CSS/主题、首页 ES modules、SW v3、本地假数据验收服务器。
- 已完成：抽取公共层，保留两页 head 防闪和 services/dbs 系统跟随；保留首页焦点与 services 字体差异；项目登记不变。
- 验证：`node --test tests/*.test.mjs` 为 8 passed / 0 failed；结构核对 9 项通过，module 语法与 diff 空白检查通过。
- 已验收（Claude 沙箱外执行）：32 张截图、四页控制台 0 报错；16 对像素对比 13 对一致、3 对仅文字抗锯齿抖动（最多 85 像素、色差 ≤16）。详见 `docs/verification/p1/README.md`。
- 提交：Codex 沙箱内提交被拒，由 Claude 核验后代为提交（`f31c9fb`、`b125dcb`），2026-10-17 经用户同意快进合入 main。
- 证据与矛盾清单：`docs/verification/p1/README.md`。不得将离线通过当作视觉验收通过。
- 下一步：P3 首页新 UI（依赖 P2 的 summary 新字段先上线）。
- 发布：2026-10-17 `deploy.sh` 部署，CF 回查确认线上 = `b125dcb`。登录态线上核验：首页加载 `/assets/base.css`、`theme.js`、`home/data.js`、`home/render.js` 均 200，8 张活数据卡与 10 个工具入口正常渲染；控制台仅有登录前 401 和 Cloudflare 访问统计脚本被网络拦截，均与本次改动无关。2026-10-17 已推 GitHub。已知问题：`wrangler pages deploy` 不认 `.assetsignore`，验收截图（假数据、在密码门后）随部署上传。

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
