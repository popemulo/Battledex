# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Battlegroup: a one-page app where the user enters two fighters and gets an AI verdict on who wins, plus (planned) anime-style art for both. Vanilla HTML/CSS/JS front end with no framework or build step, and Vercel Functions in `api/` as a proxy that holds the API keys. `project-brief.md` is the spec; `project-build.md` is the staged plan with per-stage status. Do one stage at a time and check its "Done when" before moving on. Update the status in `project-build.md` when a stage changes.

## Commands

There is no build, lint, or test tooling; `package.json` only has the Anthropic SDK dependency.

- Run locally: `vercel dev --listen 3000` (serves the static files and `api/*` together). The CLI may not be on `PATH`; one install lives at `~/.npm-global/bin/vercel`. A stale `vercel dev` can already hold port 3000, in which case it falls back to 3001.
- Env: copy `.env.example` to `.env.local` (`ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL`, optional Upstash vars). The Vercel project `development2` is linked via `.vercel/`, so `vercel dev` can also pull env from it.
- Exercise the verdict route: `curl -X POST localhost:3000/api/verdict -H 'content-type: application/json' -d '{"a":"Goku","b":"Superman"}'`. The body fields are `a`, `b`, and optional `descA`, `descB`.
- Test the front end without the API: open the page with `?mock=ok|unknown|refused|ratelimit|error`.

## Architecture

**Front end (`app.js`, one IIFE).** The page has four sibling views (`#view-form`, `#view-loading`, `#view-result`, `#view-error`). `showView(name)` sets `hidden` on all but one; never show two at once. `requestVerdict()` returns `{ httpStatus, data }` in the same shape for both the mock modes and the real `fetch('/api/verdict')`, so the rest of the flow doesn't know which is in use. Verdict text appears first, and images fill in afterwards. Images are initials placeholders until Stage 6.

**Verdict route (`api/verdict.js`).** The server sanitizes input (strips control characters and `<>`, 60-character names, 300-character descriptions), wraps each fighter in `<fighter_a>` / `<fighter_b>` tags, and calls Claude with a JSON-schema structured output. The model returns `winner` as `a` / `b` / `none` rather than a name, so the server never has to match names. `buildResult()` maps the model output to one of the response statuses the front end handles: `ok`, `needs_description` (asks the user for a short description of the unknown fighter), `refused`, or an error. Anything that fails validation is an error, not a pass-through. The call uses `output_config.effort: 'low'` and a server-side fallback beta for non-Haiku models.

**Rate limit (`api/_lib/ratelimit.js`).** 5 requests/min/IP, fixed one-minute window, shared by every route that calls `applyRateLimit(req, res)`. It sends the 429 itself and returns false, so handlers just `return` on false. The counter backend depends on the environment: Upstash Redis when its env vars are set; otherwise an in-memory map when hosted (per instance only); otherwise a temp file under `os.tmpdir()` locally, because `vercel dev` runs each request in a fresh process. When the 5/min limit is hit while testing locally, delete `battlegroup-ratelimit.json` from the temp directory.

**Image route (`api/image.js`).** A mock that returns `status: 'mock'`. Real image generation (Stage 6) needs an image model that hasn't been chosen yet, because Anthropic models don't generate images.

**Config.** `vercel.json` sets a 30 s `maxDuration` for `api/*.js`. The upstream Anthropic call has a 25 s timeout. Same origin for page and functions, so don't add CORS.

## Constraints from the plan

- Stage 5 (judge lock-down) is not built yet. The current verdict prompt asks for 3-5 sentences and the target is about 3. The planned hardening includes a hard cap on reasoning length and refusal of off-topic input.
- Render model output with `textContent`, never `innerHTML`.
- Once Stage 6 lands, one match costs three requests against the shared 5/min limit, so the limit needs revisiting.
