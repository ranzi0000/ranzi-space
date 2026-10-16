#!/opt/homebrew/opt/python@3.11/bin/python3.11
"""P3: 4 fixtures × 2 widths × 2 themes in a new headless browser only."""
import json
import os
from pathlib import Path
import sys

from playwright.sync_api import sync_playwright
from verify_p1 import FROZEN_CLOCK, serve

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {"ok": "ok", "alerts": "alerts", "unknown": "unknown", "error": "unknown"}


def main():
    output = ROOT / "docs/verification/p3"
    output.mkdir(parents=True, exist_ok=True)
    results = []
    with serve(ROOT) as origin, sync_playwright() as playwright:
        with playwright.chromium.launch(
                headless=True, channel=os.environ.get("P1_BROWSER_CHANNEL") or None) as browser:
            for fixture, state in EXPECTED.items():
                for width in (390, 1280):
                    for scheme in ("light", "dark"):
                        result = {"image": f"{fixture}-{width}-{scheme}.png", "errors": []}
                        results.append(result)
                        context = browser.new_context(
                            viewport={"width": width, "height": 900}, device_scale_factor=1,
                            color_scheme=scheme, locale="zh-CN", timezone_id="Asia/Taipei")
                        context.add_init_script(FROZEN_CLOCK)
                        page = context.new_page()
                        page.on("pageerror", lambda error, r=result: r["errors"].append(str(error)))
                        page.on("console", lambda msg, r=result: r["errors"].append(msg.text) if msg.type == "error" else None)
                        try:
                            page.goto(f"{origin}/?fixture={fixture}", wait_until="networkidle")
                            page.wait_for_function("document.querySelector('#refresh-meta').textContent === '5min ago'")
                            page.evaluate("document.fonts.ready")
                            assert page.locator('#today-panel').get_attribute('data-state') == state
                            assert page.locator('#grid .card').count() == 8
                            assert page.locator('#entry-grid .entry').count() == 10
                            assert page.locator('.tool-heading').all_text_contents() == ['投资', '创作', '工具']
                            assert page.locator('#today-latest li').count() == (0 if fixture == 'error' else 2)
                            assert page.locator('#quota-value').inner_text() == ('—' if fixture == 'error' else '62%')
                            assert page.locator('#quota-state').inner_text() == ({'unknown': '旧数据', 'error': '未读取到'}.get(fixture, '剩余'))
                            if fixture != 'error':
                                assert page.locator('#quota-reset').inner_text() == '10/22 周四 20:04 重置'
                            if fixture in ('alerts', 'unknown'):
                                assert 'bad' in page.locator('#today-alerts .status-dot').first.get_attribute('class')
                            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                            copy = page.locator('.today-copy').bounding_box()
                            quota = page.locator('.quota-block').bounding_box()
                            if width == 390:
                                assert quota['y'] >= copy['y'] + copy['height']
                            else:
                                assert quota['x'] > copy['x']
                            page.screenshot(path=str(output / result['image']), full_page=True)
                        except Exception as error:
                            result['errors'].append(str(error))
                        finally:
                            context.close()
    (output / 'browser.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
    errors = sum(len(result['errors']) for result in results)
    print(f"{len(results)} cases; {sum((output / r['image']).exists() for r in results)} screenshots; console/page/assertion errors: {errors}")
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
