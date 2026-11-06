# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Battlegroup: a one-page app where the user enters two fighters and gets an AI verdict on who wins, plus anime-style art for both. Vanilla HTML/CSS/JS front end with no framework or build step, and Vercel Functions in `api/` as a proxy that holds the API keys. `project-brief.md` is the spec; `project-build.md` is the staged plan with per-stage status. Stages 1 to 8 are built and tested locally; Stage 9 (deploy) is not done. Update the status in `project-build.md` when a stage changes.

## Commands

- Run locally: `vercel dev --listen 3000` (serves the static files and `api/*` together). The CLI may not be on `PATH`; one install lives at `~/.npm-global/bin/vercel`. A stale `vercel dev` can already hold the port, in which case it falls back to the next one. Do not add a `dev` script to `package.json` that calls `vercel dev`: Vercel rejects the recursion.
- Env: copy `.env.example` to `.env.local` or `.env` (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, optional `ANTHROPIC_MODEL`, `OPENAI_IMAGE_MODEL`, optional Upstash vars). The Vercel project `development2` is linked via `.vercel/` but has no env vars set on Vercel yet.
- Unit tests: `npm test` (`node --test test/`). Run one file with `node --test test/verdict.test.mjs`.
- Injection checks against the live verdict route: `node scripts/injection-test.mjs [baseUrl]`. It calls the real model and waits out the rate limit. Re-run it after any change to the verdict prompt.
- Exercise a route: `curl -X POST localhost:3000/api/verdict -H 'content-type: application/json' -d '{"a":"Goku","b":"Superman"}'` (fields `a`, `b`, optional `descA`, `descB`), or `/api/image` with `{"name":"Goku","desc":""}` (costs an image call).
- Test the front end without any API calls: open the page with `?mock=ok|unknown|refused|ratelimit|error|imagefail`.

## Architecture

**Front end (`app.js`, one IIFE).** Four sibling views (`#view-form`, `#view-loading`, `#view-result`, `#view-error`); `showView(name)` sets `hidden` on all but one and moves focus to that view's `[data-focus]` element. `requestVerdict()` and `requestImage()` both return `{ httpStatus, data }` for the mock modes and the real `fetch`, so the flow doesn't know which is in use. After the verdict renders, each fighter's image loads independently (`loadImage`): check the `localStorage` cache, else call `/api/image`, shrink the result to 512x768 JPEG on a canvas, cache it, show it. A failed image shows its own Retry button without losing the verdict. `matchId` makes images from an earlier match ignore themselves if a new one has started. Cache keys are `bg:img:v2:<normalised name>`; storage errors are swallowed. Mock modes skip the cache and draw initials as SVG art.

**Verdict route (`api/verdict.js`).** Input is cleaned by `api/_lib/input.js` (control characters and `<>` removed, 50-character names, 200-character descriptions, names need a letter or digit). Each fighter goes into `<fighter_a>` / `<fighter_b>` tags. The system prompt locks the model to judging and tells it to refuse instruction-like input; the call uses a JSON-schema structured output where `winner` is `a` / `b` / `none` (never a name). `buildResult()` accepts only the exact four output fields and maps them to a status the front end handles: `ok`, `needs_description`, `refused`, or an error (anything invalid is an error, never passed through). `limitReasoning()` caps the reasoning at 5 sentences and 500 characters. The call uses `effort: 'low'`, `max_tokens: 1500`, and a server-side fallback beta for non-Haiku models.

**Image route (`api/image.js`).** Calls OpenAI (`gpt-image-1-mini` by default, low quality, 1024x1536 JPEG) with a shared style prefix, non-graphic rules, and the cleaned name and description as labelled data. It returns a base64 data URL. Content-policy rejections return 422, other failures 502/503, all with neutral messages.

**Rate limit (`api/_lib/ratelimit.js`).** Fixed one-minute window per IP, with a separate bucket per route: `/api/verdict` 5 per minute, `/api/image` 10 per minute. `applyRateLimit(req, res, { scope, limit })` sends the 429 itself and returns false, so handlers just `return` on false. The counter backend depends on the environment: Upstash Redis when its env vars are set; otherwise an in-memory map when hosted (per instance only); otherwise a temp file under `os.tmpdir()` locally, because `vercel dev` runs each request in a fresh process. To reset the limit while testing locally, delete `battlegroup-ratelimit.json` from the temp directory.

**Config.** `vercel.json` sets `maxDuration` 30 s for verdict and 60 s for image; upstream timeouts (25 s and 50 s) must stay below them. Same origin for page and functions, so don't add CORS.

## Constraints

- Render model output and user text with `textContent`, never `innerHTML`.
- API keys stay in the functions. Don't reference them in `index.html`, `app.js` or `styles.css`.
