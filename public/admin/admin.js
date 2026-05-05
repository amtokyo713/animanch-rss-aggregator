(function () {
  'use strict';

  var REPO_OWNER = 'amtokyo713';
  var REPO_NAME = 'animanch-rss-aggregator';
  var FEEDS_PATH = 'public/feeds.json';
  var WORKFLOW_FILE = 'update.yml';
  var BRANCH = 'main';

  var PAT_KEY = 'gh_pat';
  var API_BASE = 'https://api.github.com';
  var PAGES_BASE = 'https://' + REPO_OWNER + '.github.io/' + REPO_NAME;

  var state = {
    pat: null,
    feedsConfig: null,
    feedsSha: null
  };

  // ---------- Utility ----------

  function $(id) { return document.getElementById(id); }

  function showError(el, msg) {
    el.textContent = msg;
    el.hidden = false;
  }

  function hideError(el) {
    el.textContent = '';
    el.hidden = true;
  }

  function setStatus(msg, type) {
    var el = $('save-status');
    el.textContent = msg;
    el.className = 'status ' + (type || '');
    el.hidden = false;
  }

  function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function base64ToUtf8(b64) {
    return decodeURIComponent(escape(atob(b64.replace(/\s/g, ''))));
  }

  function generateId(name) {
    var slug = (name || '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30);
    if (!slug) slug = 'feed';
    return slug + '-' + Math.random().toString(36).slice(2, 8);
  }

  // ---------- GitHub API ----------

  function ghFetch(path, options) {
    options = options || {};
    options.headers = Object.assign({
      'Authorization': 'Bearer ' + state.pat,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, options.headers || {});
    return fetch(API_BASE + path, options).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          var msg = body.message || ('HTTP ' + r.status);
          throw new Error(msg);
        });
      }
      return r.json();
    });
  }

  function verifyToken() {
    return ghFetch('/user');
  }

  function loadFeedsJson() {
    return ghFetch('/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + FEEDS_PATH + '?ref=' + BRANCH)
      .then(function (data) {
        state.feedsSha = data.sha;
        var json = JSON.parse(base64ToUtf8(data.content));
        return json;
      });
  }

  function saveFeedsJson(feedsConfig) {
    var content = JSON.stringify(feedsConfig, null, 2) + '\n';
    return ghFetch('/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + FEEDS_PATH, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'admin: update feeds.json',
        content: utf8ToBase64(content),
        sha: state.feedsSha,
        branch: BRANCH
      })
    }).then(function (data) {
      state.feedsSha = data.content.sha;
      return data;
    });
  }

  function triggerWorkflow() {
    return fetch(API_BASE + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/actions/workflows/' + WORKFLOW_FILE + '/dispatches', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + state.pat,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ref: BRANCH })
    }).then(function (r) {
      if (r.status === 204) return true;
      return r.json().catch(function () { return {}; }).then(function (body) {
        throw new Error(body.message || ('HTTP ' + r.status));
      });
    });
  }

  function fetchPublicData() {
    return fetch(PAGES_BASE + '/data.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // ---------- UI rendering ----------

  function renderFeedsTable() {
    var tbody = $('feeds-tbody');
    tbody.innerHTML = '';
    var tpl = $('tpl-feed-row');
    state.feedsConfig.feeds.forEach(function (feed, idx) {
      var clone = tpl.content.cloneNode(true);
      var row = clone.querySelector('.feed-row');
      row.dataset.index = idx;
      row.querySelector('.feed-enabled').checked = feed.enabled !== false;
      row.querySelector('.feed-name').value = feed.name || '';
      row.querySelector('.feed-url').value = feed.url || '';
      row.querySelector('.feed-color').value = feed.color || '#888888';
      row.querySelector('.feed-delete').addEventListener('click', function () {
        if (!confirm('このフィードを削除しますか？')) return;
        state.feedsConfig.feeds.splice(idx, 1);
        renderFeedsTable();
      });
      tbody.appendChild(clone);
    });
  }

  function readFeedsTable() {
    var rows = document.querySelectorAll('#feeds-tbody .feed-row');
    var feeds = [];
    rows.forEach(function (row) {
      var name = row.querySelector('.feed-name').value.trim();
      var url = row.querySelector('.feed-url').value.trim();
      if (!name || !url) return;
      if (!/^https?:\/\//.test(url)) {
        throw new Error('URLは http:// または https:// で始まる必要があります: ' + url);
      }
      var idx = parseInt(row.dataset.index, 10);
      var existingId = state.feedsConfig.feeds[idx] && state.feedsConfig.feeds[idx].id;
      feeds.push({
        id: existingId || generateId(name),
        name: name,
        url: url,
        enabled: row.querySelector('.feed-enabled').checked,
        color: row.querySelector('.feed-color').value
      });
    });
    return feeds;
  }

  function readSettingsForm() {
    return {
      maxItemsPerFeed: parseInt($('input-max-per-feed').value, 10) || 10,
      displayCount: parseInt($('input-display-count').value, 10) || 20,
      ttlHours: parseInt($('input-ttl-hours').value, 10) || 168
    };
  }

  function fillSettingsForm() {
    var s = state.feedsConfig.settings || {};
    $('input-max-per-feed').value = s.maxItemsPerFeed || 10;
    $('input-display-count').value = s.displayCount || 20;
    $('input-ttl-hours').value = s.ttlHours || 168;
  }

  function setConnectedUI(user) {
    $('auth-status').textContent = '接続済み: ' + user.login;
    $('auth-status').classList.add('connected');
    $('btn-logout').hidden = false;
    $('auth-section').hidden = true;
    $('settings-section').hidden = false;
    $('feeds-section').hidden = false;
    $('actions-section').hidden = false;
    $('preview-section').hidden = false;

    $('link-data-json').href = PAGES_BASE + '/data.json';
    $('link-preview').href = PAGES_BASE + '/preview.html';
  }

  function setDisconnectedUI() {
    state.pat = null;
    state.feedsConfig = null;
    state.feedsSha = null;
    $('auth-status').textContent = '未認証';
    $('auth-status').classList.remove('connected');
    $('btn-logout').hidden = true;
    $('auth-section').hidden = false;
    $('settings-section').hidden = true;
    $('feeds-section').hidden = true;
    $('actions-section').hidden = true;
    $('preview-section').hidden = true;
  }

  // ---------- Boot flow ----------

  function connect(pat) {
    state.pat = pat;
    return verifyToken().then(function (user) {
      localStorage.setItem(PAT_KEY, pat);
      return loadFeedsJson().then(function (cfg) {
        state.feedsConfig = cfg;
        setConnectedUI(user);
        fillSettingsForm();
        renderFeedsTable();
        return fetchPublicData().then(function (data) {
          if (data) {
            $('data-preview').textContent = JSON.stringify(data, null, 2);
          } else {
            $('data-preview').textContent = '(data.json をまだ取得できません)';
          }
        });
      });
    });
  }

  // ---------- Event wiring ----------

  document.addEventListener('DOMContentLoaded', function () {
    setDisconnectedUI();

    $('form-auth').addEventListener('submit', function (e) {
      e.preventDefault();
      hideError($('auth-error'));
      var pat = $('input-pat').value.trim();
      if (!pat) return;
      connect(pat).catch(function (err) {
        showError($('auth-error'), '接続失敗: ' + err.message);
        localStorage.removeItem(PAT_KEY);
        state.pat = null;
      });
    });

    $('btn-logout').addEventListener('click', function () {
      if (!confirm('ログアウトしますか？（保存されたPATを削除します）')) return;
      localStorage.removeItem(PAT_KEY);
      setDisconnectedUI();
    });

    $('btn-add-feed').addEventListener('click', function () {
      state.feedsConfig.feeds.push({
        id: '',
        name: '',
        url: '',
        enabled: true,
        color: '#888888'
      });
      renderFeedsTable();
    });

    $('btn-save').addEventListener('click', function () {
      try {
        var feeds = readFeedsTable();
        var settings = readSettingsForm();
        var newConfig = Object.assign({}, state.feedsConfig, {
          settings: settings,
          feeds: feeds
        });
        setStatus('保存中...', '');
        saveFeedsJson(newConfig).then(function () {
          state.feedsConfig = newConfig;
          renderFeedsTable();
          setStatus('feeds.json を保存しました。Actions手動実行で data.json を再生成できます。', 'success');
        }).catch(function (err) {
          setStatus('保存失敗: ' + err.message, 'error');
        });
      } catch (err) {
        setStatus('保存失敗: ' + err.message, 'error');
      }
    });

    $('btn-trigger').addEventListener('click', function () {
      setStatus('Actions実行中...', '');
      triggerWorkflow().then(function () {
        setStatus('Actions実行リクエスト送信完了。数分後に data.json が更新されます。', 'success');
      }).catch(function (err) {
        setStatus('Actions実行失敗: ' + err.message, 'error');
      });
    });

    var savedPat = localStorage.getItem(PAT_KEY);
    if (savedPat) {
      $('input-pat').value = savedPat;
      connect(savedPat).catch(function (err) {
        showError($('auth-error'), '保存されたPATでの接続に失敗: ' + err.message);
        localStorage.removeItem(PAT_KEY);
      });
    }
  });
})();
