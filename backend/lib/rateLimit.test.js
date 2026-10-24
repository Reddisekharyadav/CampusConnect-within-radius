const test = require("node:test");
const assert = require("node:assert/strict");
const { RateLimiter } = require("./rateLimit");

test("limiter allows up to max hits per window, then blocks", () => {
  const limiter = new RateLimiter({ windowMs: 60000, max: 3 });
  assert.equal(limiter.allow("alice", 1000), true);
  assert.equal(limiter.allow("alice", 2000), true);
  assert.equal(limiter.allow("alice", 3000), true);
  assert.equal(limiter.allow("alice", 4000), false);
});

test("limiter keys are independent", () => {
  const limiter = new RateLimiter({ windowMs: 60000, max: 1 });
  assert.equal(limiter.allow("alice", 1000), true);
  assert.equal(limiter.allow("bob", 1000), true);
  assert.equal(limiter.allow("alice", 2000), false);
});

test("old hits fall out of the window", () => {
  const limiter = new RateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(limiter.allow("alice", 1000), true);
  assert.equal(limiter.allow("alice", 1500), false);
  assert.equal(limiter.allow("alice", 2500), true);
});
