// POST /api/claude-launch
// 用户点 dash 的"启动新 Claude"按钮触发。
// 鉴权：走 middleware 的 cookie（同 dash 的密码登录态）。
// 行为：写时间戳到 KV "claude_launch_request"，Mac mini poller 看到后会跑 launch.sh

const KV_KEY = "claude_launch_request";
// project = 进 ~/Projects/<project> 开会话待命（不派活，只发 /remote-control）；task = 带需求派活
const MODES = new Set(["default", "dbs", "map-update", "task", "project"]);
const PROJECT_RE = /^[a-z0-9-]{1,64}$/;

export async function onRequestPost(context) {
  const { env, request } = context;
  const now = new Date().toISOString();
  let mode = "default";
  let project = "";
  let prompt = "";
  try {
    const body = await request.json();
    if (body && MODES.has(body.mode)) mode = body.mode;
    // map-update/task/project 模式必须带合法 project id（进 shell 前的第一道白名单）
    if (body && typeof body.project === "string" && PROJECT_RE.test(body.project)) {
      project = body.project;
    }
    // task 模式的自由文本需求：去控制字符压单行 + 截断（Mac 端 poller 会再做一遍）
    if (body && typeof body.prompt === "string") {
      prompt = body.prompt.replace(/[\u0000-\u001F\u007F]+/g, " ").trim().slice(0, 2000);
    }
  } catch (e) {
    // 无 body / 非 JSON = default，兼容旧按钮
  }
  if ((mode === "map-update" || mode === "task" || mode === "project") && !project) {
    return new Response(JSON.stringify({ error: mode + " requires a valid project id" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  if (mode === "task" && !prompt) {
    return new Response(JSON.stringify({ error: "task requires a non-empty prompt" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  await env.DASHBOARD.put(KV_KEY, JSON.stringify({ requested_at: now, mode, project, prompt }));
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
