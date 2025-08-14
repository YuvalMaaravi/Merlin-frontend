/**
 * Merlin Assignment Backend Server
 * Express app, MongoDB connection, healthcheck, routes, and optional cron.
 */
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Load .env locally; Railway uses dashboard Variables in production
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
app.use(express.json());

// --- Health first (so Railway can probe even if other parts fail) ---
app.get('/health', (_req, res) => res.status(200).send('ok'));

// ---- Recommended (non-fatal) env checks ----
const REQUIRED_FOR_BOOT = ['JWT_SECRET']; // keep minimal to avoid blocking boot
const missingBoot = REQUIRED_FOR_BOOT.filter((k) => !process.env[k]);
if (missingBoot.length) {
  console.warn('⚠️ Missing recommended env vars:', missingBoot.join(', '));
}

// ---- CORS ----
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));

// ---- MongoDB connection (optional for boot; logs warning if missing) ----
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
  console.log('Connecting to MongoDB…');
  mongoose
    .connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch((err) => {
      console.error('MongoDB connection error:', err?.message || err);
      // Do not exit; keep /health alive so you can fix env/DB later
    });
} else {
  console.warn('⚠️ No MONGODB_URI set; skipping DB connection.');
}

// ---- Routes ----
try {
  const authRoutes = require('./routes/auth');
  const trackerRoutes = require('./routes/tracker');
  const babyRoutes = require('./routes/babyCheck');

  app.use('/api/auth', authRoutes);
  app.use('/api/tracker', trackerRoutes);
  app.use('/api/babycheck', babyRoutes);
} catch (e) {
  console.warn('⚠️ Routes not loaded (maybe missing files?):', e?.message || e);
}

// ---- Serve React build (if present) ----
const buildDir = path.join(__dirname, 'build');
if (fs.existsSync(buildDir)) {
  app.use(express.static(buildDir));

  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      return res.sendFile(path.join(buildDir, 'index.html'));
    }
    next();
  });
} else {
  console.log('No frontend build directory found. Skipping static serving.');
}


// ---- Cron (opt-in, starts after Mongo is ready) ----
if (process.env.ENABLE_CRON === 'true') {
  try {
    const { initCron } = require('./services/cron');
    const startWhenDbReady = () => {
      if (!MONGODB_URI) {
        console.warn('Cron requires MongoDB; no MONGODB_URI set. Skipping cron.');
        return;
      }
      if (mongoose.connection.readyState === 1) {
        initCron();
        console.log('⏰ Cron started (hourly).');
      } else {
        console.log('Waiting for Mongo to connect before starting cron…');
        setTimeout(startWhenDbReady, 2000);
      }
    };
    startWhenDbReady();
  } catch (e) {
    console.error('Failed to initialize cron:', e?.message || e);
  }
} else {
  console.log('Cron disabled (set ENABLE_CRON=true to enable).');
}

// ---- Start server (Railway provides PORT) ----
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
});

// ---- Graceful shutdown ----
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server…');
  mongoose.connection.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('SIGINT received, closing server…');
  mongoose.connection.close(() => process.exit(0));
});
