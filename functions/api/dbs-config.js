// /api/dbs-config — dbs 学习系统设置（目前只有每日推送时间）
// GET/POST 都走 middleware 的 cookie 门（本路径不在 Bearer 白名单）。
// Mac 侧拉取走 /api/dbs-config-pull（Bearer）。
export async function onRequestGet(context) {
  const raw = await context.env.DASHBOARD.get("dbs_config");
  return jsonResponse(raw ? JSON.parse(raw) : { push_time: "09:20" }, 200);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }
  const t = (body && body.push_time) || "";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) {
    return jsonResponse({ error: "push_time 格式须为 HH:MM" }, 400);
  }
  const config = { push_time: t, updated_at: new Date().toISOString() };
  await env.DASHBOARD.put("dbs_config", JSON.stringify(config));
  return jsonResponse({ ok: true, ...config }, 200);
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
