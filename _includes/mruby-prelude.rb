# 開機時 eval 一次，補上 mruby 沒有但 challenge.js 需要的東西。
# 放檔案而不是編進 glue.c，改這裡不用重建 wasm。
#
# challenge-body.html 用 Liquid capture + jsonify 把整份檔案塞進 #challenge-config
# data island 的 "prelude" 欄位，escape 由 jsonify 負責 —— 反引號與 dollar-brace
# 都可以自由使用（2026-08 之前是 String.raw 內嵌，當時不行）。
#
# 這樣一來 challenge.js 的兩個 stdout 攔截 wrapper（runRuby / computeAllExpected）
# 可以一字不改地在 mruby 上跑：require 'stringio' 被吃掉、$stdout = StringIO.new 有類別可用、
# ensure $stdout = STDOUT 有常數可指。

class StringIO
  def initialize(s = "")
    @s = s
  end

  def write(*a)
    a.each { |x| @s << x.to_s }
    @s.size
  end

  def print(*a)
    write(*a)
    nil
  end

  def putc(c)
    @s << (c.is_a?(Integer) ? c.chr : c.to_s[0])
    c
  end

  # CRuby Kernel#puts 語意：陣列遞迴展開逐行、已有換行不再補、無參數只換行、
  # 空陣列什麼都不印（flatten 順便處理掉巢狀與空陣列兩件事）。
  def puts(*a)
    return write("\n") if a.empty?
    a.flatten.each { |x| s = x.to_s; write(s.end_with?("\n") ? s : s + "\n") }
    nil
  end

  def string
    @s
  end
end

# 沒被攔截時的黑洞。wrapper 的 ensure $stdout = STDOUT 需要它存在。
# ponytail: 不接 console —— 這個遊戲的輸出一律經由 StringIO 取回，真的要 debug 用 JS console。
STDOUT = StringIO.new
$stdout = STDOUT

module Kernel
  # mruby 沒有 require；題目 wrapper 的 require 'stringio' 由此接住。
  def require(_feature)
    true
  end

  # mruby 的 puts 來自 mruby-io gem，我們沒收，所以自己接到 $stdout。
  def puts(*a)
    $stdout.puts(*a)
  end

  def print(*a)
    $stdout.print(*a)
  end

  def p(*a)
    a.each { |x| $stdout.puts(x.inspect) }
    a.size <= 1 ? a[0] : a
  end
end
