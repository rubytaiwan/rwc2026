# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jekyll 4.4.x static site for the COSCUP 2026 Ruby Taiwan booth challenge game. Uses Minima theme, jekyll-feed plugin, Tailwind CSS v4 (via `tailwindcss-ruby`), and Ruby 4.0 WebAssembly for in-browser Ruby execution.

## Common Commands

```bash
# Install dependencies
bundle install

# Start local development server (auto-reloads on file changes, except _config.yml)
bundle exec jekyll serve

# Build the site to _site/
bundle exec jekyll build

# Production build (Tailwind CSS will be minified)
JEKYLL_ENV=production bundle exec jekyll build
```

> Note: `_config.yml` changes require a server restart — they are not auto-reloaded.

## Architecture

### Key Files

- `_config.yml` — site-wide settings; also holds `listmonk_list_uuid` for the subscription API
- `index.html` / `en/index.html` / `ja/index.html` — language entry points (each sets `lang:` front matter and includes `challenge-body.html`)
- `_includes/challenge-body.html` — main challenge page logic (4-phase game flow, i18n-aware)
- `_data/tasks/` — Ruby challenge task bank per language (easy/medium/hard, 15 tasks each)
- `_data/crosslang/<lang>/` — cross-language task bank per UI language (javascript/python/php, 5 tasks each)
- `_layouts/challenge.html` — layout for the challenge page; loads qrcode.min.js and ruby-wasm browser.umd.js
- `_includes/cover.html` — Ruby Taiwan cover section SVG artwork
- `_includes/cover-styles.html` — CSS for the cover section

### Assets

- `assets/ruby-wasm/browser.umd.js` — Ruby 4.0 WASM JS bridge (`@ruby/4.0-wasm-wasi@2.8.1`); exposes `window["ruby-wasm-wasi"]`
- `assets/ruby-wasm/ruby+stdlib.wasm` — Ruby 4.0 WASM binary (~31MB)
- `assets/js/qrcode.min.js` — `qrcode-generator` UMD bundle; exposes `window.qrcode(typeNumber, errorLevel)`
- `assets/images/rubytw_logo.png` — Ruby Taiwan logo (used in Canvas scorecard)

### Challenge Game Flow (index.html)

6-phase single-page flow, controlled by `switchPhase(name)`:

1. **quiz** — 5 standard questions in difficulty gradient (2 easy → 2 medium → 1 hard), drawn from `_data/tasks/<lang>.yml`. Max 3 attempts per question; reveals answer on failure. The variable shown to players is named `gem`.
2. **lang-select** — player picks their primary language (JavaScript / Python / PHP).
3. **crosslang** — 3 cross-language questions from `_data/crosslang/<lang>/<source>.yml`: familiar source-language code shown, player writes the Ruby equivalent (highlight.js syntax highlighting).
4. **result** — HTML Canvas 1080×1080 scorecard with logo; Web Share API for IG sharing (falls back to download).
5. **form** — Collects name, email, phone, school; POSTs to the Cloudflare Worker (`listmonk_submit_url`). Failure is non-blocking.
6. **proof** — Completion certificate with QR code, proof code (`RUBY-{score:02d}-{hash8}`), shimmer animation, live clock.

### Task Bank (`_data/tasks/<lang>.yml`)

Each task has:
- `category`, `difficulty` (`easy`/`medium`/`hard`)
- `secret_type`: `integer` | `odd_integer` | `string` | `array`
- `secret_range`, `secret_pool`, `array_length`, `element_range` (depending on type)
- `question` — use `{secret}` (single braces) as placeholder; `{{secret}}` would be processed by Liquid
- `answer` — the Ruby method/operator (e.g. `.next`, `* 2`)
- `tips` — array of `{ code, desc }` hint items

Answer verification uses Ruby WASM: after the VM loads, `computeAllExpected()` runs each question's correct answer through `rubyVM.eval` and stores the output in `q.expected`. Non-deterministic methods (`.shuffle`, `.sample`) use a per-question `srand(seed)` to ensure reproducibility. **No `EXPECTED_MAP` or JS reimplementation of Ruby methods needed — any valid Ruby expression can be an `answer`.**

### i18n

Three languages: `zh-TW` (default), `en`, `ja`. Each has:
- `_data/locales/<lang>.yml` — all UI strings
- `_data/tasks/<lang>.yml` — translated task bank
- `<lang>/index.html` (or root `index.html` for zh-TW) — sets `lang:` front matter, includes `challenge-body.html`

`challenge-body.html` reads `{% assign t = site.data.locales[page.lang] %}` for all UI text.

### listmonk Integration

- Form POSTs to a Cloudflare Worker (`workers/coscup2026-subscribe/`) which relays to `edm.ruby.tw/api`; the Worker's `LISTMONK_LIST_ID` decides which list subscribers land in
- Worker URL configured in `_config.yml` as `listmonk_submit_url`; CORS origin is locked to `https://coscup2026.ruby.tw`
- Deploy the Worker with `wrangler deploy` from its directory (`LISTMONK_API_TOKEN` is a Worker secret)

## Tailwind CSS

Tailwind CSS v4 via `tailwindcss-ruby` gem and a Jekyll `post_write` hook.

- `_css/input.css` — Tailwind source (`@import "tailwindcss"`, `@source` directives; `_` prefix keeps Jekyll from processing it)
- `_plugins/tailwindcss.rb` — runs Tailwind CLI after every Jekyll write cycle
- Output: `_site/assets/css/tailwind.css` (generated, not committed)

Tailwind v4 has no `tailwind.config.js`; all config lives in `_css/input.css`.

## Liquid / JS Template Gotcha

Jekyll processes `{{ }}` inside `<script>` blocks. Use `{secret}` (single braces) as JS/YAML placeholders that Liquid won't touch. Only use `{{ }}` for intentional Jekyll injections (e.g. `{{ site.data.tasks | jsonify }}`).
