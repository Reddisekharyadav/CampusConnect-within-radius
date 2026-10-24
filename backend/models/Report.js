const mongoose = require("mongoose");

// A report is a private moderation record, not a public accusation.
// It is never returned to other users, never triggers an auto-ban, and is
// removed if either party deletes their account (see DELETE /auth/me).
const reportSchema = new mongoose.Schema(
  {
    reporterUsername: { type: String, required: true, trim: true },
    reporterUsernameKey: { type: String, required: true, trim: true },
    reportedUsername: { type: String, required: true, trim: true },
    reportedUsernameKey: { type: String, required: true, trim: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

// One report per reporter/target pair — this also stops report spam.
reportSchema.index({ reporterUsernameKey: 1, reportedUsernameKey: 1 }, { unique: true });

module.exports = mongoose.model("Report", reportSchema);
