// Per-IP rate limit (fixed one-minute window). Each route has its own bucket:
// /api/verdict allows 5 per minute and /api/image allows 10 per minute
// (a match is one verdict plus two images).
//
// Vercel Functions are stateless, so a counter held in memory only works per
// function instance. When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
// are set, the counter lives in Redis and is shared across instances.
// Without them, hosted deployments fall back to a per-instance memory counter
// (best effort only) and local development uses a temp file.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const LIMIT = 5; // default per-route limit
const WINDOW_MS = 60_000;

const memory = new Map(); // key -> { bucket, count }
let warned = false;

export function getClientIp(req) {
  const h = req.headers || {};
  // On Vercel these headers are set by the platform, not by the client.
  const forwarded = String(h['x-forwarded-for'] || '').split(',')[0].trim();
  return (
    String(h['x-vercel-forwarded-for'] || '').split(',')[0].trim() ||
    String(h['x-real-ip'] || '').trim() ||
    forwarded ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function hasRedis() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function incrementRedis(key) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, 120],
    ]),
  });
  if (!res.ok) throw new Error(`redis status ${res.status}`);
  const out = await res.json();
  const count = Number(out?.[0]?.result);
  if (!Number.isFinite(count)) throw new Error('redis bad response');
  return count;
}

function incrementMemory(key, bucket) {
  if (memory.size > 500) {
    for (const [k, v] of memory) if (v.bucket < bucket) memory.delete(k);
  }
  const entry = memory.get(key) || { bucket, count: 0 };
  entry.count += 1;
  memory.set(key, entry);
  return entry.count;
}

// Local development only (`vercel dev` runs each request in a fresh process, so
// memory can't count). Counts in a temp file instead.
function incrementFile(key, bucket) {
  const file = path.join(os.tmpdir(), 'battlegroup-ratelimit.json');
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // missing or unreadable: start fresh
  }
  for (const k of Object.keys(data)) if (data[k].bucket < bucket) delete data[k];
  const entry = data[key] || { bucket, count: 0 };
  entry.count += 1;
  data[key] = entry;
  try {
    fs.writeFileSync(file, JSON.stringify(data));
  } catch {
    // ignore write failures in dev
  }
  return entry.count;
}

function isHosted() {
  return process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';
}

/**
 * Counts this request against the caller's IP. Returns true if the request may
 * proceed. When over the limit it sends the 429 response itself and returns false.
 */
export async function applyRateLimit(req, res, { scope = 'verdict', limit = LIMIT } = {}) {
  const now = Date.now();
  const bucket = Math.floor(now / WINDOW_MS);
  const key = `battlegroup:rl:${scope}:${getClientIp(req)}:${bucket}`;

  let count;
  if (hasRedis()) {
    try {
      count = await incrementRedis(key);
    } catch {
      console.error('rate limit: redis unavailable, using in-memory counter');
      count = incrementMemory(key, bucket);
    }
  } else if (isHosted()) {
    if (!warned) {
      warned = true;
      console.warn('rate limit: no Redis configured, limit is per function instance only');
    }
    count = incrementMemory(key, bucket);
  } else {
    count = incrementFile(key, bucket);
  }

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - count)));

  if (count > limit) {
    const retryAfter = Math.max(1, Math.ceil(((bucket + 1) * WINDOW_MS - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      status: 'rate_limited',
      message: 'Too many requests. Try again shortly.',
    });
    return false;
  }
  return true;
}
