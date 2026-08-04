/*
 * Emscripten glue for mruby: one long-lived mrb_state, one eval entry point.
 *
 * mrbjs_eval() 一律回傳字串（malloc'd，JS 端負責 _free）：
 *   - 正常求值 → 結果的 to_s
 *   - 例外逃出（SyntaxError 等 Ruby 端 rescue 接不到的）→ "ClassName: message"
 * 這樣 challenge-body.html 的 `result.includes('Error:')` sniff 不需要改。
 */
#include <string.h>
#include <mruby.h>
#include <mruby/compile.h>
#include <mruby/string.h>
#include <mruby/class.h>
#include <emscripten.h>

static mrb_state *mrb;

EMSCRIPTEN_KEEPALIVE
int mrbjs_init(void)
{
  if (mrb) return 0;
  mrb = mrb_open();
  return mrb ? 0 : 1;
}

EMSCRIPTEN_KEEPALIVE
char *mrbjs_eval(const char *src)
{
  mrb_value v;

  if (!mrb) return strdup("InternalError: VM not initialized");

  v = mrb_load_string(mrb, src);

  if (mrb->exc) {
    mrb_value exc = mrb_obj_value(mrb->exc);
    mrb->exc = NULL; /* 清掉，否則下一次 eval 會直接短路 */
    mrb_value msg = mrb_funcall(mrb, exc, "message", 0);
    if (mrb->exc) { mrb->exc = NULL; msg = mrb_str_new_lit(mrb, "(unprintable)"); }
    v = mrb_format(mrb, "%v: %v", mrb_obj_value(mrb_obj_class(mrb, exc)), msg);
  }

  mrb_value s = mrb_obj_as_string(mrb, v);
  if (mrb->exc) { /* to_s 自己爆了 */
    mrb->exc = NULL;
    return strdup("InternalError: to_s failed");
  }
  return strdup(mrb_string_value_cstr(mrb, &s));
}
