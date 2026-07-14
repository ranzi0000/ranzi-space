// GET /api/dbs-config-pull — Mac mini 每 10 分钟拉推送设置
// 鉴权：Authorization: Bearer <PUSH_TOKEN>（middleware 已放行此路径）
export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = request.headers.get("authorization") || "";
  if (!env.PUSH_TOKEN || auth !== `Bearer ${env.PUSH_TOKEN}`) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const raw = await env.DASHBOARD.get("dbs_config");
  return jsonResponse(raw ? JSON.parse(raw) : { push_time: "09:20" }, 200);
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
