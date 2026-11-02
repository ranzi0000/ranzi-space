import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
async function load(path) {
  return import('data:text/javascript;base64,' + Buffer.from(await read(path)).toString('base64'));
}

function kv(initial = {}) {
  const store = { ...initial };
  return { store, get: async k => store[k] ?? null, put: async (k, v) => { store[k] = v; } };
}

test('normalize 回落非法字段、至少留一个库、只保留合法的一次性动作', async () => {
  const { normalize, DEFAULTS } = await load('functions/api/kindle-config.js');
  assert.deepEqual(normalize(null), DEFAULTS);
  const c = normalize({
    batch_minutes: 15,
    briefing: { enabled: false, start: 9, end: 7 },
    sources: { dbs: { enabled: false, weight: 99 }, method: { enabled: false }, lab: { enabled: false }, course: { enabled: false } },
    calendar: { order: 'random', jump: { key: '1332', at: 'x' } },
    favorites: { pace: 'weird' },
    removed: [{ id: 'dbs:abc', at: '2026-11-02T00:00:00Z' }, { id: 5 }, 'junk'],
  });
  assert.equal(c.batch_minutes, 20);
  assert.deepEqual(c.briefing, { enabled: false, start: 7, end: 9 });
  assert.equal(c.sources.dbs.enabled, true);
  assert.equal(c.sources.dbs.weight, 5);
  assert.equal(c.calendar.order, 'random');
  assert.equal(c.calendar.jump, null);
  assert.equal(c.favorites.pace, 'standard');
  assert.deepEqual(c.removed, [{ id: 'dbs:abc', at: '2026-11-02T00:00:00Z' }]);
  assert.deepEqual(normalize({ calendar: { jump: { key: '0301', at: 't' } } }).calendar.jump, { key: '0301', at: 't' });
});

test('POST 存规范化后的设置，GET 读回；pull 要 Bearer', async () => {
  const cfg = await load('functions/api/kindle-config.js');
  const pull = await load('functions/api/kindle-config-pull.js');
  const env = { DASHBOARD: kv(), PUSH_TOKEN: 'tok' };
  const post = await cfg.onRequestPost({ env, request: new Request('https://x/api/kindle-config', {
    method: 'POST', body: JSON.stringify({ batch_minutes: 30 }) }) });
  assert.equal(post.status, 200);
  const got = await (await cfg.onRequestGet({ env })).json();
  assert.equal(got.batch_minutes, 30);
  assert.ok(got.updated_at);
  assert.equal((await pull.onRequestGet({ env, request: new Request('https://x') })).status, 401);
  const pulled = await pull.onRequestGet({ env, request: new Request('https://x', { headers: { authorization: 'Bearer tok' } }) });
  assert.equal((await pulled.json()).batch_minutes, 30);
});

test('status-push 要 Bearer 和 seen_at，status 读回', async () => {
  const push = await load('functions/api/kindle-status-push.js');
  const status = await load('functions/api/kindle-status.js');
  const env = { DASHBOARD: kv(), PUSH_TOKEN: 'tok' };
  const req = (body, auth = 'Bearer tok') => new Request('https://x', { method: 'POST', headers: { authorization: auth }, body });
  assert.equal((await push.onRequestPost({ env, request: req('{"seen_at":"t"}', 'Bearer no') })).status, 401);
  assert.equal((await push.onRequestPost({ env, request: req('{}') })).status, 400);
  assert.equal((await push.onRequestPost({ env, request: req('{"seen_at":"t","mode":"WiFi"}') })).status, 200);
  const got = await (await status.onRequestGet({ env })).json();
  assert.equal(got.mode, 'WiFi');
  assert.ok(got.received_at);
});

test('middleware 只放行两个 Bearer 接口，cookie 接口仍要登录', async () => {
  const { onRequest } = await load('functions/_middleware.js');
  const env = { SITE_PASSWORD: 'pw' };
  const next = async () => new Response('passed');
  for (const p of ['/api/kindle-config-pull', '/api/kindle-status-push']) {
    assert.equal(await (await onRequest({ request: new Request('https://x' + p), next, env })).text(), 'passed');
  }
  for (const p of ['/api/kindle-config', '/api/kindle-status', '/kindle/']) {
    assert.equal((await onRequest({ request: new Request('https://x' + p), next, env })).status, 401);
  }
});
