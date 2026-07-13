// GET /api/dbs-draw
// 从 KV 牌堆随机抽一张 dbs 卡，返回卡片 JSON，同时推一条 Bark 留档。
// 鉴权：走 middleware 的 cookie（登录用户才能抽）。
// ?push=0 只抽不推。
export async function onRequestGet(context) {
  const { request, env } = context;

  const raw = await env.DASHBOARD.get("dbs_deck");
  if (!raw) {
    return jsonResponse({ error: "牌堆还没上传（等 Mac mini 早上 08:30 推一次，或手动跑 push_deck.py）" }, 404);
  }
  const deck = JSON.parse(raw);
  const card = deck.cards[Math.floor(Math.random() * deck.cards.length)];

  const url = new URL(request.url);
  let barked = false;
  if (url.searchParams.get("push") !== "0" && deck.bark_key) {
    try {
      const body =
        `${card.q}\n\n—— 先想 30 秒，再下拉展开看他的答案 ——\n\n${card.a}` +
        (card.src_title ? `\n\n出处：《${card.src_title}》` : "");
      const payload = { title: "dbs 抽卡", body, group: "dbs-corpus" };
      if (card.src_url) payload.url = card.src_url;
      const resp = await fetch(`https://api.day.app/${deck.bark_key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
      });
      barked = resp.ok;
    } catch (e) {
      // Bark 挂了不影响抽卡
    }
  }

  // 完整逐字稿 + 结构拆解（页面展开用，不进 Bark）
  const transcript =
    (card.bvid && deck.transcripts && deck.transcripts[card.bvid]) || "";
  const breakdown =
    (card.bvid && deck.breakdowns && deck.breakdowns[card.bvid]) || "";

  return jsonResponse({ card, transcript, breakdown, barked, deck_size: deck.cards.length, deck_at: deck.received_at }, 200);
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
