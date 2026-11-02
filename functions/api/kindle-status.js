// GET /api/kindle-status — /kindle/ 后台页读复习屏现状（cookie 门）。没回传过返回 {}。
export async function onRequestGet(context) {
  const raw = await context.env.DASHBOARD.get("kindle_status");
  return jsonResponse(raw ? JSON.parse(raw) : {}, 200);
}

export async function onRequest() {
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
