// POST /api/maps-push
// Mac mini 的 projectmap sync 调用，把渲染好的项目地图页推进 KV。
// 地图内容含私密信息，绝不进本公开仓库——只走 KV 数据通道（同 bark_key 铁律）。
// 鉴权：Authorization: Bearer <PUSH_TOKEN>（middleware 已放行此路径）
//
// body: { "pages": { "<id>": "<html>", "_overview": "<html>" } }
// id 只允许 [a-z0-9-] 或 "_overview"；KV key = map_html_<id>。
// 不在本次 pages 里的旧 map_html_* key 会被清掉，防止下线项目残留。
const ID_RE = /^[a-z0-9-]+$|^_overview$/;

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = request.headers.get("authorization") || "";
  const expected = env.PUSH_TOKEN;
  if (!expected) {
    return jsonResponse({ error: "PUSH_TOKEN not configured on server" }, 500);
  }
  if (auth !== `Bearer ${expected}`) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }
  const pages = payload && payload.pages;
  if (!pages || typeof pages !== "object" || Array.isArray(pages)) {
    return jsonResponse({ error: "pages must be an object of id -> html" }, 400);
  }

  const ids = Object.keys(pages);
  for (const id of ids) {
    if (!ID_RE.test(id)) {
      return jsonResponse({ error: `illegal page id: ${id}` }, 400);
    }
    if (typeof pages[id] !== "string" || pages[id].length === 0) {
      return jsonResponse({ error: `page ${id} must be a non-empty string` }, 400);
    }
  }

  const received_at = new Date().toISOString();
  for (const id of ids) {
    await env.DASHBOARD.put(`map_html_${id}`, pages[id]);
  }

  // 清掉本次没推的旧页面（项目下线后不残留）
  const existing = await env.DASHBOARD.list({ prefix: "map_html_" });
  const keep = new Set(ids.map((id) => `map_html_${id}`));
  let pruned = 0;
  for (const key of existing.keys) {
    if (!keep.has(key.name)) {
      await env.DASHBOARD.delete(key.name);
      pruned += 1;
    }
  }

  return jsonResponse({ ok: true, stored: ids.length, pruned, received_at }, 200);
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
