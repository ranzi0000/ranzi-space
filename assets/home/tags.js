// Quick tags: jump to a section on click, highlight the section currently in view.
var bar = document.getElementById('quick-tags');
var tags = Array.prototype.slice.call(bar.querySelectorAll('a[data-tag]'));
var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
var current = '';
// 点击标签后锁定该标签高亮，直到用户自己滑动——尾部分区短、页面滚不到它顶部时，不让「滚到底」规则抢走高亮
var pinned = '';

tags.forEach(function(tag) {
  tag.addEventListener('click', function(e) {
    var target = document.getElementById(tag.dataset.tag);
    if (!target) return;
    e.preventDefault();
    pinned = tag.dataset.tag;
    setCurrent(pinned);
    target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', '#' + tag.dataset.tag);
  });
});

function setCurrent(key) {
  if (key === current) return;
  current = key;
  tags.forEach(function(tag) {
    if (tag.dataset.tag === key) {
      tag.setAttribute('aria-current', 'true');
      // 窄屏标签栏可横向滚动：保证高亮的标签在可视范围内
      var left = tag.offsetLeft - bar.offsetLeft;
      if (left < bar.scrollLeft || left + tag.offsetWidth > bar.scrollLeft + bar.clientWidth) {
        bar.scrollTo({ left: left - 16, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      }
    } else {
      tag.removeAttribute('aria-current');
    }
  });
}

// 以标签栏下沿为基准线：最后一个顶部越过基准线的可见分区即当前分区；滚到底时取最后一个
function update() {
  bar.classList.toggle('stuck', bar.getBoundingClientRect().top <= 0 && window.scrollY > 0);
  if (pinned) return;
  // 留 32px 余量：跳转后分区顶部停在 scroll-margin-top（64px）处，略低于标签栏下沿
  var line = bar.getBoundingClientRect().bottom + 32;
  var key = '';
  tags.forEach(function(tag) {
    var section = document.getElementById(tag.dataset.tag);
    if (!section || section.hidden || tag.hidden) return;
    if (section.getBoundingClientRect().top <= line) key = tag.dataset.tag;
  });
  var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  if (atBottom) {
    var visible = tags.filter(function(tag) { return !tag.hidden; });
    if (visible.length) key = visible[visible.length - 1].dataset.tag;
  }
  setCurrent(key || tags[0].dataset.tag);
}

var pending = false;
window.addEventListener('scroll', function() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(function() { pending = false; update(); });
}, { passive: true });
window.addEventListener('resize', update);
['wheel', 'touchstart', 'keydown'].forEach(function(type) {
  window.addEventListener(type, function() { pinned = ''; }, { passive: true });
});
update();
