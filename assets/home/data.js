import { renderProjects, renderSummary, refreshTime, renderOffline, renderProjectsError } from './render.js';

var PROJ_CACHE_KEY = 'ranzi-projects-cache-v2';  // 退役启动卡后换版本，避免旧缓存显示启动文案
var CACHE_KEY = 'ranzi-dash-cache-v2';  // 升 schema，v1 缓存里没有 items 字段
var summaryStarted = false;

// ── summary 活数据流程（卡片就位后启动，只启动一次） ──
function startSummary() {
  if (summaryStarted) return;
  summaryStarted = true;

  // 1) 首屏：localStorage 0ms 渲染
  try {
    var cached = localStorage.getItem(CACHE_KEY);
    if (cached) renderSummary(JSON.parse(cached));
  } catch (e) {}

  // 2) 拉最新
  function fetchSummary() {
    fetch('/api/summary', { credentials: 'same-origin', cache: 'no-store' })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        renderSummary(data);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
      })
      .catch(function(e) {
        console.warn('fetch summary failed:', e);
        renderOffline();
      });
  }
  fetchSummary();

  // 3) 每 60 秒刷一次（数据后端 5 分钟一周期，前端 60 秒拉够新鲜了）
  setInterval(function() {
    if (document.visibilityState === 'visible') fetchSummary();
  }, 60000);

  // 4) 回到前台立刻刷一次
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') fetchSummary();
  });

  // 5) 每 15 秒只更新"X 分钟前"显示 + 陈旧标记，不发请求
  setInterval(function() {
    try {
      var cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return;
      var data = JSON.parse(cached);
      var t = data.received_at || data.generated_at;
      refreshTime(t);
    } catch (e) {}
  }, 15000);
}

// ── projects.json 加载流程：缓存 0ms 出卡片 → 拉最新，变了才重渲染 ──
var renderedJson = '';
try {
  var cachedProj = localStorage.getItem(PROJ_CACHE_KEY);
  if (cachedProj) {
    renderProjects(JSON.parse(cachedProj));
    renderedJson = cachedProj;
    startSummary();
  }
} catch (e) {}

fetch('/projects.json', { credentials: 'same-origin', cache: 'no-store' })
  .then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  })
  .then(function(text) {
    var data = JSON.parse(text);
    if (text !== renderedJson) {
      renderProjects(data);
      renderedJson = text;
      try { localStorage.setItem(PROJ_CACHE_KEY, text); } catch (e) {}
    }
    startSummary();
  })
  .catch(function(e) {
    console.warn('fetch projects.json failed:', e);
    if (renderedJson) return;  // 已有缓存渲染，忽略
    renderProjectsError(e);
  });

// ─── Service Worker ────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function() {});
  });
}
