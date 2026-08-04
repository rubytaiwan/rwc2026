# Ruby 互動煉金術 — COSCUP 2026 攤位

**Ruby Taiwan × COSCUP 2026** 攤位互動挑戰遊戲。

🌐 **https://coscup2026.ruby.tw**

---

## 這是什麼？

一個跑在手機瀏覽器上的 Ruby 互動答題遊戲，讓 COSCUP 參加者能在攤位體驗真實執行 Ruby 程式碼的樂趣。

玩家回答 5 題 Ruby 基礎題 + 3 題跨語言對照題（JavaScript / Python / PHP 擇一），每題最多 3 次機會，全部完成後可至攤位領取小禮物。

### 遊戲流程

```
Phase 1：答題
  5 題基礎挑戰（2 Easy → 2 Medium → 1 Hard）
  答對自動進入下一題；答錯最多 3 次，超過後顯示正確答案
        ↓
Phase 2：跨語言挑戰
  選擇你熟悉的語言（JS / Python / PHP）
  看原語言程式碼，寫出等效的 Ruby（3 題）
        ↓
Phase 3：成績單
  1080×1080 成績卡圖片，可分享至 Instagram
        ↓
Phase 4：填寫資料
  暱稱、Email、手機、學校
  可選訂閱 Ruby Taiwan 電子報
        ↓
Phase 5：完成證明
  通關代碼 + QR Code + 動態背景
  出示給攤位工作人員領取小禮物
  🎋 加碼抽一支「Ruby 御神籤」，由 mruby WASM 抽出運勢籤詩卡，可分享 IG
```

---

## 技術棧

| 項目 | 說明 |
|------|------|
| [Jekyll 4.4](https://jekyllrb.com/) | 靜態網站產生器 |
| [Tailwind CSS v4](https://tailwindcss.com/) | 樣式（via `tailwindcss-ruby` gem）|
| [mruby](https://github.com/mruby/mruby) | 在瀏覽器中執行 mruby 4.0（C mruby → WebAssembly，含 parser）|
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | QR Code 產生 |
| [highlight.js](https://highlightjs.org/) | 跨語言題的語法上色 |
| [listmonk](https://listmonk.app/) | 電子報訂閱後台 |
| HTML Canvas API | 成績單圖片繪製 |
| Web Share API | 手機原生分享至 Instagram |

### 頁面重量

> 引擎是 C mruby（2026-08-04 從 CRuby 換過來）。這是刻意的實驗 —— 攤位本身就是實驗性專案。

首次載入約 **0.45 MB**（gzip），其中 wasm 佔 441 KB。

| | raw | gzip |
|---|---|---|
| `mruby.wasm`（現行） | 1.38 MB | **441 KB** |
| `mruby.js`（emscripten glue） | 16 KB | 5 KB |
| `ruby.wasm`（換掉的 CRuby，無 stdlib） | 17.2 MB | 4.8 MB |

**11× 的差距**，且 VM 啟動（instantiate + `mrb_open` + prelude + 5 題預先求值）實測 **22 ms**
（CRuby 版同機同法 201 ms）。

代價：mruby 沒有 stdlib、沒有 `Encoding` class（UTF-8 靠 `MRB_UTF8_STRING` 編譯選項）。
題庫 27 個 answer 全部驗證過（`node tools/mruby-wasm/spike.mjs`，CI 也會跑）。
需要完整 CRuby 語意就 revert 那次引擎切換（PR #3）。

除了題庫用到的之外，build 還多收了幾樣玩家可能自己用上的東西：
Regexp（Onigmo，CRuby 同引擎，+140 KB gzip —— 跨語言題是自由輸入，
有人想用 `gsub(/l/,"L")` 解題時不該拿到 `NameError`）、
math / time / struct / pack / rational / complex（+37 KB gzip）。

wasm 的重建方式與 gate 測試都放在 `tools/mruby-wasm/`（用 mise 的 emsdk，不需要 docker）。
bundler 的 tree-shaking 對這條路線同樣無效 —— 所有 JS 加起來約 100 KB，故本專案不使用 Vite/esbuild。

---

## 本地開發

### 前置需求

- Ruby（建議用 [rbenv](https://github.com/rbenv/rbenv) 或 [mise](https://mise.jdx.dev/) 管理）
- Bundler

### 安裝與啟動

```bash
git clone https://github.com/rubytaiwan/coscup2026-booth
cd coscup2026-booth
bundle install
bundle exec jekyll serve
```

瀏覽器開啟 http://127.0.0.1:4000

> `_config.yml` 的修改需要重啟 server 才會生效。

---

## 題庫

### 基礎題

題庫支援三語言（`zh-TW` / `en` / `ja`），各放在 `_data/tasks/<lang>.yml`，分為三個難度。每次遊戲隨機抽出 2 Easy + 2 Medium + 1 Hard，共 5 題。

新增題目只需在 `_data/tasks/<lang>.yml` 加入對應格式的 YAML 即可。答案驗證由 mruby WASM 執行正確答案後比對輸出，`answer` 欄位可以是任意合法的 Ruby 運算式。

### 跨語言題

放在 `_data/crosslang/<lang>/{javascript,python,php}.yml`（`<lang>` 是 UI 語言，檔名是玩家選擇的來源語言）。每種來源語言 5 題，每次隨機抽 3 題。

---

## 部署

本專案透過 GitHub Actions 部署 GitHub Pages 於 **https://coscup2026.ruby.tw**。

訂閱 API 經 Cloudflare Worker（`workers/coscup2026-subscribe/`）代轉至 [Ruby Taiwan listmonk](https://edm.ruby.tw)。

> **上線前必改**：在 listmonk 建立 COSCUP 2026 list 後，更新 `workers/coscup2026-subscribe/worker.js` 的 `LISTMONK_LIST_ID` 與 `_config.yml` 的 `listmonk_list_uuid`，再以 `wrangler deploy` 部署 Worker。

---

## 授權

MIT License © Ruby Taiwan
