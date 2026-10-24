// Token-based session auth for CampusConnect — dependency-free, Node built-ins only.
//
// Design (chosen by the user: token/session at registration, not a
// per-user secret):
// - A user registers with username + password. The password is NEVER stored
//   in plaintext: it is hashed with scrypt (N=16384, r=8, p=1, 64-byte key,
//   16-byte random salt) in the form `scrypt:<saltHex>:<hashHex>`.
// - On register/login the server issues a random 32-byte session token
//   (base64url). Only the SHA-256 hash of the token is stored, so a database
//   leak does not hand out live sessions. The raw token is returned once,
//   to the registering/logging-in client, and must be sent back as
//   `Authorization: Bearer <token>`.
// - One live session per user: a new login rotates (replaces) the old token.
//   Sessions expire after 30 days. Logout clears the stored token hash.
// - No JWT secret is needed because tokens are opaque random values, not
//   signed claims. Nothing about this design requires a secret in env vars,
//   and no password or token is ever written to logs.

const crypto = require("node:crypto");

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function isValidPassword(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  try {
    if (typeof password !== "string" || typeof stored !== "string") return false;
    const parts = stored.split(":");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    if (salt.length === 0 || expected.length !== 64) return false;
    const actual = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function sessionExpiresAt(nowMs = Date.now()) {
  return new Date(nowMs + SESSION_TTL_MS);
}

function isSessionExpired(user, nowMs = Date.now()) {
  if (!user || !user.sessionTokenHash || !user.sessionExpiresAt) return true;
  return new Date(user.sessionExpiresAt).getTime() <= nowMs;
}

module.exports = {
  SESSION_TTL_MS,
  isValidPassword,
  hashPassword,
  verifyPassword,
  createSessionToken,
  hashToken,
  sessionExpiresAt,
  isSessionExpired,
};
