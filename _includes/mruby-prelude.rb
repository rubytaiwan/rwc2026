# 開機時 eval 一次，補上 mruby 沒有但 challenge-body.html 需要的東西。
# 放檔案而不是編進 glue.c，改這裡不用重建 wasm。
#
# ⚠️ 這個檔案會被 challenge-body.html 用 String.raw + Liquid include 內嵌進 JS template literal，
#    所以整份檔案不能出現反引號，也不能出現 dollar-brace，否則 literal 會提早結束、
#    頁面整段 JS 直接掛掉。tools/mruby-wasm/spike.mjs 會擋這件事。
#
# 這樣一來 challenge-body.html 的兩個 stdout 攔截 wrapper（runRuby / computeAllExpected）
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

  # CRuby Kernel#puts 語意：陣列展開逐行、已有換行不再補、無參數只換行。
  def puts(*a)
    if a.empty?
      @s << "\n"
      return nil
    end
    a.each do |x|
      if x.is_a?(Array)
        x.empty? ? (@s << "\n") : puts(*x)
      else
        s = x.nil? ? "" : x.to_s
        @s << s
        @s << "\n" unless s.end_with?("\n")
      end
    end
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
