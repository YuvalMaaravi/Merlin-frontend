/**
 * Auth Routes
 * Handles user signup and login using JWT and bcrypt.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();

// Helper: Sign JWT token for a user
function signToken(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return jwt.sign(
    { userId },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } // e.g. 7d
  );
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { email = '', password = '' } = req.body;

    // Basic validation
    if (!email.trim() || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    // Check if user already exists
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    // Hash password and create user
    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({ email: email.toLowerCase(), password: hash });

    // (Optional) auto-login on signup:
    const token = signToken(user._id.toString());
    res.status(201).json({ token, user: { id: user._id, email: user.email } });
  } catch (err) {
    console.error('signup error:', err.message || err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email = '', password = '' } = req.body;
    // Basic validation
    if (!email.trim() || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    // Check password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    // Sign token
    const token = signToken(user._id.toString());
    res.json({ token, user: { id: user._id, email: user.email } });
  } catch (err) {
    console.error('login error:', err.message || err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
