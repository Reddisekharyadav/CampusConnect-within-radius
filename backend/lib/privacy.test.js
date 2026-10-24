const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LOCATION_TTL_MS_DEFAULT,
  locationTtlMs,
  isLocationStale,
  isDemoSeedAllowedInProduction,
  isMatched,
  findWave,
} = require("./validation");

test("location TTL defaults to 5 minutes and honours a valid override", () => {
  assert.equal(LOCATION_TTL_MS_DEFAULT, 5 * 60 * 1000);
  assert.equal(locationTtlMs({}), 5 * 60 * 1000);
  assert.equal(locationTtlMs({ LOCATION_TTL_MS: "2000" }), 2000);
  assert.equal(locationTtlMs({ LOCATION_TTL_MS: "bogus" }), 5 * 60 * 1000);
  assert.equal(locationTtlMs({ LOCATION_TTL_MS: "0" }), 5 * 60 * 1000);
});

test("stale locations: missing, old, and fresh lastActive", () => {
  const now = Date.now();
  assert.equal(isLocationStale(null, now), true);
  assert.equal(isLocationStale(undefined, now), true);
  assert.equal(isLocationStale(new Date(now - 6 * 60 * 1000), now), true);
  assert.equal(isLocationStale(new Date(now - 60 * 1000), now), false);
  // Short TTL (used by the smoke test) expires quickly.
  assert.equal(isLocationStale(new Date(now - 3000), now, 2000), true);
  assert.equal(isLocationStale(new Date(now - 1000), now, 2000), false);
});

test("demo seeding is off in production unless explicitly overridden", () => {
  assert.equal(isDemoSeedAllowedInProduction({ NODE_ENV: "production" }), false);
  assert.equal(isDemoSeedAllowedInProduction({ NODE_ENV: "production", ALLOW_DEMO_SEED_PRODUCTION: "1" }), true);
  assert.equal(isDemoSeedAllowedInProduction({ NODE_ENV: "production", ALLOW_DEMO_SEED_PRODUCTION: "0" }), false);
  assert.equal(isDemoSeedAllowedInProduction({ NODE_ENV: "development" }), true);
  assert.equal(isDemoSeedAllowedInProduction({}), true);
});

test("a match exists only for an accepted wave in either direction", () => {
  const waves = [
    { fromUsernameKey: "alice", toUsernameKey: "bob", status: "pending" },
    { fromUsernameKey: "carol", toUsernameKey: "dave", status: "accepted" },
    { fromUsernameKey: "erin", toUsernameKey: "frank", status: "declined" },
  ];
  assert.equal(isMatched(waves, "alice", "bob"), false);
  assert.equal(isMatched(waves, "dave", "carol"), true);
  assert.equal(isMatched(waves, "carol", "dave"), true);
  assert.equal(isMatched(waves, "erin", "frank"), false);
  assert.equal(isMatched([], "alice", "bob"), false);
});

test("findWave locates a directional wave or returns null", () => {
  const waves = [{ fromUsernameKey: "alice", toUsernameKey: "bob", status: "pending" }];
  assert.equal(findWave(waves, "alice", "bob").status, "pending");
  assert.equal(findWave(waves, "bob", "alice"), null);
});
