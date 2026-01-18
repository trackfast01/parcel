const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true }, // Unique ID for the user's chat session (e.g. from localStorage)
    sender: { type: String, enum: ["user", "admin"], required: true },
    content: { type: String, required: true },
    image: { type: String }, // Base64 string
    trackingId: { type: String, index: true }, // Linked Parcel ID
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" }, // If sent by admin
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", MessageSchema);
