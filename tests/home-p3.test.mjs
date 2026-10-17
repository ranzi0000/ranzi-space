import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const { classifyToday, quotaView, formatReset, STALE_SECONDS } = await import(
  'data:text/javascript;base64,' + Buffer.from(await read('assets/home/today.js')).toString('base64'));
const now = Date.parse('2026-10-16T04:05:05Z');
const fixtures = Object.fromEntries(await Promise.all(['ok', 'alerts', 'unknown', 'error'].map(async name =>
  [name, JSON.parse(await read('tests/fixtures/' + name + '.json'))])));

// These tests exercise behavior without a browser, network or live summary values.
test('三态：完整新鲜且无异常才正常；缺字段、失败、缺来源、过期均未知', () => {
  for (const [name, expected] of Object.entries({ ok: 'ok', alerts: 'alerts', unknown: 'unknown', error: 'unknown' })) {
    assert.equal(classifyToday(fixtures[name], now).state, expected, name);
  }
  for (const summary of [undefined, {}, { alerts: { items: [] } },
    { ...fixtures.ok, alerts: undefined }, { ...fixtures.ok, alerts: { error: '' } },
    { ...fixtures.ok, alerts: { unavailable: [] } }, { ...fixtures.ok, received_at: 'invalid' },
    { ...fixtures.ok, alerts: { items: [], unavailable: ['due'] } },
    { ...fixtures.ok, alerts: { items: [], unavailable: 'disk' } }]) {
    assert.equal(classifyToday(summary, now).state, 'unknown');
  }
  assert.equal(classifyToday(fixtures.ok, now, true).state, 'unknown');
  const timestamp = Date.parse(fixtures.ok.received_at);
  assert.equal(classifyToday(fixtures.ok, timestamp + STALE_SECONDS * 1000).state, 'ok');
  assert.equal(classifyToday(fixtures.ok, timestamp + STALE_SECONDS * 1000 + 1).state, 'unknown');
  const generated = { ...fixtures.ok, received_at: undefined };
  assert.equal(classifyToday(generated, now).state, 'ok');
  // P2 describes unavailable as optional; absent means no failed sources reported.
  assert.equal(classifyToday({ ...fixtures.ok, alerts: { items: [] } }, now).state, 'ok');
});

test('异常 bad 在前且不修改输入；未知或过期时仍保留异常与缺失来源', () => {
  const original = structuredClone(fixtures.unknown);
  const result = classifyToday(original, now);
  assert.deepEqual(result.items.map(item => item.kind), ['server_expiry']);
  assert.deepEqual(result.aiItems.map(item => item.kind), ['server_down']);
  assert.deepEqual(original, fixtures.unknown);
  assert.match(result.reasons.join(' '), /未读取到：提醒事项/);
  assert.doesNotMatch(result.reasons.join(' '), /项目心跳/);
  const expired = classifyToday(original, now + 16 * 60 * 1000);
  assert.equal(expired.state, 'unknown');
  assert.equal(expired.items.length, 1);
  assert.match(expired.reasons.join(' '), /超过 15 分钟/);
  const failed = classifyToday({ ...fixtures.alerts, alerts: { ...fixtures.alerts.alerts, error: 'example' } }, now);
  assert.equal(failed.state, 'unknown');
  assert.equal(failed.items.length, 1);
});

test('只有 AI 类异常时不打扰：状态正常，AI 侧单独计数；AI 来源缺失不算未知', () => {
  const summary = { ...fixtures.ok, alerts: { items: [
    { level: 'bad', kind: 'heartbeat', title: '示例机 心跳丢失', detail: '示例机' },
    { level: 'bad', kind: 'service', title: '示例服务 退出异常', detail: '退出码 1' },
    { level: 'warn', kind: 'due', title: '示例提醒', detail: '7 天后' },
  ], unavailable: ['heartbeat', 'disk'] } };
  const mixed = classifyToday(summary, now);
  assert.equal(mixed.state, 'alerts');
  assert.deepEqual(mixed.items.map(item => item.kind), ['due']);
  assert.equal(mixed.aiItems.length, 2);
  assert.deepEqual(mixed.reasons, []);
  const aiOnly = classifyToday({ ...summary, alerts: { ...summary.alerts, items: summary.alerts.items.slice(0, 2) } }, now);
  assert.equal(aiOnly.state, 'ok');
  assert.equal(aiOnly.items.length, 0);
  assert.equal(aiOnly.aiItems.length, 2);
});

test('周额度按 minutes 识别；旧数据标注；过期、失败或跨重置隐藏百分比', () => {
  const quota = fixtures.ok.quota;
  assert.equal(quotaView(quota, now).remaining, 62);
  assert.equal(quotaView({ ...quota, windows: [...quota.windows].reverse() }, now).remaining, 62);
  assert.equal(quotaView(fixtures.unknown.quota, now).label, '旧数据');
  assert.equal(quotaView({ ...quota, state: 'expired' }, now).remaining, null);
  assert.equal(quotaView({ ...quota, state: 'unavailable' }, now).label, '未读取到');
  for (const value of [null, {}, { error: 'example' }, { ...quota, state: 'other' }]) {
    assert.equal(quotaView(value, now).remaining, null);
    assert.equal(quotaView(value, now).label, '未读取到');
  }
  assert.equal(quotaView({ ...quota, sampled_at: now / 1000 - 3600 }, now).label, '已过期');
  assert.equal(quotaView({ ...quota, sampled_at: now / 1000 + 1 }, now).remaining, 62);  // 设备间小幅时钟差不算异常
  assert.equal(quotaView({ ...quota, sampled_at: now / 1000 + 301 }, now).remaining, null);
  assert.equal(quotaView({ ...quota, sampled_at: now / 1000 - 900 }, now).label, '剩余');  // 15 分钟旧仍按采集器的 fresh 显示
  assert.equal(quotaView({ ...quota, windows: [{ minutes: 10080, remaining: 90, resets_at: now / 1000 }] }, now).remaining, null);
  assert.equal(quotaView({ ...quota, windows: [{ minutes: 300, remaining: 90 }] }, now).remaining, null);
  assert.equal(quotaView({ ...quota, windows: [{ minutes: 10080, remaining: 0 }] }, now).remaining, 0);
  assert.equal(quotaView({ ...quota, windows: [{ minutes: 10080, remaining: 101 }] }, now).remaining, null);
});

test('Unix 秒重置时间按本地时区格式化', () => {
  const seconds = fixtures.ok.quota.windows[1].resets_at;
  const date = new Date(seconds * 1000);
  assert.equal(formatReset(seconds), `${date.getMonth() + 1}/${date.getDate()} 周${'日一二三四五六'[date.getDay()]} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} 重置`);
  assert.equal(formatReset(null), '');
  assert.equal(formatReset(NaN), '');
});

test('额度窗口优先列表与独立可信年龄：Claude 六小时边界仍可用', () => {
  const quota = fixtures.ok.quota_claude;
  assert.equal(quotaView(quota, now, [10080], 21600).remaining, 74);
  assert.equal(quotaView(quota, now, [300], 21600).remaining, 87);
  assert.equal(quotaView(quota, now, [123, 300, 10080], 21600).remaining, 87);
  assert.equal(quotaView(quota, now, [10080, 300], 21600).remaining, 74);
  const stale = { ...quota, state: 'stale', sampled_at: now / 1000 - 21600 };
  assert.equal(quotaView(stale, now, [10080], 21600).remaining, 74);
  assert.equal(quotaView(stale, now + 1, [10080], 21600).remaining, null);
  assert.equal(quotaView(stale, now).remaining, null);
  assert.equal(quotaView({ ...quota, sampled_at: now / 1000 + 300 }, now, [10080], 21600).remaining, 74);
  assert.equal(quotaView({ ...quota, sampled_at: now / 1000 + 301 }, now, [10080], 21600).remaining, null);
  assert.equal(quotaView({ ...quota, sampled_at: undefined }, now, [10080], 21600).remaining, null);
  assert.equal(quotaView({ ...quota, windows: null }, now, [10080], 21600).remaining, null);
  assert.equal(quotaView({ ...quota, windows: [quota.windows[0]] }, now, [10080], 21600).remaining, null);
});

test('额度两行有独立节点、语义标签与 640px 手机断点', async () => {
  const html = await read('index.html');
  assert.match(html, /<aside class="quota-block" aria-label="额度">/);
  assert.equal((html.match(/class="quota-row"/g) || []).length, 2);
  for (const label of ['Codex · 周额度', 'Claude · 周额度']) assert.ok(html.includes(label));
  for (const suffix of ['value', 'short', 'state', 'reset']) {
    assert.equal((html.match(new RegExp('id="quota-claude-' + suffix + '"', 'g')) || []).length, 1);
  }
  assert.match(html, /@media \(max-width: 640px\)/);
});

test('首页四段与主要入口的顺序；今天独立于旧 projects 字段渲染', async () => {
  const html = await read('index.html');
  const anchors = ['id="today-heading"', '<nav class="primary-links"', 'id="business-heading"', 'id="tools-heading"', 'id="directory-heading"'];
  const positions = anchors.map(anchor => html.indexOf(anchor));
  assert.ok(positions.every(position => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.equal((html.match(/<section\b/g) || []).length, 4);
  assert.match(html, /id="today-panel"[\s\S]*aria-live="polite"/);
  const script = await read('assets/home/render.js');
  assert.doesNotMatch(script, /if \(!data \|\| !Array\.isArray\(data\.projects\)\) return/);
  assert.match(script, /groups\[d\.group\] \|\| groups\.tool/);
  assert.match(script, /activity\.latest\.slice\(0, 2\)/);
  // Fixture switching belongs only to the dev server, never the page modules.
  assert.doesNotMatch(await read('assets/home/data.js'), /fixture|URLSearchParams/);
});

test('projects.json 仅指定 18 项的 dash.group/order 变化，其他字节全部保留', async () => {
  const original = execFileSync('git', ['show', 'HEAD:projects.json'], { encoding: 'utf8', cwd: new URL('../', import.meta.url) });
  const current = await read('projects.json');
  const before = JSON.parse(original), after = JSON.parse(current);
  const groups = {
    invest: 'investment-scanner crypto-radar listing-radar wechat-analysis market-lens azone-scanner binance-strength-monitor'.split(' '),
    create: 'douyin-recorder planning-wheel duanju-studio dontbesilent-corpus duanju-reverse biaoda-gym talk-to-anyone comfy-agent'.split(' '),
    tool: 'ranzi-admin reverse-skill shouchuan-diy'.split(' '),
  };
  const allSlugs = Object.values(groups).flat();
  for (const [group, slugs] of Object.entries(groups)) {
    const projects = after.projects.filter(project => slugs.includes(project.slug));
    assert.equal(projects.length, slugs.length);
    assert.ok(projects.every(project => project.dash.group === group));
    assert.equal(new Set(projects.map(project => project.dash.order)).size, projects.length);
  }
  // Restore only allowed values to prove every other value and every byte unchanged.
  let restored = current;
  for (const project of after.projects) {
    if (!allSlugs.includes(project.slug)) continue;
    const old = before.projects.find(item => item.slug === project.slug);
    let start = restored.indexOf('"slug": "' + project.slug + '"');
    start = restored.indexOf('"dash": {', start);
    const end = restored.indexOf('\n      }', start);
    let chunk = restored.slice(start, end).replace(/\n        "group": "(?:invest|create|tool)",/,
      'group' in old.dash ? '\n        "group": "' + old.dash.group + '",' : '');
    chunk = chunk.replace(/"order": \d+/, '"order": ' + old.dash.order);
    restored = restored.slice(0, start) + chunk + restored.slice(end);
    project.dash.order = old.dash.order;
    if ('group' in old.dash) project.dash.group = old.dash.group;
    else delete project.dash.group;
  }
  assert.equal(restored, original);
  assert.deepEqual(after, before);
});

// Small DOM stand-in checks render/replay transitions without a browser process.
test('今天渲染未知保留异常、只列两条提交；离线状态在卡片重建后保留', async () => {
  class Element {
    constructor() { this.children = []; this.nodes = {}; this.dataset = {}; this.classList = { toggle() {} }; }
    set innerHTML(value) { this.markup = value; this.children = []; this.nodes = {}; }
    querySelector(selector) { return this.nodes[selector] ||= new Element(); }
    appendChild(child) { this.children.push(child); }
  }
  const nodes = {};
  const get = id => nodes[id] ||= new Element();
  const context = {
    STALE_SECONDS, classifyToday, quotaView: (quota, _now, ...options) => quotaView(quota, now, ...options),
    document: { getElementById: get, createElement: () => new Element(), body: new Element() },
    Date: class extends Date { static now() { return now; } },
  };
  const script = (await read('assets/home/render.js')).replace(/^import .*;\n/, '').replace(/export /g, '');
  vm.createContext(context);
  vm.runInContext(script, context);
  const summary = { ...fixtures.unknown, projects: [] };
  context.renderSummary(summary);
  assert.equal(get('today-panel').dataset.state, 'unknown');
  assert.equal(get('today-status').textContent, '状态未知');
  assert.match(get('today-unknown').textContent, /未读取到：提醒事项/);
  assert.equal(get('today-alerts').children.length, 1);
  assert.equal(get('today-ai').hidden, false);
  assert.match(get('today-ai').querySelector('summary').textContent, /AI 侧 1 项/);
  assert.equal(get('today-ai').querySelector('ul').children.length, 1);
  assert.equal(get('today-latest').children.length, 2);
  assert.equal(get('quota-state').textContent, '旧数据');
  context.renderSummary({ ...fixtures.ok, projects: [] });
  assert.equal(get('today-status').textContent, '一切正常');
  assert.equal(get('quota-claude-value').textContent, '74%');
  assert.equal(get('quota-claude-short').textContent, '5 小时剩余 87%');
  assert.equal(get('quota-claude-state').textContent, '剩余');
  assert.equal(get('quota-claude-reset').textContent, formatReset(fixtures.ok.quota_claude.windows[1].resets_at));
  context.renderSummary({ ...fixtures.alerts, projects: [] });
  const sampled = new Date(fixtures.alerts.quota_claude.sampled_at * 1000);
  assert.equal(get('quota-claude-value').textContent, '74%');
  assert.equal(get('quota-claude-state').textContent,
    `数据 ${String(sampled.getHours()).padStart(2, '0')}:${String(sampled.getMinutes()).padStart(2, '0')}`);
  for (const claude of [fixtures.unknown.quota_claude, undefined, { state: 'unavailable', windows: [] },
    { error: 'fixture' }]) {
    context.renderSummary({ ...fixtures.ok, projects: [], quota_claude: claude });
    assert.equal(get('quota-claude-value').textContent, '—');
    assert.equal(get('quota-claude-short').textContent, '5 小时剩余 —');
    assert.equal(get('quota-claude-state').textContent, '终端 Claude 未运行');
    assert.equal(get('quota-claude-reset').textContent, '');
    assert.equal(get('quota-value').textContent, '62%');
  }
  const crossed = structuredClone(fixtures.ok.quota_claude);
  crossed.windows[0].resets_at = now / 1000;
  context.renderSummary({ ...fixtures.ok, projects: [], quota_claude: crossed });
  assert.equal(get('quota-claude-value').textContent, '74%');
  assert.equal(get('quota-claude-short').textContent, '5 小时剩余 —');
  crossed.windows[1].resets_at = now / 1000;
  context.renderSummary({ ...fixtures.ok, projects: [], quota_claude: crossed });
  assert.equal(get('quota-claude-value').textContent, '—');
  context.renderOffline();
  context.renderProjects({ projects: [] });
  assert.equal(get('today-panel').dataset.state, 'unknown');
  assert.match(get('today-unknown').textContent, /无法连接/);
  context.renderSummary({ ...fixtures.ok, projects: [] });
  assert.equal(get('today-panel').dataset.state, 'ok');
  context.renderSummary({ alerts: { error: 'example' }, activity: { error: 'example' }, quota: { error: 'example' } });
  assert.equal(get('today-activity').textContent, '提交动态未读取到');
  assert.equal(get('today-latest').children.length, 0);
  assert.equal(get('quota-value').textContent, '—');
});
