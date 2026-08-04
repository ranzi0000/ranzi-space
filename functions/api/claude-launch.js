// POST /api/claude-launch
// 用户点 dash 的"启动新 Claude"按钮触发。
// 鉴权：走 middleware 的 cookie（同 dash 的密码登录态）。
// 行为：写时间戳到 KV "claude_launch_request"，Mac mini poller 看到后会跑 launch.sh

const KV_KEY = "claude_launch_request";
const MODES = new Set(["default", "dbs", "map-update"]);
const PROJECT_RE = /^[a-z0-9-]{1,64}$/;

export async function onRequestPost(context) {
  const { env, request } = context;
  const now = new Date().toISOString();
  let mode = "default";
  let project = "";
  try {
    const body = await request.json();
    if (body && MODES.has(body.mode)) mode = body.mode;
    // map-update 模式必须带合法 project id（进 shell 前的第一道白名单）
    if (body && typeof body.project === "string" && PROJECT_RE.test(body.project)) {
      project = body.project;
    }
  } catch (e) {
    // 无 body / 非 JSON = default，兼容旧按钮
  }
  if (mode === "map-update" && !project) {
    return new Response(JSON.stringify({ error: "map-update requires a valid project id" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  await env.DASHBOARD.put(KV_KEY, JSON.stringify({ requested_at: now, mode, project }));
  return new Response(JSON.stringify({ ok: true, requested_at: now, mode, project }), {
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
