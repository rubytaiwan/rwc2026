# mruby → WebAssembly build config for the COSCUP booth challenge.
#
# 對應 host 端已驗證的 mruby 4.0.0（mise: ruby@mruby-4.0.0）。
# 目標：能在瀏覽器 eval 玩家輸入的任意 Ruby 字串，體積遠小於 CRuby ruby.wasm（4.8MB gzip）。

# host build：只為了產 mrbc 與 presym 掃描。
# emsdk 在 PATH 裡的 `clang` 是沒有預設 target 的 LLVM（會噴 unknown target triple 'unknown'），
# 所以這裡釘死系統 clang。
MRuby::Build.new do |conf|
  conf.toolchain :clang
  conf.cc.command = ENV['HOST_CC'] || '/usr/bin/clang'
  conf.cxx.command = ENV['HOST_CXX'] || '/usr/bin/clang++'
  conf.linker.command = conf.cc.command
  conf.archiver.command = '/usr/bin/ar'
  conf.gem core: 'mruby-compiler'
  conf.gem core: 'mruby-bin-mrbc'
end

MRuby::CrossBuild.new('wasm') do |conf|
  conf.toolchain :emscripten

  conf.gembox 'stdlib'            # array/string/numeric/enum/symbol/object-ext, compar-ext, set...
  conf.gem core: 'mruby-compiler' # mrb_load_string —— runtime eval 的關鍵
  conf.gem core: 'mruby-random'   # srand / rand / Array#shuffle / Array#sample
  conf.gem core: 'mruby-sprintf'  # inspect 的 float / escape 路徑
  conf.gem core: 'mruby-metaprog' # respond_to? 等，玩家亂打時錯誤訊息比較像樣
  conf.gem core: 'mruby-bigint'   # host build 有；2**100 才會與 CRuby 一致
  conf.gem core: 'mruby-encoding' # 3.4+ 會自動開啟 MRB_UTF8_STRING

  # 題庫現在沒用到，但常見到值得先收：共 +37KB gzip，換「加題目不必碰 emsdk」。
  conf.gem core: 'mruby-math'     # Math.sqrt
  conf.gem core: 'mruby-time'     # Time.now
  conf.gem core: 'mruby-struct'   # Struct.new
  conf.gem core: 'mruby-pack'     # Array#pack / String#unpack
  conf.gem core: 'mruby-rational' # Rational(1, 2)
  conf.gem core: 'mruby-complex'  # Complex(1, 2)
  # 仍然沒有的：Regexp（mruby core 沒有，要外部 mruby-onig-regexp + Onigmo）

  # ponytail: 刻意不收 mruby-io（prelude.rb 自己做 puts/$stdout/StringIO）與 mruby-bin-*（不需要 CLI）
  # 上限：若哪天要讀檔或 socket，才需要 stdlib-io gembox + POSIX HAL。

  # host build 沒開這個 flag，"日本語です".size 會是 15 而不是 5。
  conf.cc.defines << 'MRB_UTF8_STRING'
end
