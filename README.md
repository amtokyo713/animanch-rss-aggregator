# animanch-rss-aggregator

あにまんch掲示板（bbs.animanch.com）TOP用 外部RSSニュースティッカー。

## 概要

- 外部漫画サイト（ジャンプ+ / となりのヤングジャンプ等）のRSSを1時間毎に集約
- 統合JSON（`data.json`）をGitHub Pagesから配信
- 掲示板側は `<script>` 1行貼り付けで縦リスト表示
- 管理画面（GitHub Pages 上）でフィード追加・削除・表示件数を調整可能

要件定義: https://www.notion.so/3574806b96df81bbb77fde846fa9c323

## アーキテクチャ

```
[GitHub Actions cron 1h毎]
  ↓ src/build.js (RSS取得→マージ→data.json)
  ↓ commit + GitHub Pages deploy
[https://amtokyo713.github.io/animanch-rss-aggregator/data.json]
  ↓ widget.js が fetch
[bbs.animanch.com TOPヘッダー直下のニュースティッカー]
```

## 掲示板への埋め込み

掲示板TOPのヘッダー直下に以下を貼り付け：

```html
<div id="animanch-rss-ticker"></div>
<script src="https://amtokyo713.github.io/animanch-rss-aggregator/widget.js" async></script>
```

## 管理画面

URL: https://amtokyo713.github.io/animanch-rss-aggregator/admin/

### 必要なPersonal Access Token

GitHub の **Fine-grained PAT** を使用：
1. https://github.com/settings/personal-access-tokens/new
2. Resource owner: `amtokyo713`
3. Repository access: **Only select repositories** → `animanch-rss-aggregator`
4. Repository permissions: **Contents: Read and write** / **Workflows: Read and write**（Actions手動実行用）
5. 生成したトークンを管理画面のフォームに貼り付け（LocalStorageに保存）

PATを失効させるには https://github.com/settings/personal-access-tokens で revoke。

## ローカル開発

```bash
npm install
npm run build      # RSS取得→public/data.json生成
npm run preview    # http://localhost:8080/preview.html で表示確認
```

## ファイル構成

```
.github/workflows/update.yml   1時間毎cron + Pages deploy
src/
  fetch.js                     RSS取得（rss-parser）
  build.js                     マージ → data.json生成
  utils.js                     sanitize/dedupe/sort
public/
  feeds.json                   フィード定義（管理画面で編集）
  data.json                    統合結果（GH Actions自動生成）
  widget.js                    埋め込み本体（IIFE）
  widget.css
  preview.html                 ローカル動作確認
  admin/
    index.html                 管理画面
    admin.js                   GitHub API連携
    admin.css
```

## 運用メモ

- cron は `5 * * * *`（毎時5分。0分はGitHub Actions混雑回避）
- 1サイトのRSS取得失敗 → 該当サイトのみ前回data.jsonを流用、他は新規取得
- 全サイト失敗かつ前回data.jsonなし → exit(2)
- TTL: 7日経過アイテムは破棄
- GitHub Pages CDNキャッシュ最大10分 → widget側で10分バケットのクエリバスター付与
- PAT流出時は GitHub Settings → Personal access tokens → Revoke

## 配信元RSS（初期設定）

| サイト | RSS URL |
| --- | --- |
| ジャンプ+ | https://shonenjumpplus.com/atom |
| となりのヤングジャンプ | https://tonarinoyj.jp/atom |

追加は管理画面から。
