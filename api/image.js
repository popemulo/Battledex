// Stage 3: mock route. The real image generation is built in Stage 5.
import { applyRateLimit } from './_lib/ratelimit.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ status: 'error', message: 'Method not allowed.' });
  }
  if (!(await applyRateLimit(req, res))) return;

  return res.status(200).json({
    status: 'mock',
    image: null,
    message: 'Image generation is not available yet.',
  });
}
