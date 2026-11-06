// Battlegroup front-end logic.
//
// Exactly one view is visible at a time, toggled with the `hidden` attribute.
// Test without the API by adding ?mock=<mode> to the URL:
//   ok | unknown | refused | ratelimit | error | imagefail
// (mock modes never call the API or the image cache; art is drawn as initials.
// `imagefail` makes the first image attempt for fighter 1 fail, to test Retry.)
(() => {
  const VIEWS = ['form', 'loading', 'result', 'error'];
  const MOCK = new URLSearchParams(location.search).get('mock');
  const GENERIC_ERROR = "Couldn't get a verdict. Please try again.";

  const $ = (id) => document.getElementById(id);
  const form = $('fight-form');
  const fightButton = $('fight-button');
  const retryButton = $('retry-button');
  const backButton = $('back-button');
  const formMessage = $('form-message');

  let lastRequest = null; // what Retry re-sends
  let lastMatch = null; // the match currently on screen, for image Retry
  let busy = false;

  function showView(name) {
    for (const view of VIEWS) $('view-' + view).hidden = view !== name;
    // Move keyboard/screen-reader focus to the new view's main message.
    const target = $('view-' + name).querySelector('[data-focus]');
    if (target) target.focus({ preventScroll: true });
  }

  function setBusy(value) {
    busy = value;
    fightButton.disabled = value;
    retryButton.disabled = value;
  }

  function showError(message, { canRetry = true } = {}) {
    $('error-message').textContent = message;
    retryButton.hidden = !canRetry;
    showView('error');
  }

  function showFormMessage(message) {
    formMessage.textContent = message;
    showView('form');
  }

  // ---- Character art (Stage 6) and image cache (Stage 7) ----

  const CACHE_PREFIX = 'bg:img:v2:'; // bump the version when the image prompt changes
  const IMAGE_W = 512;
  const IMAGE_H = 768;
  let matchId = 0; // ignores images that arrive after a newer match started
  let imageFailedOnce = false; // for ?mock=imagefail

  const normaliseName = (name) => name.trim().toLowerCase().replace(/\s+/g, ' ');

  // Drop images cached under older versions (made with an older prompt).
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('bg:img:') && !key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // storage blocked: nothing to clean
  }

  function cacheGet(name) {
    try {
      return localStorage.getItem(CACHE_PREFIX + normaliseName(name));
    } catch {
      return null; // storage blocked or unavailable
    }
  }

  function cacheSet(name, image) {
    try {
      localStorage.setItem(CACHE_PREFIX + normaliseName(name), image);
    } catch {
      // storage full or blocked: skip caching, never fail the match
    }
  }

  // Shrinks the generated image so it is cheap to store; falls back to the original.
  function shrinkImage(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = IMAGE_W;
          canvas.height = IMAGE_H;
          canvas.getContext('2d').drawImage(img, 0, 0, IMAGE_W, IMAGE_H);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  function mockArt(name) {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_W}" height="${IMAGE_H}">` +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a2a5c"/><stop offset="1" stop-color="#171726"/></linearGradient></defs>' +
      '<rect width="100%" height="100%" fill="url(#g)"/>' +
      `<text x="50%" y="50%" fill="#f2f2f7" font-family="sans-serif" font-size="150" font-weight="800" text-anchor="middle" dominant-baseline="middle">${initials(name).replace(/[<>&]/g, '')}</text></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  function initials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.trim().slice(0, 2);
    return letters.toUpperCase();
  }

  // Returns { httpStatus, data } like requestVerdict, for the mock and the real API.
  async function requestImage(name, desc, side) {
    if (MOCK) {
      await delay(700);
      if (MOCK === 'imagefail' && side === 'a' && !imageFailedOnce) {
        imageFailedOnce = true;
        return { httpStatus: 502, data: { status: 'error', message: "Couldn't draw this fighter. You can retry." } };
      }
      return { httpStatus: 200, data: { status: 'ok', image: mockArt(name) } };
    }
    const response = await fetch('/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, desc }),
    });
    const data = await response.json().catch(() => null);
    return { httpStatus: response.status, data };
  }

  function setSlot(side, { image, status, canRetry = false, name }) {
    const img = $('img-' + side);
    const slot = $('image-' + side);
    const statusEl = $('status-' + side);
    $('retry-image-' + side).hidden = !canRetry;
    statusEl.textContent = status || '';
    statusEl.hidden = !status;
    slot.classList.toggle('loading', Boolean(status) && !canRetry);
    slot.classList.toggle('failed', canRetry);
    if (image) {
      img.alt = `Anime-style art of ${name}`;
      img.src = image;
      img.hidden = false;
    } else {
      img.hidden = true;
      img.removeAttribute('src');
      img.alt = '';
    }
  }

  async function loadImage(side, name, desc, id) {
    if (!MOCK) {
      const cached = cacheGet(name);
      if (cached) return setSlot(side, { image: cached, name });
    }

    setSlot(side, { status: 'Drawing...' });
    let outcome;
    try {
      outcome = await requestImage(name, desc, side);
    } catch {
      outcome = { httpStatus: 0, data: null };
    }
    if (id !== matchId) return; // a newer match replaced this one

    const { httpStatus, data } = outcome;
    if (httpStatus === 200 && data && data.status === 'ok' && typeof data.image === 'string' && data.image.startsWith('data:image/')) {
      const image = MOCK ? data.image : await shrinkImage(data.image);
      if (id !== matchId) return;
      if (!MOCK) cacheSet(name, image);
      return setSlot(side, { image, name });
    }

    const message =
      httpStatus === 429
        ? 'Too many requests, try again shortly.'
        : (data && data.message) || "Couldn't draw this fighter. You can retry.";
    setSlot(side, { status: message, canRetry: true });
  }

  function showResult(request, data) {
    // textContent only: names and reasoning are user/model text, never HTML.
    $('winner-name').textContent = data.winnerName;
    $('name-a').textContent = request.a;
    $('name-b').textContent = request.b;
    $('reasoning').textContent = data.reasoning;
    matchId += 1;
    const id = matchId;
    lastMatch = { request, id };
    setSlot('a', { status: 'Drawing...' });
    setSlot('b', { status: 'Drawing...' });
    showView('result');

    // The verdict shows first; each image fills in as it arrives.
    loadImage('a', request.a, request.descA, id);
    loadImage('b', request.b, request.descB, id);
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Returns { httpStatus, data } in the same shape for the mock and the real API.
  async function requestVerdict(request) {
    if (MOCK) {
      await delay(1200);
      switch (MOCK) {
        case 'error':
          throw new Error('mock failure');
        case 'ratelimit':
          return { httpStatus: 429, data: { status: 'rate_limited' } };
        case 'refused':
          return { httpStatus: 200, data: { status: 'refused', message: "Sorry, that matchup isn't something I can judge. Try different fighters." } };
        case 'unknown':
          if (!request.descA) return { httpStatus: 200, data: { status: 'needs_description', unknown: ['a'] } };
        // falls through once a description was given
        default:
          return {
            httpStatus: 200,
            data: {
              status: 'ok',
              winner: 'a',
              winnerName: request.a,
              reasoning: `${request.a} takes this one on raw power and experience. ${request.b} puts up a strong fight, but cannot keep up over a long exchange. This is a mock result for testing the layout.`,
            },
          };
      }
    }

    const response = await fetch('/api/verdict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data = await response.json().catch(() => null);
    return { httpStatus: response.status, data };
  }

  async function runFight(request) {
    lastRequest = request;
    setBusy(true);
    showView('loading');
    try {
      const { httpStatus, data } = await requestVerdict(request);

      if (httpStatus === 429) {
        return showError('Too many requests, try again shortly.');
      }
      if (!data || httpStatus >= 400) {
        return showError((data && data.message) || GENERIC_ERROR);
      }

      switch (data.status) {
        case 'ok':
          return showResult(request, data);
        case 'needs_description': {
          for (const side of ['a', 'b']) $(`desc-${side}-wrap`).hidden = !data.unknown.includes(side);
          const names = data.unknown.map((side) => (side === 'a' ? request.a : request.b));
          return showFormMessage(`We don't recognise ${names.join(' and ')}. Add a short description to continue.`);
        }
        case 'refused':
          return showError(data.message || "That matchup can't be judged.", { canRetry: false });
        default:
          return showError(GENERIC_ERROR);
      }
    } catch {
      showError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;

    const a = $('fighter-a').value.trim();
    const b = $('fighter-b').value.trim();
    const descA = $('desc-a').value.trim();
    const descB = $('desc-b').value.trim();

    if (!a || !b) return showFormMessage('Enter both fighter names.');
    if (a.toLowerCase() === b.toLowerCase()) return showFormMessage('Pick two different fighters.');
    if (!$('desc-a-wrap').hidden && !descA) return showFormMessage(`Add a short description for ${a}.`);
    if (!$('desc-b-wrap').hidden && !descB) return showFormMessage(`Add a short description for ${b}.`);

    formMessage.textContent = '';
    runFight({ a, b, descA, descB });
  });

  for (const side of ['a', 'b']) {
    $('retry-image-' + side).addEventListener('click', () => {
      if (!lastMatch) return;
      const { request, id } = lastMatch;
      loadImage(side, side === 'a' ? request.a : request.b, side === 'a' ? request.descA : request.descB, id);
    });
  }

  retryButton.addEventListener('click', () => {
    if (!busy && lastRequest) runFight(lastRequest);
  });

  backButton.addEventListener('click', () => showFormMessage(''));

  $('again-button').addEventListener('click', () => {
    matchId += 1; // drop any images still on the way
    for (const id of ['fighter-a', 'fighter-b', 'desc-a', 'desc-b']) $(id).value = '';
    $('desc-a-wrap').hidden = true;
    $('desc-b-wrap').hidden = true;
    showFormMessage('');
  });
})();
