// GET /api/kindle-control-request
// Mac mini 上的 claude-rc poller 每 3 秒拉一次（与 claude-launch-request 同轮）。
// 鉴权：Bearer token（middleware 放行此路径，参考 /api/push 模式）
// 返回：KV "kindle_control" 里存的最新控制命令 {action, requested_at}

const KV_KEY = "kindle_control";

export async function onRequest(context) {
  const { request, env } = context;

  const auth = request.headers.get("authorization") || "";
  const expected = env.PUSH_TOKEN;
  if (!expected) {
    return jsonResponse({ error: "PUSH_TOKEN not configured" }, 500);
  }
  if (auth !== `Bearer ${expected}`) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const raw = await env.DASHBOARD.get(KV_KEY);
  if (!raw) {
    return jsonResponse({ error: "no request yet" }, 404);
  }
  return new Response(raw, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
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
