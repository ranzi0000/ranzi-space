// Pure P2 consumer rules; no DOM, storage, network or production values.
export const STALE_SECONDS = 15 * 60;
const SOURCE_LABELS = {
  heartbeat: '项目心跳', service: '本机服务', server_down: '服务器连通性',
  server_expiry: '服务器到期', disk: '磁盘', stale: '到期数据时效', due: '提醒事项',
};

// 只有这两类要用户亲手处理（提醒事项、服务器续费付款）；其余是排查修复类，归「AI 侧」收起。
// 未读取到的来源同理：只有影响用户这两类的来源缺失才算「状态未知」。
export const USER_KINDS = new Set(['due', 'server_expiry']);
const USER_SOURCES = new Set(['due', 'stale', 'server_expiry']);

export function classifyToday(summary, now = Date.now(), offline = false) {
  const alerts = summary?.alerts;
  const all = Array.isArray(alerts?.items) ? [...alerts.items] : [];
  all.sort((a, b) => (a.level === 'bad' ? 0 : 1) - (b.level === 'bad' ? 0 : 1));
  const items = all.filter(item => USER_KINDS.has(item.kind));
  const aiItems = all.filter(item => !USER_KINDS.has(item.kind));
  const reasons = [];
  if (!alerts || typeof alerts !== 'object' || 'error' in alerts || !Array.isArray(alerts.items)) {
    reasons.push('异常数据未读取到');
  }
  const missing = Array.isArray(alerts?.unavailable) ? alerts.unavailable.filter(key => USER_SOURCES.has(key)) : [];
  if (missing.length) {
    reasons.push('未读取到：' + missing.map(key => SOURCE_LABELS[key] || key).join('、'));
  } else if (alerts?.unavailable != null && !Array.isArray(alerts.unavailable)) {
    reasons.push('异常来源不完整');
  }
  const stamp = Date.parse(summary?.received_at || summary?.generated_at);
  if (!Number.isFinite(stamp)) reasons.push('更新时间未知');
  else if ((now - stamp) / 1000 > STALE_SECONDS) reasons.push('汇总数据已超过 15 分钟未更新');
  if (offline) reasons.push('暂时无法连接，等待更新');
  return { state: reasons.length ? 'unknown' : items.length ? 'alerts' : 'ok', items, aiItems, reasons };
}

export function formatReset(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const d = new Date(seconds * 1000);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} 周${'日一二三四五六'[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())} 重置`;
}

// An explicit maximum age is inclusive; omitted retains Codex's legacy 1h cutoff.
export function quotaView(quota, now = Date.now(), minutes = [10080], maxAgeSeconds = null) {
  const labels = { stale: '旧数据', expired: '已过期', unavailable: '未读取到' };
  let state = quota?.state;
  if (!quota || 'error' in quota || !['fresh', 'stale', 'expired', 'unavailable'].includes(state)) {
    return { label: '未读取到', remaining: null, reset: '' };
  }
  const windows = Array.isArray(quota.windows) ? quota.windows : [];
  const window = minutes.map(duration => windows.find(w => w?.minutes === duration)).find(Boolean);
  const age = now / 1000 - quota.sampled_at;
  if (maxAgeSeconds !== null && !Number.isFinite(quota.sampled_at)) state = 'expired';
  if (['fresh', 'stale'].includes(state) && Number.isFinite(quota.sampled_at)) {
    // 新鲜度以采集器给的 state 为准（它每 10 分钟才真读一次，summary 又 5 分钟一推，采样常有 10–15 分钟旧）；
    // Codex 保留原有 >= 1 小时边界；其他来源可指定包含边界的最大可信年龄。
    const tooOld = maxAgeSeconds === null ? age >= 3600 : age > maxAgeSeconds;
    if (age < -300 || tooOld) state = 'expired';
  }
  if (['fresh', 'stale'].includes(state) && window?.resets_at && window.resets_at <= now / 1000) state = 'expired';
  const remaining = ['fresh', 'stale'].includes(state) && Number.isFinite(window?.remaining)
    && window.remaining >= 0 && window.remaining <= 100 ? window.remaining : null;
  return {
    label: labels[state] || (remaining === null ? '周额度未读取到' : '剩余'),
    remaining,
    reset: ['fresh', 'stale'].includes(state) ? formatReset(window?.resets_at) : '',
  };
}
