---
name: sync-projects
description: >
  Use when ranzi.space 的项目清单和实际项目脱节 —— 新项目没在网站上出现、项目上线了
  但描述还是老的、状态该从 active 转 dormant 了没改、大屏提醒"N 个项目未登记"。
  projects.json 是 ranzi.space 首页大屏 + /projects 列表 + hub README 的唯一真源。
  触发词: /sync-projects、/同步项目、"网站怎么没更新"、"项目滞后"、"查漏项目"、
  "补登记项目"、"projects.json 对账"、"哪些项目没登记"、"更新 ranzi.space 项目"。
  也在做完 /new-project 之外的项目变动（改状态、上线加链接、改描述）后主动触发。
---

# sync-projects — projects.json 真源对账登记

> **核心原则**：`projects.json` 是 ranzi.space 项目清单的**唯一真源**（首页大屏卡片 +
> /projects 列表页 + hub README 全靠它渲染）。但它靠手动维护，必然漂移。这个 skill 把
> "清单跟上现实"从**靠人记得**变成**机械对账 + 半自动登记**。

## 为什么重要

网站不是数据源，`projects.json` 才是。项目发生任何变动（新建、上线、改状态、改描述）
如果没同步进这个文件，网站就一直显示旧的——这不是 bug，是"真源靠人肉维护 → 必然滞后"
的结构性问题。`/new-project` 只覆盖"从零新建"一条路径；手动建的项目、已登记项目的后续
变化，全靠这个 skill 兜底。

## 核心概念：客观检测 vs 主观登记（先分清，否则会瞎填）

| 类型 | 谁来做 | 例子 |
|------|--------|------|
| **客观事实** | `audit_projects.py` 全自动 | 本地有仓库没登记 / active 但久未提交 / 登记了但本地没有 |
| **主观判断** | Claude 拟稿 + **用户拍板** | tagline 怎么写、status 归哪类、要不要上大屏、tier 几级 |

**脚本绝不自动写 projects.json**。它只告诉你"哪里对不上"+给拟稿原材料。真正写什么、
写不写，是 judgment，必须人确认。这条是这个 skill 和"全自动补登记"的根本区别。

## 执行流程

### 第一步：机械对账（先跑脚本，别先猜）

```bash
python3 ~/Projects/ranzi-space/skills/sync-projects/audit_projects.py          # 人类可读
python3 ~/Projects/ranzi-space/skills/sync-projects/audit_projects.py --json   # 给自己消费
```

四类漂移（详见脚本 docstring）：
- **missing** 本地有 git 仓库但清单没登记 → 附 github / README 首行 / 技术栈线索（拟稿原材料）
- **stale** status=active 但 >120 天没提交 → 复核是不是该转 dormant
- **orphan** 清单登记了但本地找不到 → 复核是否已删/改名
- **naming** 目录名 ≠ slug 但靠别名匹配上 → 仅记录（audit trail，不用动）

漂移合计 0 → 直接告诉用户"真源与现实一致"，收工。

### 第二步：逐个拟稿（读原材料，做 judgment）

对每个 **missing** 项，用脚本给的 github + README 首行 + 技术栈线索，再按需
`cat <项目>/README.md` 或查 memory，拟出这一行的字段（对齐现有条目风格）：

```json
{
  "slug": "kindle-dash",
  "title": "Kindle 仪表盘（kindle-dash）",
  "tagline": "一句话说清它是什么（中文，克制，不带 emoji）",
  "status": "active",
  "tier": 2,
  "github": "https://github.com/ranzi0000/kindle-dash",
  "tags": ["E-Ink", "Python"],
  "show_on_site": true,
  "show_on_dashboard": false
}
```

字段取值：`status` ∈ active/dormant/archived/infra；`tier` 1=旗舰 2=工具 3=配套（可省）；
上大屏要额外配 `dash: {key,title,sub,href,order}`（有活数据才做，key 对应
dash-collector 的 collector）；有线上地址加 `"live": "..."`。

### 第三步：给用户确认主观字段（唯一需要介入的地方）

把拟稿摆成表格给用户，**至少确认 status 和 show_on_dashboard**（这两个最主观）。
用户点头/改字段后才写入。不要替用户决定项目该不该上大屏、算不算活跃。

对 stale / orphan，也是问用户"要不要转 dormant / 是不是删了"，不自动改。

### 第四步：安全写入 projects.json（**indent=1 铁律**）

`projects.json` 用 **1 个空格缩进**，不是 2。用 `json.dump(..., indent=1)`，否则整文件
会被重排、diff 爆炸、丢失原格式：

```python
import json
path = "/Users/chenguodong/Projects/ranzi-space/projects.json"
d = json.load(open(path, encoding="utf-8"))
existing = {p["slug"] for p in d["projects"]}
for entry in NEW_ENTRIES:               # 幂等：已存在的 slug 跳过
    if entry["slug"] not in existing:
        d["projects"].append(entry)
with open(path, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=1)
    f.write("\n")                       # 保留末尾换行
```

写完**立刻 `git diff --stat projects.json`**：只该新增 ~14 行/条 + 1 处末尾加逗号。
若 diff 是几百行的重排 → indent 错了，`git checkout projects.json` 重来。

### 第五步：commit + 部署 + 独立验证

```bash
cd /Users/chenguodong/Projects/ranzi-space
git add projects.json && git commit -m "feat: 补登记 <slug> 进真源"   # post-commit 自动 deploy
```

commit 会触发 `post-commit` → `deploy.sh` 自动部署到 CF Pages。然后**用独立手段验证**
（执行的命令和验证的命令必须是两个动作）：

- **commit 成真**：单独跑 `git log -1 --format=%h` 看 HEAD 变了、`git status` 里 projects.json 不再是 M
- **线上生效**：浏览器或 read_page 看 https://ranzi.space/projects/ 出现新项目

## 自检清单（这个 skill 的灵魂，逐条打勾）

- [ ] audit 列出的每个 **missing** 都处理了（登记 / 或明确跳过并说明原因）
- [ ] 写入后 `python3 -c "import json;json.load(open('projects.json'))"` 不报错（JSON 合法）
- [ ] `git diff --stat projects.json` 只新增预期行数（**没有整文件重排** → 证明 indent=1 生效）
- [ ] commit 用**独立命令**验证过 HEAD 变化（不看 commit 命令自己的输出）
- [ ] 线上 /projects 页确认出现新项目（浏览器/read_page，不是"应该好了"）
- [ ] stale / orphan 已向用户复核（要不要转 dormant / 是否已删），没有自动改

哪条打不了勾，回去补。

## 常见坑（都是真踩过的，别再踩）

| 坑 | 后果 | 正解 |
|----|------|------|
| `json.dump` 用默认 `indent=2` | 整文件重排、diff 几百行、丢格式 | **必须 `indent=1`**，写完查 diff |
| 信任 `flagged during monitoring` 标记的命令结果 | 拿到假 commit hash / 假状态还当真 | 该结果作废，换浏览器 / Read 直接读文件 / CF API 复核 |
| deploy 会把**工作树**文件推上线 | 没 commit 也上线了，误以为入库了 | 部署 ≠ 入库，改完必须 `git commit` 补齐历史 |
| 用 `timeout` 命令 | macOS 没有,exit 127,命令没跑还以为"输出被吞" | 别用 `timeout`；长命令用 Bash 工具自带超时 |
| 只 push dash-collector 不重跑 | 大屏提醒条不会立刻归零 | 补登记后大屏会随下一轮采集（≤5min）自动归零，不用手动催 |

## 相关

- 姊妹 skill `/new-project`：从零新建项目时自动追加 projects.json（本 skill 管"新建之后"的一切变动）
- 大屏提醒来源：`dash-collector/collect.py` 的 `collect_registry_drift()` 每 5min 对账，把 `registry_drift` 塞进 summary，首页 header 下方显示提醒条
- 部署链路细节见 memory `ranzi_space.md`
