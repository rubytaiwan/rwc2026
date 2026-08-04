# mruby.wasm 實驗結果（2026-08-04）

分支 `exp/mruby-wasm`。把引擎從 CRuby `ruby.wasm` 換成 C mruby 4.0.0 編出的 wasm。
`main` 未受影響，線上仍是 CRuby。

## 體積

| 檔案 | raw | gzip |
|---|---|---|
| `assets/ruby-wasm/mruby.wasm` | 794,394 | **265,239** |
| `assets/ruby-wasm/mruby.js`（emscripten glue） | 11,331 | 4,085 |
| **合計** | 805,725 | **269,324** |
| `assets/ruby-wasm/ruby.wasm`（`main`，CRuby 無 stdlib） | 17,190,431 | ~4,800,000 |

**4.8 MB → 0.27 MB gzip，約 18×。**

## 啟動成本（Chrome，M 系列 Mac，本機 localhost）

在頁面 console 逐段量測：

| 階段 | ms |
|---|---|
`createMruby()`（instantiate + wasm 編譯） | 21
`mrb_open()` | <1
eval prelude | 1
`computeAllExpected()` 等值的 5 次 eval | <1
**合計** | **22**

（CRuby 版要先 `compileStreaming` 一顆 17 MB 的 module，量級差異來自這裡。）

## Gate — `node tools/mruby-wasm/spike.mjs`

```
=== quiz answers（_data/tasks/zh-TW.yml） ===   15/15 ok
=== crosslang answers（逐字元比對 expected）===  45/45 ok（zh-TW/en/ja × js/python/php）
=== srand 決定性 / rand ===                     ok（同 seed 同結果、不同 seed 不同結果、rand(12) ∈ 0..11）
=== UTF-8（MRB_UTF8_STRING）===                 ok（"日本語です".size == 5、.reverse 正確）
=== 玩家亂打 ===                                 NoMethodError / SyntaxError 皆轉成字串，VM 不掛
✅ GATE PASS
```

## 瀏覽器實測（localhost:4321）

- 狀態列 `✅ mruby 4.0 就緒`
- 完整跑一輪：quiz 5 題（含 seeded `.shuffle`）+ crosslang 3 題 → **8/8**，`cc=8`
- 成績卡 Canvas 1080×1080 正常繪出（dataURL 1.5 MB）
- proof 頁：proof code `RUBY-08-…`、QR 以 SVG 繪出、live clock 正常
- 御神籤：`rand(12)` 走 mruby（非 JS fallback），籤詩 Canvas 1080×1080 有畫出內容
- 無效輸入（`.foo` / `.map { |x| x` / 未閉合字串 / `.sort` 用在 Integer 上）→ 顯示紅字錯誤且**不消耗**作答次數，行為與 CRuby 版相同
- 沒有殘留對 `ruby.wasm` / `browser.umd.js` 的請求

**未測**：form 送出（會 POST 到 production Cloudflare Worker，寫真實 listmonk subscriber 並寄信）。

## 與 CRuby 的行為差異

| | mruby 4.0（本分支） | CRuby 4.0（main） |
|---|---|---|
| 例外訊息 | `undefined method 'foo' for Array` | `... for an instance of Array` |
| SyntaxError | 由 glue 轉成字串回傳（`SyntaxError: syntax error`），parser 訊息走 `console.debug` | 直接 throw 到 JS，由 `catch` 顯示 |
| `require` / stdlib | 沒有；prelude 提供 no-op + `StringIO` | 有（本 build 無 stdlib `.rb`，但 StringIO 是 built-in ext） |
| `Encoding` class | 沒有（UTF-8 靠 `MRB_UTF8_STRING`） | 有 |
| 大數 | 靠 `mruby-bigint`（已收） | 原生 |
| 執行 timeout | 沒有（與 CRuby 版相同，不是退步） | 沒有 |

## 建置

```sh
sh tools/mruby-wasm/build.sh      # 用 mise 的 emsdk，不需要 docker
node tools/mruby-wasm/spike.mjs   # gate
```

踩到的兩個坑（已在程式碼中處理）：

1. emsdk 會把 `clang` 放進 PATH，而那顆 LLVM 沒有預設 target；mruby 的 host build（產 `mrbc`）
   拿它去編會噴 `unknown target triple 'unknown'`。→ `build_config.rb` 把 host build 釘在 `/usr/bin/clang`。
2. prelude 以 ``String.raw`{% include %}` `` 內嵌進頁面 JS，檔案裡出現反引號會提早關掉
   template literal、整段頁面 JS 掛掉（狀態列會卡在初始文字，console 沒有錯誤可看）。
   → `spike.mjs` 開頭會擋這件事。
