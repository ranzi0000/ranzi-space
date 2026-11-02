// GET /api/kindle-config-pull — kindle-dash/push.sh 每轮（2 分钟）拉复习屏设置
// 鉴权：Authorization: Bearer <PUSH_TOKEN>（middleware 已放行此路径）
// 原样返回 KV 里的设置（没存过返回 {}），默认值由 Mac 侧 kconfig.py 兜底。
export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = request.headers.get("authorization") || "";
  if (!env.PUSH_TOKEN || auth !== `Bearer ${env.PUSH_TOKEN}`) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const raw = await env.DASHBOARD.get("kindle_config");
  return jsonResponse(raw ? JSON.parse(raw) : {}, 200);
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
