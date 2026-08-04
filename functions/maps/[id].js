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
  return new Response(html, { status: 200, headers: htmlHeaders() });
}

function htmlHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  };
}
