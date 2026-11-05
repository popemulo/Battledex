# Battlegroup - Build Plan

Staged plan for `project-brief.md`. Do one stage at a time and check its "Done when" before starting the next. Each stage leaves the app in a working state.

Stack: HTML, CSS, vanilla JS, plus a small proxy (Vercel Functions) that holds the API keys. Hosted on Vercel.

| # | Stage | Result | Status |
|---|-------|--------|--------|
| 0 | Settle blocking decisions | Providers and proxy chosen, Vercel project created | Done (image model deferred to Stage 5) |
| 1 | Static page | Four views in the markup, only the input form visible | Done |
| 2 | Front-end logic with mock data | View switching and full flow work with fake results | Done |
| 3 | Proxy and rate limit | Deployed Vercel Functions that limit requests | Done locally, not yet checked on a deployed URL |
| 4 | Real verdict | LLM verdict shown in the page | Done, tested live locally |
| 5 | Real character art | Two anime images shown in the page | Not started |
| 6 | Image caching | Repeat matchups reuse images | Not started |
| 7 | Polish and cross-browser checks | Looks and works right on desktop and phone | Not started |
| 8 | Deploy and final check | Live app meets the success criteria | Not started |

---

## Stage 0: Settle blocking decisions
**Goal:** answer the open questions that block later stages.

**Status:** done, except the image model. Decided: proxy (option A), Claude via the Anthropic SDK (`claude-opus-5-5` by default), users can add a description for unrecognised fighters. The image model is still open and is needed in Stage 5 (Anthropic models don't generate images). The Vercel project is created and linked from the CLI; it is not connected to a git repo because there isn't one yet.

- Choose proxy (option A, recommended) or user-supplied key (option B).
- Choose the LLM provider and model.
- Choose the image model. Estimate cost per match.
- Hosting is decided: Vercel for both the static site and the proxy. Create the Vercel project and connect it to the repo.
- Decide whether users can add a fighter description when a name isn't recognised.

**Done when:** each item above is written into section 11 of the brief as decided.

---

## Stage 1: Static page
**Goal:** the page layout, with no JavaScript logic yet.

- Create `index.html`, `styles.css`, `app.js` (empty for now).
- Build four separate views on the one page, each its own element (e.g. `<section id="view-form">`, `#view-loading`, `#view-result`, `#view-error`):
  - **Input form view:** two name inputs and a **Fight** button.
  - **Loading view:** a loading message or indicator.
  - **Result view:** two image placeholders side by side, a "WIN" label spot, and a reasoning text spot.
  - **Error view:** an error message spot and a **Retry** button.
- Views are toggled with the `hidden` attribute, not stacked on top of each other. Only one view is visible at a time.
- In the HTML, only the input form view is visible. The loading, result, and error views carry the `hidden` attribute.
- Basic responsive layout that stacks on narrow screens.

**Done when:** the page opens with only the input form visible, the other three views are in the markup but hidden (removing `hidden` in dev tools shows each one), and it looks reasonable on desktop and phone widths.

---

## Stage 2: Front-end logic with mock data
**Goal:** the full user flow works with fake results.

**Status:** done. Test modes: open the page with `?mock=ok`, `?mock=unknown`, `?mock=refused`, `?mock=ratelimit`, or `?mock=error`. The character art is a placeholder (the fighter's initials) until Stage 5.

- Write a small `showView(name)` function in `app.js` that sets `hidden` on every view except the one named, so exactly one view is visible at a time.
- Validate input: both names required, and the two names must differ. Show validation messages inline in the form view (the error view is for request failures).
- On **Fight**: `showView('loading')`, then after a delay `showView('result')` with a hard-coded mock result (winner, reasoning, placeholder images).
- In the result view, the verdict appears first and the images fill in after (simulate with a delay).
- Error view with a **Retry** button (add a way to trigger it for testing). **Retry** runs the request again via the loading view.
- Disable the **Fight** button while a request is running.

**Done when:** you can run through form to loading to result, validation error, and failure to error view to retry using only mock data, and only one view is ever visible.

---

## Stage 3: Proxy and rate limit
**Goal:** a deployed proxy with no AI calls yet.

**Status:** done locally (the 6th call in a minute returns 429). Not yet checked on a deployed URL. The 5-per-minute counter is shared by both routes, so once Stage 5 makes one match cost three requests (one verdict, two images), the limit will need revisiting. Set the Upstash variables for a real limit in production.

- Create two Vercel Functions in the `api/` folder: `api/verdict.js` and `api/image.js` (return mock responses for now).
- Store API keys as Vercel environment variables (none needed yet, set up the structure).
- Enforce 5 requests per minute per IP. Over the limit returns HTTP 429 and a short message. Functions are stateless, so use shared storage (e.g. a Redis store) or a Vercel rate limiting rule for the counter. Choose one here.
- The page and functions share one origin, so CORS is not needed. Don't enable open CORS on the functions.
- Check the function timeout limits on your Vercel plan, since image generation can be slow.
- Front end shows the "too many requests, try again shortly" message on 429.

**Done when:** calling the endpoint 6 times in a minute returns 429 on the sixth call, and the page shows the message.

---

## Stage 4: Real verdict
**Goal:** the verdict comes from the LLM.

**Status:** done and tested live locally: known matchup, unknown name, description follow-up, and refusal of a private individual. Needs `ANTHROPIC_API_KEY` set in Vercel for production.

- Write the verdict prompt: given two fighter names, return JSON with `winner` and `reasoning` (3-5 sentences). No score or confidence.
- Call the LLM from the proxy `/verdict` route. Validate the JSON before returning it.
- Handle unrecognised names: return a response that asks for a short description (per the Stage 0 decision).
- Apply the content rules: refuse private individuals, hateful, or sexual input, with a neutral message.
- Front end replaces mock data with the real response.

**Done when:** a known matchup returns a sensible verdict, an unknown name triggers the description prompt, and a refused input shows the neutral message.

---

## Stage 5: Real character art
**Goal:** two anime-style images generated per match.

- Add the shared style prefix (e.g. "anime style, full body, dynamic pose, neutral background") to every image prompt.
- Call the image model from the proxy `/image` route, one call per fighter.
- Add non-graphic rules to the prompt: no gore, no explicit injury.
- Front end shows the verdict first, then fills each image in as it arrives. A failed image shows a retry option without losing the verdict.

**Done when:** a match shows a verdict plus two images in matching style, and a single failed image can be retried.

---

## Stage 6: Image caching
**Goal:** avoid paying to regenerate the same fighter.

- Store generated images in `localStorage` keyed by normalised fighter name (trim and lowercase).
- Check the cache before calling `/image`.
- Handle storage limits: if full, skip caching rather than failing.

**Done when:** repeating a matchup shows images immediately with no image API call.

---

## Stage 7: Polish and cross-browser checks
**Goal:** make it feel finished.

- Visual styling with an anime / battle feel.
- Clear loading states and smooth image fade-in.
- Keyboard use (Enter submits) and basic accessibility (labels, alt text, contrast).
- Test in current Chrome, Safari, and Firefox, on desktop and a phone.

**Done when:** no layout breaks or console errors in the three browsers.

---

## Stage 8: Deploy and final check
**Goal:** the live app meets the brief.

- Deploy to Vercel (static site and `api/` functions together) and set the environment variables for production.
- Confirm no API keys appear in client-side code or network requests from the page.
- Time a typical match (target about 15 seconds or less).
- Decide the copyright approach for anime characters (private demo, or public with a disclaimer) and add the disclaimer if needed.
- Walk through every item in section 10 of the brief.

**Done when:** all success criteria in section 10 of the brief pass on the live URL.
