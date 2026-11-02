// /api/kindle-config — Kindle 复习屏设置（换批间隔、早间简报、卡片库比例、日历卡、收藏回顾）
// GET/POST 都走 middleware 的 cookie 门；Mac 侧拉取走 /api/kindle-config-pull（Bearer）。
// 存什么由这里的 normalize 决定，kindle-dash/kconfig.py 再按同一份默认值兜底一次。
export const DEFAULTS = {
  batch_minutes: 20,
  briefing: { enabled: true, start: 7, end: 9 },
  sources: {
    dbs: { enabled: true, weight: 5 },
    method: { enabled: true, weight: 3 },
    lab: { enabled: true, weight: 2 },
    course: { enabled: true, weight: 4 },
  },
  calendar: { enabled: true, order: "seq", jump: null },
  favorites: { enabled: true, pace: "standard" },
  removed: [],
};
const BATCH_MINUTES = [10, 20, 30, 60];
const PACES = ["dense", "standard", "sparse"];
const REMOVED_MAX = 200;

const bool = (v, d) => (typeof v === "boolean" ? v : d);
const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);

// 不合法的字段回落默认值，不整单拒收：页面只会发自己生成的结构，回落比报错更不容易把设置弄丢。
export function normalize(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const b = c.briefing || {};
  let start = int(b.start, 0, 23, DEFAULTS.briefing.start);
  let end = int(b.end, 1, 24, DEFAULTS.briefing.end);
  if (end <= start) ({ start, end } = DEFAULTS.briefing);
  const sources = {};
  for (const [kind, d] of Object.entries(DEFAULTS.sources)) {
    const s = (c.sources || {})[kind] || {};
    sources[kind] = { enabled: bool(s.enabled, d.enabled), weight: int(s.weight, 1, 10, d.weight) };
  }
  if (!Object.values(sources).some((s) => s.enabled)) sources.dbs.enabled = true;  // 至少留一个库
  const cal = c.calendar || {};
  const jump = cal.jump && /^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(cal.jump.key || "")
    && typeof cal.jump.at === "string" ? { key: cal.jump.key, at: cal.jump.at } : null;
  const fav = c.favorites || {};
  const removed = (Array.isArray(c.removed) ? c.removed : [])
    .filter((r) => r && typeof r.id === "string" && r.id.length < 80 && typeof r.at === "string")
    .map((r) => ({ id: r.id, at: r.at }))
    .slice(-REMOVED_MAX);
  return {
    batch_minutes: BATCH_MINUTES.includes(c.batch_minutes) ? c.batch_minutes : DEFAULTS.batch_minutes,
    briefing: { enabled: bool(b.enabled, DEFAULTS.briefing.enabled), start, end },
    sources,
    calendar: {
      enabled: bool(cal.enabled, DEFAULTS.calendar.enabled),
      order: cal.order === "random" ? "random" : "seq",
      jump,
    },
    favorites: {
      enabled: bool(fav.enabled, DEFAULTS.favorites.enabled),
      pace: PACES.includes(fav.pace) ? fav.pace : DEFAULTS.favorites.pace,
    },
    removed,
  };
}

export async function onRequestGet(context) {
  const raw = await context.env.DASHBOARD.get("kindle_config");
  const stored = raw ? JSON.parse(raw) : {};
  return jsonResponse({ ...normalize(stored), updated_at: stored.updated_at || null }, 200);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }
  const config = { ...normalize(body), updated_at: new Date().toISOString() };
  await env.DASHBOARD.put("kindle_config", JSON.stringify(config));
  return jsonResponse({ ok: true, ...config }, 200);
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
