const test = require("node:test");
const assert = require("node:assert/strict");
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
} = require("./validation");

test("latitude/longitude ranges reject out-of-range values", () => {
  assert.equal(isValidLatitude(91), false);
  assert.equal(isValidLatitude(-90), true);
  assert.equal(isValidLongitude(181), false);
  assert.equal(isValidLongitude(180), true);
  assert.equal(isValidLatitude("17"), false);
});

test("radius must be 10-500", () => {
  assert.equal(isValidRadius(9), false);
  assert.equal(isValidRadius(500), true);
  assert.equal(isValidRadius(501), false);
});

test("username length 3-32", () => {
  assert.equal(isValidUsername("ab"), false);
  assert.equal(isValidUsername("abc"), true);
  assert.equal(isValidUsername("  "), false);
});

test("snapCoordinate rounds to 0.001 degrees", () => {
  assert.equal(snapCoordinate(17.38549), 17.385);
  assert.equal(snapCoordinate(78.48671), 78.487);
});

test("haversine distance is sane for a known short hop", () => {
  const d = haversineDistanceMeters(17.385, 78.4867, 17.385, 78.4877);
  assert.ok(d > 90 && d < 120, `expected ~107 m, got ${d}`);
});

test("distance banding rounds to the nearest 10 m", () => {
  assert.equal(bandDistanceMeters(32), 30);
  assert.equal(bandDistanceMeters(37), 40);
  assert.equal(bandDistanceMeters(0), 0);
});

test("report reason must be 10-500 characters", () => {
  assert.equal(isValidReportReason("too short"), false);
  assert.equal(isValidReportReason("This user was abusive in chat."), true);
});

test("mutual radius uses the smaller of querier and target radius", () => {
  assert.equal(isWithinMutualRadius(200, 500, 100), false);
  assert.equal(isWithinMutualRadius(90, 500, 100), true);
  assert.equal(isWithinMutualRadius(90, 100, 500), true);
});
