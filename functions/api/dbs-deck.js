// POST /api/dbs-deck
// Mac mini 推 dbs 知识底座的抽卡牌堆（观点单元精简版 + bark key）进 KV。
// 鉴权：Authorization: Bearer <PUSH_TOKEN>（middleware 已放行此路径）
export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = request.headers.get("authorization") || "";
  if (!env.PUSH_TOKEN) {
    return jsonResponse({ error: "PUSH_TOKEN not configured on server" }, 500);
  }
  if (auth !== `Bearer ${env.PUSH_TOKEN}`) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }
  if (!payload || !Array.isArray(payload.cards) || payload.cards.length === 0) {
    return jsonResponse({ error: "payload.cards must be a non-empty array" }, 400);
  }

  payload.received_at = new Date().toISOString();
  await env.DASHBOARD.put("dbs_deck", JSON.stringify(payload));
  return jsonResponse({ ok: true, cards: payload.cards.length }, 200);
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
