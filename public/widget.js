(function () {
  'use strict';

  var SCRIPT_EL = document.currentScript;
  var BASE = (function () {
    if (SCRIPT_EL && SCRIPT_EL.src) {
      return SCRIPT_EL.src.replace(/\/widget\.js(\?.*)?$/, '');
    }
    return 'https://amtokyo713.github.io/animanch-rss-aggregator';
  })();

  var TARGET_ID = 'animanch-rss-ticker';
  var CSS_ID = 'amrss-css';

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var link = document.createElement('link');
    link.id = CSS_ID;
    link.rel = 'stylesheet';
    link.href = BASE + '/widget.css';
    document.head.appendChild(link);
  }

  function ensureContainer() {
    var el = document.getElementById(TARGET_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = TARGET_ID;
    if (SCRIPT_EL && SCRIPT_EL.parentNode) {
      SCRIPT_EL.parentNode.insertBefore(el, SCRIPT_EL);
    } else {
      document.body.insertBefore(el, document.body.firstChild);
    }
    return el;
  }

  function fetchData() {
    var bucket = Math.floor(Date.now() / (10 * 60 * 1000));
    return fetch(BASE + '/data.json?t=' + bucket, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  function render(root, data) {
    if (!data || !Array.isArray(data.items) || data.items.length === 0) return;
    var wrap = document.createElement('div');
    wrap.className = 'amrss-wrap';

    var header = document.createElement('div');
    header.className = 'amrss-header';
    header.textContent = '関連サイト新着';
    wrap.appendChild(header);

    var ul = document.createElement('ul');
    ul.className = 'amrss-list';
    data.items.forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'amrss-item';
      li.style.borderLeftColor = it.color || '#888';

      var a = document.createElement('a');
      a.className = 'amrss-link';
      a.href = it.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = it.title;
      li.appendChild(a);

      var src = document.createElement('span');
      src.className = 'amrss-source';
      src.textContent = it.source;
      li.appendChild(src);

      ul.appendChild(li);
    });
    wrap.appendChild(ul);

    root.innerHTML = '';
    root.appendChild(wrap);
  }

  function init() {
    ensureCss();
    var root = ensureContainer();
    fetchData()
      .then(function (data) { render(root, data); })
      .catch(function (err) {
        if (window && window.console) {
          console.warn('[animanch-rss] failed to load data.json:', err && err.message);
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
