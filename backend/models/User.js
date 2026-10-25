const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    usernameKey: { type: String, required: true, trim: true },
    fullName: { type: String, default: "", trim: true },
    bio: { type: String, default: "" },
    instagram: { type: String, default: "", trim: true },
    facebook: { type: String, default: "", trim: true },
    course: { type: String, default: "", trim: true },
    interests: { type: [String], default: [] },
    isVisible: { type: Boolean, default: false },
    // Demo/seed users must never be mistaken for real students in production.
    isDemo: { type: Boolean, default: false },
    // Auth (see backend/lib/auth.js): password is stored ONLY as a scrypt
    // hash; the session token is stored ONLY as a SHA-256 hash. Demo/seed
    // users have neither, so they can never log in — they are seed data.
    passwordHash: { type: String, default: "" },
    sessionTokenHash: { type: String, default: "" },
    sessionExpiresAt: { type: Date, default: null },
    // Usernames (lowercased keys) this user has blocked. Blocked users are
    // excluded from /nearby in both directions.
    blockedUsernameKeys: { type: [String], default: [] },
    radius: { type: Number, default: 100, min: 10, max: 500 },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point"
      },
      coordinates: {
        type: [Number],
        required: false,
        validate: {
          validator: (value) => Array.isArray(value) && value.length === 2,
          message: "Location must be [longitude, latitude]"
        }
      }
    },
    lastActive: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

userSchema.index({ usernameKey: 1 }, { unique: true });
userSchema.index({ location: "2dsphere" });
userSchema.index({ isVisible: 1, lastActive: 1 });

module.exports = mongoose.model("User", userSchema);
