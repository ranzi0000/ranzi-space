#!/opt/homebrew/opt/python@3.11/bin/python3.11
"""P3/T1: synthetic quota states × 2 widths × 2 themes; headless only."""
import json
import os
from pathlib import Path
import sys

from playwright.sync_api import sync_playwright
from verify_p1 import FROZEN_CLOCK, serve

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {"ok": "ok", "alerts": "alerts", "unknown": "unknown", "error": "unknown"}
CLAUDE = {
    "ok": ("74%", "5 小时剩余 87%", "剩余"),
    "alerts": ("74%", "5 小时剩余 87%", "数据 11:05"),
    "unknown": ("—", "5 小时剩余 —", "终端 Claude 未运行"),
    "error": ("—", "5 小时剩余 —", "终端 Claude 未运行"),
}


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
                            assert page.locator('.grid .card').count() == 7
                            assert page.locator('.entry-grid .entry').count() == 3
                            assert page.locator('.group-section:visible .eyebrow').all_text_contents() == ['投资', '创作', '工具']
                            assert page.locator('#quick-tags a:visible').all_text_contents() == ['今天', '投资5', '创作4', '工具1', '服务器', '目录']
                            assert page.locator('#today-latest li').count() == (0 if fixture == 'error' else 2)
                            assert page.locator('#quota-value').inner_text() == ('—' if fixture == 'error' else '62%')
                            assert page.locator('#quota-state').inner_text() == ({'unknown': '旧数据', 'error': '未读取到'}.get(fixture, '剩余'))
                            if fixture != 'error':
                                assert page.locator('#quota-reset').inner_text() == '10/22 周四 20:04 重置'
                            value, short, label = CLAUDE[fixture]
                            assert page.locator('#quota-claude-value').inner_text() == value
                            assert page.locator('#quota-claude-short').inner_text() == short
                            assert page.locator('#quota-claude-state').inner_text() == label
                            assert page.locator('#quota-claude-reset').inner_text() == (
                                '10/22 周四 20:04 重置' if fixture in ('ok', 'alerts') else '')
                            assert page.locator('.quota-block').get_attribute('aria-label') == '额度'
                            rows = page.locator('.quota-row')
                            assert rows.count() == 2
                            assert rows.nth(0).is_visible() and rows.nth(1).is_visible()
                            codex_box, claude_box = rows.nth(0).bounding_box(), rows.nth(1).bounding_box()
                            assert claude_box['y'] >= codex_box['y'] + codex_box['height']
                            for selector in ('#quota-value', '#quota-state', '#quota-reset',
                                             '#quota-claude-value', '#quota-claude-short',
                                             '#quota-claude-state', '#quota-claude-reset'):
                                # Both palettes must keep the text legible against the card.
                                contrast = page.locator(selector).evaluate("""el => {
                                    const rgb = color => color.match(/[\\d.]+/g).slice(0, 3).map(Number);
                                    const luminance = color => rgb(color).map(v => {
                                        v /= 255;
                                        return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
                                    }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
                                    const fg = luminance(getComputedStyle(el).color);
                                    const bg = luminance(getComputedStyle(document.querySelector('.today-panel')).backgroundColor);
                                    return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
                                }""")
                                assert contrast >= 4.5, f'{selector}: contrast {contrast:.2f}'
                            if fixture in ('alerts', 'unknown'):
                                # 假数据里「服务器失联」归 AI 侧（折叠行），用户列表只剩「续费」一条
                                assert page.locator('#today-alerts li').count() == 1
                                assert 'warn' in page.locator('#today-alerts .status-dot').first.get_attribute('class')
                                assert page.locator('#today-ai').is_visible()
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
