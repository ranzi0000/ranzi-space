# P1 公共层实施与验收（2026-10-16）

范围：`refactor/p1-common-layer`；起点与 main 均为 `5783650`。仅实施 P1 第 1–6 条，没有部署、push、merge 或实施 P2–P4。

## 1. 计划与代码的矛盾

| 锚点 | 当前代码 | 本次处理 |
| --- | --- | --- |
| 63 项、23 项有 dash、18 项上首页 | 63 / **22** / 18 | projects.json 原样保留 |
| 重复 order 为 3、10 | **3、5、10** 各重复两次 | P1 不重排、不修 order |
| projects 防闪第 20 行、切换脚本第 436 行 | 防闪起于 **17** 行、切换 script 标签在 **433** 行 | 防闪脚本逐字保留 |
| 首页脚本第 579–911 行 | script 标签在 **580** 行，911 为结束标签 | 按函数边界抽取 |
| 首页与 projects 的公共样式 | 首页独有 focus-visible；services 等宽字体列表少 Liberation Mono | 焦点样式留首页，字体差异保留在 base.css 的 services 作用域 |
| 全库背景变量仅命中 base.css | 计划遗漏 **functions/_middleware.js 登录页**的定义；其深色背景为 #0f0f10，与内容页 #0c0c0c 不同 | 保持 P1 四页范围，不改登录页、鉴权或通过改名规避检索；此项验收未通过 |

其余 P1 锚点一致：四页原主题行为、summary/projects.json 来源、SW 无预缓存、网络优先静态缓存、v2 缓存名及提交自动部署钩子。其他仓库的锚点未核验，属于 P2–P4 范围。

## 2. 实施与提交范围

- base.css 集中颜色、字体、首页与项目页的基础样式，以及主题按钮样式；services/dbs 保留原布局和系统跟随行为。
- theme.js 仅由首页和 projects 引用；head 防闪脚本保留，存储键不变。
- 首页模块：data.js 管缓存、请求、定时与前台刷新、SW 注册；render.js 管 DOM 和重建卡片后的 summary 回填。
- sw.js 仅更改缓存版本为 v3。projects.json、登录 middleware 未改。
- 标准库 dev_server.py 静态服务指定根目录，真实读取该目录 projects.json；summary 始终来自仓库中的单份假 fixture。fixture 按当前前端消费结构构造，未读取生产数据或凭据。
- 增加离线行为测试与核验脚本。测试命令：`node --test tests/*.test.mjs`（Codex 原先加的 `tests/index.js` 目录入口已由 Claude 删除）。

所有提交必须通过 `SKIP_DEPLOY=1 git commit ...`。Codex 在沙箱内 `git add` 被拒（索引锁，退出码 128），由 Claude 核验后代为提交；以 `git log --oneline main..HEAD` 为准。

## 3. 验收结果（Claude 在沙箱外独立执行，2026-10-16）

| 命令 / 检查 | 退出码 | 关键结果 |
| --- | --- | --- |
| `node --test tests/*.test.mjs` | **0** | 8 passed / 0 failed |
| `python3 -B -m unittest tests/dev_server_test.py` | **0** | OK |
| `P1_BROWSER_CHANNEL=chrome python3.11 -B scripts/verify_p1.py` | **0** | 32 张截图；四页 console / pageerror 共 0 条；首页与 /projects 主题切换、防闪恢复断言通过；/services、/dbs 无手动切换、仍跟随系统 |
| `python3.11 -B scripts/compare_p1_pixels.py` | 1 | 13 对完全一致，3 对有极少量像素差（见下表） |
| `grep -rln -- '--bg:'`（html/css/js，排除 docs） | 0 | 命中 `assets/base.css` 与 `functions/_middleware.js` |

Playwright 自带浏览器未安装（下载需用户同意），因此用 `P1_BROWSER_CHANNEL=chrome` 调用本机已装的 Chrome 无头模式，未操作任何已打开的浏览器窗口。

像素差异（[逐对结果](pixels.csv)，截图在 [before/](before/) 与 [after/](after/)）：

| 截图 | 不同像素 | 占比 | 最大色差（0–255） |
| --- | --- | --- | --- |
| home-1280-light | 52 | 0.0024% | 12 |
| home-1280-dark | 68 | 0.0031% | 11 |
| projects-1280-dark | 85 | 0.0010% | 16 |
| 其余 13 对 | 0 | 0 | 0 |

判定：差异像素全部落在文字字形边缘，最大色差不超过 16，放大对照肉眼无区别，属于两次渲染之间文字抗锯齿的细微抖动，不是样式改变。视觉验收通过。

## 4. 范围说明

- 登录页颜色变量写在 `functions/_middleware.js` 生成的 HTML 里。登录前访问不到受密码门保护的 `/assets/base.css`，所以登录页保留自己的变量，作为"颜色变量只在 base.css 定义"这一标准的例外。
- /dbs 加载时会请求 `/api/dbs-config`，截图脚本对它固定返回假数据，前后两版相同；控制台结果只证明离线环境，不证明生产接口。

未运行 deploy.sh、wrangler 或任何 Cloudflare 操作；线上保持未部署状态。
