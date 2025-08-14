/**
 * Cron Service
 * Periodically checks trackers for new followings and sends notification emails.
 * Safe-by-default: no scheduling on import; must call initCron() explicitly.
 */
const cron = require('node-cron');
const mongoose = require('mongoose');
const Tracker = require('../models/Tracker');

function safeRequire(mod) {
  try {
    return require(mod);
  } catch (e) {
    console.warn(`Optional module "${mod}" not available:`, e?.message || e);
    return null;
  }
}

async function checkTrackers() {
  // Ensure DB is connected
  if (mongoose.connection.readyState !== 1) {
    console.warn('DB not connected; skipping cron cycle.');
    return;
  }

  const instagram = safeRequire('./instagramAPI'); // { getFollowings, getProfile }
  const mailer = safeRequire('./mailer');          // { sendEmail }

  if (!instagram?.getFollowings || !instagram?.getProfile) {
    console.warn('instagramAPI missing; skipping cron cycle.');
    return;
  }
  if (!mailer?.sendEmail) {
    console.warn('mailer missing; skipping cron cycle.');
    return;
  }

  const trackers = await Tracker.find({});
  for (const t of trackers) {
    try {
      // Backfill targetPk if missing
      if (!t.targetPk) {
        const profile = await instagram.getProfile(t.instagramUsername);
        const pk = profile?.pk ? String(profile.pk) : null;
        if (!pk) {
          console.warn(`Could not resolve pk for @${t.instagramUsername}; skipping`);
          continue;
        }
        t.targetPk = pk;
        await t.save();
        console.log(`Backfilled pk for @${t.instagramUsername}: ${pk}`);
      }

      console.log(`Checking tracker for @${t.instagramUsername} (pk: ${t.targetPk})`);
      const followObjs = await instagram.getFollowings(t.targetPk);
      if (!Array.isArray(followObjs) || followObjs.length === 0) {
        console.warn(`followings fetch failed/empty for @${t.instagramUsername}, skipping`);
        continue;
      }

      const current = followObjs.map(u => u?.username).filter(Boolean).map(String);
      const baseline = Array.isArray(t.baselineFollowing) ? t.baselineFollowing : [];
      const newcomers = current.filter(u => !new Set(baseline).has(u));

      if (newcomers.length > 0) {
        await mailer.sendEmail(t.email, t.instagramUsername, newcomers);
        t.baselineFollowing = current;
        await t.save();
        console.log(`emailed ${t.email} about @${t.instagramUsername}: +${newcomers.length} new followings`);
      }
    } catch (err) {
      console.error(
        `tracker job error for @${t.instagramUsername}:`,
        err?.response?.data || err.message || err
      );
    }
  }
}

/**
 * Initializes cron schedules.
 * - Runs hourly at minute 0
 * - Optional one-shot 30s after boot for smoke test (enabled by ENABLE_CRON_SMOKE)
 */
function initCron() {
  // Every hour at minute 0
  cron.schedule('0 * * * *', checkTrackers);

  // Optional: run once after boot (set ENABLE_CRON_SMOKE=true to enable)
  if (process.env.ENABLE_CRON_SMOKE === 'true') {
    setTimeout(checkTrackers, 30_000);
  }
}

module.exports = { initCron, checkTrackers };
