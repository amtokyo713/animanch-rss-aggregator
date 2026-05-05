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

    var section = document.createElement('section');
    section.className = 'amrss-wrap';
    section.setAttribute('role', 'region');
    section.setAttribute('aria-label', '外部サイト新着');
    section.setAttribute('lang', 'ja');

    var header = document.createElement('div');
    header.className = 'amrss-header';
    header.textContent = '外部サイト新着';
    section.appendChild(header);

    var ul = document.createElement('ul');
    ul.className = 'amrss-list';
    ul.setAttribute('aria-label', '新着記事一覧');

    data.items.forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'amrss-item';
      li.style.borderLeftColor = it.color || '#888';

      var a = document.createElement('a');
      a.className = 'amrss-link';
      a.href = it.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', it.source + 'の記事「' + it.title + '」を新しいタブで開く');

      if (it.thumbnail) {
        var img = document.createElement('img');
        img.className = 'amrss-thumb';
        img.src = it.thumbnail;
        img.alt = '';
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
        img.setAttribute('aria-hidden', 'true');
        img.onerror = function () { img.style.display = 'none'; };
        a.appendChild(img);
      }

      var titleSpan = document.createElement('span');
      titleSpan.className = 'amrss-title';
      titleSpan.textContent = it.title;
      a.appendChild(titleSpan);

      li.appendChild(a);

      var src = document.createElement('span');
      src.className = 'amrss-source';
      src.textContent = it.source;
      li.appendChild(src);

      ul.appendChild(li);
    });
    section.appendChild(ul);

    root.innerHTML = '';
    root.appendChild(section);
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
