// POST /api/push
// Mac mini 上的 collector 调用，把聚合数据写入 KV。
// 鉴权：Authorization: Bearer <PUSH_TOKEN>
//
// middleware 已对此路径放行，所以 cookie 不会拦。
export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Bearer token 校验
  const auth = request.headers.get("authorization") || "";
  const expected = env.PUSH_TOKEN;
  if (!expected) {
    return jsonResponse({ error: "PUSH_TOKEN not configured on server" }, 500);
  }
  if (auth !== `Bearer ${expected}`) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  // 2. 读 body，最小校验是合法 JSON
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }
  if (!payload || typeof payload !== "object") {
    return jsonResponse({ error: "payload must be an object" }, 400);
  }

  // 3. 强制盖上服务端时间戳，避免客户端时间漂移
  payload.received_at = new Date().toISOString();

  // 4. 写 KV（KV 限制 25MB/key，我们的 payload 远小于此）
  await env.DASHBOARD.put("latest", JSON.stringify(payload));

  return jsonResponse({ ok: true, received_at: payload.received_at }, 200);
}

// 非 POST 一律拒
export async function onRequest(context) {
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
