# Battlegroup - Project Brief
## 1. What are we actually building?(Scope)

A web app where you type in two fighters, including anime characters, and get an AI generated verdict on who'd win, plus AI generated anime-style character art for both

## 2. Users and goal (decided)
- **Audience:** casual fans and friends. A fun, shareable, one-page demo.
- **Goal:** type two names, get a result that's entertaining enough to share.

## 3. Non-goals for v1 (decided)
- No user accounts or login
- No saved match history or leaderboards
- No multiplayer or real-time features
- No native mobile app (responsive web page only)

## 4. Verdict format (decided)
- **Winner:** the winning fighter's name, shown with a "WIN" label. No score, percentage, or confidence is displayed.
- **Reasoning:** about 3 sentences (hard cap 5 sentences / 500 characters, enforced by the server) covering style, strengths, and the matchup
- **Input:** fighter names only. If the model doesn't recognise a name, the app asks the user to add a short description (up to 200 characters) for that fighter and then judges using it (decided).

## 5. Character art (decided)
- **Style:** one fixed anime style for both fighters so the pair looks like they belong together, e.g. "anime style, full body, dynamic pose, neutral background". The style text is a shared prefix in every image prompt.
- **Anime characters:** the model should recognise well-known anime characters by name and draw them in their recognisable look (hair, outfit, signature features). For lesser-known or original characters, the user adds a short description (see section 4).
- **Copyright:** generated art of existing anime characters is a gray area. Decide whether the app stays a private demo or is public, and whether to add a disclaimer (open decision, see section 11).
- **Output:** two images per match, shown side by side.
- **Caching:** store generated images in `localStorage` keyed by fighter name, so repeat matchups don't regenerate and cost money.
- **Loading:** show a placeholder while images generate.

## 6. Tech stack (decided)
- **Frontend:** HTML, CSS, vanilla JavaScript. No framework and no build step.
- **Files:** `index.html`, `styles.css`, `app.js`.
- **External calls:** `fetch` to an LLM for the verdict and to an image model for the art.
- **Hosting:** Vercel. It serves the static files and runs the proxy as Vercel Functions in the same project.

**Key constraint:** any API key in browser JavaScript is visible to anyone who opens the page. **Decided: option A (proxy).** Option B was considered and rejected:
- **A. Small server-side proxy (recommended):** a Vercel Function (in the project's `api/` folder) holds the keys and enforces rate limits. Keys live in Vercel environment variables. The frontend still has no framework.
- **B. User-supplied key:** the visitor pastes their own key, stored in `localStorage`. Fine for a personal demo, not for a public link.

## 7. Providers, cost, and limits (decided)
- **LLM for verdicts (decided):** Claude, called from the Vercel Function with the official Anthropic SDK (`@anthropic-ai/sdk`). Default model `claude-sonnet-5-5`, overridable with the `ANTHROPIC_MODEL` environment variable (a smaller model such as `claude-haiku-5-5` is cheaper). The key goes in `ANTHROPIC_API_KEY`.
- **Image model (decided):** OpenAI, called from the Vercel Function with the official `openai` package. Default model `gpt-image-1-mini` at low quality, 1024x1536 JPEG, overridable with `OPENAI_IMAGE_MODEL`. The key goes in `OPENAI_API_KEY`. Measured about 10 seconds per image. Estimate the cost per match (two images) from OpenAI's current price list before launch.
- **Rate limit (per IP):** `/api/verdict` allows 5 requests per minute per IP address and `/api/image` allows 10 (two per match), each in its own bucket, enforced by the proxy. Requests over the limit get a "too many requests, try again shortly" message. Visitors behind a shared IP (office or mobile carrier NAT) share this limit. Vercel Functions are stateless, so the counter needs shared storage (e.g. a Redis store) or a Vercel-level rate limiting rule. Decided: use Upstash Redis (REST) when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. Without them, the hosted app counts per function instance only (best effort), and local dev counts in a temp file.

## 8. Content and safety (decided)
- Fictional characters and public figures are allowed.
- Refuse inputs that target private individuals, or that are hateful or sexual.
- Keep the art non-graphic: no gore and no explicit injury.
- On refusal, show a short neutral message and let the user try a different name.

## 9. Flow and errors (decided)
1. User enters two names and clicks **Fight**.
2. The verdict text appears first. The two images fill in when ready.
3. On any failure, show a message and a **Retry** button.

## 10. Success criteria for v1 (decided)
- A user can enter two names and see a verdict and two images on desktop and phone.
- Works in current Chrome, Safari, and Firefox.
- A typical match finishes in about 15 seconds or less (target, not a hard requirement).
- No API keys in client-side code.

## 11. Open decisions
- Final art style (the model is decided: OpenAI `gpt-image-1-mini`, see section 7)
- Copyright approach for anime characters (private demo, public launch with disclaimer, or other)
