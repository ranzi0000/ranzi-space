# P3 首页 UI 核验记录

范围：`feat/p3-home-ui`，仅首页 P3。改动留在 worktree，未暂存、提交、推送或部署。

## 计划与当前代码的差异

- 计划第 2 节仍是 P1 前的行号和内联结构；当前公共 CSS、主题脚本和首页模块已拆分，SW 已为 v3。本轮沿用，不再执行 P1。
- 登记仍为 63 项、22 项有 dash、18 项显示，但这 18 项包含 7 张活数据卡、1 张 `dash.big` 静态大卡、10 个纯入口。静态大卡保留在业务区，只把纯入口按组呈现。
- 计划锚点曾称重复 order 在 P1 更正；实际仍存在。本轮只增加指定 18 项的 group，将 market-lens 的 order 从 3 改为 4、biaoda-gym 从 10 改为 12，组内唯一。其他字节通过离线测试比对 HEAD 完整保留。
- P2 实际的 alerts 除 checked_at/items 外还会给出 unavailable；activity.latest 为对象数组；quota.windows 按 minutes 识别周窗口（10080），resets_at 和 sampled_at 是 Unix 秒，不能把窗口位置或日期字符串当作固定契约。只参考结构，没有复制真实取值。
- 计划 P3 至少三份样例；本次任务细化为 ok、alerts、unknown、error 四份，按本次要求实现。

## 行为与设计

首页为今天 / 业务 / 工具 / 目录四段，两个主要入口位于今天与业务之间；原登记漂移提示移入业务区。新区域沿用 base.css 颜色和字体，正常、异常、未知用细侧边及带文字的状态点区分，无大面积红底。额度在宽屏右侧，540px 以下落到动态下方；异常与提交文字允许换行。

三态判定在 `assets/home/today.js`，15 分钟边界沿用 STALE_SECONDS。失败、来源缺失、时间未知和数据过期均显示状态未知，保留并排序已知异常；网络失败也标注未知，卡片重建不会清掉离线状态。15 秒刷新同时重算今天状态，即使存储不可用也能更新。

额度只选择 10080 分钟窗口；stale 标注旧数据，expired/unavailable/error 隐藏百分比。按采集模块的 10 分钟 / 1 小时语义重新检查缓存年龄，跨过重置时间后隐藏旧百分比。重置时间按浏览器本地时区显示。

## 本地样例切换

```sh
python3 -B scripts/dev_server.py --port 8000
```

打开 `http://localhost:8000/?fixture=ok`（或 alerts / unknown / error）。本地服务器在首页响应写入 HttpOnly、SameSite=Lax 的 `preview_fixture` cookie；首页模块照常请求 `/api/summary`，由服务器选对应假数据。页面 JS 不读取 fixture 参数。cookie 在同源页签间共享，切换样例请重新打开对应 URL。直接请求 `/api/summary?fixture=alerts` 仅覆盖该次 API 请求，不修改 cookie；无参数、无 cookie 时仍使用原 P1 summary.json。非法名称返回 400。

四份新 fixture 全为示例值，只有仓库名沿用登记；没有读取生产 API。原 P1 fixture 不变。

## 已完成的离线验证

- `node --test tests/*.test.mjs`：退出码 0，15 passed / 0 failed。覆盖主题、缓存和离线刷新、退役入口、四段结构、三态与 15 分钟边界、异常排序和保留、周额度与过期、两条提交渲染、离线回填、登记逐字节约束。
- `python3 -B -m unittest tests/dev_server_test.py`：退出码 0，5 tests OK。覆盖静态文件、真实登记、默认样例、四份 query/cookie 选择、HEAD、显式 query 优先级及非法样例拒绝。
- `for file in assets/home/*.js; do node --input-type=module --check < "$file" || exit; done`：退出码 0。
- Python AST 解析 dev_server.py、verify_p3.py、dev_server_test.py：退出码 0，无落盘字节码。
- `git diff --check`：退出码 0。
- `git diff --stat projects.json`：

```text
 projects.json | 22 ++++++++++++++++++++--
 1 file changed, 20 insertions(+), 2 deletions(-)
```

## 浏览器核验待补

`scripts/verify_p3.py` 起独立无头 Chromium，不连接已打开的浏览器。冻结时钟与 P1 一致，为 2026-10-16 04:05:05 UTC；时区为 Asia/Taipei。四份样例 × 390/1280 × light/dark 共 16 组，截图和 browser.json 写入本目录；任何控制台、页面或断言错误均退出 1，环境错误也非零退出。脚本同时检查卡片数、三态、bad 优先、额度、重置时间、两条提交、横向溢出与额度布局。

沙箱内两次启动尝试：系统 `python3 -B scripts/verify_p3.py` 退出 1（缺 Playwright）；使用已安装 Playwright 的 Python 3.11 后退出 1（本地服务器 bind 报 PermissionError: Operation not permitted）。尚未进入浏览器采集，**没有生成截图，也不能宣称深浅色视觉验收或浏览器控制台通过**。

核验方在允许本地端口和浏览器的环境运行：

```sh
P1_BROWSER_CHANNEL=chrome /opt/homebrew/opt/python@3.11/bin/python3.11 -B scripts/verify_p3.py
```

不指定 P1_BROWSER_CHANNEL 时使用 Playwright 默认 Chromium。核验方还需人工检查 16 张图的排版和深浅色可读性。本轮未执行 P4 或任何发布操作。

## Claude 独立核验（2026-10-17，沙箱外）

- `node --test tests/*.test.mjs`：15 passed / 0 failed；`python3 -B -m unittest tests/dev_server_test.py`：OK。
- `P1_BROWSER_CHANNEL=chrome /opt/homebrew/opt/python@3.11/bin/python3.11 -B scripts/verify_p3.py`：退出码 0，16 张截图，控制台、页面和断言错误 0。上文"沙箱内两次启动尝试失败"已由本次补跑覆盖。
- 人工查看 `alerts-1280-light`、`unknown-390-dark`：三态显示、排序、窄屏额度块下移、工具分组均符合计划。
- 修订：`quotaView` 不再自行把 10 分钟以上的采样标为旧数据（采集器每 10 分钟读一次，summary 每 5 分钟推一次，正常就有 10–15 分钟旧）；时钟超前容差 5 分钟。测试已同步。
- 公开仓库检查：fixture、脚本、页面中无真实服务器名、提醒内容或 IP。
