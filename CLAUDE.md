# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jekyll 4.4.x static site for the **RubyWorld Conference 2026 special edition** booth challenge game — a Ruby Taiwan × RubyCity MATSUE collaboration commemorating RubyCity MATSUE's 20th anniversary, shown at the RubyCity MATSUE booth at RubyWorld Conference 2026. (Derived from the COSCUP 2026 booth game.) Uses Minima theme, jekyll-feed plugin, Tailwind CSS v4 (via `tailwindcss-ruby`), and WebAssembly for in-browser Ruby execution.

> **引擎是 C mruby 4.0 編出來的 wasm**（441 KB gzip），2026-08-04 從 CRuby `ruby.wasm`
> （4.8 MB gzip）換過來（PR #3）。這是刻意的實驗：攤位本身就是實驗性專案。
> 要回 CRuby 就 revert 那個 merge —— `ruby.wasm` 與 `browser.umd.js` 還在 git history 裡
> （commit `42034c2`），`assets/js/challenge.js` 的 `initRuby()` 也會一併還原。

## Current Status（2026-11-17）：RubyWorld Conference 2026 特別版

由 Ruby Taiwan 與 RubyCity MATSUE 合作，紀念 RubyCity MATSUE 20 週年，預計在 RWC 2026 的 RubyCity MATSUE 攤位展出。本 repo 由 COSCUP 2026 攤位版改來，**遊戲邏輯與題庫未動**，只換活動識別：

- 網域 `rwc2026.ruby.tw`、Worker `rwc2026-subscribe`、listmonk API user `rwc2026-booth-api-user`
- Hashtag：`#rubyworld #rubycity #rubytaiwan`；事件標籤 `RUBYWORLD 2026 × RUBY TAIWAN`（證明頁加 `× RUBYCITY MATSUE`）；`SALT` 改為 `RWC2026RubyTaiwan`（舊 COSCUP 的 proof code 不再有效）
- `secret_pool` 裡的 `coscup` 換成 `matsue`
- **預設語言為日文**：`/` = ja、`/en/`、`/zh-TW/`（原本 `/` 是 zh-TW、`/ja/` 是日文；舊的 `/ja/` 已不存在）。
- **個資收集開關**：`_config.yml` 的 `collect_personal_data`（預設 `false`）。關閉時結果頁直接進完成證明，跳過 form phase、不呼叫 Worker、不寄通知信；開啟才有表單 / listmonk 訂閱。JS 端靠 data island 的 `collectData`，`switchPhase('form')` 在關閉時會被導向 `proof`。

### RWC 上線前待辦（基礎設施要新建，不沿用 COSCUP 的）

- [x] DNS / CNAME 已設定（2026-11-17）
- [x] listmonk 端已新建 list、API user、tx template
- [x] list `RWC2026-Booth` ID 13、API user `rwc2026-booth-api-user` 已建（`worker.js` 已填 list ID 13）
- [x] list UUID 已填 `_config.yml`；tx template ja=7 / en=8（原稿在 `workers/rwc2026-subscribe/templates/`，zh-TW 沿用 en）已填 `worker.js`
- [ ] repo secrets：`CLOUDFLARE_API_TOKEN`、`LISTMONK_API_TOKEN`（新 user 的 token）；push 後 workflow 部署新 Worker，確認 `_config.yml` 的 `listmonk_submit_url` 與實際 Worker 網址一致
- [ ] 用下方 curl 驗證 `mailed: true`（記得把網址換成 `rwc2026-subscribe`）
- [ ] 現場前：EN/JA/PHP 完整流程實測；活動後清理舊 COSCUP Worker 與 listmonk 資源

---

以下為 **COSCUP 2026 前身版**的歷史紀錄（網域、worker、list ID 等皆為舊值，僅供參考）：

## 前身狀態（COSCUP 2026，2026-08-02）

本 repo 由 `rubytaiwan/sitcon2026-booth` 的 PR #2 branch（`claude/tender-sinoussi-e11ea1`，跨語言功能）直接遷移而來（push 保留完整 history，非 fork）。舊 repo 凍結於 SITCON 狀態，其 PR #2 尚未留言關閉。

### 已完成並上線

- **部署**：`https://coscup2026.ruby.tw`（COSCUP 時期；GitHub Pages + Actions，HTTPS 已強制；DNS 為 Cloudflare 灰雲 CNAME → `rubytaiwan.github.io`）
- **PR #2 feedback 四項必改**：
  - 玩家可見變數 `secret` → `gem`（題庫三語 + UI/eval 程式碼）
  - 題數 7+3 → **5+3 = 8**（2E+2M+1H；所有寫死的 `/10`、星星數、評語門檻已同步）
  - crosslang tips 三語化（`_data/crosslang/<lang>/`，原本 EN/JA 會看到中文提示）
  - 全站 COSCUP rebrand（含 `SALT`、`secret_pool` 的 `coscup` 字串、poster、README）
- **Ruby 御神籤（omikuji）**：proof 頁抽籤按鈕 → Ruby WASM `rand(12)` 抽籤（VM 未就緒退回 JS 亂數）→ 翻卡動畫 + 1080×1080 Canvas 籤詩卡（可分享/下載）。籤池 `_data/omikuji/<lang>.yml` 三語各 12 支
- **表單**：關閉瀏覽器 autofill（`autocomplete=off` + `type=text` + `inputmode`）；「學校」欄改為「你所屬的組織或學校」；「免費 Ruby 課程興趣」checkbox 已移除
- **listmonk 訂閱鏈**（E2E 已測通）：表單 → Cloudflare Worker `coscup2026-subscribe` → edm.ruby.tw
  - List：`COSCUP2026-Booth`（ID 11，UUID `87b9fdf5-…`，設定於 `_config.yml`）
  - API user：`coscup2026-booth`（token 存於 repo secret `LISTMONK_API_TOKEN`）
  - 完成通知信：tx template **ID 6**（COSCUP 版，於 listmonk 後台維護）
- **CI**：push `main` 自動部署 Pages；`workers/coscup2026-subscribe/**` 有變更自動部署 Worker（`.github/workflows/deploy-worker.yml`，需 repo secrets `CLOUDFLARE_API_TOKEN` + `LISTMONK_API_TOKEN`）；`mruby-gate.yml` 在題庫 / prelude / wasm / 建置腳本有變更時把整份題庫餵進 VM 實跑
- **引擎換成 mruby（2026-08-04，PR #3）**：CRuby `ruby.wasm` 4.8 MB gzip → C mruby 441 KB gzip（1/11），VM 啟動 201 ms → 22 ms。做法與量測見 `tools/mruby-wasm/RESULT.md`。已知差異：例外訊息文字與 CRuby 不同、沒有 stdlib 與 `Encoding` class、沒有 JSON

### 待辦 / 注意事項

- [x] ~~完成通知信寄不出去~~（2026-08-04 修好）：listmonk role **Booth Subscriber API**
      當時缺 `tx:send`，`POST /api/tx` 回 `403 permission denied: tx:send` —— 而 worker 與前端
      都是 fire-and-forget，所以「從來沒寄出過任何完成通知信」完全靜音。已勾上 `tx:send` +
      `subscribers:sql_query`，實測 `mailed: true`。
      Worker 現在回 `{ subscriber_id, created, mailed, lookup, steps[] }`，前端失敗時
      `console.warn('[subscribe] 未寄出', …)`，現場可直接從 DevTools 判斷哪一步掛掉。複驗：
      ```sh
      curl -s -X POST https://rwc2026-subscribe.contact-db4.workers.dev \
        -H 'Content-Type: application/json' \
        -d '{"email":"you@example.com","name":"test","attribs":{"score":8,"total":8}}'
      ```
      role **Booth Subscriber API** 最終需要的四項：`subscribers:manage`（建立）、
      `subscribers:get_all` + `subscribers:sql_query`（用 email 查回既有 subscriber，
      少了 `get_all` 會回 200 但 `total: 0`）、`tx:send`（寄信）。`lists:manage_all`
      是管名單本身，不等於能跨名單查 subscriber。
- 已知限制：email 已存在時 create 撞 409，worker **不會**更新既有 subscriber 的
  name/attribs（例如 SITCON 時期建的 id 934 仍是 `score: 0 / total: 10`），所以回頭客
  這次填的 score/school/phone 不會被記下來。刻意不修 —— listmonk 的
  `PUT /api/subscribers/:id` 是整筆取代，`lists` 給錯會把人從其他名單踢掉，
  不值得為分析用的 attribs 冒這個風險。
- [ ] Template 6 內的取消訂閱連結 `edm.ruby.tw/subscription/manage?uuid=…` 端點尚未建置（目前 404，屬預期，後續會補）
- [ ] 舊 repo PR #2：留言說明遷移至本 repo 後關閉
- [ ] 刪除 listmonk 測試資料：subscriber `ryudo@5xruby.com`（id 1105，E2E 測試用）
- [ ] 活動後輪替/移除 listmonk 的 `automation-api` API user（token 曾出現於對話）
- [ ] 現場實測：PHP 跨語言題組、EN/JA 完整流程（SITCON 時未測完的部分）
- 跨語言題庫每語言僅 5 題抽 3，重複率偏高；如需降低可擴充至 8–10 題（新題記得在 `_data/crosslang/choices.yml` 補 3 個選項，gate 會擋）

## Common Commands

```bash
# Install dependencies
bundle install

# Start local development server (auto-reloads on file changes, except _config.yml)
bundle exec jekyll serve

# Build the site to _site/
bundle exec jekyll build

# Production build (Tailwind CSS will be minified)
JEKYLL_ENV=production bundle exec jekyll build
```

> Note: `_config.yml` changes require a server restart — they are not auto-reloaded.

## Architecture

### Key Files

- `_config.yml` — site-wide settings; also holds `listmonk_list_uuid` for the subscription API
- `index.html`（ja，預設）/ `en/index.html` / `zh-TW/index.html` — language entry points (each sets `lang:` front matter and includes `challenge-body.html`)
- `_includes/challenge-body.html` — 頁面 HTML（6 個 phase 的 markup，i18n 走 `{{ t.xxx }}`）+ 尾端的 `#challenge-config` data island。**這裡已經沒有任何 JS 邏輯**
- `assets/js/challenge.js` — 全部遊戲邏輯（~970 行）。**純 JS，不經過 Liquid**，Jekyll 只是原樣複製；需要 Jekyll 的東西全部從 data island 讀（見下方 Data Island 一節）
- `_data/tasks/` — Ruby challenge task bank per language (easy/medium/hard, 15 tasks each)
- `_data/crosslang/<lang>/` — cross-language task bank per UI language (javascript/python/php, 5 tasks each)
- `_data/crosslang/choices.yml` — 跨語言題的其餘 3 個選項（Ruby 程式碼與 UI 語言無關，只有一份）
- `_layouts/challenge.html` — layout for the challenge page; loads qrcode.min.js, `mruby.js`(emscripten glue) and highlight.js. All `<head>` scripts use `defer`; this is safe because `challenge.js` is loaded as an external `type="module"` (also deferred) at the end of `challenge-body.html`, so it executes after them in document order.
- `_includes/mruby-prelude.rb` — Ruby prelude eval'd at boot; supplies the `require` no-op, `StringIO`, `STDOUT`/`$stdout` and `Kernel#puts` that mruby lacks. 走 Liquid `capture` + `jsonify` 進 data island 的 `prelude` 欄位，escape 由 jsonify 負責 —— 反引號與 `${` 都可以自由使用（2026-08-04 之前是 `String.raw` 內嵌，當時不行）。
- `_includes/cover.html` — Ruby Taiwan cover section SVG artwork
- `_includes/cover-styles.html` — CSS for the cover section
- `tools/mruby-wasm/` — how the wasm is produced: `build.sh`（mise emsdk，無需 docker）、`build_config.rb`、`glue.c`、`spike.mjs`（把整份題庫餵進 VM 的 gate）

### Assets

- `assets/ruby-wasm/mruby.js` — emscripten glue（15.8KB raw / 5.2KB gzip）；定義 `window.createMruby`，用 `locateFile` 指到 `mruby.wasm`
- `assets/ruby-wasm/mruby.wasm` — C mruby 4.0.0 build（1.38MB raw / **441KB gzip**），含 parser（`mruby-compiler`）所以能 eval 玩家輸入的任意字串。gembox：`stdlib` + compiler/random/sprintf/metaprog/bigint/encoding + math/time/struct/pack/rational/complex + **`mattn/mruby-onig-regexp`（Onigmo，sha 釘死）**，**不含 mruby-io**（prelude 自己做 stdout）。編譯開 `MRB_UTF8_STRING`。
  - Onigmo 有兩個建置坑，已在 `build_config.rb` / `build.sh` 處理：`conf.host_target = 'i686-pc-linux-gnu'`（Onigmo 6.2.0 的 `config.sub` 不認得 wasm），以及用 `emar` 從 `.o` 重打包 `libonigmo.a`（libtool 產出的是 96 bytes 空殼）。
  - 重建：`sh tools/mruby-wasm/build.sh`，驗證：`node tools/mruby-wasm/spike.mjs`
  - 沒有 stdlib、沒有 `Encoding` class；真的需要完整 CRuby 語意就 revert PR #3（`ruby.wasm` 17.2MB raw / 4.8MB gzip 還在 git history 的 commit `42034c2`）
- `assets/js/challenge.js` — 遊戲邏輯（39.9KB raw / 11.4KB gzip），純靜態 ESM。以前內嵌在 HTML 裡每次重下，現在進瀏覽器快取
- `assets/js/qrcode.min.js` — `qrcode-generator` UMD bundle; exposes `window.qrcode(typeNumber, errorLevel)`
- `assets/images/rubytw_logo.png` — Ruby Taiwan logo (used in Canvas scorecard)

### Challenge Game Flow (`assets/js/challenge.js`)

6-phase single-page flow, controlled by `switchPhase(name)`（markup 在 `_includes/challenge-body.html`）:

1. **quiz** — 5 standard questions in difficulty gradient (2 easy → 2 medium → 1 hard), drawn from `_data/tasks/<lang>.yml`. Max 3 attempts per question; reveals answer on failure. The variable shown to players is named `gem`.
2. **lang-select** — player picks their primary language (JavaScript / Python / PHP).
3. **crosslang** — 3 cross-language questions from `_data/crosslang/<lang>/<source>.yml`: familiar source-language
   code shown (highlight.js), player **picks** the Ruby equivalent from 4 options（2026-08-04 從自由輸入改成 4 選 1 ——
   原本要打的表達式太長，攤位現場沒人想在手機上輸入 `.split.map(&:capitalize).join(" ")`）。
   - 選項 = 該題 `answer` + `choices.yml` 裡的 3 個，渲染時洗牌
   - 判定**不看標記**：點下去的選項直接丟進 mruby 跑，輸出等於 `expected` 就算對。所以同一題可以有兩個都對的寫法，
     題庫不需要多一個欄位；有 6 題刻意這樣設計（`reduce(:+)`、`reject(&:even?)`、`Array#*` 當 join 之類有教學價值的替代寫法）
   - 機會 2 次（`CROSSLANG_ATTEMPTS`），不是 quiz 的 3 次 —— 4 選 1 給 3 次等於亂猜就過
4. **result** — HTML Canvas 1080×1080 scorecard with logo; Web Share API for IG sharing (falls back to download).
5. **form** — Collects name, email, phone, school; POSTs to the Cloudflare Worker (`listmonk_submit_url`). Failure is non-blocking.
6. **proof** — Completion certificate with QR code, proof code (`RUBY-{score:02d}-{hash8}`), shimmer animation, live clock.

### Task Bank (`_data/tasks/<lang>.yml`)

Each task has:
- `category`, `difficulty` (`easy`/`medium`/`hard`)
- `secret_type`: `integer` | `odd_integer` | `string` | `array`
- `secret_range`, `secret_pool`, `array_length`, `element_range` (depending on type)
- `question` — use `{secret}` (single braces) as placeholder; `{{secret}}` would be processed by Liquid
- `answer` — the Ruby method/operator (e.g. `.next`, `* 2`)
- `tips` — array of `{ code, desc }` hint items

Answer verification uses the wasm VM: after it loads, `computeAllExpected()` runs each question's correct answer through `rubyVM.eval` and stores the output in `q.expected`. (`rubyVM` 是包住 `mrbjs_eval` 的 6 行 shim，介面與 ruby.wasm 的 VM 相同：`eval(src).toString()`。) Non-deterministic methods (`.shuffle`, `.sample`) use a per-question `srand(seed)` to ensure reproducibility. **No `EXPECTED_MAP` or JS reimplementation of Ruby methods needed — any valid Ruby expression can be an `answer`.**

### i18n

Three languages: `zh-TW` (default), `en`, `ja`. Each has:
- `_data/locales/<lang>.yml` — all UI strings
- `_data/tasks/<lang>.yml` — translated task bank
- `<lang>/index.html` (or root `index.html` for zh-TW) — sets `lang:` front matter, includes `challenge-body.html`

`challenge-body.html` 的 HTML 用 `{% assign t = site.data.locales[page.lang] %}`；`challenge.js` 的
UI 字串走 data island 的 `ui` 欄位（同一份 YAML），在 JS 裡是 `UI.<key>`，插值用 `tpl(UI.key, { n: 1 })`。

### listmonk Integration

- Form POSTs to a Cloudflare Worker (`workers/rwc2026-subscribe/`) which relays to `edm.ruby.tw/api`; the Worker's `LISTMONK_LIST_ID` decides which list subscribers land in
- Worker URL configured in `_config.yml` as `listmonk_submit_url`; CORS origin is locked to `https://rwc2026.ruby.tw`
- Deploy the Worker with `wrangler deploy` from its directory (`LISTMONK_API_TOKEN` is a Worker secret)

## Tailwind CSS

Tailwind CSS v4 via `tailwindcss-ruby` gem and a Jekyll `post_write` hook.

- `_css/input.css` — Tailwind source (`@import "tailwindcss"`, `@source` directives; `_` prefix keeps Jekyll from processing it)
- `_plugins/tailwindcss.rb` — runs Tailwind CLI after every Jekyll write cycle
- Output: `_site/assets/css/tailwind.css` (generated, not committed)

Tailwind v4 has no `tailwind.config.js`; all config lives in `_css/input.css`.

## Data Island（JS ↔ Jekyll 的唯一介面）

2026-08-04 起 JS 從 HTML 抽出來了：`assets/js/challenge.js` 是**零 Liquid 的靜態 ESM**
（Jekyll 只是原樣複製它），所有需要 Jekyll 才拿得到的東西都經由 `challenge-body.html`
尾端的 data island 傳遞：

```liquid
{% capture prelude %}{% include mruby-prelude.rb %}{% endcapture %}
<script id="challenge-config" type="application/json">
{ "lang": …, "ui": …, "tasks": …, "crosslang": {…}, "choices": …, "omikuji": …,
  "submitUrl": …, "listUuid": …, "logoUrl": …, "wasmUrl": …, "prelude": … }
</script>
<script type="module" src="…/challenge.js?v={{ site.time | date: '%s' }}"></script>
```

`challenge.js` 檔頭 `JSON.parse` 它，還原成 `UI` / `PAGE_LANG` / `TASK_DEFS` / `CROSSLANG_DEFS`
/ `CROSSLANG_CHOICES` / `OMIKUJI_DEFS` / `SUBMIT_URL` / `LISTMONK_LIST_UUID` / `LOGO_URL`
/ `WASM_URL` / `PRELUDE`。要加新的注入值就在這兩邊各加一行。

三個規矩：

1. **`challenge.js` 裡不要放 Liquid** —— 它不會被處理，只會變成語法錯誤。反過來說，backtick、
   `${}`、`{{`、`{%` 在那個檔案裡都是安全的。
2. **每個 `jsonify` 後面要接 `| replace: '</', '<\/'`**。locale 裡有 HTML（`result_tag_reminder`
   的 `<strong>`），萬一哪天出現 `</script` 會直接把 data island 切斷。`<\/` 是合法 JSON escape。
3. **HTML 部分照舊**：`{{ t.xxx }}` 只在 `challenge-body.html` 的 markup 用；`_data/tasks/*.yml`
   的 `question` 仍用 `{secret}` 單大括號（Liquid 不碰單大括號）。

`?v={{ site.time | date: '%s' }}` 是 build 時間當版號，避免現場 deploy 後訪客拿到快取裡的舊 JS。

## 選択式モード（2026-11-20）

- `_config.yml`：`quiz_mode: choice`（`legacy` で旧 5 問コード入力版に戻る）、`choice_question_count: 3`、`crosslang_enabled: true|false`。
- 題庫：`_data/quiz/{ja,en,zh-TW}.yml`（question / code(任意) / answer / wrong×3 / explanation(任意)）。前田さんは YAML だけ編集すればよい。題數 > 3 時は毎回ランダム抽出。現在は動作確認用プレースホルダー 4 問。
- JS：`challenge.js` の `bootChoice` / `pickChoice` / `phase-choice`（challenge-body.html）。4 択は 2 回まで、尽きたら正解表示。`TOTAL_QUESTIONS` は動的（選択式 3 ＋ crosslang 有効なら 3）、結果の評価は割合（≥85% / ≥50%）。
- 正誤判定は**選択式も mruby で実行**する（`judgeChoice`）：`code` があれば実行結果＝選択肢の文字列が正解、`code` が無い問題は `check`（選択肢を `%s` に代入して `true` になれば正解。例 `"%s.is_a?(Symbol)"`）、どちらも無ければ YAML の `answer`。VM が起動していない時だけ `answer` にフォールバック。`crosslang_enabled: false` でも mruby WASM は読み込む。
- `tools/mruby-wasm/spike.mjs`（CI の mruby-gate）が `_data/quiz` の全選択肢を実行し、「判定が正解になるのは `answer` だけ」を検査する（`ruby` が必要）。
- 日本語版タイトルは原題「Ruby 互動煉金術」に戻した（市の提案 11/17）。
- 未確定：「3 問答え終わり＝通関」の定義と、300 個の記念品の確認方法（市に質問中）。
