// RubyWorld Conference 2026 特別版（RubyCity MATSUE 20 週年紀念）攤位大地遊戲 —— 全部遊戲邏輯。
//
// 這個檔案是**純 JS，不經過 Liquid**（Jekyll 只是原樣複製）。所有需要 Jekyll 才拿得到的東西
// （題庫、locale、prelude、asset URL、Worker URL）都由 _includes/challenge-body.html 的
// <script id="challenge-config" type="application/json"> data island 注入，見下方 CFG。
//
// 也就是說：這裡可以放心用雙大括號、Liquid tag、backtick、dollar-brace，都不會被處理。
//
// 載入方式是 <script type="module" src=...>，跟原本的 inline module 一樣是 deferred，
// 依 document order 在 _layouts/challenge.html head 那幾個 defer script 之後執行 ——
// 所以 window.createMruby / window.qrcode / window.hljs 都拿得到。

const CFG = JSON.parse(document.getElementById('challenge-config').textContent);

const UI                 = CFG.ui;         // _data/locales/[lang].yml
const PAGE_LANG          = CFG.lang;
const TASK_DEFS          = CFG.tasks;      // _data/tasks/[lang].yml
const CROSSLANG_DEFS     = CFG.crosslang;  // _data/crosslang/[lang]/*.yml
const CROSSLANG_CHOICES  = CFG.choices;    // _data/crosslang/choices.yml（三語共用）
const OMIKUJI_DEFS       = CFG.omikuji;    // _data/omikuji/[lang].yml
const COLLECT_DATA       = CFG.collectData; // _config.yml collect_personal_data；false 時整個 form phase 被跳過
const SUBMIT_URL         = CFG.submitUrl;  // Cloudflare Worker（CORS 鎖 rwc2026.ruby.tw）
const LISTMONK_LIST_UUID = CFG.listUuid;
const LOGO_URL           = CFG.logoUrl;
const WASM_URL           = CFG.wasmUrl;
const PRELUDE            = CFG.prelude;    // _includes/mruby-prelude.rb

// 插值 helper：tpl(UI.key, { n: value })
function tpl(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

// ── 設定 ─────────────────────────────────────────────────
const STANDARD_QUESTIONS = 3;
const CROSSLANG_COUNT    = 3;
const TOTAL_QUESTIONS    = STANDARD_QUESTIONS + CROSSLANG_COUNT; // 6
const MAX_ATTEMPTS       = 3;
// 跨語言題是 4 選 1，給 3 次等於 3/4 亂猜就中，所以只給 2 次（= 50%）
const CROSSLANG_ATTEMPTS = 2;
const SALT               = 'RWC2026RubyTaiwan';

// ── secret 生成 ──────────────────────────────────────────
function generateSecret(def) {
  switch (def.secret_type) {
    case 'integer': {
      const [min, max] = def.secret_range;
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    case 'odd_integer': {
      const [min, max] = def.secret_range;
      let n = Math.floor(Math.random() * (max - min + 1)) + min;
      if (n % 2 === 0) n = n + 1 <= max ? n + 1 : n - 1;
      return n;
    }
    case 'string': {
      const pool = def.secret_pool;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    case 'array': {
      const [eMin, eMax] = def.element_range;
      return Array.from({ length: def.array_length },
        () => Math.floor(Math.random() * (eMax - eMin + 1)) + eMin);
    }
    case 'nested_array': {
      const pool = def.secret_pool;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    default: return 0;
  }
}

// ── Ruby literal 轉換（支援巢狀陣列）────────────────────
function toRubyLit(v) {
  if (Array.isArray(v)) return '[' + v.map(toRubyLit).join(', ') + ']';
  if (typeof v === 'string') return `"${v}"`;
  return String(v);
}

// ── 題目工廠函數 ─────────────────────────────────────────
function buildQuestion(def, raw) {
  const isArray     = Array.isArray(raw);
  const isString    = def.secret_type === 'string';
  const rubyLiteral = isArray ? toRubyLit(raw) : isString ? `"${raw}"` : String(raw);
  const displayVal  = isArray ? toRubyLit(raw) : String(raw);

  const needsSeed = def.answer === '.shuffle' || def.answer === '.sample';
  const seed = needsSeed ? Math.floor(Math.random() * 2147483647) : null;

  return {
    category:    def.category,
    difficulty:  def.difficulty,
    question:    def.question.replace('{secret}', displayVal),
    codeLine1:   `gem = ${rubyLiteral}`,
    inputPrefix: 'puts gem',
    expected:    null,
    answer:      def.answer,
    seed,
    rubyCode: (input) => [
      ...(seed !== null ? [`srand(${seed})`] : []),
      `gem = ${rubyLiteral}`,
      `puts gem${input}`,
    ].join('\n'),
    tips: def.tips,
  };
}

// ── crosslang 題目工廠（answer + 3 個其他選項，洗牌成 4 選 1）──
function buildCrosslangQuestion(def, lang) {
  const others = CROSSLANG_CHOICES[def.id] || [];
  return {
    type:       'crosslang',
    sourceLang: lang,
    code:       def.code,
    expected:   def.expected,
    answer:     def.answer,
    tips:       def.tips,
    choices:    [def.answer, ...others].sort(() => Math.random() - 0.5),
  };
}

// ── State persistence（sessionStorage）────────────────────
const SAVE_KEY = `ruby_quiz_v1_${PAGE_LANG}`;
let quizMeta = [];

function saveState() {
  try {
    sessionStorage.setItem(SAVE_KEY, JSON.stringify({
      phase: currentPhase, qi: questionIndex, cc: correctCount,
      ca: currentAttempts, name: playerName, ts: proofTs,
      meta: quizMeta, lang: selectedLang,
      clIds: crosslangIds, cli: crosslangIndex,
    }));
  } catch (_) {}
}

function clearSavedState() {
  try { sessionStorage.removeItem(SAVE_KEY); } catch (_) {}
}

// ── 3 題梯度出題 (1E + 1M + 1H) ──────────────────────────
let quizQuestions = [];

function prepareQuiz(restoredMeta) {
  if (restoredMeta) {
    quizMeta      = restoredMeta;
    quizQuestions = restoredMeta.map(({di, raw}) => buildQuestion(TASK_DEFS[di], raw));
    return;
  }
  const pickIdx = (indices, n) => indices.slice().sort(() => Math.random() - 0.5).slice(0, n);
  const easyIdx = TASK_DEFS.flatMap((t, i) => t.difficulty === 'easy'   ? [i] : []);
  const medIdx  = TASK_DEFS.flatMap((t, i) => t.difficulty === 'medium' ? [i] : []);
  const hardIdx = TASK_DEFS.flatMap((t, i) => t.difficulty === 'hard'   ? [i] : []);
  const selected = [
    ...pickIdx(easyIdx, Math.min(1, easyIdx.length)),
    ...pickIdx(medIdx,  Math.min(1, medIdx.length)),
    ...pickIdx(hardIdx, Math.min(1, hardIdx.length)),
  ];
  quizMeta      = selected.map(di => ({ di, raw: generateSecret(TASK_DEFS[di]) }));
  quizQuestions = quizMeta.map(({di, raw}) => buildQuestion(TASK_DEFS[di], raw));
}

// ── 狀態 ─────────────────────────────────────────────────
let rubyVM         = null;
let currentPhase   = 'quiz';
let questionIndex  = 0;
let correctCount   = 0;
let currentAttempts = 0;
let playerName     = '';
let proofTs        = '';
let selectedLang   = '';
let crosslangQuestions = [];
let crosslangIndex    = 0;
let crosslangAttempts = 0;
let crosslangIds   = [];

// ── Phase 切換 ────────────────────────────────────────────
window.switchPhase = function (name) {
  if (name === 'form' && !COLLECT_DATA) name = 'proof'; // 含還原舊存檔的情況
  const allPhases = ['quiz', 'lang-select', 'crosslang', 'result', 'form', 'proof'];
  allPhases.forEach(p => {
    const el = document.getElementById('phase-' + p);
    if (el) el.style.display = (p === name) ? '' : 'none';
  });
  // progress bar: show during quiz and crosslang only
  const progressEl = document.getElementById('phase-progress');
  if (progressEl) progressEl.style.display = (name === 'quiz' || name === 'crosslang') ? '' : 'none';

  currentPhase = name;
  window.scrollTo({ top: document.getElementById('challenge').offsetTop - 20, behavior: 'smooth' });

  if (name === 'result') renderResult();
  if (name === 'form')   populateFormPrefills();
  if (name === 'proof')  { renderProof(); clearSavedState(); }
  else saveState();
};

// ── Form pre-fills ────────────────────────────────────────
function populateFormPrefills() {
  const scoreEl = document.getElementById('form-score');
  const langEl  = document.getElementById('form-lang');
  if (scoreEl) scoreEl.value = `${correctCount} / ${TOTAL_QUESTIONS}`;
  if (langEl)  langEl.value  = selectedLang;
}

// ── 進度條 ────────────────────────────────────────────────
function updateProgress() {
  const n = questionIndex + 1;
  document.getElementById('progress-text').textContent = tpl(UI.quiz_progress, { n });
  document.getElementById('score-text').textContent    = tpl(UI.quiz_score, { n: correctCount });
  document.getElementById('progress-fill').style.width = (n / STANDARD_QUESTIONS * 100) + '%';
}

function updateProgressForCrosslang() {
  const n = crosslangIndex + 1;
  document.getElementById('progress-text').textContent = tpl(UI.crosslang_progress, { n });
  document.getElementById('score-text').textContent    = tpl(UI.quiz_score, { n: correctCount });
  document.getElementById('progress-fill').style.width = (n / CROSSLANG_COUNT * 100) + '%';
}

// ── 難度 badge ────────────────────────────────────────────
const DIFF_STYLE = {
  easy:   { bg: '#dcfce7', color: '#16a34a', label: UI.diff_easy   },
  medium: { bg: '#fef9c3', color: '#ca8a04', label: UI.diff_medium },
  hard:   { bg: '#fde8e7', color: '#bd3f32', label: UI.diff_hard   },
};

// ── 渲染題目 ──────────────────────────────────────────────
function renderQuestion(q) {
  document.getElementById('task-category').textContent  = q.category;
  document.getElementById('task-question').textContent  = q.question;
  document.getElementById('task-code').textContent      = q.codeLine1;
  document.getElementById('code-display').textContent   = q.codeLine1;
  document.getElementById('input-prefix').textContent   = q.inputPrefix;
  document.getElementById('method-input').value         = '';
  document.getElementById('line-nums').innerHTML        = '1<br>2<br>3';

  const ds = DIFF_STYLE[q.difficulty] || DIFF_STYLE.easy;
  const badge = document.getElementById('difficulty-badge');
  badge.textContent        = ds.label;
  badge.style.background   = ds.bg;
  badge.style.color        = ds.color;

  document.getElementById('attempts-badge').textContent = '';
  document.getElementById('feedback-panel').style.display = 'none';
  setOutput(`<span style="color:#4a3a48;">${UI.quiz_output_waiting}</span>`);

  document.getElementById('tips-list').innerHTML = q.tips.map(t => `
    <div style="background:#fef6f0;border-radius:8px;padding:10px 14px;">
      <code style="font-family:monospace;font-size:12px;color:#323232;">${t.code}</code>
      <p style="font-size:11px;color:#9b9b9b;margin:3px 0 0;">${t.desc}</p>
    </div>
  `).join('');
}

// ── crosslang 題目渲染 ────────────────────────────────────
function renderCrosslangQuestion(q) {
  const langLabels = { javascript: 'JavaScript', python: 'Python', php: 'PHP' };
  document.getElementById('crosslang-badge').textContent = `${langLabels[q.sourceLang]} → Ruby`;

  const codeEl = document.getElementById('crosslang-code');
  codeEl.removeAttribute('data-highlighted');
  codeEl.className = `language-${q.sourceLang}`;
  codeEl.textContent = q.code;
  if (window.hljs) window.hljs.highlightElement(codeEl);

  renderCrosslangChoices(q);
  document.getElementById('crosslang-feedback').style.display = 'none';
  document.getElementById('crosslang-output').innerHTML =
    `<span style="color:#4a3a48;">${UI.quiz_output_waiting}</span>`;
  document.getElementById('crosslang-attempts-badge').textContent = '';

  const statusEl = document.getElementById('crosslang-ruby-status');
  if (statusEl) statusEl.textContent = rubyVM ? UI.wasm_ready : UI.wasm_not_ready;

  document.getElementById('crosslang-tips-list').innerHTML = q.tips.map(t => `
    <div style="background:#fef6f0;border-radius:8px;padding:10px 14px;">
      <code style="font-family:monospace;font-size:12px;color:#323232;">${t.code}</code>
      <p style="font-size:11px;color:#9b9b9b;margin:3px 0 0;">${t.desc}</p>
    </div>
  `).join('');
}

// ── crosslang 選項渲染 ────────────────────────────────────
const CHOICE_STYLE = "display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:#fff;border:1px solid #e8d5d3;border-radius:10px;padding:14px 16px;cursor:pointer;font-family:inherit;transition:border-color .15s,background .15s;";

function renderCrosslangChoices(q) {
  document.getElementById('crosslang-choices').innerHTML = q.choices.map((c, i) => `
    <button type="button" id="cl-choice-${i}" onclick="pickCrosslang(${i})" style="${CHOICE_STYLE}"
      onmouseover="if(!this.disabled){this.style.borderColor='#bd3f32';this.style.background='#fef6f0';}"
      onmouseout="if(!this.disabled){this.style.borderColor='#e8d5d3';this.style.background='#fff';}">
      <span style="flex-shrink:0;width:24px;height:24px;border-radius:6px;background:#fef6f0;color:#bd3f32;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;">${'ABCD'[i]}</span>
      <code style="font-family:'JetBrains Mono','Courier New',monospace;font-size:13px;color:#323232;word-break:break-word;">${escHtml(c)}</code>
    </button>
  `).join('');
}

function lockCrosslangChoices() {
  document.querySelectorAll('#crosslang-choices button').forEach(b => {
    b.disabled = true;
    b.style.cursor = 'default';
  });
}

// ── 輸出 ──────────────────────────────────────────────────
function setOutput(html) {
  document.getElementById('output-body').innerHTML = html;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── 正確回饋 ──────────────────────────────────────────────
function showCorrectFeedback() {
  const fp = document.getElementById('feedback-panel');
  fp.style.display = 'block';
  fp.innerHTML = `
    <div style="background:#f0faf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:24px;">🎉</span>
      <span style="font-size:16px;font-weight:700;color:#15803d;">${UI.feedback_correct}</span>
    </div>`;
}

// ── 答錯回饋 ──────────────────────────────────────────────
function showRetryFeedback(remaining) {
  const fp = document.getElementById('feedback-panel');
  fp.style.display = 'block';
  fp.innerHTML = `
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 20px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:20px;">❌</span>
      <span style="font-size:14px;color:#9a3412;">${tpl(UI.feedback_wrong, { n: remaining })}</span>
    </div>`;
  document.getElementById('attempts-badge').textContent = tpl(UI.feedback_attempts_remaining, { n: remaining });
}

// ── 顯示正確答案 ──────────────────────────────────────────
function showAnswerReveal(q) {
  const fp = document.getElementById('feedback-panel');
  fp.style.display = 'block';
  fp.innerHTML = `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span style="font-size:18px;">😅</span>
        <span style="font-size:14px;font-weight:700;color:#991b1b;">${UI.feedback_exhausted}</span>
      </div>
      <code style="font-family:monospace;font-size:14px;color:#7f1d1d;background:#fee2e2;border-radius:6px;padding:6px 12px;display:inline-block;">
        puts gem${escHtml(q.answer)}
      </code>
    </div>`;
}

// ── crosslang 回饋 ────────────────────────────────────────
function showCrosslangFeedback(correct, remaining) {
  const fp = document.getElementById('crosslang-feedback');
  fp.style.display = 'block';
  if (correct) {
    fp.innerHTML = `<div style="background:#f0faf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;display:flex;align-items:center;gap:12px;"><span style="font-size:24px;">🎉</span><span style="font-size:16px;font-weight:700;color:#15803d;">${UI.feedback_correct}</span></div>`;
  } else {
    fp.innerHTML = `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 20px;display:flex;align-items:center;gap:12px;"><span style="font-size:20px;">❌</span><span style="font-size:14px;color:#9a3412;">${tpl(UI.feedback_wrong, { n: remaining })}</span></div>`;
    document.getElementById('crosslang-attempts-badge').textContent = tpl(UI.feedback_attempts_remaining, { n: remaining });
  }
}

function showCrosslangAnswerReveal(q) {
  const fp = document.getElementById('crosslang-feedback');
  fp.style.display = 'block';
  fp.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><span style="font-size:18px;">😅</span><span style="font-size:14px;font-weight:700;color:#991b1b;">${UI.feedback_exhausted}</span></div><code style="font-family:monospace;font-size:14px;color:#7f1d1d;background:#fee2e2;border-radius:6px;padding:6px 12px;display:inline-block;">${escHtml(q.answer)}</code></div>`;
}

// ── 下一題 (quiz) ─────────────────────────────────────────
function nextQuestion() {
  questionIndex++;
  if (questionIndex >= STANDARD_QUESTIONS) {
    switchPhase('lang-select');
  } else {
    currentAttempts = 0;
    updateProgress();
    renderQuestion(quizQuestions[questionIndex]);
    saveState();
  }
}

// ── 下一題 (crosslang) ────────────────────────────────────
function nextCrosslangQuestion() {
  crosslangIndex++;
  if (crosslangIndex >= crosslangQuestions.length) {
    switchPhase('result');
  } else {
    crosslangAttempts = 0;
    updateProgressForCrosslang();
    renderCrosslangQuestion(crosslangQuestions[crosslangIndex]);
  }
}

// ── 選擇語言 ──────────────────────────────────────────────
window.selectLang = function (lang) {
  selectedLang = lang;
  const pool    = CROSSLANG_DEFS[lang] || [];
  const shuffled = pool.slice().sort(() => Math.random() - 0.5).slice(0, CROSSLANG_COUNT);
  crosslangIds       = shuffled.map(def => def.id);
  crosslangQuestions = shuffled.map(def => buildCrosslangQuestion(def, lang));
  crosslangIndex    = 0;
  crosslangAttempts = 0;
  switchPhase('crosslang');
  renderCrosslangQuestion(crosslangQuestions[0]);
  updateProgressForCrosslang();
};

// ── 執行 Ruby (quiz) ──────────────────────────────────────
window.runRuby = async function () {
  if (!rubyVM) {
    setOutput(`<span style="color:#febc2e;">${UI.wasm_not_ready}</span>`);
    return;
  }

  const input = document.getElementById('method-input').value.trim();
  if (!input) {
    setOutput(`<span style="color:#febc2e;">${UI.wasm_no_input}</span>`);
    return;
  }

  const q = quizQuestions[questionIndex];
  const wrapped = `
require 'stringio'
$stdout = StringIO.new
begin
  ${q.rubyCode(input)}
  $stdout.string.chomp
rescue SyntaxError => e
  "SyntaxError: \#{e.message}"
rescue => e
  "\#{e.class}: \#{e.message}"
ensure
  $stdout = STDOUT
end
`;

  let result;
  try {
    result = rubyVM.eval(wrapped).toString();
  } catch (e) {
    if (e instanceof RangeError || e.message?.includes('call stack')) {
      try {
        await new Promise(r => setTimeout(r, 50));
        result = rubyVM.eval(wrapped).toString();
      } catch (e2) {
        setOutput(`<span style="color:#f87171;">${UI.exec_error_prefix} ${escHtml(e2.message)}</span>`);
        return;
      }
    } else {
      setOutput(`<span style="color:#f87171;">${UI.exec_error_prefix} ${escHtml(e.message)}</span>`);
      return;
    }
  }

  const isError = result.includes('Error:') || result.includes('SyntaxError');
  if (isError) {
    setOutput(`<span style="color:#f87171;">${escHtml(result)}</span>`);
    return;
  }

  setOutput(`<span style="color:#4ade80;">=&gt; ${escHtml(result)}</span>`);

  if (result.trim() === (q.expected ?? '').trim()) {
    correctCount++;
    document.getElementById('score-text').textContent = tpl(UI.quiz_score, { n: correctCount });
    showCorrectFeedback();
    setTimeout(() => nextQuestion(), 1400);
  } else {
    currentAttempts++;
    if (currentAttempts >= MAX_ATTEMPTS) {
      showAnswerReveal(q);
      setTimeout(() => nextQuestion(), 3000);
    } else {
      showRetryFeedback(MAX_ATTEMPTS - currentAttempts);
    }
  }
};

// ── 選一個選項 (crosslang) ────────────────────────────────
// 不看「哪個是正解」—— 選項直接餵進 mruby，輸出等於 expected 就算對。
// 所以同一題可以有兩個都對的寫法，不需要在題庫標記。
window.pickCrosslang = async function (i) {
  const clOut = (html) => { document.getElementById('crosslang-output').innerHTML = html; };
  if (!rubyVM) {
    clOut(`<span style="color:#febc2e;">${UI.wasm_not_ready}</span>`);
    return;
  }
  const q   = crosslangQuestions[crosslangIndex];
  const btn = document.getElementById('cl-choice-' + i);
  if (!q || !btn || btn.disabled) return;

  const code = `begin\n${q.choices[i]}\nrescue SyntaxError => e\n"SyntaxError: \#{e.message}"\nrescue => e\n"\#{e.class}: \#{e.message}"\nend`;
  let result;
  try {
    result = rubyVM.eval(code).toString();
  } catch (e) {
    // 偶發的 call stack exhausted：等一拍再試一次
    await new Promise(r => setTimeout(r, 50));
    try {
      result = rubyVM.eval(code).toString();
    } catch (e2) {
      clOut(`<span style="color:#f87171;">${UI.exec_error_prefix} ${escHtml(e2.message)}</span>`);
      return;
    }
  }

  const correct = !result.includes('Error:') && result.trim() === q.expected.trim();
  clOut(`<span style="color:${correct ? '#4ade80' : '#f87171'};">=&gt; ${escHtml(result)}</span>`);

  if (correct) {
    btn.style.borderColor = '#22c55e';
    btn.style.background  = '#f0faf4';
    lockCrosslangChoices();
    correctCount++;
    document.getElementById('score-text').textContent = tpl(UI.quiz_score, { n: correctCount });
    showCrosslangFeedback(true);
    setTimeout(() => nextCrosslangQuestion(), 1400);
    return;
  }

  btn.disabled = true;
  btn.style.opacity = '0.45';
  btn.style.background = '#faf7f5';
  btn.style.cursor = 'default';
  crosslangAttempts++;
  if (crosslangAttempts >= CROSSLANG_ATTEMPTS) {
    lockCrosslangChoices();
    showCrosslangAnswerReveal(q);
    setTimeout(() => nextCrosslangQuestion(), 3000);
  } else {
    showCrosslangFeedback(false, CROSSLANG_ATTEMPTS - crosslangAttempts);
  }
};

// ── 詢問 AI ───────────────────────────────────────────────
window.askAI = function () {
  const q = quizQuestions[questionIndex];
  if (!q) return;
  const prompt =
`${UI.ai_prompt_intro}

${UI.ai_prompt_category_label}${q.category}
${UI.ai_prompt_question_label}${q.question}
${UI.ai_prompt_code_label}
\`\`\`ruby
${q.codeLine1}
puts gem.???   ${UI.ai_prompt_code_comment}
\`\`\`

${UI.ai_prompt_instruction}`;

  window.open('https://chatgpt.com/?prompt=' + encodeURIComponent(prompt), '_blank');

  const btn = document.getElementById('ask-ai-btn');
  const orig = btn.innerHTML;
  btn.innerHTML = UI.ask_ai_opening;
  btn.style.color = '#16a34a'; btn.style.borderColor = '#16a34a';
  setTimeout(() => { btn.innerHTML = orig; btn.style.color = '#6d28d9'; btn.style.borderColor = '#7c3aed'; }, 2000);
};

// ── 詢問 AI（跨語言題）──────────────────────────────────
window.askAICrosslang = function () {
  const q = crosslangQuestions[crosslangIndex];
  if (!q) return;
  const prompt =
`${UI.ai_prompt_intro}

${UI.ai_prompt_question_label}${UI.crosslang_prompt}
\`\`\`${q.sourceLang}
${q.code}
\`\`\`
\`\`\`ruby
${q.choices.map((c, i) => `${'ABCD'[i]}. ${c}`).join('\n')}
\`\`\`

${UI.ai_prompt_instruction}`;

  window.open('https://chatgpt.com/?prompt=' + encodeURIComponent(prompt), '_blank');

  const btn = document.getElementById('crosslang-ask-ai-btn');
  const orig = btn.innerHTML;
  btn.innerHTML = UI.ask_ai_opening;
  btn.style.color = '#16a34a'; btn.style.borderColor = '#16a34a';
  setTimeout(() => { btn.innerHTML = orig; btn.style.color = '#6d28d9'; btn.style.borderColor = '#7c3aed'; }, 2000);
};

// ── Phase Result: Canvas 成績單 ───────────────────────────
function renderResult() {
  const sub = document.getElementById('result-subtitle');
  sub.textContent = correctCount >= 6
    ? tpl(UI.result_great, { n: correctCount })
    : correctCount >= 3
    ? tpl(UI.result_good, { n: correctCount })
    : tpl(UI.result_encourage, { n: correctCount });

  document.fonts.ready.then(() => drawScoreCard());
}

function drawScoreCard() {
  const canvas = document.getElementById('share-canvas');
  const ctx = canvas.getContext('2d');
  const W = 1080, H = 1080;

  const grad = ctx.createRadialGradient(W/2, H*0.35, 0, W/2, H/2, W*0.75);
  grad.addColorStop(0, '#d94f40');
  grad.addColorStop(1, '#7a2219');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.07;
  for (const [cx, cy, r] of [[W*0.1, H*0.1, 260],[W*0.9, H*0.85, 320],[W*0.85, H*0.15, 180]]) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.fillStyle = '#fff'; ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '500 38px Montserrat, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(UI.canvas_top_label, W/2, 100);

  const logo = new Image();
  logo.crossOrigin = 'anonymous';
  logo.src = LOGO_URL;

  const drawContent = () => {
    ctx.fillStyle = '#fff';
    ctx.font = `800 220px Montserrat, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(String(correctCount), W/2, H*0.52);

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 80px Montserrat, sans-serif';
    ctx.fillText(`/ ${TOTAL_QUESTIONS}`, W/2, H*0.52 + 90);

    const stars = '⭐'.repeat(correctCount) + '○'.repeat(TOTAL_QUESTIONS - correctCount);
    ctx.font = '52px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(stars.slice(0, 10), W/2, H*0.72);

    ctx.font = `600 44px ${PAGE_LANG === 'ja' ? '"Noto Sans JP", ' : ''}Montserrat, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(UI.canvas_tagline, W/2, H*0.83);

    if (selectedLang) {
      ctx.font = '500 36px Montserrat, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(`${UI.canvas_lang_prefix} ${selectedLang}`, W/2, H*0.88);
    }

    ctx.font = '500 36px Montserrat, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(UI.canvas_hashtags, W/2, H*0.92);
  };

  logo.onload = () => {
    const logoH = 240, logoW = logo.width * (logoH / logo.height);
    ctx.drawImage(logo, W/2 - logoW/2, 130, logoW, logoH);
    drawContent();
  };
  logo.onerror = () => {
    ctx.font = '180px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('💎', W/2, 360);
    drawContent();
  };
}

async function shareCanvasImage(canvasId, filename, title, text) {
  const canvas = document.getElementById(canvasId);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title, text });
  } else {
    downloadCanvasImage(canvasId, filename);
  }
}

function downloadCanvasImage(canvasId, filename) {
  const a = document.createElement('a');
  a.download = filename;
  a.href = document.getElementById(canvasId).toDataURL('image/png');
  a.click();
}

window.shareScoreCard  = () => shareCanvasImage('share-canvas', UI.share_filename, UI.share_title, tpl(UI.share_text, { n: correctCount }));
window.downloadCanvas  = () => downloadCanvasImage('share-canvas', UI.share_filename);
window.shareOmikuji    = () => shareCanvasImage('omikuji-canvas', UI.omikuji_share_filename, UI.omikuji_share_title, tpl(UI.omikuji_share_text, { level: omikujiPick?.level ?? '' }));
window.downloadOmikuji = () => downloadCanvasImage('omikuji-canvas', UI.omikuji_share_filename);

// ── Omikuji 御神籤 ────────────────────────────────────────
let omikujiPick = null;

window.drawOmikuji = function () {
  let idx;
  // 由 Ruby 本人抽籤；VM 尚未就緒時退回 JS 亂數
  try { idx = parseInt(rubyVM.eval(`rand(${OMIKUJI_DEFS.length})`).toString(), 10); }
  catch (_) { idx = Math.floor(Math.random() * OMIKUJI_DEFS.length); }
  omikujiPick = OMIKUJI_DEFS[idx];
  document.getElementById('omikuji-btn').style.display = 'none';
  document.getElementById('omikuji-reveal').style.display = 'block';
  document.fonts.ready.then(() => drawOmikujiCard(omikujiPick));
};

function drawOmikujiCard(o) {
  const canvas = document.getElementById('omikuji-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const jpFont = PAGE_LANG === 'ja' ? '"Noto Sans JP", ' : '';

  // 御神籤紙底 + 雙框
  ctx.fillStyle = '#fdf6ec';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#bd3f32';
  ctx.lineWidth = 10;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.lineWidth = 3;
  ctx.strokeRect(64, 64, W - 128, H - 128);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#bd3f32';
  ctx.font = '500 34px Montserrat, sans-serif';
  ctx.fillText(UI.canvas_top_label, W / 2, 160);

  ctx.fillStyle = '#9b9b9b';
  ctx.font = `600 44px ${jpFont}Montserrat, sans-serif`;
  ctx.fillText(UI.omikuji_canvas_title, W / 2, 240);

  // 運勢等級：自動縮字直到塞得下
  ctx.fillStyle = '#bd3f32';
  let size = 190;
  do {
    size -= 10;
    ctx.font = `800 ${size}px ${jpFont}Montserrat, sans-serif`;
  } while (ctx.measureText(o.level).width > W - 220 && size > 60);
  ctx.fillText(o.level, W / 2, H * 0.46);

  ctx.fillStyle = '#323232';
  ctx.font = '700 72px monospace';
  ctx.fillText(o.method, W / 2, H * 0.60);

  // 文案換行：英文按字、CJK 按字元
  ctx.fillStyle = '#555555';
  ctx.font = `500 42px ${jpFont}Montserrat, sans-serif`;
  const hasSpaces = o.text.includes(' ') && PAGE_LANG === 'en';
  const units = hasSpaces ? o.text.split(' ') : [...o.text];
  const sep = hasSpaces ? ' ' : '';
  const maxW = W - 240;
  let line = '', y = H * 0.70;
  for (const u of units) {
    const candidate = line ? line + sep + u : u;
    if (ctx.measureText(candidate).width > maxW && line) {
      ctx.fillText(line, W / 2, y);
      line = u; y += 62;
    } else {
      line = candidate;
    }
  }
  if (line) ctx.fillText(line, W / 2, y);

  ctx.fillStyle = '#9b9b9b';
  ctx.font = '500 30px Montserrat, sans-serif';
  ctx.fillText(UI.canvas_hashtags, W / 2, H * 0.92);
}

// ── Phase Form: 提交到 listmonk ───────────────────────────
window.submitForm = async function () {
  const name       = document.getElementById('form-name').value.trim();
  const email      = document.getElementById('form-email').value.trim();
  const phone      = document.getElementById('form-phone').value.trim();
  const school     = document.getElementById('form-school').value.trim();
  const message    = document.getElementById('form-message').value.trim();

  if (!name || !email) {
    alert(UI.form_validation_error);
    return;
  }

  playerName = name;

  const btn = document.getElementById('form-submit-btn');
  btn.disabled = true;
  btn.textContent = UI.form_submitting;

  try {
    const resp = await fetch(SUBMIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        name,
        list_uuids: [LISTMONK_LIST_UUID],
        ui_lang: PAGE_LANG,
        attribs: {
          phone, school, message,
          score: correctCount, total: TOTAL_QUESTIONS, lang: selectedLang,
        },
      }),
    });
    // 訂閱失敗不阻擋玩家，但現場要看得出「信到底寄出了沒」
    const r = await resp.json().catch(() => null);
    if (!resp.ok || !r?.mailed) console.warn('[subscribe] 未寄出', resp.status, r);
    else console.info('[subscribe] ok, subscriber', r.subscriber_id);
  } catch (e) {
    console.warn('Form submit error (continuing anyway):', e);
  }

  switchPhase('proof');
};

// ── Phase Proof ───────────────────────────────────────────
function generateProofCode(name, score, ts) {
  const raw = (name || 'anon') + score + ts + SALT;
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = Math.imul(31, h) + raw.charCodeAt(i) | 0;
  }
  const hash = Math.abs(h).toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
  return `RUBY-${String(score).padStart(2, '0')}-${hash}`;
}

function renderProof() {
  const now = new Date();
  proofTs = now.toISOString();
  const displayTime = now.toLocaleString(UI.date_locale, { hour12: false });
  const code = generateProofCode(playerName, correctCount, proofTs);

  document.getElementById('proof-name').textContent  = playerName || '';
  document.getElementById('proof-score').textContent = correctCount;
  document.getElementById('proof-code').textContent  = code;
  document.getElementById('proof-time').textContent  = displayTime;

  const qrEl = document.getElementById('proof-qrcode');
  qrEl.innerHTML = '';
  try {
    const qr = window.qrcode(4, 'M');
    qr.addData(code);
    qr.make();
    qrEl.innerHTML = qr.createSvgTag(4, 0);
  } catch (e) {
    qrEl.textContent = code;
  }

  const clockEl = document.getElementById('proof-live-time');
  const tick = () => {
    if (currentPhase !== 'proof') return;
    clockEl.textContent = new Date().toLocaleString(UI.date_locale, { hour12: false });
    requestAnimationFrame(tick);
  };
  tick();
}

// ── WASM で全題目の expected を算出 ──────────────────────
async function computeAllExpected() {
  for (const q of quizQuestions) {
    const code = `
require 'stringio'
$stdout = StringIO.new
begin
  ${q.rubyCode(q.answer)}
  $stdout.string.chomp
rescue => e
  "\#{e.class}: \#{e.message}"
ensure
  $stdout = STDOUT
end`;
    try {
      q.expected = rubyVM.eval(code).toString();
    } catch (_) {
      q.expected = '???';
    }
  }
}

// ── 載入 mruby WASM ───────────────────────────────────────
// ponytail: mruby 4.0（265KB gzip）取代 CRuby ruby.wasm（4.8MB gzip）—— 題庫 27 個 answer
// 全部驗證過（tools/mruby-wasm/spike.mjs）。上限：mruby 沒有 stdlib、沒有 Encoding class，
// 需要真 stdlib 的題目就得回頭用 CRuby（見 main 分支）。
async function initRuby() {
  const statusEl = document.getElementById('ruby-status');
  const wasmUrl  = WASM_URL;
  // mruby 沒有 require / StringIO / $stdout，由 prelude 補齊，
  // 好讓下面兩個 eval wrapper 與 CRuby 版一字不差。
  const prelude  = PRELUDE;
  try {
    statusEl.textContent = UI.wasm_step1;
    const Module = await createMruby({
      locateFile: () => wasmUrl,
      // mruby parser 的 syntax error 會寫 stderr，別讓它污染 console
      printErr: (m) => console.debug('[mruby]', m),
    });

    statusEl.textContent = UI.wasm_step2;
    if (Module.ccall('mrbjs_init', 'number', [], []) !== 0) throw new Error('mrbjs_init failed');

    // 只需要 eval(src).toString()，與 ruby.wasm 的 VM 介面對齊
    rubyVM = {
      eval: (src) => {
        const ptr = Module.ccall('mrbjs_eval', 'number', ['string'], [src]);
        const out = Module.UTF8ToString(ptr);
        Module._free(ptr);
        return { toString: () => out };
      },
    };
    rubyVM.eval(prelude);

    await computeAllExpected();
    statusEl.textContent = UI.wasm_ready;
    statusEl.style.color = '#16a34a';
    document.getElementById('run-btn').style.opacity = '1';

    // crosslang-ruby-status も更新
    const clStatus = document.getElementById('crosslang-ruby-status');
    if (clStatus) { clStatus.textContent = UI.wasm_ready; clStatus.style.color = '#16a34a'; }
  } catch (e) {
    const msg = (e && (e.message || String(e))) || 'unknown';
    statusEl.textContent = `${UI.wasm_error_prefix} ${msg.slice(0, 80)}`;
    statusEl.style.color = '#f87171';
    console.error('Ruby WASM load error:', e);
  }
}

// ── 初始化 ────────────────────────────────────────────────
(function () {
  let snap;
  try { snap = JSON.parse(sessionStorage.getItem(SAVE_KEY)); } catch (_) {}

  if (snap && Array.isArray(snap.meta) && snap.meta.length > 0) {
    prepareQuiz(snap.meta);
    questionIndex   = snap.qi   ?? 0;
    correctCount    = snap.cc   ?? 0;
    currentAttempts = snap.ca   ?? 0;
    playerName      = snap.name ?? '';
    proofTs         = snap.ts   ?? '';
    selectedLang    = snap.lang ?? '';
    currentPhase    = snap.phase ?? 'quiz';

    // Restore crosslang questions from saved IDs
    if (selectedLang && Array.isArray(snap.clIds) && snap.clIds.length > 0) {
      const pool = CROSSLANG_DEFS[selectedLang] || [];
      const restored = snap.clIds.map(id => pool.find(d => d.id === id)).filter(Boolean);
      if (restored.length === snap.clIds.length) {
        crosslangIds       = snap.clIds;
        crosslangIndex     = snap.cli ?? 0;
        // ponytail: 選項會重新洗牌（順序沒存進 sessionStorage）—— reload 中途換位置無妨
        crosslangQuestions = restored.map(def => buildCrosslangQuestion(def, selectedLang));
      } else {
        // Can't restore cleanly — fall back to lang-select
        currentPhase = 'lang-select';
      }
    }
  } else {
    prepareQuiz();
  }

  updateProgress();
  renderQuestion(quizQuestions[Math.min(questionIndex, quizQuestions.length - 1)]);
  if (currentPhase === 'crosslang' && crosslangQuestions.length > 0) {
    switchPhase('crosslang');
    renderCrosslangQuestion(crosslangQuestions[Math.min(crosslangIndex, crosslangQuestions.length - 1)]);
    updateProgressForCrosslang();
  } else {
    switchPhase(currentPhase);
  }
  document.getElementById('run-btn').style.opacity = '0.6';
  initRuby();
})();

document.getElementById('method-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') window.runRuby();
});

