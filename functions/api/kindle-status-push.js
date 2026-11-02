// POST /api/kindle-status-push — kindle-dash 回传复习屏现状（在线时间、各库数量、日历进度、收藏列表）
// 鉴权：Authorization: Bearer <PUSH_TOKEN>（middleware 已放行此路径）
// Mac 侧只在内容变化或距上次超过 15 分钟时推，KV 免费档每天 1000 次写入。
const MAX_BYTES = 256 * 1024;

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = request.headers.get("authorization") || "";
  if (!env.PUSH_TOKEN || auth !== `Bearer ${env.PUSH_TOKEN}`) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const text = await request.text();
  if (text.length > MAX_BYTES) return jsonResponse({ error: "too large" }, 413);
  let body;
  try {
    body = JSON.parse(text);
  } catch (e) {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }
  if (!body || typeof body !== "object" || typeof body.seen_at !== "string") {
    return jsonResponse({ error: "seen_at required" }, 400);
  }
  await env.DASHBOARD.put("kindle_status", JSON.stringify({ ...body, received_at: new Date().toISOString() }));
  return jsonResponse({ ok: true }, 200);
}

export async function onRequest() {
  return jsonResponse({ error: "method not allowed" }, 405);
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
