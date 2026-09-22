import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
async function load(path) {
  return import('data:text/javascript;base64,' + Buffer.from(await read(path)).toString('base64'));
}

test('两个历史启动 URL 的所有方法都返回 410，完全不访问请求或 KV', async () => {
  const forbidden = new Proxy({}, { get() { throw new Error('不允许读取请求、凭据或 KV'); } });
  for (const route of ['claude-launch', 'claude-launch-request']) {
    const handlers = await load(`functions/api/${route}.js`);
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const handler = handlers['onRequest' + method[0] + method.slice(1).toLowerCase()] || handlers.onRequest;
      const response = await handler(forbidden);
      assert.equal(response.status, 410, `${route} ${method}`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), {
        error: 'remote_launch_retired', message: '请在App中创建任务',
      });
    }
  }
});

test('旧入口经过密码门后返回 410，原拉取地址直接返回 410', async () => {
  const { onRequest: middleware } = await load('functions/_middleware.js');
  const password = 'offline-test-password';
  const env = {
    SITE_PASSWORD: password,
    DASHBOARD: new Proxy({}, { get() { throw new Error('不允许读写 KV'); } }),
  };
  for (const route of ['claude-launch', 'claude-launch-request']) {
    const endpoint = await load(`functions/api/${route}.js`);
    for (const authorized of [false, true]) {
      const request = new Request(`https://ranzi.space/api/${route}`, {
        method: route === 'claude-launch' ? 'POST' : 'GET',
        headers: authorized ? { cookie: 'ranzi_auth=' + createHash('sha256').update(password).digest('hex') } : {},
      });
      const response = await middleware({ request, env, next: () => endpoint.onRequest({ request, env }) });
      assert.equal(response.status, route === 'claude-launch' && !authorized ? 401 : 410);
    }
  }
});

test('主页只保留一组地图与作品集链接，项目卡片不再发起会话', async () => {
  const html = await read('index.html');
  assert.equal((html.match(/href="\/maps"/g) || []).length, 1);
  assert.equal((html.match(/href="https:\/\/lab.ranzi.space"/g) || []).length, 1);
  assert.match(html, /<nav class="primary-links"[\s\S]*项目地图[\s\S]*知识作品集[\s\S]*<\/nav>/);
  assert.doesNotMatch(html, /claude-launch|bindEntryLaunch|dash\.launch|d\.launch|启动新 Claude|dbs 诊断会话/);
  assert.doesNotMatch(html, /ranzi-projects-cache-v1/);
  for (const [, script] of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script);
  }
  const { projects } = JSON.parse(await read('projects.json'));
  assert.ok(projects.every(p => !p.dash || !('launch' in p.dash)));
  const byId = Object.fromEntries(projects.map(p => [p.slug, p]));
  assert.equal(byId['reverse-skill'].dash.href, byId['reverse-skill'].github);
  assert.equal(byId['shouchuan-diy'].dash.href, '/maps/shouchuan-diy');
});

test('地图正文保留，在线和离线只显示设备状态，不注入派活按钮或脚本', async () => {
  const original = '<!doctype html><header>项目</header><main>地图正文</main></body>';
  for (const route of ['index', '[id]']) {
    const { onRequestGet } = await load(`functions/maps/${route}.js`);
    for (const online of [true, false]) {
      const reads = [];
      const response = await onRequestGet({
        params: { id: 'shouchuan-diy' },
        env: { DASHBOARD: { async get(key) {
          reads.push(key);
          if (key === 'mac_heartbeat') return online ? JSON.stringify({ at: new Date().toISOString() }) : null;
          return original;
        } } },
      });
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.ok(html.includes('<main>地图正文</main>'));
      assert.ok(html.includes(online ? 'Mac mini 在线' : 'Mac mini 可能离线'));
      assert.doesNotMatch(html, /<button|<script|<textarea|claude-launch|派活|派单|让 Agent/);
      assert.deepEqual(reads, [route === 'index' ? 'map_html__overview' : 'map_html_shouchuan-diy', 'mac_heartbeat']);
    }
  }
});

test('地图无内容与非法项目 id 的原有响应保留', async () => {
  const { onRequestGet: detail } = await load('functions/maps/[id].js');
  const { onRequestGet: overview } = await load('functions/maps/index.js');
  const env = { DASHBOARD: { get: async () => null } };
  assert.equal((await detail({ params: { id: '../bad' }, env })).status, 400);
  assert.equal((await detail({ params: { id: 'missing' }, env })).status, 404);
  assert.equal((await overview({ env })).status, 503);
});
