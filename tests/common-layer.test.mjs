import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

test('主题继续使用原存储键，auto 清除覆盖，存储不可用仍能切换', async () => {
  const script = await read('assets/theme.js');
  for (const blocked of [false, true]) {
    const storage = new Map([['ranzi-space-theme', 'dark']]);
    let theme;
    const buttons = ['auto', 'light', 'dark'].map(mode => ({
      dataset: { theme: mode },
      setAttribute(key, value) { this[key] = value; },
      addEventListener(name, handler) { this.click = handler; },
    }));
    vm.runInNewContext(script, {
      document: {
        documentElement: {
          setAttribute(key, value) { theme = value; },
          removeAttribute() { theme = undefined; },
        },
        querySelectorAll: () => buttons,
      },
      localStorage: {
        getItem(key) { if (blocked) throw Error('blocked'); return storage.get(key); },
        setItem(key, value) { if (blocked) throw Error('blocked'); storage.set(key, value); },
        removeItem(key) { if (blocked) throw Error('blocked'); storage.delete(key); },
      },
    });
    assert.equal(theme, blocked ? undefined : 'dark');
    buttons[1].click();
    assert.equal(theme, 'light');
    assert.equal(buttons[1]['aria-pressed'], 'true');
    buttons[0].click();
    assert.equal(theme, undefined);
    if (!blocked) assert.equal(storage.has('ranzi-space-theme'), false);
  }
});

test('首页保留缓存先绘、刷新周期、回前台刷新和离线提示', async () => {
  const script = (await read('assets/home/data.js')).replace(/^import .*;\n/, '');
  const projects = { projects: [{ slug: 'sample' }] };
  const summary = { projects: [], received_at: '2026-10-16T04:00:05Z' };
  const storage = new Map([
    ['ranzi-projects-cache-v2', JSON.stringify(projects)],
    ['ranzi-dash-cache-v2', JSON.stringify(summary)],
  ]);
  const calls = [], requests = [], timers = [], listeners = {};
  let failSummary = false;
  const document = { visibilityState: 'visible', addEventListener: (event, fn) => { listeners[event] = fn; } };
  vm.runInNewContext(script, {
    document, navigator: {},
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    renderProjects: data => calls.push(['projects', data]),
    renderSummary: data => calls.push(['summary', data]),
    refreshTime: time => calls.push(['time', time]),
    renderOffline: () => calls.push(['offline']),
    renderProjectsError: () => assert.fail('cached projects should remain visible'),
    setInterval: (fn, interval) => timers.push({ fn, interval }),
    console: { warn() {} },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url === '/api/summary' && failSummary) throw Error('offline');
      return { ok: true, json: async () => summary, text: async () => JSON.stringify(projects) };
    },
  });
  assert.deepEqual(structuredClone(calls.slice(0, 2)), [['projects', projects], ['summary', summary]]);
  await flush();
  assert.deepEqual(timers.map(t => t.interval), [60000, 15000]);
  assert.equal(calls.filter(c => c[0] === 'projects').length, 1);
  const initial = requests.length;
  document.visibilityState = 'hidden';
  timers[0].fn(); listeners.visibilitychange();
  assert.equal(requests.length, initial);
  document.visibilityState = 'visible';
  timers[0].fn(); listeners.visibilitychange();
  await flush();
  assert.equal(requests.length, initial + 2);
  timers[1].fn();
  assert.deepEqual(calls.at(-1), ['time', summary.received_at]);
  assert.equal(requests.length, initial + 2);
  storage.delete('ranzi-dash-cache-v2');
  timers[1].fn();
  assert.deepEqual(calls.at(-1), ['time', undefined]);
  failSummary = true;
  listeners.visibilitychange();
  await flush();
  assert.deepEqual(calls.at(-1), ['offline']);
  assert.ok(requests.every(r => r.options.cache === 'no-store' && r.options.credentials === 'same-origin'));
});

test('本地服务器的静态文件、真实登记和假 summary 路由（内存 HTTP，无端口）', () => {
  const result = spawnSync('python3', ['-B', 'tests/dev_server_test.py'], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
