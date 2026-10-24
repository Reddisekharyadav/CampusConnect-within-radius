// Shared validation / privacy helpers for CampusConnect backend.
// Kept dependency-free so they can be unit-tested without MongoDB.

function isValidLatitude(value) {
  return typeof value === "number" && !Number.isNaN(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value) {
  return typeof value === "number" && !Number.isNaN(value) && value >= -180 && value <= 180;
}

function isValidRadius(value) {
  return typeof value === "number" && !Number.isNaN(value) && value >= 10 && value <= 500;
}

function isValidUsername(value) {
  return typeof value === "string" && value.trim().length >= 3 && value.trim().length <= 32;
}

function isValidReportReason(value) {
  return typeof value === "string" && value.trim().length >= 10 && value.trim().length <= 500;
}

// Band a distance to the nearest 10 m before it leaves the server.
// The internal exact distance is still used for sorting and for the
// mutual-radius check; what other users see is only a band, so a stream of
// /nearby responses cannot be used to trilaterate a metre-precise position
// on top of the already-coarse (~100 m) stored location.
function bandDistanceMeters(distanceMeters) {
  if (typeof distanceMeters !== "number" || Number.isNaN(distanceMeters)) return 0;
  return Math.round(distanceMeters / 10) * 10;
}

// Snap a coordinate to a ~100 m grid (0.001 degrees) before storage.
// The backend never returns other users' coordinates, but storing only a
// coarse location limits what a database breach or a future bug can expose.
function snapCoordinate(value) {
  return Math.round(value * 1000) / 1000;
}

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Location discovery TTL: a stored location is only discoverable for this
// long after the user's last activity. /nearby filters on it, and the
// periodic sweep (see server.js) clears stale locations. Overridable via
// LOCATION_TTL_MS for tests — production default is 5 minutes.
const LOCATION_TTL_MS_DEFAULT = 5 * 60 * 1000;

function locationTtlMs(env = process.env) {
  const parsed = Number.parseInt(env.LOCATION_TTL_MS, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : LOCATION_TTL_MS_DEFAULT;
}

function isLocationStale(lastActive, nowMs = Date.now(), ttlMs = LOCATION_TTL_MS_DEFAULT) {
  if (!lastActive) return true;
  const at = new Date(lastActive).getTime();
  if (Number.isNaN(at)) return true;
  return at <= nowMs - ttlMs;
}

// Demo seeding in production is only allowed with an explicit override.
// The seed script enforces this itself; the server logs the same guard at
// startup so a production deploy can never silently have demo data on.
function isDemoSeedAllowedInProduction(env = process.env) {
  return env.NODE_ENV !== "production" || env.ALLOW_DEMO_SEED_PRODUCTION === "1";
}

// Wave/match helpers (pure, unit-testable): waves are {fromUsernameKey,
// toUsernameKey, status}. A match exists only when a wave in either
// direction is accepted.
function isMatched(waves, keyA, keyB) {
  return (waves || []).some(
    (w) =>
      w.status === "accepted" &&
      ((w.fromUsernameKey === keyA && w.toUsernameKey === keyB) ||
        (w.fromUsernameKey === keyB && w.toUsernameKey === keyA))
  );
}

function findWave(waves, fromKey, toKey) {
  return (waves || []).find((w) => w.fromUsernameKey === fromKey && w.toUsernameKey === toKey) || null;
}

module.exports = {
  isValidLatitude,
  isValidLongitude,
  isValidRadius,
  isValidUsername,
  isValidReportReason,
  bandDistanceMeters,
  snapCoordinate,
  haversineDistanceMeters,
  isWithinMutualRadius,
  LOCATION_TTL_MS_DEFAULT,
  locationTtlMs,
  isLocationStale,
  isDemoSeedAllowedInProduction,
  isMatched,
  findWave,
};

// A user is only discoverable within the SMALLER of the querier's radius
// and the target's own radius. Previously only the querier's radius was
// enforced, so a user who set 10 m could still be found at 500 m.
function isWithinMutualRadius(distanceMeters, querierRadius, targetRadius) {
  const targetLimit =
    typeof targetRadius === "number" && !Number.isNaN(targetRadius) ? targetRadius : querierRadius;
  return distanceMeters <= Math.min(querierRadius, targetLimit);
}
