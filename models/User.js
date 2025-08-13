/**
 * User Model
 * Stores user credentials for authentication.
 */
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true }, // User email
  password: { type: String, required: true }, // Hashed password
});

userSchema.index({ email: 1 }, { unique: true }); // Ensure unique emails

module.exports = mongoose.model('User', userSchema);
