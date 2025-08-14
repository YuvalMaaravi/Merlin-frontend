/**
 * Merlin Assignment Backend Server
 * Entry point for Express app, MongoDB connection, and route setup.
 */
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Load .env only in development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// ---- Sanity checks for required envs ----
const REQUIRED_VARS = [
  'MONGODB_URI',
  'JWT_SECRET',
  'RAPIDAPI_KEY',
  'OPENAI_API_KEY',
  'SENDGRID_API_KEY',
  'SENDER_EMAIL',
];

const missing = REQUIRED_VARS.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('Missing required env vars:', missing.join(', '));
  process.exit(1);
}

// ---- App setup ----
const app = express();
app.use(express.json());

// Configure CORS
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));

// ---- MongoDB connection ----
const MONGODB_URI = process.env.MONGODB_URI;
console.log('Connecting to MongoDB…');
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err?.message || err);
    process.exit(1);
  });

// ---- Routes ----
const authRoutes = require('./routes/auth');
const trackerRoutes = require('./routes/tracker');
const babyRoutes = require('./routes/babyCheck');

app.use('/api/auth', authRoutes);
app.use('/api/tracker', trackerRoutes);
app.use('/api/babycheck', babyRoutes);

// ---- Serve React build (if present) ----
const buildDir = path.join(__dirname, 'build');
if (fs.existsSync(buildDir)) {
  app.use(express.static(buildDir));
  // SPA fallback for non-API routes
  app.get('*', (req, res) => {
    // avoid catching API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ message: 'API route not found' });
    }
    res.sendFile(path.join(buildDir, 'index.html'));
  });
} else {
  console.log('No frontend build directory found. Skipping static serving.');
}

// ---- Cron / Scheduler ----
// Import registers the cron schedule. Optionally run an immediate check once on boot.
const cronSvc = require('./services/cron');
// Optional: run one pass at startup (comment out if you don’t want this)
// cronSvc.checkTrackers();

// ---- Start server ----
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
});
