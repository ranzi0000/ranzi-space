// GET /maps/<id> —— 单个项目的地图页
// 内容由 Mac mini 渲染后推 KV（/api/maps-push），这里现取现服务。
// 鉴权：middleware 已对本路径强制 cookie 密码门。
const ID_RE = /^[a-z0-9-]+$/;

export async function onRequestGet(context) {
  const id = context.params.id;
  if (typeof id !== "string" || !ID_RE.test(id)) {
    return new Response("bad id", { status: 400 });
  }
  const html = await context.env.DASHBOARD.get(`map_html_${id}`);
  if (!html) {
    return new Response("<h1>404</h1><p>没有这个项目的地图。</p>", {
      status: 404,
      headers: htmlHeaders(),
    });
  }
  const mins = await heartbeatAgeMinutes(context.env);
  return new Response(injectHeartbeat(html, mins), {
    status: 200,
    headers: htmlHeaders(),
  });
}

// Mac mini 上次报「我在线」是几分钟前；没心跳或读不出来返回 null（按离线处理）
// 两个路由文件各留一份（本仓库的 function 都是自包含的，htmlHeaders 也是这么处理的）
async function heartbeatAgeMinutes(env) {
  try {
    const raw = await env.DASHBOARD.get("mac_heartbeat");
    if (!raw) return null;
    const t = Date.parse(JSON.parse(raw).at);
    if (!t) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 60000));
  } catch (e) {
    return null;
  }
}

// 仅显示设备在线状态，不代表远程任务入口。
function heartbeatLine(mins, font, style) {
  const online = mins !== null && mins <= 12;
  const dot = online ? "#3fb950" : "#e0913a";
  const text = online ? "Mac mini 在线" : "Mac mini 可能离线";
  return (
    `<div style="${style}">` +
    `<span style="width:7px;height:7px;border-radius:50%;background:${dot};` +
    `display:inline-block;flex:0 0 auto"></span>` +
    `<span style="font:12px/1.4 ${font}">${text}</span></div>`
  );
}

// 右下角只保留设备心跳，地图正文原样返回。
function injectHeartbeat(html, heartbeatMins) {
  const FONT = "ui-sans-serif,system-ui,-apple-system,'PingFang SC',sans-serif";
  const beat = heartbeatLine(
    heartbeatMins,
    FONT,
    "position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));" +
      "z-index:99;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;" +
      "color:#fff;background:rgba(24,24,27,.92);box-shadow:0 2px 10px rgba(0,0,0,.25)"
  );
  return html.includes("</body>") ? html.replace("</body>", beat + "</body>") : html + beat;
}

function htmlHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  };
}
