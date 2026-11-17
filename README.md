# Ruby 互動煉金術 / Ruby Alchemy — RubyWorld Conference 2026 特別版

**Ruby Taiwan × RubyCity MATSUE** — RubyCity MATSUE 20 周年記念 / 20th Anniversary / 20 週年紀念 🌐 **https://rwc2026.ruby.tw**

**[日本語](#ja) ｜ [English](#en) ｜ [繁體中文](#zh-tw)**

---

<a id="ja"></a>

## 日本語

[English](#en) ｜ [繁體中文](#zh-tw)

### これは何？

RubyWorld Conference 2026 の RubyCity MATSUE ブースで遊べる特別版のインタラクティブ・チャレンジゲームです。Ruby Taiwan と RubyCity MATSUE の共同企画で、RubyCity MATSUE の 20 周年を記念しています。スマホのブラウザ上で本物の Ruby コードを実行して遊べます。

Ruby 基礎問題 5 問 + クロスランゲージ問題 3 問（JavaScript / Python / PHP から選択）。各問 3 回まで挑戦でき（クロスランゲージは 2 回）、全問終了後にブースで記念品を受け取れます。

### ゲームの流れ

1. **クイズ** — 基礎 5 問（Easy 2 → Medium 2 → Hard 1）。不正解 3 回で正解を表示
2. **言語選択** — 得意な言語（JS / Python / PHP）を選ぶ
3. **クロスランゲージ** — 元の言語のコードを見て、等価な Ruby を 4 択から選ぶ（3 問）
4. **成績表** — 1080×1080 のスコアカード画像（Instagram 共有可）
5. **フォーム** — ニックネーム・Email・電話・所属。Ruby Taiwan のニュースレター購読は任意
6. **完了証明** — 合格コード + QR コード。RubyCity MATSUE ブースのスタッフに提示して記念品を受け取る
   🎋 おまけ：mruby WASM で「Ruby おみくじ」を引ける（共有可）

### 技術スタック

Jekyll 4.4 / Tailwind CSS v4 / mruby 4.0（C mruby → WebAssembly、gzip 441 KB）/ qrcode-generator / highlight.js / listmonk / Canvas API / Web Share API

初回ロードは約 **0.45 MB**（gzip）。以前の CRuby `ruby.wasm`（4.8 MB gzip）の 1/11 で、VM 起動は 201 ms → 22 ms。代償として stdlib と `Encoding` クラスがありません。CRuby が必要なら PR #3 を revert してください。再ビルドと検証は `tools/mruby-wasm/` を参照。

### ローカル開発

```bash
git clone https://github.com/rubytaiwan/rwc2026
cd rwc2026
bundle install
bundle exec jekyll serve   # http://127.0.0.1:4000
```

`_config.yml` の変更はサーバーの再起動が必要です。

### 問題集

- 基礎問題：`_data/tasks/<lang>.yml`（`zh-TW` / `en` / `ja`）。`answer` は任意の有効な Ruby 式。mruby WASM で実行して出力を比較します
- クロスランゲージ：`_data/crosslang/<lang>/{javascript,python,php}.yml`。各言語 5 問から 3 問を抽選

### デプロイ

GitHub Actions で GitHub Pages（**https://rwc2026.ruby.tw**）へ。購読 API は Cloudflare Worker（`workers/rwc2026-subscribe/`）経由で [Ruby Taiwan listmonk](https://edm.ruby.tw) に中継します。

### ライセンス

MIT License © Ruby Taiwan

[↑ トップへ](#ruby-互動煉金術--ruby-alchemy--rubyworld-conference-2026-特別版)

---

<a id="en"></a>

## English

[日本語](#ja) ｜ [繁體中文](#zh-tw)

### What is this?

A special-edition interactive challenge game for the RubyCity MATSUE booth at RubyWorld Conference 2026, a collaboration between Ruby Taiwan and RubyCity MATSUE celebrating the 20th anniversary of RubyCity MATSUE. It runs real Ruby code right in your phone's browser.

Players answer 5 Ruby basics questions + 3 cross-language questions (pick JavaScript / Python / PHP). Up to 3 attempts per question (2 for cross-language); finish everything to claim a small gift at the RubyCity MATSUE booth.

### Game flow

1. **Quiz** — 5 basic questions (2 Easy → 2 Medium → 1 Hard). The answer is revealed after 3 misses
2. **Language select** — pick your primary language (JS / Python / PHP)
3. **Cross-language** — read code in your language, pick the equivalent Ruby from 4 choices (3 questions)
4. **Result** — 1080×1080 scorecard image, shareable to Instagram
5. **Form** — nickname, email, phone, organization/school; optional Ruby Taiwan newsletter signup
6. **Proof** — completion code + QR code; show it to RubyCity MATSUE booth staff for your gift
   🎋 Bonus: draw a "Ruby Omikuji" fortune powered by mruby WASM (shareable)

### Tech stack

Jekyll 4.4 / Tailwind CSS v4 / mruby 4.0 (C mruby → WebAssembly, 441 KB gzip) / qrcode-generator / highlight.js / listmonk / Canvas API / Web Share API

First load is ~**0.45 MB** gzip — 1/11 of the previous CRuby `ruby.wasm` (4.8 MB gzip), and VM startup dropped from 201 ms to 22 ms. Trade-off: no stdlib and no `Encoding` class. Need full CRuby? Revert PR #3. See `tools/mruby-wasm/` for rebuilding and verification.

### Local development

```bash
git clone https://github.com/rubytaiwan/rwc2026
cd rwc2026
bundle install
bundle exec jekyll serve   # http://127.0.0.1:4000
```

Changes to `_config.yml` require a server restart.

### Task bank

- Basic: `_data/tasks/<lang>.yml` (`zh-TW` / `en` / `ja`). `answer` can be any valid Ruby expression; it is run in mruby WASM and its output is compared
- Cross-language: `_data/crosslang/<lang>/{javascript,python,php}.yml`. 5 per source language, 3 drawn at random

### Deployment

GitHub Actions → GitHub Pages at **https://rwc2026.ruby.tw**. The subscription API is relayed through a Cloudflare Worker (`workers/rwc2026-subscribe/`) to the [Ruby Taiwan listmonk](https://edm.ruby.tw).

### License

MIT License © Ruby Taiwan

[↑ Back to top](#ruby-互動煉金術--ruby-alchemy--rubyworld-conference-2026-特別版)

---

<a id="zh-tw"></a>

## 繁體中文

[日本語](#ja) ｜ [English](#en)

### 這是什麼？

RubyWorld Conference 2026 特別版：由 Ruby Taiwan 與 RubyCity MATSUE 合作，紀念 RubyCity MATSUE 20 週年，在 RubyCity MATSUE 攤位展出的互動挑戰遊戲，跑在手機瀏覽器上，讓參加者體驗真實執行 Ruby 程式碼的樂趣。

玩家回答 5 題 Ruby 基礎題 + 3 題跨語言對照題（JavaScript / Python / PHP 擇一），每題最多 3 次機會（跨語言 2 次），全部完成後可至攤位領取小禮物。

### 遊戲流程

1. **答題** — 5 題基礎挑戰（2 Easy → 2 Medium → 1 Hard），答錯 3 次顯示正確答案
2. **選語言** — 選擇你熟悉的語言（JS / Python / PHP）
3. **跨語言挑戰** — 看原語言程式碼，從 4 個選項選出等效的 Ruby（3 題）
4. **成績單** — 1080×1080 成績卡圖片，可分享至 Instagram
5. **填寫資料** — 暱稱、Email、手機、所屬組織或學校；可選訂閱 Ruby Taiwan 電子報
6. **完成證明** — 通關代碼 + QR Code，出示給 RubyCity MATSUE 攤位工作人員領取小禮物
   🎋 加碼：抽一支「Ruby 御神籤」，由 mruby WASM 抽出籤詩卡，可分享 IG

### 技術棧

Jekyll 4.4 / Tailwind CSS v4 / mruby 4.0（C mruby → WebAssembly，441 KB gzip）/ qrcode-generator / highlight.js / listmonk / Canvas API / Web Share API

首次載入約 **0.45 MB**（gzip），為先前 CRuby `ruby.wasm`（4.8 MB gzip）的 1/11，VM 啟動由 201 ms 降到 22 ms。代價：沒有 stdlib、沒有 `Encoding` class；需要完整 CRuby 語意就 revert PR #3。重建與驗證見 `tools/mruby-wasm/`。

### 本地開發

```bash
git clone https://github.com/rubytaiwan/rwc2026
cd rwc2026
bundle install
bundle exec jekyll serve   # http://127.0.0.1:4000
```

`_config.yml` 的修改需要重啟 server 才會生效。

### 題庫

- 基礎題：`_data/tasks/<lang>.yml`（`zh-TW` / `en` / `ja`）。`answer` 可以是任意合法的 Ruby 運算式，由 mruby WASM 執行後比對輸出
- 跨語言題：`_data/crosslang/<lang>/{javascript,python,php}.yml`，每種來源語言 5 題，隨機抽 3 題

### 部署

GitHub Actions 部署 GitHub Pages 於 **https://rwc2026.ruby.tw**。訂閱 API 經 Cloudflare Worker（`workers/rwc2026-subscribe/`）代轉至 [Ruby Taiwan listmonk](https://edm.ruby.tw)。

### 授權

MIT License © Ruby Taiwan

[↑ 回到頂端](#ruby-互動煉金術--ruby-alchemy--rubyworld-conference-2026-特別版)
