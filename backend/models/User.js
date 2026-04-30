const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    usernameKey: { type: String, required: true, trim: true },
    bio: { type: String, default: "" },
    isVisible: { type: Boolean, default: false },
    radius: { type: Number, default: 100, min: 10, max: 500 },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point"
      },
      coordinates: {
        type: [Number],
        required: true,
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

module.exports = mongoose.model("User", userSchema);
