/**
 * Tracker Model
 * Stores Instagram tracker info for each user.
 */
const mongoose = require('mongoose');

const trackerSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // User who owns this tracker
  instagramUsername: { type: String, required: true }, // Tracked Instagram username
  targetPk: { type: String, required: true }, // Instagram numeric id
  baselineFollowing: { type: [String], default: [] }, // Initial following list
  email: { type: String, required: true }, // Notification email
  createdAt: { type: Date, default: Date.now }, // Creation timestamp
});

trackerSchema.index({ userId: 1, instagramUsername: 1 }, { unique: true }); // Unique per user/username

module.exports = mongoose.model('Tracker', trackerSchema);
