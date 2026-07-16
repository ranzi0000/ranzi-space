#!/usr/bin/env python3
"""
projects.json 真源对账器 —— sync-projects skill 的机械检测部分。

机械能判断的（客观事实）在这里全自动检出；主观判断（tagline 怎么写、
status 归哪类、要不要上大屏）留给 SKILL.md 指导 Claude + 人确认，脚本不碰。

用法:
    python3 audit_projects.py            # 人类可读摘要
    python3 audit_projects.py --json     # 结构化 JSON（给程序/Claude 消费）

四类漂移:
    missing  本地有 git 仓库但 projects.json 没登记（硬，零误报）→ 附拟稿原材料
    stale    status=active 但 >STALE_DAYS 天没提交（软提示，可能该转 dormant）
    orphan   projects.json 登记了但本地目录 + _archived_local 都找不到
    naming   本地目录名与 slug 对不上、靠别名/归一化才匹配（audit trail，不算错）

定位 projects.json（依次尝试）:
    1. 环境变量 PROJECTS_JSON（显式指定，不存在则报错，绝不静默回退）
    2. ~/Projects/ranzi-space/projects.json（真源固定位置）

注意：不用 __file__ 相对定位——脚本经软链调用时 __file__ 解析不跟随软链，
会算到错误目录。绝对路径最稳（这个 skill 本就死绑 ranzi-space）。
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

HOME = Path.home()
PROJECTS_DIR = HOME / "Projects"

# 本地目录名 ↔ projects.json slug 的真别名（前缀 ranzi- / 下划线差异靠归一化，这里只列名字完全不同的）
ALIASES = {"fortune_teller_app": "xuanyi-fortune"}
# 不需要登记的本地 git 仓库（网站自己 + 本地 skill 收藏等纯基建，可按需扩充）
IGNORE_DIRS = {"ranzi-space"}
STALE_DAYS = 120  # active 但这么久没提交 → 软提示


def find_registry() -> Path:
    env = os.environ.get("PROJECTS_JSON")
    if env:  # 显式指定就必须用它；不存在直接报错，绝不静默回退到别的 registry
        p = Path(env)
        if p.is_file():
            return p
        raise FileNotFoundError(f"PROJECTS_JSON={env} 指向的文件不存在")
    default = PROJECTS_DIR / "ranzi-space" / "projects.json"
    if default.is_file():
        return default
    raise FileNotFoundError(
        f"找不到 projects.json（{default}）；或设 PROJECTS_JSON 环境变量指定"
    )


def norm_slug(s: str) -> str:
    return s.replace("_", "-").replace("ranzi-", "")


def git_last_commit(repo: Path) -> str | None:
    try:
        out = subprocess.check_output(
            ["git", "-C", str(repo), "log", "-1", "--format=%cs"],
            stderr=subprocess.DEVNULL, timeout=10,
        )
        return out.decode().strip() or None
    except Exception:
        return None


def git_remote(repo: Path) -> str | None:
    try:
        out = subprocess.check_output(
            ["git", "-C", str(repo), "remote", "get-url", "origin"],
            stderr=subprocess.DEVNULL, timeout=10,
        )
        url = out.decode().strip()
        return url[:-4] if url.endswith(".git") else url or None
    except Exception:
        return None


def readme_head(repo: Path) -> str | None:
    for name in ("README.md", "README.MD", "readme.md", "README"):
        f = repo / name
        if f.is_file():
            try:
                for line in f.read_text("utf-8", errors="replace").splitlines():
                    t = line.strip().lstrip("# ").strip()
                    if t:
                        return t[:120]
            except Exception:
                return None
    return None


def lang_hint(repo: Path) -> list[str]:
    """扫标志文件猜技术栈，帮 Claude 拟 tags。启发式，不求全。"""
    hints: list[str] = []
    names = set()
    try:
        names = {p.name.lower() for p in repo.iterdir()}
    except Exception:
        return hints
    if "package.json" in names:
        hints.append("Node")
    if "requirements.txt" in names or "pyproject.toml" in names or any(
        n.endswith(".py") for n in names
    ):
        hints.append("Python")
    if "cargo.toml" in names:
        hints.append("Rust")
    if "go.mod" in names:
        hints.append("Go")
    if any(n.endswith(".html") for n in names) or "index.html" in names:
        hints.append("前端")
    if "dockerfile" in names:
        hints.append("Docker")
    return hints


def find_local_repo(slug: str) -> Path | None:
    """按 slug / 下划线变体 / 别名反查本地 git 仓库目录。"""
    for c in (slug, slug.replace("-", "_")):
        if (PROJECTS_DIR / c / ".git").is_dir():
            return PROJECTS_DIR / c
    for local, sl in ALIASES.items():
        if sl == slug and (PROJECTS_DIR / local / ".git").is_dir():
            return PROJECTS_DIR / local
    return None


def audit() -> dict:
    reg_path = find_registry()
    reg = json.loads(reg_path.read_text("utf-8"))
    projects = reg.get("projects", [])
    by_slug = {p["slug"]: p for p in projects}
    reg_norm = {norm_slug(s) for s in by_slug}
    archived_local = set(reg.get("_archived_local", []))
    today = date.today()

    missing, stale, orphan, naming = [], [], [], []

    # 扫本地 git 仓库
    local_git_dirs = []
    for d in sorted(os.listdir(PROJECTS_DIR)):
        if d.startswith(".") or d.startswith("_"):
            continue
        if (PROJECTS_DIR / d / ".git").is_dir():
            local_git_dirs.append(d)

    # 1) missing + 4) naming
    for d in local_git_dirs:
        if d in IGNORE_DIRS or d in archived_local:
            continue
        alias = ALIASES.get(d, d)
        if alias in by_slug or norm_slug(d) in reg_norm:
            # 匹配上了，但目录名与 slug 字面不同 → naming 提示
            if d not in by_slug:
                matched = alias if alias in by_slug else next(
                    (s for s in by_slug if norm_slug(s) == norm_slug(d)), None
                )
                if matched and matched != d:
                    naming.append({"local_dir": d, "slug": matched})
            continue
        repo = PROJECTS_DIR / d
        missing.append({
            "slug": d,
            "last_commit": git_last_commit(repo),
            "github": git_remote(repo),
            "readme_head": readme_head(repo),
            "lang_hint": lang_hint(repo),
        })

    # 2) stale：active 且很久没提交
    for p in projects:
        if p.get("status") != "active":
            continue
        repo = find_local_repo(p["slug"])
        if repo is None:
            continue
        lc = git_last_commit(repo)
        if not lc:
            continue
        try:
            days = (today - datetime.strptime(lc, "%Y-%m-%d").date()).days
        except Exception:
            continue
        if days > STALE_DAYS:
            stale.append({"slug": p["slug"], "last_commit": lc, "days": days})

    # 3) orphan：登记了但本地没有（排除 infra/archived —— 它们可能本就无本地目录如远程服务）
    for p in projects:
        if p.get("status") in ("infra", "archived"):
            continue
        if find_local_repo(p["slug"]) is None:
            orphan.append({"slug": p["slug"], "status": p.get("status")})

    return {
        "checked_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "registry": str(reg_path),
        "summary": {
            "missing": len(missing), "stale": len(stale),
            "orphan": len(orphan), "naming": len(naming),
        },
        "missing": missing,
        "stale": stale,
        "orphan": orphan,
        "naming": naming,
    }


def print_human(r: dict) -> None:
    s = r["summary"]
    total = s["missing"] + s["stale"] + s["orphan"]
    print(f"projects.json 对账 · {r['checked_at']}")
    print(f"真源: {r['registry']}")
    print(f"漂移合计 {total}  (未登记 {s['missing']} · 可能过时 {s['stale']} · 孤儿 {s['orphan']} · 命名不一致 {s['naming']})")
    if r["missing"]:
        print("\n── 未登记（本地有仓库、清单没有）── 需登记")
        for m in r["missing"]:
            print(f"  • {m['slug']}  最近提交 {m['last_commit'] or '?'}")
            if m["github"]:
                print(f"      github : {m['github']}")
            if m["readme_head"]:
                print(f"      README : {m['readme_head']}")
            if m["lang_hint"]:
                print(f"      技术栈线索 : {', '.join(m['lang_hint'])}")
    if r["stale"]:
        print("\n── 可能过时（active 但久未提交）── 建议复核 status")
        for x in r["stale"]:
            print(f"  • {x['slug']}  最近提交 {x['last_commit']}（{x['days']} 天前）")
    if r["orphan"]:
        print("\n── 孤儿（清单有、本地找不到）── 复核是否已删/改名")
        for x in r["orphan"]:
            print(f"  • {x['slug']}  (status={x['status']})")
    if r["naming"]:
        print("\n── 命名不一致（目录名 ≠ slug，靠别名匹配）── 仅记录")
        for x in r["naming"]:
            print(f"  • 目录 {x['local_dir']}  ↔  slug {x['slug']}")
    if total == 0:
        print("\n真源与本地一致，无需登记。")


def main() -> int:
    try:
        r = audit()
    except Exception as e:
        print(f"AUDIT FAILED: {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    if "--json" in sys.argv:
        print(json.dumps(r, ensure_ascii=False, indent=2))
    else:
        print_human(r)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
