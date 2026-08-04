#!/bin/sh
# 建 mruby → WebAssembly，產物落在 assets/ruby-wasm/mruby.{js,wasm}
#
# 在 repo 根目錄執行：sh tools/mruby-wasm/build.sh
#
# 需要：ruby + rake（跑 mruby 的 build system）、emscripten（emcc/em++/emar）。
# 沒有 emcc 時自動走 mise：mise install emsdk@latest
# ponytail: 不用 docker —— 只是為了一個 emcc 而拉整個 image 不划算。
set -e

MRUBY_TAG="${MRUBY_TAG:-4.0.0}"   # 對齊 host 端已驗證的 mise ruby@mruby-4.0.0
OUT_DIR="assets/ruby-wasm"
SRC_DIR="${MRUBY_SRC:-tmp/mruby-$MRUBY_TAG}"

[ -f tools/mruby-wasm/glue.c ] || { echo "請在 repo 根目錄執行"; exit 1; }
mkdir -p "$OUT_DIR" tmp

# emcc 不在 PATH 就用 mise 代跑
if command -v emcc >/dev/null 2>&1; then
  RUN=""
else
  command -v mise >/dev/null 2>&1 || { echo "找不到 emcc，也沒有 mise"; exit 1; }
  mise install emsdk@latest
  RUN="mise exec emsdk@latest --"
fi

[ -d "$SRC_DIR" ] || git clone --depth 1 -b "$MRUBY_TAG" https://github.com/mruby/mruby "$SRC_DIR"
cp tools/mruby-wasm/build_config.rb "$SRC_DIR/build_config/wasm.rb"

( cd "$SRC_DIR" && MRUBY_CONFIG=build_config/wasm.rb $RUN rake -j"$(sysctl -n hw.ncpu 2>/dev/null || nproc)" )

$RUN emcc tools/mruby-wasm/glue.c "$SRC_DIR/build/wasm/lib/libmruby.a" \
  -I "$SRC_DIR/include" -I "$SRC_DIR/build/wasm/include" \
  -O3 -fwasm-exceptions -sSUPPORT_LONGJMP=wasm \
  -sMODULARIZE=1 -sEXPORT_NAME=createMruby -sENVIRONMENT=web,node \
  -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 \
  -sEXPORTED_FUNCTIONS=_mrbjs_init,_mrbjs_eval,_free \
  -sEXPORTED_RUNTIME_METHODS=ccall,UTF8ToString \
  -o "$OUT_DIR/mruby.js"

echo
echo "=== 產物大小 ==="
for f in "$OUT_DIR/mruby.js" "$OUT_DIR/mruby.wasm"; do
  printf '%-32s raw %9s  gzip %9s\n' "$f" "$(wc -c < "$f")" "$(gzip -9c "$f" | wc -c)"
done
echo "（對照：assets/ruby-wasm/ruby.wasm = 17,190,431 raw / ~4.8MB gzip）"
