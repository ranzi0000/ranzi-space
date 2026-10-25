import { STALE_SECONDS, classifyToday, quotaView } from './today.js';

// DOM rendering and last-summary replay after a project-list rebuild.
var GROUP_KEYS = ['invest', 'create', 'product', 'tool'];
var serverStrip = document.getElementById('server-strip');
var meta = document.getElementById('refresh-meta');
var lastSummary = null;
var summaryOffline = false;

function fmtRelative(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d)) return '—';
  var diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return Math.floor(diff) + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'min ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function applyStaleness(iso) {
  if (!iso) return;
  var d = new Date(iso);
  if (isNaN(d)) return;
  var diff = (Date.now() - d.getTime()) / 1000;
  var stale = diff > STALE_SECONDS;
  document.body.classList.toggle('stale', stale);
  meta.classList.toggle('stale', stale);
}
function statusClass(s) {
  return (s === 'ok' || s === 'warn' || s === 'bad') ? s : '';
}

// ── 纯入口行（dash 无 key）：只有标题 + 一句说明，进 tools 区 ──
function appendEntry(p, target) {
  if (!target) return;
  var d = p.dash;
  var a = document.createElement('a');
  a.className = 'entry';
  a.setAttribute('data-gen', '1');
  a.innerHTML = '<span class="entry-title"></span><span class="entry-sub"></span>';
  var subEl = a.querySelector('.entry-sub');
  a.querySelector('.entry-title').textContent = d.title || p.slug;
  subEl.textContent = d.sub || '';
  a.href = d.href || p.live || '#';
  target.appendChild(a);
}

// ── 卡片生成：show_on_dashboard=true 且带 dash 元数据的条目，按 dash.group 分区、dash.order 排 ──
//    有 dash.key = 活数据大卡；无 key 但 dash.big=true = 静态大卡（main 显示 dash.main 固定文案、
//    无状态点）；两者进分区的 .grid，其余纯入口进分区的 .entry-grid。没有内容的分区连同快捷标签一起隐藏。
function buildCards(data) {
  var entries = (data.projects || [])
    .filter(function(p) { return p.show_on_dashboard === true && p.dash; })
    .sort(function(a, b) { return (a.dash.order || 99) - (b.dash.order || 99); });

  var groups = {};
  GROUP_KEYS.forEach(function(key) {
    var cards = document.querySelector('[data-cards="' + key + '"]');
    var list = document.querySelector('[data-entries="' + key + '"]');
    cards.innerHTML = '';
    list.innerHTML = '';
    groups[key] = { cards: cards, entries: list, count: 0 };
  });

  entries.forEach(function(p) {
    var d = p.dash;
    var g = groups[d.group] || groups.tool;
    g.count += 1;
    if (!d.key && !d.big) { appendEntry(p, g.entries); return; }
    var grid = g.cards;

    var a = document.createElement('a');
    a.className = 'card';
    a.href = d.href || p.live || '#';
    if (d.key) a.setAttribute('data-project', d.key);
    a.innerHTML =
      '<div class="card-head"><span class="card-name"></span><span class="status-dot"></span></div>' +
      (d.items
        ? '<ul class="card-items">' +
            '<li><span class="dot"></span><span class="title">—</span><span class="time"></span></li>' +
            '<li><span class="dot"></span><span class="title">—</span><span class="time"></span></li>' +
          '</ul>'
        : '<div class="card-main placeholder">—</div><div class="card-sub"></div>');
    a.querySelector('.card-name').textContent = d.title || p.slug;
    var subEl = a.querySelector('.card-sub');
    if (subEl) subEl.textContent = d.sub || '';
    if (!d.key) {
      // 静态大卡：无 collector 数据，主文案固定，状态点整个摘掉
      var mainEl = a.querySelector('.card-main');
      mainEl.textContent = d.main || d.title || '';
      mainEl.classList.remove('placeholder');
      var dotEl = a.querySelector('.status-dot');
      dotEl.parentNode.removeChild(dotEl);
    }
    grid.appendChild(a);
  });

  GROUP_KEYS.forEach(function(key) {
    var empty = groups[key].count === 0;
    document.getElementById(key).hidden = empty;
    var tag = document.querySelector('#quick-tags [data-tag="' + key + '"]');
    if (!tag) return;
    tag.hidden = empty;
    tag.querySelector('.tag-count').textContent = empty ? '' : String(groups[key].count);
  });
}

// ── 云服务器状态条（数据全部来自 summary.servers，页面本身不含服务器信息） ──
function renderServers(sv) {
  if (!sv || !Array.isArray(sv.list) || !sv.list.length) return;
  serverStrip.innerHTML = '';
  sv.list.forEach(function(s) {
    var cell = document.createElement('div');
    cell.className = 'server-cell';
    if (s.role) cell.title = s.role;
    cell.innerHTML =
      '<div class="s-name"><span class="status-dot"></span><span class="n"></span></div>' +
      '<div class="s-sub"></div>';
    cell.querySelector('.status-dot').className = 'status-dot ' + statusClass(s.status);
    cell.querySelector('.n').textContent = s.name || '—';
    cell.querySelector('.s-sub').textContent = s.sub || '';
    serverStrip.appendChild(cell);
  });
  serverStrip.hidden = false;
  document.getElementById('server-empty').hidden = true;
}

export function renderProjects(data) {
  buildCards(data);
  if (lastSummary) renderSummary(lastSummary, true);  // 回填不清除网络失败状态
}

function renderStandardCard(card, p) {
  var mainEl = card.querySelector('.card-main');
  var subEl = card.querySelector('.card-sub');
  var dotEl = card.querySelector('.status-dot');

  if (p.main !== undefined && p.main !== null && p.main !== '') {
    mainEl.textContent = p.main;
    mainEl.classList.remove('placeholder');
  }
  if (p.sub) subEl.textContent = p.sub;
  dotEl.className = 'status-dot ' + statusClass(p.status);
}

function renderItemCard(card, p) {
  var ul = card.querySelector('.card-items');
  var dotEl = card.querySelector('.status-dot');
  dotEl.className = 'status-dot ' + statusClass(p.status);

  if (!p.items || p.items.length === 0) return;

  ul.innerHTML = '';
  p.items.forEach(function(it) {
    var li = document.createElement('li');
    li.innerHTML =
      '<span class="dot ' + statusClass(it.status) + '"></span>' +
      '<span class="title"></span>' +
      '<span class="time"></span>';
    li.querySelector('.title').textContent = it.title || '—';
    li.querySelector('.time').textContent = it.time || '';
    ul.appendChild(li);
  });
}

export function renderSummary(data, replay = false) {
  if (!data || typeof data !== 'object') return;
  lastSummary = data;
  if (!replay) summaryOffline = false;
  renderToday(data);
  (Array.isArray(data.projects) ? data.projects : []).forEach(function(p) {
    var card = document.querySelector('.grid [data-project="' + p.key + '"]');
    if (!card) return;
    if (p.href) card.setAttribute('href', p.href);

    if (p.items) {
      renderItemCard(card, p);
    } else {
      renderStandardCard(card, p);
    }
  });

  var t = data.received_at || data.generated_at;
  if (t) {
    meta.textContent = fmtRelative(t);
    applyStaleness(t);
  }

  renderServers(data.servers);
  renderDrift(data.registry_drift);
}

// 项目登记漂移提醒：本地 git 仓库 vs projects.json 真源对不上时提示
function renderDrift(rd) {
  var el = document.getElementById('drift-banner');
  if (!el) return;
  if (!rd || !rd.count) { el.hidden = true; return; }
  var miss = (rd.missing || []).map(function(m) { return m.slug; });
  var stale = (rd.stale || []).map(function(s) { return s.slug; });
  var summ = [];
  if (miss.length) summ.push(miss.length + ' 个未登记');
  if (stale.length) summ.push(stale.length + ' 个可能过时');
  el.querySelector('.drift-title').innerHTML =
    '项目登记 · <span class="drift-count">' + summ.join(' · ') + '</span>';
  var detail = [];
  if (miss.length) detail.push(miss.join(' · '));
  if (stale.length) detail.push('过时: ' + stale.join(' · '));
  el.querySelector('.drift-detail').textContent = detail.join('   |   ');
  el.hidden = false;
}

export function refreshTime(iso) {
  renderToday(lastSummary);
  if (iso) {
    meta.textContent = fmtRelative(iso);
    applyStaleness(iso);
  }
}

export function renderOffline() {
  meta.textContent = 'offline';
  summaryOffline = true;
  renderToday(lastSummary);
}

export function renderProjectsError(e) {
  var grid = document.querySelector('[data-cards="invest"]');
  document.getElementById('invest').hidden = false;
  grid.innerHTML = '';
  var err = document.createElement('div');
  err.className = 'grid-error';
  err.textContent = 'projects.json 加载失败：' + (e.message || 'unknown');
  grid.appendChild(err);
}

// New summary fields render independently of legacy business cards.
function renderToday(data) {
  var panel = document.getElementById('today-panel');
  var view = classifyToday(data, Date.now(), summaryOffline);
  panel.dataset.state = view.state;
  document.getElementById('tag-today-dot').dataset.state = view.state;
  document.getElementById('today-status').textContent = {
    ok: view.aiItems.length ? '无需你处理' : '一切正常', alerts: view.items.length + ' 项待你处理', unknown: '状态未知',
  }[view.state];
  var list = document.getElementById('today-alerts');
  list.innerHTML = '';
  view.items.forEach(function(item) {
    var li = document.createElement('li');
    li.innerHTML = '<span class="status-dot" aria-hidden="true"></span><div><span class="alert-title"></span><span class="alert-detail"></span></div>';
    li.querySelector('.status-dot').className = 'status-dot ' + statusClass(item.level);
    li.querySelector('.alert-title').textContent = (item.level === 'bad' ? '异常 · ' : '注意 · ') + item.title;
    li.querySelector('.alert-detail').textContent = item.detail || '';
    list.appendChild(li);
  });
  // AI 侧异常默认收起，只露一行计数；展开看明细
  var ai = document.getElementById('today-ai');
  ai.hidden = !view.aiItems.length;
  ai.querySelector('summary').textContent = 'AI 侧 ' + view.aiItems.length + ' 项（无需你处理）';
  var aiList = ai.querySelector('ul');
  aiList.innerHTML = '';
  view.aiItems.forEach(function(item) {
    var li = document.createElement('li');
    li.textContent = item.title + (item.detail && item.detail !== item.title ? ' · ' + item.detail : '');
    aiList.appendChild(li);
  });
  var reason = document.getElementById('today-unknown');
  reason.textContent = view.reasons.join('；');
  reason.hidden = !view.reasons.length;
  var activity = data?.activity;
  var valid = activity && !('error' in activity) && Number.isFinite(activity.today_commits) && Number.isFinite(activity.repos);
  document.getElementById('today-activity').textContent = valid
    ? '今日 ' + activity.today_commits + ' 次提交 · ' + activity.repos + ' 个仓库' + (activity.most_active ? ' · 最活跃 ' + activity.most_active : '')
    : '提交动态未读取到';
  var latest = document.getElementById('today-latest');
  latest.innerHTML = '';
  if (valid && Array.isArray(activity.latest)) activity.latest.slice(0, 2).forEach(function(item) {
    var li = document.createElement('li');
    li.innerHTML = '<span class="commit-title"></span><time></time>';
    li.querySelector('.commit-title').textContent = item.repo + ' · ' + item.title;
    li.querySelector('time').textContent = fmtRelative(item.time);
    if (item.time) li.querySelector('time').dateTime = item.time;
    latest.appendChild(li);
  });
  var claude = quotaView(data?.quota_claude, Date.now(), [10080], 21600);
  var short = quotaView(data?.quota_claude, Date.now(), [300], 21600);
  var available = claude.remaining !== null;
  // 额度只有终端 Claude 运行时才会写入；没有数据时整块隐藏，不常驻一行「未运行」
  document.getElementById('quota-block').hidden = !available;
  panel.classList.toggle('no-quota', !available);
  var sampled = new Date(data?.quota_claude?.sampled_at * 1000);
  var sampleTime = String(sampled.getHours()).padStart(2, '0') + ':' + String(sampled.getMinutes()).padStart(2, '0');
  document.getElementById('quota-claude-value').textContent = available ? claude.remaining + '%' : '—';
  document.getElementById('quota-claude-short').textContent = '5 小时剩余 ' + (short.remaining === null ? '—' : short.remaining + '%');
  document.getElementById('quota-claude-state').textContent = !available ? '终端 Claude 未运行'
    : claude.label === '旧数据' ? '数据 ' + sampleTime : claude.label;
  document.getElementById('quota-claude-reset').textContent = available ? claude.reset : '';
}
