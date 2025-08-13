/**
 * Cron Service
 * Periodically checks trackers for new followings and sends notification emails.
 */
const cron = require('node-cron');
const Tracker = require('../models/Tracker');
const { getFollowings, getProfile } = require('./instagramAPI');
const { sendEmail } = require('./mailer');

// Main job: check all trackers
async function checkTrackers() {
  const trackers = await Tracker.find({});
  for (const t of trackers) {
    try {
      // Backfill targetPk if missing
      if (!t.targetPk) {
        const profile = await getProfile(t.instagramUsername);
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
      const followObjs = await getFollowings(t.targetPk);
      if (!Array.isArray(followObjs) || followObjs.length === 0) {
        console.warn(`followings fetch failed/empty for @${t.instagramUsername}, skipping`);
        continue;
      }

      // Compare current followings to baseline
      const current = followObjs.map(u => u?.username).filter(Boolean).map(String);
      const baseline = Array.isArray(t.baselineFollowing) ? t.baselineFollowing : [];
      const baselineSet = new Set(baseline);
      const newcomers = current.filter(u => !baselineSet.has(u));

      // Send email if new followings detected
      if (newcomers.length > 0) {
        await sendEmail(t.email, t.instagramUsername, newcomers);
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

// Schedule job to run every hour
cron.schedule('0 * * * *', checkTrackers);

module.exports = { checkTrackers };
