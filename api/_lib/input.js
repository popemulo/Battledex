// Shared cleaning for user-supplied fighter text (used by /api/verdict and /api/image).

export const NAME_MAX = 50;
export const DESC_MAX = 200;

// Control characters, line/paragraph separators, and angle brackets.
const UNSAFE_CHARS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029<>]', 'g');

/**
 * Returns the cleaned string, or null if it is not a string or is too long.
 * Control characters and angle brackets become spaces so user text can't close
 * or open the prompt tags that wrap it.
 */
export function sanitize(value, max) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length > max) return null;
  return cleaned;
}

/** A usable name has at least one letter or digit (rejects symbol-only input). */
export function hasLetterOrDigit(text) {
  return /[\p{L}\p{N}]/u.test(text);
}

/** Parses a JSON request body that may arrive as a string or an object. */
export function readBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body && typeof body === 'object' ? body : null;
}
