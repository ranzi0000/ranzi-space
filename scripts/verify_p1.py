#!/opt/homebrew/opt/python@3.11/bin/python3.11
"""Capture P1 in a NEW headless Playwright browser. Never attaches to open tabs."""
import argparse
from contextlib import contextmanager
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGES = {"home": "/", "projects": "/projects/", "services": "/services/", "dbs": "/dbs/"}
FROZEN_CLOCK = """{
  const OriginalDate = Date;
  const fixed = OriginalDate.parse('2026-10-16T04:05:05Z');
  window.Date = class extends OriginalDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed; }
  };
}"""


@contextmanager
def serve(root):
    process = subprocess.Popen(
        [sys.executable, "-B", str(ROOT / "scripts/dev_server.py"), "--root", str(root), "--port", "0"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    try:
        line = process.stdout.readline().strip()
        if not line.startswith("Preview ready on port "):
            raise RuntimeError(process.stderr.read())
        yield "http://localhost:" + line.rsplit(" ", 1)[1]
    finally:
        process.terminate()
        process.wait()


def capture(browser, origin, output):
    results = []
    output.mkdir(parents=True, exist_ok=True)
    for name, path in PAGES.items():
        for width in (390, 1280):
            for scheme in ("light", "dark"):
                context = browser.new_context(viewport={"width": width, "height": 900},
                                              device_scale_factor=1, color_scheme=scheme,
                                              locale="zh-CN", timezone_id="Asia/Taipei")
                context.add_init_script(FROZEN_CLOCK)
                # /dbs already requests this unrelated production API on load.
                # Keep it offline and identical on both sides; dev_server only mocks summary.
                context.route("**/api/dbs-config", lambda route: route.fulfill(
                    content_type="application/json", body='{"push_time":"09:20"}'))
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
                page.goto(origin + path, wait_until="networkidle")
                page.evaluate("document.fonts.ready")
                if name == "home":
                    page.wait_for_function("document.querySelector('#refresh-meta').textContent === '5min ago'")
                elif name == "projects":
                    page.wait_for_selector(".proj-row")
                elif name == "services":
                    page.wait_for_selector(".svc")
                filename = f"{name}-{width}-{scheme}.png"
                page.screenshot(path=str(output / filename), full_page=True)
                results.append({"image": filename, "errors": errors})
                if name in ("home", "projects"):
                    for mode in ("dark", "light", "auto"):
                        page.locator(f'.theme-toggle .seg[data-theme="{mode}"]').click()
                        assert page.locator("html").get_attribute("data-theme") == (None if mode == "auto" else mode)
                        assert page.locator(f'.theme-toggle .seg[data-theme="{mode}"]').get_attribute("aria-pressed") == "true"
                    # Verify the head script restores a saved override on a new navigation.
                    opposite = "dark" if scheme == "light" else "light"
                    page.evaluate("mode => localStorage.setItem('ranzi-space-theme', mode)", opposite)
                    page.reload(wait_until="networkidle")
                    assert page.locator("html").get_attribute("data-theme") == opposite
                else:
                    assert page.locator(".theme-toggle").count() == 0
                    page.evaluate("localStorage.setItem('ranzi-space-theme', 'dark')")
                    page.reload(wait_until="networkidle")
                    assert page.locator("html").get_attribute("data-theme") is None
                context.close()
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-ref", default="main")
    args = parser.parse_args()
    output = ROOT / "docs/verification/p1"
    with tempfile.TemporaryDirectory(prefix="ranzi-space-p1-before-") as tmp:
        archive = subprocess.check_output(["git", "archive", args.baseline_ref], cwd=ROOT)
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            tar.extractall(tmp, filter="data")
        # Start servers first: fail normally if this environment forbids local ports.
        with serve(Path(tmp)) as before, serve(ROOT) as after, sync_playwright() as playwright:
            with playwright.chromium.launch(
                    headless=True, channel=os.environ.get("P1_BROWSER_CHANNEL") or None) as browser:
                results = {"before": capture(browser, before, output / "before"),
                           "after": capture(browser, after, output / "after")}
        (output / "browser.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
        count = sum(len(item["errors"]) for group in results.values() for item in group)
        print(f"32 screenshots; console/page errors: {count}")
        return 1 if count else 0


if __name__ == "__main__":
    sys.exit(main())
