// Tiny in-memory rate limiter — dependency-free, no Redis required.
// This is per-process state, which is the right trade-off for a free-tier
// single-instance backend (see DEPLOYMENT.md). On a multi-instance deploy
// this must be replaced with a shared store; the API shape (allow(key))
// is deliberately small so that swap is a one-file change.

class RateLimiter {
  constructor({ windowMs, max }) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map(); // key -> array of timestamps (ms)
  }

  allow(key, nowMs = Date.now()) {
    const cutoff = nowMs - this.windowMs;
    const recent = (this.hits.get(key) || []).filter((t) => t > cutoff);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(nowMs);
    this.hits.set(key, recent);
    return true;
  }

  reset() {
    this.hits.clear();
  }
}

// Express middleware wrapper. keyFn(req) decides the bucket (IP, token user,
// or a combination). A rejected request gets 429, never a silent drop.
function rateLimitMiddleware(limiter, keyFn) {
  return (req, res, next) => {
    const key = keyFn(req);
    if (!limiter.allow(key)) {
      res.setHeader("Retry-After", Math.ceil(limiter.windowMs / 1000));
      return res.status(429).json({ error: "Too many requests, try again later" });
    }
    return next();
  };
}

module.exports = { RateLimiter, rateLimitMiddleware };
