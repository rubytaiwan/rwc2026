# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jekyll 4.4.x static site for the COSCUP 2026 Ruby Taiwan booth challenge game. Uses Minima theme, jekyll-feed plugin, Tailwind CSS v4 (via `tailwindcss-ruby`), and WebAssembly for in-browser Ruby execution.

> **引擎是 C mruby 4.0 編出來的 wasm**（441 KB gzip），2026-08-04 從 CRuby `ruby.wasm`
> （4.8 MB gzip）換過來（PR #3）。這是刻意的實驗：攤位本身就是實驗性專案。
> 要回 CRuby 就 revert 那個 merge —— `ruby.wasm` 與 `browser.umd.js` 還在 git history 裡
> （commit `42034c2`），`_includes/challenge-body.html` 的 `initRuby()` 也會一併還原。

## Current Status（2026-08-02）

本 repo 由 `rubytaiwan/sitcon2026-booth` 的 PR #2 branch（`claude/tender-sinoussi-e11ea1`，跨語言功能）直接遷移而來（push 保留完整 history，非 fork）。舊 repo 凍結於 SITCON 狀態，其 PR #2 尚未留言關閉。

### 已完成並上線

- **部署**：`https://coscup2026.ruby.tw`（GitHub Pages + Actions，HTTPS 已強制；DNS 為 Cloudflare 灰雲 CNAME → `rubytaiwan.github.io`）
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

- [ ] Template 6 內的取消訂閱連結 `edm.ruby.tw/subscription/manage?uuid=…` 端點尚未建置（目前 404，屬預期，後續會補）
- [ ] 舊 repo PR #2：留言說明遷移至本 repo 後關閉
- [ ] 刪除 listmonk 測試資料：subscriber `ryudo@5xruby.com`（id 1105，E2E 測試用）
- [ ] 活動後輪替/移除 listmonk 的 `automation-api` API user（token 曾出現於對話）
- [ ] 現場實測：PHP 跨語言題組、EN/JA 完整流程（SITCON 時未測完的部分）
- 跨語言題庫每語言僅 5 題抽 3，重複率偏高；如需降低可擴充至 8–10 題

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
- `index.html` / `en/index.html` / `ja/index.html` — language entry points (each sets `lang:` front matter and includes `challenge-body.html`)
- `_includes/challenge-body.html` — main challenge page logic (4-phase game flow, i18n-aware)
- `_data/tasks/` — Ruby challenge task bank per language (easy/medium/hard, 15 tasks each)
- `_data/crosslang/<lang>/` — cross-language task bank per UI language (javascript/python/php, 5 tasks each)
- `_layouts/challenge.html` — layout for the challenge page; loads qrcode.min.js, `mruby.js`(emscripten glue) and highlight.js. All `<head>` scripts use `defer`; this is safe because the inline script in `challenge-body.html` is `type="module"` (also deferred) and runs after them in document order.
- `_includes/mruby-prelude.rb` — Ruby prelude eval'd at boot; supplies the `require` no-op, `StringIO`, `STDOUT`/`$stdout` and `Kernel#puts` that mruby lacks. **It is inlined into JS via ``String.raw`{% include %}` `` — no backticks or `${` allowed in that file** (`tools/mruby-wasm/spike.mjs` guards this).
- `_includes/cover.html` — Ruby Taiwan cover section SVG artwork
- `_includes/cover-styles.html` — CSS for the cover section
- `tools/mruby-wasm/` — how the wasm is produced: `build.sh`（mise emsdk，無需 docker）、`build_config.rb`、`glue.c`、`spike.mjs`（把整份題庫餵進 VM 的 gate）

### Assets

- `assets/ruby-wasm/mruby.js` — emscripten glue（15.8KB raw / 5.2KB gzip）；定義 `window.createMruby`，用 `locateFile` 指到 `mruby.wasm`
- `assets/ruby-wasm/mruby.wasm` — C mruby 4.0.0 build（1.38MB raw / **441KB gzip**），含 parser（`mruby-compiler`）所以能 eval 玩家輸入的任意字串。gembox：`stdlib` + compiler/random/sprintf/metaprog/bigint/encoding + math/time/struct/pack/rational/complex + **`mattn/mruby-onig-regexp`（Onigmo，sha 釘死）**，**不含 mruby-io**（prelude 自己做 stdout）。編譯開 `MRB_UTF8_STRING`。
  - Onigmo 有兩個建置坑，已在 `build_config.rb` / `build.sh` 處理：`conf.host_target = 'i686-pc-linux-gnu'`（Onigmo 6.2.0 的 `config.sub` 不認得 wasm），以及用 `emar` 從 `.o` 重打包 `libonigmo.a`（libtool 產出的是 96 bytes 空殼）。
  - 重建：`sh tools/mruby-wasm/build.sh`，驗證：`node tools/mruby-wasm/spike.mjs`
  - 沒有 stdlib、沒有 `Encoding` class；真的需要完整 CRuby 語意就 revert PR #3（`ruby.wasm` 17.2MB raw / 4.8MB gzip 還在 git history 的 commit `42034c2`）
- `assets/js/qrcode.min.js` — `qrcode-generator` UMD bundle; exposes `window.qrcode(typeNumber, errorLevel)`
- `assets/images/rubytw_logo.png` — Ruby Taiwan logo (used in Canvas scorecard)

### Challenge Game Flow (index.html)

6-phase single-page flow, controlled by `switchPhase(name)`:

1. **quiz** — 5 standard questions in difficulty gradient (2 easy → 2 medium → 1 hard), drawn from `_data/tasks/<lang>.yml`. Max 3 attempts per question; reveals answer on failure. The variable shown to players is named `gem`.
2. **lang-select** — player picks their primary language (JavaScript / Python / PHP).
3. **crosslang** — 3 cross-language questions from `_data/crosslang/<lang>/<source>.yml`: familiar source-language code shown, player writes the Ruby equivalent (highlight.js syntax highlighting).
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

`challenge-body.html` reads `{% assign t = site.data.locales[page.lang] %}` for all UI text.

### listmonk Integration

- Form POSTs to a Cloudflare Worker (`workers/coscup2026-subscribe/`) which relays to `edm.ruby.tw/api`; the Worker's `LISTMONK_LIST_ID` decides which list subscribers land in
- Worker URL configured in `_config.yml` as `listmonk_submit_url`; CORS origin is locked to `https://coscup2026.ruby.tw`
- Deploy the Worker with `wrangler deploy` from its directory (`LISTMONK_API_TOKEN` is a Worker secret)

## Tailwind CSS

Tailwind CSS v4 via `tailwindcss-ruby` gem and a Jekyll `post_write` hook.

- `_css/input.css` — Tailwind source (`@import "tailwindcss"`, `@source` directives; `_` prefix keeps Jekyll from processing it)
- `_plugins/tailwindcss.rb` — runs Tailwind CLI after every Jekyll write cycle
- Output: `_site/assets/css/tailwind.css` (generated, not committed)

Tailwind v4 has no `tailwind.config.js`; all config lives in `_css/input.css`.

## Liquid / JS Template Gotcha

Jekyll processes `{{ }}` inside `<script>` blocks. Use `{secret}` (single braces) as JS/YAML placeholders that Liquid won't touch. Only use `{{ }}` for intentional Jekyll injections (e.g. `{{ site.data.tasks | jsonify }}`).
