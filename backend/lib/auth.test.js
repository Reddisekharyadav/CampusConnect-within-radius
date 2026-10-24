const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isValidPassword,
  hashPassword,
  verifyPassword,
  createSessionToken,
  hashToken,
  isSessionExpired,
} = require("./auth");

test("password must be 8-128 characters", () => {
  assert.equal(isValidPassword("short"), false);
  assert.equal(isValidPassword("longenough1"), true);
  assert.equal(isValidPassword(12345678), false);
});

test("scrypt hash verifies the right password and rejects the wrong one", () => {
  const stored = hashPassword("correct-horse-1");
  assert.ok(!stored.includes("correct-horse-1"), "stored value must not contain the password");
  assert.ok(stored.startsWith("scrypt:"), "stored value must carry the scrypt marker");
  assert.equal(verifyPassword("correct-horse-1", stored), true);
  assert.equal(verifyPassword("wrong-password", stored), false);
  assert.equal(verifyPassword("correct-horse-1", "plaintext"), false);
});

test("two hashes of the same password differ (per-user salt)", () => {
  assert.notEqual(hashPassword("same-password-1"), hashPassword("same-password-1"));
});

test("session tokens are random and only their hash is stored", () => {
  const a = createSessionToken();
  const b = createSessionToken();
  assert.notEqual(a, b);
  assert.equal(hashToken(a), hashToken(a));
  assert.notEqual(hashToken(a), hashToken(b));
  assert.ok(!hashToken(a).includes(a));
});

test("session expiry treats missing/expired sessions as expired", () => {
  assert.equal(isSessionExpired(null), true);
  assert.equal(isSessionExpired({}), true);
  const live = { sessionTokenHash: "x", sessionExpiresAt: new Date(Date.now() + 60000) };
  assert.equal(isSessionExpired(live), false);
  const dead = { sessionTokenHash: "x", sessionExpiresAt: new Date(Date.now() - 1000) };
  assert.equal(isSessionExpired(dead), true);
});
