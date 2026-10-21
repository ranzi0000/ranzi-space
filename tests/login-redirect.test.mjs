import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
async function load(path) {
  return import('data:text/javascript;base64,' + Buffer.from(await read(path)).toString('base64'));
}

const PASSWORD = 'test-password';

async function loadMiddleware() {
  return load('functions/_middleware.js');
}

function loginRequest(redirect, password) {
  const body = new URLSearchParams();
  body.set('password', password);
  body.set('redirect', redirect);
  return new Request('https://ranzi.space/__login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
}

function call(mod, request) {
  return mod.onRequest({
    request,
    env: { SITE_PASSWORD: PASSWORD },
    next: () => new Response('secret-page', { status: 200 }),
  });
}

function hiddenRedirect(html) {
  const tags = html.match(/<input type="hidden" name="redirect" value="([^"]*)">/g);
  assert.equal(tags && tags.length, 1, html);
  return tags[0].match(/value="([^"]*)"/)[1];
}

test('safeRedirect 只接受站内路径', async () => {
  const { safeRedirect } = await loadMiddleware();
  const rejected = [
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    '/\\\\evil.example',
    '\\evil.example',
    'https://evil.example',
    'http://evil.example',
    '/foo//bar',
    '/maps?q=https://evil.example',
    '/foo\\bar',
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r\nLocation: https://evil.example',
    '/\u0000abc',
    '/\u007fabc',
    '/\u0085abc',
    '/ evil.example',
    '/foo bar',
    '/\u00a0abc',
    '/\u2028abc',
    '/\u3000abc',
    '',
    null,
    undefined,
    1,
  ];
  for (const value of rejected) {
    assert.equal(safeRedirect(value), '/', JSON.stringify(value));
  }
  for (const value of ['/', '/maps', '/maps/shouchuan-diy', '/maps?a=1&b=2', '/项目']) {
    assert.equal(safeRedirect(value), value);
  }
});

test('escapeHtml 转义属性与文本里的 & < > " \'', async () => {
  const { escapeHtml } = await loadMiddleware();
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(escapeHtml('密码错误'), '密码错误');
});

test('loginPage 转义错误文本和跳转属性', async () => {
  const { loginPage } = await loadMiddleware();
  const html = loginPage(`<img src=x onerror="alert('1')">&`, `/q?a=1&b=2"'<>`);
  assert.match(html, /<p class="error">&lt;img src=x onerror=&quot;alert\(&#39;1&#39;\)&quot;&gt;&amp;<\/p>/);
  assert.equal(hiddenRedirect(html), `/q?a=1&amp;b=2&quot;&#39;&lt;&gt;`);
  assert.doesNotMatch(html, /<img/);
  const clean = loginPage('', '/maps');
  assert.doesNotMatch(clean, /class="error"/);
  assert.equal(hiddenRedirect(clean), '/maps');
});

test('密码错误页不反射脚本，也不把站外跳转写进隐藏域', async () => {
  const mod = await loadMiddleware();
  const xss = await call(mod, loginRequest(`"><script>alert(1)</script>`, 'wrong'));
  assert.equal(xss.status, 401);
  const xssHtml = await xss.text();
  assert.equal(xssHtml.includes('<script'), false);
  assert.match(xssHtml, /<p class="error">密码错误<\/p>/);
  assert.equal(hiddenRedirect(xssHtml), '/');

  const quoted = await call(mod, loginRequest(`/"><script>alert(1)</script>`, 'wrong'));
  const quotedHtml = await quoted.text();
  assert.equal(quotedHtml.includes('<script'), false);
  assert.equal(hiddenRedirect(quotedHtml), '/&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');

  for (const redirect of ['//evil.example', '/\\evil.example', '/\t/evil.example', '/ evil.example']) {
    const response = await call(mod, loginRequest(redirect, 'wrong'));
    const html = await response.text();
    assert.equal(hiddenRedirect(html), '/', JSON.stringify(redirect));
    assert.equal(html.includes('evil.example'), false, JSON.stringify(redirect));
  }
});

test('未登录页只把站内路径写进隐藏域，并转义 &', async () => {
  const mod = await loadMiddleware();
  const external = await call(mod, new Request('https://ranzi.space//evil.example/maps'));
  assert.equal(external.status, 401);
  const externalHtml = await external.text();
  assert.equal(hiddenRedirect(externalHtml), '/');
  assert.equal(externalHtml.includes('evil.example'), false);

  const slashBackslash = await call(mod, new Request('https://ranzi.space/\\evil.example'));
  assert.equal(hiddenRedirect(await slashBackslash.text()), '/');

  const internal = await call(mod, new Request('https://ranzi.space/maps?a=1&b=2'));
  assert.equal(hiddenRedirect(await internal.text()), '/maps?a=1&amp;b=2');
});

test('登录成功的 Location 使用同一套站内校验', async () => {
  const mod = await loadMiddleware();
  for (const redirect of [
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    '/\\\\evil.example',
    'https://evil.example',
    '/\r\nLocation: https://evil.example',
    '/\t/evil.example',
    '/ evil.example',
    '/foo//bar',
  ]) {
    const response = await call(mod, loginRequest(redirect, PASSWORD));
    assert.equal(response.status, 302, JSON.stringify(redirect));
    assert.equal(response.headers.get('location'), '/', JSON.stringify(redirect));
    assert.match(response.headers.get('set-cookie') || '', /ranzi_auth=.*HttpOnly/);
  }

  const ok = await call(mod, loginRequest('/maps?a=1&b=2', PASSWORD));
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get('location'), '/maps?a=1&b=2');
  assert.match(ok.headers.get('set-cookie') || '', /HttpOnly; Secure; SameSite=Lax/);
});

test('已登录请求仍放行，未配置密码仍返回 500', async () => {
  const mod = await loadMiddleware();
  const cookie = 'ranzi_auth=' + createHash('sha256').update(PASSWORD).digest('hex');
  let called = false;
  const response = await mod.onRequest({
    request: new Request('https://ranzi.space/maps', { headers: { cookie } }),
    env: { SITE_PASSWORD: PASSWORD },
    next: () => {
      called = true;
      return new Response('secret-page', { status: 200 });
    },
  });
  assert.equal(called, true);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'secret-page');

  const missing = await mod.onRequest({
    request: new Request('https://ranzi.space/maps'),
    env: {},
    next: () => assert.fail('未配置密码不应放行'),
  });
  assert.equal(missing.status, 500);
});
