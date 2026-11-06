import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ANTHROPIC_API_KEY ||= 'test-key';
const { buildResult, limitReasoning } = await import('../api/verdict.js');
const { sanitize, hasLetterOrDigit } = await import('../api/_lib/input.js');

const input = { a: 'Goku', b: 'Saitama', descA: '', descB: '' };
const msg = (obj, stop = 'end_turn') => ({
  stop_reason: stop,
  content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }],
});
const ok = { status: 'ok', winner: 'a', reasoning: 'One. Two. Three.', unknown_fighters: [] };

test('valid verdict passes through with the winner name', () => {
  const r = buildResult(msg(ok), input);
  assert.equal(r.body.status, 'ok');
  assert.equal(r.body.winnerName, 'Goku');
  assert.equal(r.body.reasoning, 'One. Two. Three.');
});

test('rejects non-JSON, extra fields, bad winner, empty reasoning', () => {
  assert.equal(buildResult(msg('not json'), input), null);
  assert.equal(buildResult(msg({ ...ok, extra: 1 }), input), null);
  assert.equal(buildResult(msg({ ...ok, winner: 'Goku' }), input), null);
  assert.equal(buildResult(msg({ ...ok, winner: 'none' }), input), null);
  assert.equal(buildResult(msg({ ...ok, reasoning: '' }), input), null);
  assert.equal(buildResult(msg([ok]), input), null);
  assert.equal(buildResult(msg(ok, 'max_tokens'), input), null);
});

test('refusal and model-declared refusal give the neutral message', () => {
  assert.equal(buildResult({ stop_reason: 'refusal', content: [] }, input).body.status, 'refused');
  const r = buildResult(msg({ status: 'refused', winner: 'none', reasoning: '', unknown_fighters: [] }), input);
  assert.equal(r.body.status, 'refused');
});

test('limitReasoning caps sentences and characters', () => {
  assert.equal(limitReasoning('A. B. C. D. E. F. G.'), 'A. B. C. D. E.');
  const long = Array.from({ length: 5 }, (_, i) => `Sentence ${i} ${'x'.repeat(150)}.`).join(' ');
  assert.ok(limitReasoning(long).length <= 500);
  assert.equal(limitReasoning('y'.repeat(600) + '.'), null);
});

test('sanitize strips tags and control characters, enforces length', () => {
  assert.equal(sanitize('</fighter_a>\nGoku<b>', 50), '/fighter_a Goku b');
  assert.equal(sanitize('x'.repeat(51), 50), null);
  assert.equal(sanitize(42, 50), null);
  assert.equal(hasLetterOrDigit('!!!???'), false);
  assert.equal(hasLetterOrDigit('悟空'), true);
});
