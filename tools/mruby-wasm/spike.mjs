// Gate for the mruby.wasm swap: run the real task bank through the built VM.
//
//   node tools/mruby-wasm/spike.mjs
//
// 題庫從 _data/ 讀，wrapper 與 literal 組法照抄 assets/js/challenge.js
// （toRubyLit / buildQuestion / rubyCode / computeAllExpected / runCrosslang）。
// exit code 0 = 全綠。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const require_ = createRequire(import.meta.url);

// ── 迷你 YAML 讀取（題庫格式很規律，不值得為它裝 dep）──────
const unq = (s) => {
  s = s.trim();
  const q = s[0];
  if ((q === '"' || q === "'") && s.at(-1) === q) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
  }
  return s;
};
function parseList(text) {
  const out = [];
  let cur = null;
  for (const line of text.split('\n')) {
    if (/^- /.test(line)) { cur = {}; out.push(cur); }
    if (!cur) continue;
    const m = line.match(/^(?:- |\s+)([a-z_]+):[ \t]*(\S.*)$/);
    if (m) cur[m[1]] = unq(m[2]);
  }
  return out;
}
// 引號後面可能跟著 `# 也對` 之類的註解，unq() 認不出來 —— 先切掉
const stripComment = (s) => {
  s = s.trim();
  const q = s[0];
  if (q === '"' || q === "'") return s.slice(0, s.lastIndexOf(q) + 1);
  return s.replace(/\s+#.*$/, '');
};
// choices.yml：`id:` 之後跟著三個 `- "…"`（刻意不用 anchor，這個 parser 不吃）
function parseChoices(text) {
  const out = {};
  let key = null;
  for (const line of text.split('\n')) {
    if (/^\s*(#|$)/.test(line)) continue;
    const k = line.match(/^([a-z0-9_]+):\s*$/);
    if (k) { key = k[1]; out[key] = []; continue; }
    const item = line.match(/^\s+- (.*)$/);
    if (item && key) out[key].push(unq(stripComment(item[1])));
  }
  return out;
}

// ── VM ────────────────────────────────────────────────────
const createMruby = require_(join(ROOT, 'assets/ruby-wasm/mruby.js'));
const Module = await createMruby();
if (Module.ccall('mrbjs_init', 'number', [], []) !== 0) throw new Error('mrbjs_init failed');

function ev(src) {
  const p = Module.ccall('mrbjs_eval', 'number', ['string'], [src]);
  const out = Module.UTF8ToString(p);
  Module._free(p);
  return out;
}
// prelude 與頁面共用同一份（頁面用 Liquid capture + jsonify 送進 data island，
// escape 由 jsonify 負責，所以這裡不需要再擋反引號 / dollar-brace）
const preludeSrc = readFileSync(join(ROOT, '_includes/mruby-prelude.rb'), 'utf8');
ev(preludeSrc);

// ── wrapper：與 challenge.js 逐字相同 ───────────────
const quizWrapper = (rubyCode) => `
require 'stringio'
$stdout = StringIO.new
begin
  ${rubyCode}
  $stdout.string.chomp
rescue => e
  "#{e.class}: #{e.message}"
ensure
  $stdout = STDOUT
end`;

const crosslangWrapper = (input) =>
  `begin\n${input}\nrescue SyntaxError => e\n"SyntaxError: #{e.message}"\nrescue => e\n"#{e.class}: #{e.message}"\nend`;

// ── literal 生成（等價於 generateSecret + toRubyLit，但取決定性值）──
const toRubyLit = (v) =>
  Array.isArray(v) ? '[' + v.map(toRubyLit).join(', ') + ']'
  : typeof v === 'string' ? `"${v}"` : String(v);

function literalFor(def) {
  const range = (s) => s.replace(/[[\]]/g, '').split(',').map((x) => parseInt(x, 10));
  switch (def.secret_type) {
    case 'integer': return String(range(def.secret_range)[0]);
    case 'odd_integer': {
      const [min, max] = range(def.secret_range);
      return String(min % 2 === 0 ? Math.min(min + 1, max) : min);
    }
    case 'string': return `"${def.secret_pool.replace(/[[\]]/g, '').split(',')[0].trim()}"`;
    case 'array': {
      const [eMin, eMax] = range(def.element_range);
      const span = eMax - eMin + 1;
      return toRubyLit(Array.from({ length: +def.array_length }, (_, i) => eMin + ((i * 7 + 2) % span)));
    }
    case 'nested_array': return '[[1, 2], [3, [4, 5]], [6]]';
    default: return '0';
  }
}

// ── 跑 ────────────────────────────────────────────────────
let fails = 0;
const bad = (msg) => { fails++; console.log('  FAIL ' + msg); };
const head = (s) => console.log('\n=== ' + s + ' ===');

head('quiz answers（_data/tasks/zh-TW.yml）');
const tasks = parseList(readFileSync(join(ROOT, '_data/tasks/zh-TW.yml'), 'utf8'))
  .filter((t) => t.answer);
for (const def of tasks) {
  const lit = literalFor(def);
  const seeded = def.answer === '.shuffle' || def.answer === '.sample';
  const code = [seeded ? 'srand(12345)' : null, `gem = ${lit}`, `puts gem${def.answer}`]
    .filter(Boolean).join('\n');
  const out = ev(quizWrapper(code));
  const ok = out.length > 0 && !out.includes('Error:');
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${(lit + def.answer).padEnd(36)} => ${JSON.stringify(out)}`);
  if (!ok) fails++;
}
console.log(`  (${tasks.length} 題)`);

head('crosslang answers（逐字元比對 YAML expected）');
let clCount = 0;
for (const lang of ['zh-TW', 'en', 'ja']) {
  const dir = join(ROOT, '_data/crosslang', lang);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.yml'))) {
    for (const q of parseList(readFileSync(join(dir, f), 'utf8'))) {
      if (!q.answer) continue;
      clCount++;
      const got = ev(crosslangWrapper(q.answer));
      if (got !== q.expected) bad(`${lang}/${f} ${q.answer}\n       want ${JSON.stringify(q.expected)}\n       got  ${JSON.stringify(got)}`);
    }
  }
}
console.log(`  ${clCount} 題比對完成`);

head('crosslang 4 選 1（每個選項實跑；判定看輸出，不看標記）');
const CHOICES = parseChoices(readFileSync(join(ROOT, '_data/crosslang/choices.yml'), 'utf8'));
const clDir = join(ROOT, '_data/crosslang/zh-TW');   // id/answer/expected 三語相同
const clDefs = readdirSync(clDir).filter((n) => n.endsWith('.yml'))
  .flatMap((f) => parseList(readFileSync(join(clDir, f), 'utf8')))
  .filter((d) => d.answer);
for (const def of clDefs) {
  const others = CHOICES[def.id];
  if (!others) { bad(`choices.yml 缺 ${def.id}`); continue; }
  const all = [def.answer, ...others];
  if (all.length !== 4) bad(`${def.id} 湊出 ${all.length} 個選項（要 4 個）`);
  const outs = all.map((c) => ev(crosslangWrapper(c)));
  const okFlags = outs.map((o) => o.trim() === def.expected.trim());
  const nOk = okFlags.filter(Boolean).length;
  if (nOk === 0) bad(`${def.id} 沒有任何選項的輸出等於 expected ${JSON.stringify(def.expected)}`);
  if (nOk === all.length) bad(`${def.id} 四個選項全對，沒有干擾選項`);
  console.log(`  ${def.id} — ${nOk} 對 / ${all.length}`);
  all.forEach((c, i) => {
    const err = outs[i].includes('Error:');
    console.log(`    ${okFlags[i] ? '✓' : err ? '!' : '✗'} ${c.padEnd(52)} => ${JSON.stringify(outs[i].slice(0, 48))}`);
  });
}
const orphans = Object.keys(CHOICES).filter((id) => !clDefs.some((d) => d.id === id));
if (orphans.length) bad(`choices.yml 有孤兒 id（題庫裡沒這題）：${orphans.join(', ')}`);
console.log(`  ${clDefs.length} 題 × 4 選項；「!」= 該選項會拋例外（玩家看到紅字，算答錯，可接受）`);

head('srand 決定性 / rand');
const sh = (seed) => ev(quizWrapper(`srand(${seed})\ngem = [3, 7, 1, 9, 4]\nputs gem.shuffle`));
if (sh(42) !== sh(42)) bad('srand(42) + .shuffle 兩次不同');
const sa = (seed) => ev(quizWrapper(`srand(${seed})\ngem = [11, 47, 3, 88, 5]\nputs gem.sample`));
if (sa(7) !== sa(7)) bad('srand(7) + .sample 兩次不同');
if (sh(1) === sh(2)) bad('不同 seed 給出相同 shuffle（RNG 沒吃 seed？）');
const rolls = Array.from({ length: 20 }, () => parseInt(ev('rand(12)'), 10));
if (!rolls.every((n) => Number.isInteger(n) && n >= 0 && n < 12)) bad('rand(12) 超出 0..11: ' + rolls);
console.log(`  shuffle/sample 決定性 ok；rand(12) 樣本 ${rolls.slice(0, 8).join(',')}…`);

head('UTF-8（MRB_UTF8_STRING）');
const u = (src) => ev(crosslangWrapper(src));
const utf8 = [
  ['"日本語です".size', '5'],
  ['"日本語です".chars.size', '5'],
  ['"日本語です".reverse', 'すで語本日'],
  ['"日本語です".chars.first', '日'],
];
for (const [src, want] of utf8) {
  const got = u(src);
  if (got !== want) bad(`${src} want ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
  else console.log(`  ok   ${src} => ${got}`);
}

head('Regexp（Onigmo）—— 跨語言題是自由輸入，玩家可能自己用正規式解');
const RE = [
  ['"banana" =~ /na/', '2'],
  ['"banana".gsub(/a/, "o")', 'bonono'],
  ['"banana".sub(/na/) { |m| m.upcase }', 'baNAna'],
  ['"2026-08-04".match(/(\\d+)-(\\d+)/)[1]', '2026'],
  ['"a1b2".scan(/\\d/)', '["1", "2"]'],
  ['/ruby/ === "i love ruby"', 'true'],
  ['"日本語です".gsub(/語/, "GO")', '日本GOです'],
  ['"CamelCase".gsub(/([A-Z])/) { "_" + $1.downcase }', '_camel_case'],
  // 標準答案的字串樣式版本不能被 Regexp 支援搞壞
  ['"banana".gsub("a", "o")', 'bonono'],
];
for (const [src, want] of RE) {
  const got = u(src);
  if (got !== want) bad(`${src} want ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
  else console.log(`  ok   ${src.padEnd(48)} => ${got}`);
}

head('玩家亂打（不能讓 VM 掛掉，且要看得出是錯誤）');
for (const input of ['.foo', '.sort;', '.map { |x| x', '.chars.first(2)', '; while true; break; end', '"']) {
  const out = ev(quizWrapper(`gem = [1, 2, 3]\nputs gem${input}`));
  console.log(`  ${String(input).padEnd(26)} => ${JSON.stringify(out.slice(0, 72))}`);
}

head('選擇題 _data/quiz（逐題逐選項實跑；必須剛好只有 YAML answer 判對）');
{
  const { execFileSync } = require_('node:child_process');
  const judge = (q, text) => {
    if (q.code) { const out = ev(quizWrapper(String(q.code))); return !/^\w*(Error|Exception): /.test(out) && out.trim() === text.trim(); }
    if (q.check) return ev(quizWrapper(`puts(${String(q.check).split('%s').join(text)})`)).trim() === 'true';
    return text === String(q.answer);
  };
  for (const lang of ['ja', 'en', 'zh-TW']) {
    const rows = JSON.parse(execFileSync('ruby', ['-ryaml', '-rjson', '-e', 'puts YAML.load_file(ARGV[0]).to_json', join(ROOT, `_data/quiz/${lang}.yml`)]).toString());
    rows.forEach((q, n) => {
      const opts = [String(q.answer), ...(q.wrong || []).map(String)];
      if (opts.length !== 4) return bad(`${lang} #${n + 1} 選項不是 4 個`);
      const ok = opts.filter((t) => judge(q, t));
      if (ok.length !== 1 || ok[0] !== String(q.answer)) bad(`${lang} #${n + 1} 判對的是 ${JSON.stringify(ok)}，應該只有 ${JSON.stringify(String(q.answer))}`);
      else console.log(`  ok   ${lang} #${n + 1} ${q.code ? 'code ' : q.check ? 'check' : 'yaml '} => ${q.answer}`);
    });
  }
}

head('體積');
for (const f of ['assets/ruby-wasm/mruby.js', 'assets/ruby-wasm/mruby.wasm']) {
  const buf = readFileSync(join(ROOT, f));
  const gz = gzipSync(buf, { level: 9 }).length;
  console.log(`  ${f.padEnd(30)} raw ${buf.length.toLocaleString().padStart(11)}  gzip ${gz.toLocaleString().padStart(9)}`);
  if (f.endsWith('.wasm') && gz > 1_000_000) bad(`gzip ${gz} > 1MB gate`);
}
const old = join(ROOT, 'assets/ruby-wasm/ruby.wasm');
try { console.log(`  (CRuby ruby.wasm raw ${statSync(old).size.toLocaleString()} / ~4.8MB gzip)`); } catch { /* 已刪 */ }

console.log(`\n${fails === 0 ? '✅ GATE PASS' : `❌ GATE FAIL — ${fails} 項`}`);
process.exit(fails === 0 ? 0 : 1);
