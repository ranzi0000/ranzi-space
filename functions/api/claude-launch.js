// POST /api/claude-launch
// 用户点 dash 的"启动新 Claude"按钮触发。
// 鉴权：走 middleware 的 cookie（同 dash 的密码登录态）。
// 行为：写时间戳到 KV "claude_launch_request"，Mac mini poller 看到后会跑 launch.sh

const KV_KEY = "claude_launch_request";

export async function onRequestPost(context) {
  const { env } = context;
  const now = new Date().toISOString();
  await env.DASHBOARD.put(KV_KEY, JSON.stringify({ requested_at: now }));
  return new Response(JSON.stringify({ ok: true, requested_at: now }), {
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
