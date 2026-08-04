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
  🎋 加碼抽一支「Ruby 御神籤」，由 Ruby WASM 抽出運勢籤詩卡，可分享 IG
```

---

## 技術棧

| 項目 | 說明 |
|------|------|
| [Jekyll 4.4](https://jekyllrb.com/) | 靜態網站產生器 |
| [Tailwind CSS v4](https://tailwindcss.com/) | 樣式（via `tailwindcss-ruby` gem）|
| [Ruby WASM](https://github.com/ruby/ruby.wasm) | 在瀏覽器中執行真實 Ruby 4.0（`ruby.wasm`，無 stdlib）|
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | QR Code 產生 |
| [highlight.js](https://highlightjs.org/) | 跨語言題的語法上色 |
| [listmonk](https://listmonk.app/) | 電子報訂閱後台 |
| HTML Canvas API | 成績單圖片繪製 |
| Web Share API | 手機原生分享至 Instagram |

### 頁面重量

首次載入約 **4.8 MB**（gzip），其中 4.8 MB 全是 `ruby.wasm`；所有 JS 加起來約 100 KB。
攤位現場每位訪客都要拉一份 wasm，所以任何瘦身都該從這個檔案下手 —— bundler 的
tree-shaking 動不到它，最佳情況也只省全站 0.4%，故本專案不使用 Vite/esbuild。

改用不含 stdlib 的 `ruby.wasm`（17.2 MB raw）而非 `ruby+stdlib.wasm`（32.5 MB raw）：
題庫答案與御神籤只用 core Ruby，輸出攔截用的 `StringIO` 是編進 binary 的 built-in
extension，不需要 stdlib。若日後有題目答案需要 `require` 真正的 stdlib，改回
`ruby+stdlib.wasm` 並同步 `_includes/challenge-body.html` 的 `wasmUrl`。

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

新增題目只需在 `_data/tasks/<lang>.yml` 加入對應格式的 YAML 即可。答案驗證由 Ruby WASM 執行正確答案後比對輸出，`answer` 欄位可以是任意合法的 Ruby 運算式。

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
