// GET /api/claude-launch-request
// Mac mini 上的 poller.py 每 3 秒拉一次。
// 鉴权：Bearer token（middleware 放行此路径，参考 /api/push 模式）
// 返回：KV "claude_launch_request" 里存的最新触发时间戳

const KV_KEY = "claude_launch_request";

export async function onRequest(context) {
  const { request, env } = context;

  // Bearer token 校验
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
