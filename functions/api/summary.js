// GET /api/summary
// 受 _middleware.js 的 cookie 鉴权保护（前端登录后才能访问）。
// 从 KV "DASHBOARD" 读最新一份聚合数据，原样返回。
export async function onRequest(context) {
  const { env } = context;

  const raw = await env.DASHBOARD.get("latest");
  if (!raw) {
    // 还没有 collector push 过数据
    return jsonResponse(
      {
        generated_at: null,
        projects: [],
        meta: { note: "no data yet — waiting for collector first push" },
      },
      200
    );
  }

  // KV 里存的就是 collector push 进来的 JSON 字符串，直接透传
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
