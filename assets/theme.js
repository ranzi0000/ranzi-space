// Shared manual theme control; the head anti-flash scripts stay inline.
(function() {
  var STORAGE_KEY = 'ranzi-space-theme';
  var root = document.documentElement;
  var btns = document.querySelectorAll('.theme-toggle .seg');

  function getMode() {
    try {
      var t = localStorage.getItem(STORAGE_KEY);
      if (t === 'light' || t === 'dark') return t;
    } catch (e) {}
    return 'auto';
  }
  function applyMode(mode) {
    if (mode === 'auto') {
      root.removeAttribute('data-theme');
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    } else {
      root.setAttribute('data-theme', mode);
      try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) {}
    }
    btns.forEach(function(b) {
      b.setAttribute('aria-pressed', b.dataset.theme === mode ? 'true' : 'false');
    });
  }
  applyMode(getMode());
  btns.forEach(function(b) {
    b.addEventListener('click', function() { applyMode(b.dataset.theme); });
  });
})();
