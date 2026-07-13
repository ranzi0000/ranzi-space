// POST /api/kindle-control
// 用户在 /services/ 页点 Kindle 控制按钮触发。
// 鉴权：走 middleware 的 cookie（同 dash 的密码登录态）。
// 行为：写 {action, requested_at} 到 KV "kindle_control"，Mac mini poller 看到后跑 kindle_ctl.sh

const KV_KEY = "kindle_control";
const ACTIONS = ["pause", "resume", "reboot"];

export async function onRequestPost(context) {
  const { request, env } = context;
  let action = "";
  try {
    const body = await request.json();
    action = body.action || "";
  } catch (e) {
    // fallthrough
  }
  if (!ACTIONS.includes(action)) {
    return new Response(JSON.stringify({ error: "invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  const now = new Date().toISOString();
  await env.DASHBOARD.put(KV_KEY, JSON.stringify({ action, requested_at: now }));
  return new Response(JSON.stringify({ ok: true, action, requested_at: now }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function onRequest() {
  return new Response(JSON.stringify({ error: "method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
