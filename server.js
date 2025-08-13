/**
 * Merlin Assignment Backend Server
 * Entry point for Express app, MongoDB connection, and route setup.
 */
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import route handlers
const authRoutes = require('./routes/auth');
const trackerRoutes = require('./routes/tracker');
const babyRoutes = require('./routes/babyCheck');

// MongoDB connection URI (from .env)
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI;

const app = express();
// Parse JSON bodies
app.use(express.json());
// Enable CORS for frontend
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'build')));

// Connect to MongoDB
console.log('Connecting to MongoDB…');
(async () => {
  try {
    // Connect using Mongoose
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message || err);
    process.exit(1);
  }
})();

// Register API routes
app.use('/api/auth', authRoutes);      // Auth endpoints
app.use('/api/tracker', trackerRoutes); // Tracker endpoints
app.use('/api/babycheck', babyRoutes);  // BabyCheck endpoints

// Serve React index.html for any non-API route (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Start cron job for tracker checks (runs every minute)
require('./services/cron').checkTrackers();

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
