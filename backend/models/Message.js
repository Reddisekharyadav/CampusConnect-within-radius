const mongoose = require("mongoose");

// Peer messages between matched users only. The server enforces the match
// before storing or delivering a message (see /messages and the Socket.IO
// send_message handler); this model never stores a non-match message.
const messageSchema = new mongoose.Schema(
  {
    fromUsername: { type: String, required: true, trim: true },
    fromUsernameKey: { type: String, required: true, trim: true },
    toUsername: { type: String, required: true, trim: true },
    toUsernameKey: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

messageSchema.index({ fromUsernameKey: 1, toUsernameKey: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
