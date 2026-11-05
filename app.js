// Battlegroup front-end logic.
//
// Exactly one view is visible at a time, toggled with the `hidden` attribute.
// Test without the API by adding ?mock=<mode> to the URL:
//   ok | unknown | refused | ratelimit | error
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
  let busy = false;

  function showView(name) {
    for (const view of VIEWS) $('view-' + view).hidden = view !== name;
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

  function initials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.trim().slice(0, 2);
    return letters.toUpperCase();
  }

  // Stage 2/4 stand-in for the character art. Real images arrive in Stage 5.
  function fillImage(id, name) {
    const el = $(id);
    el.textContent = initials(name);
    el.classList.add('filled');
  }

  function resetImages() {
    for (const id of ['image-a', 'image-b']) {
      const el = $(id);
      el.textContent = '';
      el.classList.remove('filled');
    }
  }

  function showResult(request, data) {
    // textContent only: names and reasoning are user/model text, never HTML.
    $('winner-name').textContent = data.winnerName;
    $('name-a').textContent = request.a;
    $('name-b').textContent = request.b;
    $('reasoning').textContent = data.reasoning;
    resetImages();
    showView('result');

    // The verdict shows first, then the art fills in.
    setTimeout(() => {
      fillImage('image-a', request.a);
      fillImage('image-b', request.b);
    }, 800);
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

  retryButton.addEventListener('click', () => {
    if (!busy && lastRequest) runFight(lastRequest);
  });

  backButton.addEventListener('click', () => showFormMessage(''));

  $('again-button').addEventListener('click', () => {
    for (const id of ['fighter-a', 'fighter-b', 'desc-a', 'desc-b']) $(id).value = '';
    $('desc-a-wrap').hidden = true;
    $('desc-b-wrap').hidden = true;
    showFormMessage('');
  });
})();
