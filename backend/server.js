const express = require("express");
const http = require("node:http");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("node:path");
const { Server: SocketIOServer } = require("socket.io");
const User = require("./models/User");
const Report = require("./models/Report");
const Wave = require("./models/Wave");
const PeerMessage = require("./models/Message");
const {
  isValidLatitude,
  isValidLongitude,
  isValidRadius,
  isValidUsername,
  isValidReportReason,
  bandDistanceMeters,
  snapCoordinate,
  haversineDistanceMeters,
  isWithinMutualRadius,
  locationTtlMs,
  isLocationStale,
  isDemoSeedAllowedInProduction,
  isMatched,
  findWave,
} = require("./lib/validation");
const {
  isValidPassword,
  hashPassword,
  verifyPassword,
  createSessionToken,
  hashToken,
  sessionExpiresAt,
  isSessionExpired,
} = require("./lib/auth");
const { RateLimiter, rateLimitMiddleware } = require("./lib/rateLimit");

dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const app = express();
const PORT = process.env.PORT || 5000;

/**
 * Private Network Access (PNA) header — MUST be set before cors() so it is
 * included in both preflight (OPTIONS) and regular responses.
 *
 * Chrome 104+ enforces the W3C Private Network Access spec: requests from
 * "public" origins (including chrome-extension://) to "private" networks
 * (localhost / 127.0.0.1) require the server to explicitly opt-in by
 * responding with Access-Control-Allow-Private-Network: true.
 * Without this header Chrome silently blocks the request → AxiosError: Network Error.
 *
 * References:
 *   https://developer.chrome.com/blog/private-network-access-update/
 *   https://wicg.github.io/private-network-access/
 */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  next();
});

// Production CORS guard: in production the API must have an explicit
// origin allowlist. A wildcard (or an unset ALLOWED_ORIGINS, which would
// default to "*") refuses to start, loudly, instead of silently serving
// every origin. Local development keeps the documented "*" default.
const rawAllowedOrigins = process.env.ALLOWED_ORIGINS;
if (
  process.env.NODE_ENV === "production" &&
  (!rawAllowedOrigins || rawAllowedOrigins.split(",").map((o) => o.trim()).includes("*"))
) {
  console.error(
    "Refusing to start in production with ALLOWED_ORIGINS unset or '*'. " +
      "Set ALLOWED_ORIGINS to the exact frontend origin(s), e.g. https://your-frontend.pages.dev"
  );
  process.exit(1);
}
const allowedOrigins = rawAllowedOrigins
  ? rawAllowedOrigins.split(",").map((o) => o.trim()).filter(Boolean)
  : "*";
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      // Chrome sends this in PNA preflight requests
      "Access-Control-Request-Private-Network",
    ],
    // Respond to OPTIONS preflights with 204 No Content
    optionsSuccessStatus: 204,
  })
);

app.use(express.json({ limit: "10kb" }));

// Malformed JSON should be a JSON 400, not Express's default HTML error.
app.use((error, _req, res, next) => {
  if (error && error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  return next(error);
});

const MONGODB_URI = process.env.MONGODB_URI;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";

let useMemoryStore = !MONGODB_URI;
const memoryUsers = [];
// In-memory reports mirror the Mongo Report collection (see models/Report.js).
const memoryReports = [];
// In-memory waves and peer messages mirror the Wave/Message collections.
const memoryWaves = [];
const memoryMessages = [];
// Discovery TTL: locations older than this are not discoverable (see
// /nearby) and are cleared by the periodic sweep below.
const LOCATION_TTL_MS = locationTtlMs();

// Rate limits (per window, per key). Location updates normally arrive every
// 15 s, so 60/min is generous for one user and still stops flooding; chat
// is tighter because it can hit a paid upstream API; auth is tightest
// because it is the brute-force surface. These are per-process (see
// lib/rateLimit.js) — fine for a single free-tier instance.
const authLimiter = new RateLimiter({ windowMs: 60 * 1000, max: 10 });
const locationLimiter = new RateLimiter({ windowMs: 60 * 1000, max: 60 });
const nearbyLimiter = new RateLimiter({ windowMs: 60 * 1000, max: 120 });
const chatLimiter = new RateLimiter({ windowMs: 60 * 1000, max: 20 });
const reportLimiter = new RateLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
const clientIp = (req) => req.ip || req.socket?.remoteAddress || "unknown";
const authedKey = (req) => (req.user ? `user:${req.user.usernameKey}` : `ip:${clientIp(req)}`);

// --- Auth helpers (work identically over memory and Mongo stores) --------
const publicProfile = (u) => ({
  username: u.username,
  bio: u.bio || "",
  isVisible: u.isVisible === true,
  radius: typeof u.radius === "number" ? u.radius : 100,
  isDemo: u.isDemo === true,
});

const findMemoryUserByKey = (key) => memoryUsers.find((u) => u.usernameKey === key);
const findMemoryUserByTokenHash = (hash) =>
  memoryUsers.find((u) => u.sessionTokenHash === hash);

async function getUserByKey(key) {
  if (useMemoryStore) return findMemoryUserByKey(key) || null;
  return User.findOne({ usernameKey: key });
}

async function getUserByTokenHash(hash) {
  if (useMemoryStore) return findMemoryUserByTokenHash(hash) || null;
  return User.findOne({ sessionTokenHash: hash });
}

async function persistUser(user) {
  if (useMemoryStore) {
    upsertMemoryUser(user);
    return user;
  }
  await user.save();
  return user;
}

async function removeUser(user) {
  if (useMemoryStore) {
    const idx = memoryUsers.findIndex((u) => u.usernameKey === user.usernameKey);
    if (idx >= 0) memoryUsers.splice(idx, 1);
    for (let i = memoryReports.length - 1; i >= 0; i--) {
      if (memoryReports[i].reporterUsernameKey === user.usernameKey ||
          memoryReports[i].reportedUsernameKey === user.usernameKey) {
        memoryReports.splice(i, 1);
      }
    }
    for (let i = memoryWaves.length - 1; i >= 0; i--) {
      if (memoryWaves[i].fromUsernameKey === user.usernameKey || memoryWaves[i].toUsernameKey === user.usernameKey) {
        memoryWaves.splice(i, 1);
      }
    }
    for (let i = memoryMessages.length - 1; i >= 0; i--) {
      if (memoryMessages[i].fromUsernameKey === user.usernameKey || memoryMessages[i].toUsernameKey === user.usernameKey) {
        memoryMessages.splice(i, 1);
      }
    }
    return;
  }
  await User.deleteOne({ usernameKey: user.usernameKey });
  await Report.deleteMany({
    $or: [{ reporterUsernameKey: user.usernameKey }, { reportedUsernameKey: user.usernameKey }],
  });
  await Wave.deleteMany({
    $or: [{ fromUsernameKey: user.usernameKey }, { toUsernameKey: user.usernameKey }],
  });
  await PeerMessage.deleteMany({
    $or: [{ fromUsernameKey: user.usernameKey }, { toUsernameKey: user.usernameKey }],
  });
}

// Issue (or rotate) a session for a user: returns the raw token once.
// Only the hash is ever persisted.
async function issueSession(user) {
  const token = createSessionToken();
  user.sessionTokenHash = hashToken(token);
  user.sessionExpiresAt = sessionExpiresAt();
  await persistUser(user);
  return token;
}

// Ownership middleware: every mutation endpoint below runs through this.
// A token can only act as its own user; demo/seed users have no token and
// therefore can never authenticate.
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    if (!token) return res.status(401).json({ error: "Authentication required" });
    const user = await getUserByTokenHash(hashToken(token));
    if (!user || isSessionExpired(user)) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }
    req.user = user;
    return next();
  } catch (error) {
    console.error("auth error", error);
    return res.status(500).json({ error: "Authentication failed" });
  }
}


// --- Waves / matches / peer messages (shared by REST and Socket.IO) -----
async function listWavesForUser(usernameKey) {
  if (useMemoryStore) {
    return memoryWaves.filter((w) => w.fromUsernameKey === usernameKey || w.toUsernameKey === usernameKey);
  }
  return Wave.find({
    $or: [{ fromUsernameKey: usernameKey }, { toUsernameKey: usernameKey }],
  }).lean();
}

async function userIsMatchedWith(keyA, keyB) {
  if (useMemoryStore) return isMatched(memoryWaves, keyA, keyB);
  const accepted = await Wave.findOne({
    status: "accepted",
    $or: [
      { fromUsernameKey: keyA, toUsernameKey: keyB },
      { fromUsernameKey: keyB, toUsernameKey: keyA },
    ],
  }).lean();
  return Boolean(accepted);
}

// Returns { wave } or throws an Error with a .statusCode.
async function createWave(fromUser, toUsername) {
  const toKey = toUsername.trim().toLowerCase();
  if (toKey === fromUser.usernameKey) {
    const error = new Error("You cannot wave at yourself");
    error.statusCode = 400;
    throw error;
  }
  const target = await getUserByKey(toKey);
  if (!target) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  if (await userIsMatchedWith(fromUser.usernameKey, toKey)) {
    const error = new Error("You are already matched with this user");
    error.statusCode = 409;
    throw error;
  }
  if (useMemoryStore) {
    const existing = findWave(memoryWaves, fromUser.usernameKey, toKey);
    if (existing && existing.status === "pending") {
      const error = new Error("Wave already pending");
      error.statusCode = 409;
      throw error;
    }
    const reverse = findWave(memoryWaves, toKey, fromUser.usernameKey);
    if (reverse && reverse.status === "pending") {
      const error = new Error("This user already waved at you — accept their wave instead");
      error.statusCode = 409;
      throw error;
    }
    if (existing) {
      existing.status = "pending";
      existing.updatedAt = new Date();
      return { wave: existing };
    }
    const wave = {
      fromUsername: fromUser.username,
      fromUsernameKey: fromUser.usernameKey,
      toUsername: target.username,
      toUsernameKey: toKey,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memoryWaves.push(wave);
    return { wave };
  }
  const existing = await Wave.findOne({ fromUsernameKey: fromUser.usernameKey, toUsernameKey: toKey });
  if (existing && existing.status === "pending") {
    const error = new Error("Wave already pending");
    error.statusCode = 409;
    throw error;
  }
  const reverse = await Wave.findOne({ fromUsernameKey: toKey, toUsernameKey: fromUser.usernameKey, status: "pending" });
  if (reverse) {
    const error = new Error("This user already waved at you — accept their wave instead");
    error.statusCode = 409;
    throw error;
  }
  if (existing) {
    existing.status = "pending";
    await existing.save();
    return { wave: existing };
  }
  const wave = await Wave.create({
    fromUsername: fromUser.username,
    fromUsernameKey: fromUser.usernameKey,
    toUsername: target.username,
    toUsernameKey: toKey,
    status: "pending",
  });
  return { wave };
}

async function setWaveStatus(me, fromUsername, status) {
  const fromKey = fromUsername.trim().toLowerCase();
  if (useMemoryStore) {
    const wave = findWave(memoryWaves, fromKey, me.usernameKey);
    if (!wave || wave.status !== "pending") return null;
    wave.status = status;
    wave.updatedAt = new Date();
    return wave;
  }
  const wave = await Wave.findOne({ fromUsernameKey: fromKey, toUsernameKey: me.usernameKey, status: "pending" });
  if (!wave) return null;
  wave.status = status;
  await wave.save();
  return wave;
}

async function listMatchesForUser(usernameKey) {
  const waves = await listWavesForUser(usernameKey);
  const matchedKeys = new Set();
  for (const w of waves) {
    if (w.status !== "accepted") continue;
    matchedKeys.add(w.fromUsernameKey === usernameKey ? w.toUsernameKey : w.fromUsernameKey);
  }
  const names = [];
  for (const key of matchedKeys) {
    const user = await getUserByKey(key);
    names.push(user ? user.username : key);
  }
  return names;
}

async function listPeerMessages(keyA, keyB) {
  if (useMemoryStore) {
    return memoryMessages
      .filter(
        (m) =>
          (m.fromUsernameKey === keyA && m.toUsernameKey === keyB) ||
          (m.fromUsernameKey === keyB && m.toUsernameKey === keyA)
      )
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }
  return PeerMessage.find({
    $or: [
      { fromUsernameKey: keyA, toUsernameKey: keyB },
      { fromUsernameKey: keyB, toUsernameKey: keyA },
    ],
  })
    .sort({ createdAt: 1 })
    .lean();
}

// Stores a peer message only after the match check passes. Returns the
// stored message or throws an Error with .statusCode (403 = not matched).
async function sendPeerMessage(fromUser, toUsername, text) {
  const toKey = toUsername.trim().toLowerCase();
  if (toKey === fromUser.usernameKey) {
    const error = new Error("You cannot message yourself");
    error.statusCode = 400;
    throw error;
  }
  const target = await getUserByKey(toKey);
  if (!target) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  if (!(await userIsMatchedWith(fromUser.usernameKey, toKey))) {
    const error = new Error("You can only message users you have matched with — wave first, and wait for them to accept");
    error.statusCode = 403;
    throw error;
  }
  const cleanText = text.trim();
  if (useMemoryStore) {
    const message = {
      fromUsername: fromUser.username,
      fromUsernameKey: fromUser.usernameKey,
      toUsername: target.username,
      toUsernameKey: toKey,
      text: cleanText,
      createdAt: new Date(),
    };
    memoryMessages.push(message);
    return { message, target };
  }
  const message = await PeerMessage.create({
    fromUsername: fromUser.username,
    fromUsernameKey: fromUser.usernameKey,
    toUsername: target.username,
    toUsernameKey: toKey,
    text: cleanText,
  });
  return { message, target };
}

// --- Realtime (Socket.IO, ported from legacy server.ts, now authed) -------
// Legacy server.ts ran Socket.IO with NO authentication: any client could
// register any username and message anyone. Here the handshake itself must
// carry a valid session token (auth.token, or an Authorization header);
// unauthenticated sockets are rejected before they join any room.
// Web clients keep working without sockets: they poll /nearby on an
// interval, so sockets are an enhancement, not a requirement.
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"] },
});

// socket.id -> last known (snapped) position, for nearby_change fan-out.
const connectedSockets = new Map();

io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake?.auth?.token ||
      (typeof socket.handshake?.headers?.authorization === "string" &&
      socket.handshake.headers.authorization.startsWith("Bearer ")
        ? socket.handshake.headers.authorization.slice("Bearer ".length).trim()
        : "");
    if (!token) return next(new Error("Authentication required"));
    const user = await getUserByTokenHash(hashToken(token));
    if (!user || isSessionExpired(user)) return next(new Error("Invalid or expired session"));
    socket.user = user;
    return next();
  } catch (error) {
    console.error("socket auth error", error);
    return next(new Error("Authentication failed"));
  }
});

function notifyNearbyChange(updatedUser) {
  if (!updatedUser.location || !updatedUser.isVisible) return;
  const [lon, lat] = updatedUser.location.coordinates;
  for (const [socketId, peer] of connectedSockets.entries()) {
    if (peer.usernameKey === updatedUser.usernameKey) continue;
    if (peer.blockedByUpdated || peer.blockedUpdated) continue;
    const exact = haversineDistanceMeters(peer.latitude, peer.longitude, lat, lon);
    if (!isWithinMutualRadius(exact, peer.radius, updatedUser.radius)) continue;
    io.to(socketId).emit("nearby_change", {
      type: "update",
      user: {
        username: updatedUser.username,
        bio: updatedUser.bio || "",
        isDemo: updatedUser.isDemo === true,
        distance: bandDistanceMeters(exact),
      },
    });
  }
}

io.on("connection", (socket) => {
  const user = socket.user;
  socket.join(`user:${user.usernameKey}`);
  connectedSockets.set(socket.id, {
    usernameKey: user.usernameKey,
    latitude: null,
    longitude: null,
    radius: typeof user.radius === "number" ? user.radius : 100,
    blockedByUpdated: false,
    blockedUpdated: false,
  });

  socket.on("location_update", (data) => {
    if (!data || typeof data !== "object") return;
    if (typeof data.isVisible !== "boolean") return;
    if (data.isVisible && (!isValidLatitude(data.latitude) || !isValidLongitude(data.longitude))) return;
    const entry = connectedSockets.get(socket.id);
    if (!entry) return;
    entry.latitude = data.isVisible ? snapCoordinate(data.latitude) : null;
    entry.longitude = data.isVisible ? snapCoordinate(data.longitude) : null;
    entry.radius = isValidRadius(data.radius) ? data.radius : entry.radius;
  });

  socket.on("wave", async (data, ack) => {
    try {
      if (!data || !isValidUsername(data.username)) return ack?.({ error: "username must be 3-32 characters" });
      const { wave } = await createWave(user, data.username);
      io.to(`user:${wave.toUsernameKey}`).emit("wave_received", {
        fromUsername: wave.fromUsername,
        status: wave.status,
      });
      return ack?.({ ok: true, wave: { toUsername: wave.toUsername, status: wave.status } });
    } catch (error) {
      return ack?.({ error: error.message });
    }
  });

  socket.on("wave_accept", async (data, ack) => {
    try {
      if (!data || !isValidUsername(data.username)) return ack?.({ error: "username must be 3-32 characters" });
      const wave = await setWaveStatus(user, data.username, "accepted");
      if (!wave) return ack?.({ error: "No pending wave from that user" });
      io.to(`user:${wave.fromUsernameKey}`).emit("match", { withUsername: user.username });
      io.to(`user:${user.usernameKey}`).emit("match", { withUsername: wave.fromUsername });
      return ack?.({ ok: true, matchedWith: wave.fromUsername });
    } catch (error) {
      return ack?.({ error: error.message });
    }
  });

  socket.on("wave_decline", async (data, ack) => {
    try {
      if (!data || !isValidUsername(data.username)) return ack?.({ error: "username must be 3-32 characters" });
      const wave = await setWaveStatus(user, data.username, "declined");
      if (!wave) return ack?.({ error: "No pending wave from that user" });
      return ack?.({ ok: true, declined: wave.fromUsername });
    } catch (error) {
      return ack?.({ error: error.message });
    }
  });

  socket.on("send_message", async (data, ack) => {
    try {
      if (!data || !isValidUsername(data.username) || typeof data.text !== "string" || !data.text.trim() || data.text.length > 2000) {
        return ack?.({ error: "A matched username and a message of 1-2000 characters are required" });
      }
      const { message } = await sendPeerMessage(user, data.username, data.text);
      io.to(`user:${message.toUsernameKey}`).emit("new_message", {
        fromUsername: message.fromUsername,
        text: message.text,
        createdAt: message.createdAt,
      });
      return ack?.({ ok: true, message: { toUsername: message.toUsername, text: message.text } });
    } catch (error) {
      return ack?.({ error: error.message });
    }
  });

  socket.on("disconnect", () => {
    connectedSockets.delete(socket.id);
  });
});

const pruneMemoryUsers = () => {
  // Discovery TTL sweep (memory path): stale locations are cleared, but
  // the profile itself is kept for 30 minutes, so the user can reappear
  // on their next update-location without re-registering.
  const now = Date.now();
  for (const user of memoryUsers) {
    if (user.lastActive && new Date(user.lastActive).getTime() <= now - LOCATION_TTL_MS) {
      user.location = undefined;
      user.lastActive = null;
      user.locationClearedAt = new Date();
    }
  }
  const removalCutoff = now - 30 * 60 * 1000;
  for (let i = memoryUsers.length - 1; i >= 0; i--) {
    const user = memoryUsers[i];
    if (!user.location && user.locationClearedAt && new Date(user.locationClearedAt).getTime() <= removalCutoff) {
      memoryUsers.splice(i, 1);
    }
  }
};
setInterval(pruneMemoryUsers, 60 * 1000).unref();

// Mongo path TTL sweep: same rule as the memory sweep — clear stale
// locations, keep profiles. Runs only when Mongo is actually connected.
setInterval(async () => {
  try {
    if (useMemoryStore || mongoose.connection.readyState !== 1) return;
    const cutoff = new Date(Date.now() - LOCATION_TTL_MS);
    await User.updateMany(
      { lastActive: { $lt: cutoff } },
      { $unset: { location: "", lastActive: "" } }
    );
  } catch (error) {
    console.error("location TTL sweep error", error.message);
  }
}, 60 * 1000).unref();

const upsertMemoryUser = (user) => {
  const index = memoryUsers.findIndex((entry) => entry.usernameKey === user.usernameKey);
  if (index >= 0) {
    memoryUsers[index] = user;
  } else {
    memoryUsers.push(user);
  }
};

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "CampusRadius API",
    // Previously this always returned ok:true even in in-memory preview
    // mode, which could route production traffic to a non-persistent instance.
    mode: useMemoryStore ? "memory" : "mongo",
    dbConnected: !useMemoryStore && mongoose.connection.readyState === 1,
  });
});

// --- Auth endpoints -------------------------------------------------------
// Register: username + password (scrypt-hashed, never plaintext). A second
// registration for an existing username is 409 — it must not silently
// reset that user's password or session.
app.post("/auth/register", rateLimitMiddleware(authLimiter, clientIp), async (req, res) => {
  try {
    const { username, password, bio } = req.body || {};
    if (!isValidUsername(username)) {
      return res.status(400).json({ error: "username must be 3-32 characters" });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: "password must be 8-128 characters" });
    }
    if (typeof bio === "string" && bio.trim().length > 500) {
      return res.status(400).json({ error: "bio must be at most 500 characters" });
    }
    const usernameKey = username.trim().toLowerCase();
    const existing = await getUserByKey(usernameKey);
    if (existing) {
      return res.status(409).json({ error: "username is already taken" });
    }
    const user = useMemoryStore
      ? {
          username: username.trim(),
          usernameKey,
          bio: typeof bio === "string" ? bio.trim() : "",
          isVisible: false,
          isDemo: false,
          radius: 100,
          passwordHash: hashPassword(password),
          sessionTokenHash: "",
          sessionExpiresAt: null,
          blockedUsernameKeys: [],
          location: undefined,
          lastActive: null,
        }
      : new User({
          username: username.trim(),
          usernameKey,
          bio: typeof bio === "string" ? bio.trim() : "",
          passwordHash: hashPassword(password),
        });
    const token = await issueSession(user);
    return res.status(201).json({ username: user.username, token });
  } catch (error) {
    console.error("register error", error);
    return res.status(500).json({ error: "Failed to register" });
  }
});

// Login: generic 401 for unknown user OR wrong password, so the endpoint
// does not reveal which usernames exist.
app.post("/auth/login", rateLimitMiddleware(authLimiter, clientIp), async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!isValidUsername(username) || !isValidPassword(password)) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    const user = await getUserByKey(username.trim().toLowerCase());
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    const token = await issueSession(user);
    return res.json({ username: user.username, token });
  } catch (error) {
    console.error("login error", error);
    return res.status(500).json({ error: "Failed to log in" });
  }
});

app.post("/auth/logout", requireAuth, async (req, res) => {
  try {
    req.user.sessionTokenHash = "";
    req.user.sessionExpiresAt = null;
    await persistUser(req.user);
    return res.json({ success: true });
  } catch (error) {
    console.error("logout error", error);
    return res.status(500).json({ error: "Failed to log out" });
  }
});

app.get("/auth/me", requireAuth, (req, res) => {
  return res.json(publicProfile(req.user));
});

// Delete my account: requires the authenticated session AND an explicit
// server-side confirmation string. This deletes the profile, stored
// location, blocks, and any reports involving this user — it is not a
// soft-hide. A deleted username can be re-registered afterwards.
app.delete("/auth/me", requireAuth, async (req, res) => {
  try {
    if (!req.body || req.body.confirm !== "DELETE") {
      return res.status(400).json({ error: 'confirm must be exactly "DELETE"' });
    }
    const username = req.user.username;
    await removeUser(req.user);
    return res.json({ success: true, deletedUsername: username });
  } catch (error) {
    console.error("delete account error", error);
    return res.status(500).json({ error: "Failed to delete account" });
  }
});

// --- Blocks ---------------------------------------------------------------
// Blocks are private and two-way for discovery: a blocked user never
// appears in your /nearby results, and you never appear in theirs.
app.get("/blocks", requireAuth, (req, res) => {
  return res.json({ blocked: (req.user.blockedUsernameKeys || []).map((key) => key) });
});

app.post("/blocks", requireAuth, async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!isValidUsername(username)) {
      return res.status(400).json({ error: "username must be 3-32 characters" });
    }
    const targetKey = username.trim().toLowerCase();
    if (targetKey === req.user.usernameKey) {
      return res.status(400).json({ error: "You cannot block yourself" });
    }
    const target = await getUserByKey(targetKey);
    if (!target) return res.status(404).json({ error: "User not found" });
    const blocked = new Set(req.user.blockedUsernameKeys || []);
    blocked.add(targetKey);
    req.user.blockedUsernameKeys = [...blocked];
    await persistUser(req.user);
    return res.json({ success: true, blockedUsername: target.username });
  } catch (error) {
    console.error("block error", error);
    return res.status(500).json({ error: "Failed to block user" });
  }
});

app.delete("/blocks/:username", requireAuth, async (req, res) => {
  try {
    const targetKey = String(req.params.username || "").trim().toLowerCase();
    req.user.blockedUsernameKeys = (req.user.blockedUsernameKeys || []).filter((k) => k !== targetKey);
    await persistUser(req.user);
    return res.json({ success: true, unblockedUsernameKey: targetKey });
  } catch (error) {
    console.error("unblock error", error);
    return res.status(500).json({ error: "Failed to unblock user" });
  }
});

// --- Reports --------------------------------------------------------------
// Reports are stored privately for moderation. No auto-ban, no public
// exposure, one report per reporter/target pair, rate-limited.
app.post("/reports", requireAuth, rateLimitMiddleware(reportLimiter, authedKey), async (req, res) => {
  try {
    const { username, reason } = req.body || {};
    if (!isValidUsername(username)) {
      return res.status(400).json({ error: "username must be 3-32 characters" });
    }
    if (!isValidReportReason(reason)) {
      return res.status(400).json({ error: "reason must be 10-500 characters" });
    }
    const targetKey = username.trim().toLowerCase();
    if (targetKey === req.user.usernameKey) {
      return res.status(400).json({ error: "You cannot report yourself" });
    }
    const target = await getUserByKey(targetKey);
    if (!target) return res.status(404).json({ error: "User not found" });
    const cleanReason = reason.trim();
    if (useMemoryStore) {
      const existing = memoryReports.find(
        (r) => r.reporterUsernameKey === req.user.usernameKey && r.reportedUsernameKey === targetKey
      );
      if (existing) return res.status(409).json({ error: "You have already reported this user" });
      memoryReports.push({
        reporterUsername: req.user.username,
        reporterUsernameKey: req.user.usernameKey,
        reportedUsername: target.username,
        reportedUsernameKey: targetKey,
        reason: cleanReason,
        createdAt: new Date(),
      });
    } else {
      const existing = await Report.findOne({
        reporterUsernameKey: req.user.usernameKey,
        reportedUsernameKey: targetKey,
      });
      if (existing) return res.status(409).json({ error: "You have already reported this user" });
      await Report.create({
        reporterUsername: req.user.username,
        reporterUsernameKey: req.user.usernameKey,
        reportedUsername: target.username,
        reportedUsernameKey: targetKey,
        reason: cleanReason,
      });
    }
    return res.status(201).json({ success: true, reportedUsername: target.username });
  } catch (error) {
    console.error("report error", error);
    return res.status(500).json({ error: "Failed to submit report" });
  }
});

// --- My reports (status only, own reports) --------------------------------
// A user can see their own reports (who they reported and when). Nobody
// else's reports are ever listed here.
app.get("/reports/mine", requireAuth, async (req, res) => {
  try {
    if (useMemoryStore) {
      const mine = memoryReports
        .filter((r) => r.reporterUsernameKey === req.user.usernameKey)
        .map((r) => ({ reportedUsername: r.reportedUsername, reason: r.reason, createdAt: r.createdAt, status: "submitted" }));
      return res.json({ reports: mine });
    }
    const docs = await Report.find({ reporterUsernameKey: req.user.usernameKey }).sort({ createdAt: -1 }).lean();
    return res.json({
      reports: docs.map((r) => ({ reportedUsername: r.reportedUsername, reason: r.reason, createdAt: r.createdAt, status: "submitted" })),
    });
  } catch (error) {
    console.error("my reports error", error);
    return res.status(500).json({ error: "Failed to load your reports" });
  }
});

// --- Waves / matches ------------------------------------------------------
// Wave -> accept -> match, then (and only then) peer chat. See models/Wave.js.
app.get("/waves", requireAuth, async (req, res) => {
  try {
    const waves = await listWavesForUser(req.user.usernameKey);
    return res.json({
      waves: waves.map((w) => ({
        fromUsername: w.fromUsername,
        toUsername: w.toUsername,
        status: w.status,
        createdAt: w.createdAt,
      })),
    });
  } catch (error) {
    console.error("waves error", error);
    return res.status(500).json({ error: "Failed to load waves" });
  }
});

app.post("/waves", requireAuth, async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!isValidUsername(username)) {
      return res.status(400).json({ error: "username must be 3-32 characters" });
    }
    const { wave } = await createWave(req.user, username);
    return res.status(201).json({ success: true, toUsername: wave.toUsername, status: wave.status });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error("wave error", error);
    return res.status(500).json({ error: "Failed to send wave" });
  }
});

app.post("/waves/:username/accept", requireAuth, async (req, res) => {
  try {
    const wave = await setWaveStatus(req.user, req.params.username, "accepted");
    if (!wave) return res.status(404).json({ error: "No pending wave from that user" });
    io.to(`user:${wave.fromUsernameKey}`).emit("match", { withUsername: req.user.username });
    return res.json({ success: true, matchedWith: wave.fromUsername });
  } catch (error) {
    console.error("wave accept error", error);
    return res.status(500).json({ error: "Failed to accept wave" });
  }
});

app.post("/waves/:username/decline", requireAuth, async (req, res) => {
  try {
    const wave = await setWaveStatus(req.user, req.params.username, "declined");
    if (!wave) return res.status(404).json({ error: "No pending wave from that user" });
    return res.json({ success: true, declined: wave.fromUsername });
  } catch (error) {
    console.error("wave decline error", error);
    return res.status(500).json({ error: "Failed to decline wave" });
  }
});

app.get("/matches", requireAuth, async (req, res) => {
  try {
    const matches = await listMatchesForUser(req.user.usernameKey);
    return res.json({ matches });
  } catch (error) {
    console.error("matches error", error);
    return res.status(500).json({ error: "Failed to load matches" });
  }
});

// --- Peer messages (matched users only) -----------------------------------
app.post("/messages", requireAuth, rateLimitMiddleware(chatLimiter, authedKey), async (req, res) => {
  try {
    const { username, text } = req.body || {};
    if (!isValidUsername(username)) {
      return res.status(400).json({ error: "username must be 3-32 characters" });
    }
    if (typeof text !== "string" || !text.trim() || text.length > 2000) {
      return res.status(400).json({ error: "message must be 1-2000 characters" });
    }
    const { message } = await sendPeerMessage(req.user, username, text);
    io.to(`user:${message.toUsernameKey}`).emit("new_message", {
      fromUsername: message.fromUsername,
      text: message.text,
      createdAt: message.createdAt,
    });
    return res.status(201).json({ success: true, toUsername: message.toUsername, text: message.text });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error("peer message error", error);
    return res.status(500).json({ error: "Failed to send message" });
  }
});

app.get("/messages/:username", requireAuth, async (req, res) => {
  try {
    const targetKey = String(req.params.username || "").trim().toLowerCase();
    if (!(await userIsMatchedWith(req.user.usernameKey, targetKey))) {
      return res.status(403).json({ error: "You can only read messages with users you have matched with" });
    }
    const messages = await listPeerMessages(req.user.usernameKey, targetKey);
    return res.json({
      messages: messages.map((m) => ({
        fromUsername: m.fromUsername,
        toUsername: m.toUsername,
        text: m.text,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error("peer messages error", error);
    return res.status(500).json({ error: "Failed to load messages" });
  }
});

app.post("/update-location", requireAuth, rateLimitMiddleware(locationLimiter, authedKey), async (req, res) => {
  try {
    const { username, bio, latitude, longitude, radius, isVisible } = req.body;

    // Ownership: a token may only move its own profile. A username in the
    // body that does not match the token is a 403, never a silent override.
    if (username !== undefined && username !== req.user.username) {
      return res.status(403).json({ error: "You can only update your own profile" });
    }
    if (isVisible !== undefined && typeof isVisible !== "boolean") {
      // Previously Boolean("false") === true, silently flipping a user visible.
      return res.status(400).json({ error: "isVisible must be a boolean" });
    }
    if (typeof bio === "string" && bio.trim().length > 500) {
      return res.status(400).json({ error: "bio must be at most 500 characters" });
    }
    if (radius !== undefined && !isValidRadius(radius)) {
      // Previously an out-of-range radius silently became 100.
      return res.status(400).json({ error: "radius must be between 10 and 500" });
    }

    // The authenticated user IS the profile being updated — no upsert of a
    // stranger's account, and auth fields (password/token/blocks) are never
    // overwritten by a location update.
    const trimmedUsername = req.user.username;
    const usernameKey = req.user.usernameKey;
    const visible = isVisible === true;
    const safeRadius = typeof radius === "number" ? radius : 100;

    if (!visible) {
      // Hidden means hidden: do not store a location at all. Previously the
      // server stored the exact position every 15 s even when invisible.
      req.user.bio = typeof bio === "string" ? bio.trim() : req.user.bio;
      req.user.isVisible = false;
      req.user.radius = safeRadius;
      req.user.lastActive = null;
      req.user.location = undefined;
      if (!useMemoryStore) {
        await User.updateOne(
          { usernameKey },
          { $set: { bio: req.user.bio, isVisible: false, radius: safeRadius }, $unset: { location: "", lastActive: "" } }
        );
      } else {
        upsertMemoryUser(req.user);
      }
      return res.json({ success: true, username: trimmedUsername, radius: safeRadius, isVisible: false });
    }

    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      return res.status(400).json({ error: "Valid latitude (-90..90) and longitude (-180..180) are required" });
    }

    // Store only a coarse (~100 m) location, never the exact coordinates.
    req.user.bio = typeof bio === "string" ? bio.trim() : req.user.bio;
    req.user.isVisible = true;
    req.user.radius = safeRadius;
    req.user.location = {
      type: "Point",
      coordinates: [snapCoordinate(longitude), snapCoordinate(latitude)]
    };
    req.user.lastActive = new Date();
    await persistUser(req.user);
    // Realtime fan-out: connected nearby users learn about this update
    // over their authenticated sockets; web clients without sockets still
    // see it on their next /nearby poll.
    notifyNearbyChange(req.user);

    return res.json({ success: true, username: trimmedUsername, radius: safeRadius, isVisible: true, lastActive: req.user.lastActive });
  } catch (error) {
    console.error("update-location error", error);
    return res.status(500).json({ error: "Failed to update location" });
  }
});

app.post("/nearby", requireAuth, rateLimitMiddleware(nearbyLimiter, authedKey), async (req, res) => {
  try {
    const { latitude, longitude, radius, includeDemo } = req.body;

    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      return res.status(400).json({ error: "Valid latitude (-90..90) and longitude (-180..180) are required" });
    }
    if (radius !== undefined && !isValidRadius(radius)) {
      return res.status(400).json({ error: "radius must be between 10 and 500" });
    }

    const safeRadius = typeof radius === "number" ? radius : 100;
    // Discovery TTL: only locations fresher than this are discoverable.
    const fiveMinutesAgo = new Date(Date.now() - LOCATION_TTL_MS);
    // Self-exclusion comes from the token, never from a client-supplied name.
    const currentUsernameKey = req.user.usernameKey;
    // Demo/seed users are excluded from production listings by default.
    const demoFilter = (u) => includeDemo === true || u.isDemo !== true;
    // Two-way block filter: exclude users you blocked, and users who
    // blocked you. For Mongo, blocked-by-others is applied after the query
    // because a target's block list is not in the candidate filter.
    const myBlocked = new Set(req.user.blockedUsernameKeys || []);
    const blockFilter = (u) => !myBlocked.has(u.usernameKey);

    const toNearbyUser = (u) => {
      const userLon = u.location.coordinates[0];
      const userLat = u.location.coordinates[1];
      const exact = haversineDistanceMeters(latitude, longitude, userLat, userLon);
      return {
        username: u.username,
        fullName: u.fullName,
        bio: u.bio,
        instagram: u.instagram,
        facebook: u.facebook,
        course: u.course,
        interests: u.interests || [],
        isDemo: u.isDemo === true,
        // Banded, not metre-precise (see validation.bandDistanceMeters).
        distance: bandDistanceMeters(exact),
        _exactDistance: exact,
        _targetRadius: typeof u.radius === "number" ? u.radius : safeRadius,
        _blockedByTarget: (u.blockedUsernameKeys || []).includes(currentUsernameKey),
      };
    };

    let nearbyUsers;
    if (useMemoryStore) {
      nearbyUsers = memoryUsers
        .filter((u) => u.isVisible && u.location && u.lastActive && u.lastActive >= fiveMinutesAgo)
        .filter((u) => u.usernameKey !== currentUsernameKey)
        .filter(demoFilter)
        .filter(blockFilter)
        .map(toNearbyUser)
        .filter((u) => !u._blockedByTarget)
        .filter((u) => isWithinMutualRadius(u._exactDistance, safeRadius, u._targetRadius));
    } else {
      const docs = await User.find({
        isVisible: true,
        isDemo: includeDemo === true ? { $in: [true, false] } : false,
        lastActive: { $gte: fiveMinutesAgo },
        location: {
          $near: {
            $geometry: { type: "Point", coordinates: [longitude, latitude] },
            $maxDistance: safeRadius
          }
        }
      }).select("username usernameKey fullName bio instagram facebook course interests location radius isDemo blockedUsernameKeys").lean();
      nearbyUsers = docs
        .filter((u) => u.usernameKey !== currentUsernameKey)
        .filter(blockFilter)
        .map(toNearbyUser)
        .filter((u) => !u._blockedByTarget)
        .filter((u) => isWithinMutualRadius(u._exactDistance, safeRadius, u._targetRadius));
    }

    nearbyUsers.sort((a, b) => a._exactDistance - b._exactDistance);
    // Previously unbounded: a radius query could return the whole collection.
    return res.json(nearbyUsers.slice(0, 100).map(({ _targetRadius, _exactDistance, _blockedByTarget, ...user }) => user));
  } catch (error) {
    console.error("nearby error", error);
    return res.status(500).json({ error: "Failed to fetch nearby users" });
  }
});

app.post("/chat", requireAuth, rateLimitMiddleware(chatLimiter, authedKey), async (req, res) => {
  try {
    const { message, nearbyUsers = [] } = req.body;
    // Identity comes from the token, never from a client-supplied username/bio.
    const username = req.user.username;
    const bio = req.user.bio || "";

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: "message must be at most 2000 characters" });
    }

    // Privacy: nearby users never consented to having their profiles sent to
    // an LLM provider. The prompt now contains only the caller's own message.
    // The nearbyUsers field is accepted but deliberately ignored.
    void nearbyUsers;

    if (!OPENROUTER_API_KEY) {
      // Previously this returned HTTP 200, masking a misconfigured deployment.
      return res.status(503).json({ error: "Chat is not configured yet. Add OPENROUTER_API_KEY." });
    }

    const prompt = [
      `Current user: ${username || "unknown"}`,
      `Bio: ${typeof bio === "string" ? bio.slice(0, 500) : ""}`,
      `User message: ${message}`
    ].join("\n\n");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      signal: AbortSignal.timeout(15000),
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost",
        "X-Title": process.env.OPENROUTER_APP_NAME || "CampusRadius"
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are CampusRadius assistant. Keep replies short, helpful, privacy-first, and focused on nearby discovery, profiles, and app usage."
          },
          { role: "user", content: prompt }
        ]
      })
    });

    if (!response.ok) {
      // Log status only, never the full provider response body.
      console.error("openrouter error status", response.status);
      return res.status(502).json({ error: "Chat service failed" });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    return res.json({
      reply: reply || "I could not generate a response right now."
    });
  } catch (error) {
    console.error("chat error", error);
    return res.status(500).json({ error: "Failed to generate chatbot response" });
  }
});

const start = async () => {
  // Production demo-seed guard (asserted in lib/privacy.test.js): demo
  // seeding is provably off in production unless the explicit override is
  // set. The seed script itself also refuses without that override.
  if (process.env.NODE_ENV === "production") {
    if (isDemoSeedAllowedInProduction()) {
      console.log("⚠️ Demo seeding override is set in production (ALLOW_DEMO_SEED_PRODUCTION=1).");
    } else {
      console.log("Demo seeding is disabled in production (ALLOW_DEMO_SEED_PRODUCTION unset).");
    }
  }
  try {
    if (!MONGODB_URI) {
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_MEMORY_MODE !== "true") {
        console.error("MONGODB_URI is missing in production. Refusing to start in memory mode.");
        process.exit(1);
      }
      console.log("⚠️ MONGODB_URI not found. CampusRadius backend running in preview mode with in-memory storage.");
      console.log("Mobile data will NOT persist! Set MONGODB_URI to enable persistent database.");
      useMemoryStore = true;
      httpServer.listen(PORT, () => {
        console.log(`CampusRadius backend listening on port ${PORT}`);
      });
      return;
    }

    console.log("Attempting to connect to MongoDB...");
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    useMemoryStore = false;
    console.log("✅ Successfully connected to MongoDB!");
    httpServer.listen(PORT, () => {
      console.log(`✅ CampusRadius backend listening on port ${PORT} with persistent database`);
    });
  } catch (error) {
    console.error("❌ MongoDB connection failed!");
    console.error("Error:", error.message);
    if (process.env.NODE_ENV === "production") {
      // Silent memory fallback in production previously meant data loss
      // with a healthy-looking /health response. Fail loudly instead.
      console.error("Refusing to start in production without MongoDB. Set MONGODB_URI or ALLOW_MEMORY_MODE=true.");
      if (process.env.ALLOW_MEMORY_MODE !== "true") process.exit(1);
    }
    console.log("Falling back to in-memory preview mode (data will NOT persist)");
    useMemoryStore = true;
    httpServer.listen(PORT, () => {
      console.log(`CampusRadius backend listening on port ${PORT} (preview mode - in-memory only)`);
    });
  }
};

start();
