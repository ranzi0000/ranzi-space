# ranzi-space 工作入口

远程会话启动已退役：任务直接在 App 中创建，旧启动 API 只返回 410。首页主入口为项目地图与知识作品集；地图页只读显示内容和设备心跳。不得恢复网页派活或 dash.launch。

KV 免费写额度每天 1000 次（2026-10-17 曾贴线超限）：大屏推送每 5 分钟一次已占 288 次。新增写 KV 的端点或提高推送频率前先算账；心跳不写 KV、地图推送先比后写，别改回去。

projects.json 是项目登记和首页卡片的正式来源。新条目保留原缩进，禁止为增一项重排全文件。提交可能触发自动部署，先读 deploy.sh 和 README，正式上线前确认工作区没有他人未提交改动。

首页（2026-10-17 重构）：颜色变量只在 `assets/base.css` 定义（登录页 `functions/_middleware.js` 例外，登录前读不到 `/assets`）；首页脚本分 `assets/home/data.js`（取数）、`render.js`（画图）、`today.js`（三态与额度判定纯函数）。改首页先跑 `node --test tests/*.test.mjs`，界面改动用 `scripts/dev_server.py` + `scripts/verify_p3.py` 截图验收，fixture 只放假数据（公开仓库）。`/assets/*` 依赖 `_headers` 的 `no-cache` 和 Cloudflare「浏览器缓存 TTL = 遵循现有标头」，两者缺一，改版后老设备会新 HTML 配旧脚本。

全局工作规则与长期记忆分别在 `~/.agents/rules/` 和 `~/.agents/memory/`。只称 ranzi；凭据只保留文件引用。接手先读项目进度。并行更改先核对 git status，部署前检查与本任务无关的改动。
