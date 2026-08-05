// POST /api/agent-heartbeat
// Mac mini 的 claude-rc poller 每 5 分钟报一次「我还活着」，写进 KV。
// 地图页/总览页服务时读它，告诉人「派活现在有没有人接」——离线时点派活会假装成功，这行字就是防这个。
// 鉴权：Authorization: Bearer <PUSH_TOKEN>（与 /api/maps-push 同一把 token，middleware 已放行此路径）
//
// KV: mac_heartbeat = {"at": "<ISO 时间>"}
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
  await env.DASHBOARD.put("mac_heartbeat", JSON.stringify({ at }));

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
