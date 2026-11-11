// 首页金句：每天一条金句加一条做法（k 为 do 的条目），按日期取；点一下换下一条金句。数据真源 quotes.json，每日推送脚本读同一份。
export function pickIndex(count, date) {
  if (!count) return -1;
  const days = Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
  return ((days % count) + count) % count;
}

async function init() {
  const box = document.getElementById('quote-line');
  if (!box) return;
  let quotes;
  try {
    const resp = await fetch('/assets/home/quotes.json', { cache: 'no-cache' });
    quotes = await resp.json();
  } catch (e) { return; }
  if (!Array.isArray(quotes) || !quotes.length) return;
  const dos = quotes.filter(q => q.k === 'do');
  quotes = quotes.filter(q => q.k !== 'do');
  if (!quotes.length) return;
  let i = pickIndex(quotes.length, new Date());
  const today = dos[pickIndex(dos.length, new Date())];
  const doLine = box.querySelector('.quote-do');
  if (doLine && today) { doLine.textContent = '做法 · ' + today.t; doLine.hidden = false; }
  const show = () => {
    box.querySelector('.quote-text').textContent = quotes[i].t;
    box.querySelector('.quote-src').textContent = quotes[i].s || '';
    box.hidden = false;
  };
  box.addEventListener('click', () => { i = (i + 1) % quotes.length; show(); });
  show();
}

if (typeof document !== 'undefined') init();
