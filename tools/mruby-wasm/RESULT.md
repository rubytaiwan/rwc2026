# mruby.wasm 實驗結果（2026-08-04）

分支 `exp/mruby-wasm`。把引擎從 CRuby `ruby.wasm` 換成 C mruby 4.0.0 編出的 wasm。
2026-08-04 經 PR #3 merge 進 `main`（攤位本身是實驗性專案，這是刻意的選擇）。

## 體積

| 檔案 | raw | gzip |
|---|---|---|
| `assets/ruby-wasm/mruby.wasm` | 1,384,540 | **440,625** |
| `assets/ruby-wasm/mruby.js`（emscripten glue） | 15,786 | 5,217 |
| **合計** | 1,400,326 | **445,842** |
| `assets/ruby-wasm/ruby.wasm`（`main`，CRuby 無 stdlib） | 17,190,431 | ~4,800,000 |

**4.8 MB → 0.45 MB gzip，約 11×。**

體積是逐步決定的，記錄一下每一段換到什麼：

| 組成 | gzip | 為什麼收 |
|---|---|---|
| 最小可用（題庫 27 個 answer 剛好跑得動） | 265 KB | — |
| + math / time / struct / pack / rational / complex | 301 KB（+37 KB） | 常見但題庫還沒用到；先收，日後加題目大多不必重建 wasm |
| + Regexp（Onigmo） | 441 KB（+140 KB） | 跨語言題是**自由輸入**，玩家想用 `gsub(/l/,"L")` 解題時不該拿到 `NameError` |

CI 的 gate 會擋住「answer 用到沒編進去的東西」，但擋住之後還是得有人跑 `build.sh` ——
所以寧可先把常見的收進來。

### 這顆裡面有 / 沒有什麼

```
有：Array/String/Hash/Range/Enumerable/Numeric/Symbol 全套 ext、Set、Comparable、
    Enumerator、bigint（2**100）、sprintf / String#%、metaprog、UTF-8、
    Regexp（Onigmo，含 $1 / scan / match / block 形式 / 日文）、
    Math、Time、Struct、pack/unpack、Rational、Complex
沒有：JSON、mruby-io（stdout 由 prelude 代勞）、stdlib 的 .rb（mruby 本來就沒有）
```

### Regexp 的選擇與兩個建置坑

選 `mattn/mruby-onig-regexp`（Onigmo，**CRuby 自己用的引擎**，2026-06 還有 commit，sha 已釘死）。
其他選項都不行：`mruby-hs-regexp` 停在 2016、還在用 mruby 1.x 的 `ARGS_ANY()`，
**直接編不過**（`error: call to undeclared function 'ARGS_ANY'`）；PCRE 兩顆要外部庫、
語意也與 Ruby 不同。Onigmo 上游停在 6.2.0（2019）不是問題 —— Ruby 自己就用它。

加下去會踩兩個坑，都已寫進 `build_config.rb` / `build.sh`：

1. gem 把 `--host <build 名稱>` 傳給 Onigmo 的 `configure`，而 Onigmo 6.2.0 的 `config.sub`
   完全不認得 wasm（`machine 'wasm' not recognized` → rake abort）。解法是餵一個它認得的
   三元組（CC/LD/AR 早就被 emscripten toolchain 指向 emcc/emar 了）：
   ```ruby
   conf.host_target = 'i686-pc-linux-gnu'
   ```
2. libtool 產出的 `.libs/libonigmo.a` 是 96 bytes 的空殼，連結會噴
   `undefined symbol: OnigEncodingUTF_8`。`build.sh` 用 `emar` 從 `.o` 重打包（約 1.5 MB）：
   ```sh
   emar rcs tmp/libonigmo.a $(find <build>/mrbgems/mruby-onig-regexp/onigmo-6.2.0 -name '*.o' -not -path '*/.libs/*')
   ```

gate 有 9 條正規式回歸測試（`=~`、`gsub`、`sub` block、`match[1]`、`scan`、`===`、
`$1`、日文、以及「字串樣式版的 gsub 沒被搞壞」）。瀏覽器實測：玩家輸入
`"hello world".gsub(/\bw/) { |c| c.upcase }` 回 `hello World`。

## 啟動成本（Chrome，M 系列 Mac，本機 localhost，兩邊同機同法量測）

| 階段 | mruby | 階段 | CRuby（`origin/main`） |
|---|---|---|---|
| `createMruby()`（instantiate + 編譯） | 21 ms | `WebAssembly.compileStreaming` | 86 ms |
| `mrb_open()` | <1 ms | `DefaultRubyVM(module)` | 113 ms |
| eval prelude | 1 ms | `require "stringio"` | <1 ms |
| 5 次 eval（等同 `computeAllExpected`） | <1 ms | 5 次 eval | 2 ms |
| **合計** | **22 ms** | **合計** | **201 ms** |

約 **9×**。注意這是本機、檔案已在快取的情況；攤位現場真正的差別是下載量
（441 KB vs 4.8 MB），行動網路下差距會被放大得多。CRuby 那邊的 86 ms 還可能受
Chrome code cache 眷顧（同一顆 module 先前已編譯過），屬樂觀值。

## Gate — `node tools/mruby-wasm/spike.mjs`

```
=== quiz answers（_data/tasks/zh-TW.yml） ===   15/15 ok
=== crosslang answers（逐字元比對 expected）===  45/45 ok（zh-TW/en/ja × js/python/php）
=== srand 決定性 / rand ===                     ok（同 seed 同結果、不同 seed 不同結果、rand(12) ∈ 0..11）
=== UTF-8（MRB_UTF8_STRING）===                 ok（"日本語です".size == 5、.reverse 正確）
=== Regexp（Onigmo）===                         9/9 ok（=~ / gsub / sub block / match[1] / scan / === / $1 / 日文）
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

| | mruby 4.0（現行） | CRuby 4.0（換掉的） |
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
