// GET /maps —— 项目地图总览页
// 内容由 Mac mini 渲染后推 KV（/api/maps-push），这里现取现服务。
// 鉴权：middleware 已对本路径强制 cookie 密码门。
export async function onRequestGet(context) {
  const html = await context.env.DASHBOARD.get("map_html__overview");
  if (!html) {
    return new Response(
      "<h1>项目地图还没同步</h1><p>Mac mini 的 projectmap-sync 尚未推送数据。</p>",
      { status: 503, headers: htmlHeaders() }
    );
  }
  const mins = await heartbeatAgeMinutes(context.env);
  return new Response(injectHeartbeat(html, mins), { status: 200, headers: htmlHeaders() });
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

// 页头底下一行小字：接单方在不在。绿点=在线，橙点=可能没人接
// 注入发生在服务层（渲染器保持纯净），样式内联，不依赖渲染器的 class
function injectHeartbeat(html, mins) {
  const FONT = "ui-sans-serif,system-ui,-apple-system,'PingFang SC',sans-serif";
  const online = mins !== null && mins <= 12;
  const dot = online ? "#3fb950" : "#e0913a";
  const text = online ? "Mac mini 在线" : "Mac mini 可能离线，派活可能没人接";
  const line =
    `<div style="display:flex;align-items:center;gap:7px;margin-top:12px">` +
    `<span style="width:7px;height:7px;border-radius:50%;background:${dot};` +
    `display:inline-block;flex:0 0 auto"></span>` +
    `<span style="font:12px/1.5 ${FONT};opacity:.8">${text}</span></div>`;
  if (html.includes("</header>")) return html.replace("</header>", line + "</header>");
  if (html.includes("</body>")) return html.replace("</body>", line + "</body>");
  return html + line;
}

function htmlHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  };
}
