// POST /api/agent-heartbeat
// Mac mini 的 claude-rc poller 每 5 分钟报一次「我还活着」。
// 2026-10-17 起不再写 KV：KV 免费写额度每天 1000 次，这里一天就占 288 次。
// 地图页的「Mac mini 在线」改用 dash-collector 推送的 latest.received_at 判断。
// 端点保留只为让 poller 不报错，鉴权照旧。
// 鉴权：Authorization: Bearer <PUSH_TOKEN>（与 /api/maps-push 同一把 token，middleware 已放行此路径）
export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = request.headers.get("authorization") || "";
  const expected = env.PUSH_TOKEN;
  if (!expected) {
    return jsonResponse({ error: "PUSH_TOKEN not configured on server" }, 500);
  }
  if (auth !== `Bearer ${expected}`) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const at = new Date().toISOString();

  return jsonResponse({ ok: true, at }, 200);
}

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
