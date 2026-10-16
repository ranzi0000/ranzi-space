// DOM rendering and last-summary replay after a project-list rebuild.
var grid = document.getElementById('grid');
var entryGrid = document.getElementById('entry-grid');
var serverStrip = document.getElementById('server-strip');
var meta = document.getElementById('refresh-meta');
var lastSummary = null;
var STALE_SECONDS = 15 * 60;

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
function appendEntry(p) {
  if (!entryGrid) return;
  var d = p.dash;
  var a = document.createElement('a');
  a.className = 'entry';
  a.setAttribute('data-gen', '1');
  a.innerHTML = '<span class="entry-title"></span><span class="entry-sub"></span>';
  var subEl = a.querySelector('.entry-sub');
  a.querySelector('.entry-title').textContent = d.title || p.slug;
  subEl.textContent = d.sub || '';
  a.href = d.href || p.live || '#';
  entryGrid.appendChild(a);
}

// ── 卡片生成：show_on_dashboard=true 且带 dash 元数据的条目，按 dash.order 排 ──
//    有 dash.key = 活数据大卡（进 #grid）；无 key 但 dash.big=true = 静态大卡
//    （进 #grid，main 显示 dash.main 固定文案、无状态点）；其余 = 紧凑入口行（进 #entry-grid）
function buildCards(data) {
  var entries = (data.projects || [])
    .filter(function(p) { return p.show_on_dashboard === true && p.dash; })
    .sort(function(a, b) { return (a.dash.order || 99) - (b.dash.order || 99); });

  grid.innerHTML = '';
  // 只清 JS 生成的入口行，静态写死的「地图」保留在第一位
  if (entryGrid) {
    Array.prototype.forEach.call(
      entryGrid.querySelectorAll('[data-gen]'),
      function(el) { el.parentNode.removeChild(el); }
    );
  }

  entries.forEach(function(p) {
    var d = p.dash;
    if (!d.key && !d.big) { appendEntry(p); return; }

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
}

export function renderProjects(data) {
  buildCards(data);
  if (lastSummary) renderSummary(lastSummary);  // 卡片重建后回填活数据
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

export function renderSummary(data) {
  if (!data || !Array.isArray(data.projects)) return;
  lastSummary = data;
  data.projects.forEach(function(p) {
    var card = grid.querySelector('[data-project="' + p.key + '"]');
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
  if (iso) {
    meta.textContent = fmtRelative(iso);
    applyStaleness(iso);
  }
}

export function renderOffline() {
  meta.textContent = 'offline';
}

export function renderProjectsError(e) {
  grid.innerHTML = '';
  var err = document.createElement('div');
  err.className = 'grid-error';
  err.textContent = 'projects.json 加载失败：' + (e.message || 'unknown');
  grid.appendChild(err);
}
