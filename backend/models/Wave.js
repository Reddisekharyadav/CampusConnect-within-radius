const mongoose = require("mongoose");

// A "wave" is a mutual-interest request: user A waves at user B, B accepts
// (or declines), and only an accepted wave creates a match. Peer chat
// (REST /messages and Socket.IO send_message) is rejected for non-matches,
// so nobody can message a stranger just because they are nearby. This is
// the Common Grounds lesson from the comparison research.
const waveSchema = new mongoose.Schema(
  {
    fromUsername: { type: String, required: true, trim: true },
    fromUsernameKey: { type: String, required: true, trim: true },
    toUsername: { type: String, required: true, trim: true },
    toUsernameKey: { type: String, required: true, trim: true },
    status: { type: String, enum: ["pending", "accepted", "declined"], default: "pending" },
  },
  { timestamps: true }
);

// One wave record per direction per pair; a declined wave is re-opened
// (status back to pending) rather than duplicated.
waveSchema.index({ fromUsernameKey: 1, toUsernameKey: 1 }, { unique: true });

module.exports = mongoose.model("Wave", waveSchema);
