const COOKIE_NAME = "ranzi_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

async function sha256Hex(text) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseCookies(request) {
  const out = {};
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function loginPage(error, redirect) {
  const safeRedirect = redirect && redirect.startsWith("/") ? redirect : "/";
  const errorBlock = error
    ? `<p class="error">${error}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ranzi.space</title>
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%2318181b'/%3E%3Ctext x='16' y='21' font-family='ui-monospace,monospace' font-size='14' font-weight='600' text-anchor='middle' fill='%23fafaf8'%3Er%3C/text%3E%3C/svg%3E">
<style>
:root {
  --bg: #fafaf8;
  --fg: #18181b;
  --muted: #71717a;
  --border: #ebe9e4;
  --accent: oklch(54% 0.13 38);
  --danger: oklch(52% 0.18 25);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f0f10;
    --fg: #fafaf8;
    --muted: #a1a1aa;
    --border: #27272a;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.box {
  width: 100%;
  max-width: 320px;
}
h1 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px;
  letter-spacing: -0.01em;
}
.hint {
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 24px;
}
form { display: flex; flex-direction: column; gap: 12px; }
input[type="password"] {
  width: 100%;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  background: transparent;
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 6px;
  outline: none;
  transition: border-color 0.15s;
}
input[type="password"]:focus { border-color: var(--accent); }
button {
  padding: 10px 14px;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  background: var(--fg);
  color: var(--bg);
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
button:hover { opacity: 0.88; }
.error {
  margin: 0;
  font-size: 13px;
  color: var(--danger);
}
</style>
</head>
<body>
<div class="box">
  <h1>ranzi.space</h1>
  <p class="hint">需要密码</p>
  <form method="POST" action="/__login">
    <input type="hidden" name="redirect" value="${safeRedirect}">
    <input type="password" name="password" autofocus required autocomplete="current-password">
    <button type="submit">进入</button>
    ${errorBlock}
  </form>
</div>
</body>
</html>`;
}

function htmlResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const password = env.SITE_PASSWORD;

  // /api/push 走 Bearer token 不查 cookie，在 functions/api/push.js 里自己校验
  if (url.pathname === "/api/push") {
    return await next();
  }

  if (!password) {
    return htmlResponse(
      "<h1>500</h1><p>SITE_PASSWORD env var not configured.</p>",
      500
    );
  }

  const expectedHash = await sha256Hex(password);

  if (url.pathname === "/__login" && request.method === "POST") {
    const form = await request.formData();
    const submitted = form.get("password") || "";
    const redirect = form.get("redirect") || "/";
    const target = typeof redirect === "string" && redirect.startsWith("/") ? redirect : "/";
    if (submitted === password) {
      return new Response(null, {
        status: 302,
        headers: {
          "Set-Cookie": `${COOKIE_NAME}=${expectedHash}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`,
          "Location": target,
          "Cache-Control": "no-store",
        },
      });
    }
    return htmlResponse(loginPage("密码错误", target), 401);
  }

  if (url.pathname === "/__logout") {
    return new Response(null, {
      status: 302,
      headers: {
        "Set-Cookie": `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
        "Location": "/",
        "Cache-Control": "no-store",
      },
    });
  }

  const cookies = parseCookies(request);
  if (cookies[COOKIE_NAME] === expectedHash) {
    return await next();
  }

  return htmlResponse(loginPage("", url.pathname + url.search), 401);
}
