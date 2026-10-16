// Pure P2 consumer rules; no DOM, storage, network or production values.
export const STALE_SECONDS = 15 * 60;
const SOURCE_LABELS = {
  heartbeat: '项目心跳', service: '本机服务', server_down: '服务器连通性',
  server_expiry: '服务器到期', disk: '磁盘', stale: '到期数据时效', due: '提醒事项',
};

export function classifyToday(summary, now = Date.now(), offline = false) {
  const alerts = summary?.alerts;
  const items = Array.isArray(alerts?.items) ? [...alerts.items] : [];
  items.sort((a, b) => (a.level === 'bad' ? 0 : 1) - (b.level === 'bad' ? 0 : 1));
  const reasons = [];
  if (!alerts || typeof alerts !== 'object' || 'error' in alerts || !Array.isArray(alerts.items)) {
    reasons.push('异常数据未读取到');
  }
  if (Array.isArray(alerts?.unavailable) && alerts.unavailable.length) {
    reasons.push('未读取到：' + alerts.unavailable.map(key => SOURCE_LABELS[key] || key).join('、'));
  } else if (alerts?.unavailable != null && !Array.isArray(alerts.unavailable)) {
    reasons.push('异常来源不完整');
  }
  const stamp = Date.parse(summary?.received_at || summary?.generated_at);
  if (!Number.isFinite(stamp)) reasons.push('更新时间未知');
  else if ((now - stamp) / 1000 > STALE_SECONDS) reasons.push('汇总数据已超过 15 分钟未更新');
  if (offline) reasons.push('暂时无法连接，等待更新');
  return { state: reasons.length ? 'unknown' : items.length ? 'alerts' : 'ok', items, reasons };
}

export function formatReset(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const d = new Date(seconds * 1000);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} 周${'日一二三四五六'[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())} 重置`;
}

export function quotaView(quota, now = Date.now()) {
  const labels = { stale: '旧数据', expired: '已过期', unavailable: '未读取到' };
  let state = quota?.state;
  if (!quota || 'error' in quota || !['fresh', 'stale', 'expired', 'unavailable'].includes(state)) {
    return { label: '未读取到', remaining: null, reset: '' };
  }
  const window = quota.windows?.find(w => w.minutes === 10080);
  const age = now / 1000 - quota.sampled_at;
  if (['fresh', 'stale'].includes(state) && Number.isFinite(quota.sampled_at)) {
    // 新鲜度以采集器给的 state 为准（它每 10 分钟才真读一次，summary 又 5 分钟一推，采样常有 10–15 分钟旧）；
    // 这里只兜底：超过 1 小时或比本机时钟超前 5 分钟以上（时钟异常）一律视为过期。
    if (age < -300 || age >= 3600) state = 'expired';
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
