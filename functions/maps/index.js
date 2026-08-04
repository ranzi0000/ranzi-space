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
  return new Response(html, { status: 200, headers: htmlHeaders() });
}

function htmlHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  };
}
