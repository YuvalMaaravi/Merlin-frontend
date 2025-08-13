// Tracker Routes
// Handles adding, listing, and removing Instagram trackers for users.
const express = require('express');
const authMiddleware = require('../utils/authMiddleware');
const { getProfile, getFollowings } = require('../services/instagramAPI');
const Tracker = require('../models/Tracker');

const router = express.Router();

const MAX_TRACKERS_PER_USER = 3; // Limit per user
const MAX_FOLLOWING = 100;       // Max following allowed for tracked account

// Add a new tracker
router.post('/add', authMiddleware, async (req, res) => {
  const { instagramUsername, email } = req.body;
  const handle = String(instagramUsername || '').trim();
  if (!handle) return res.status(400).json({ message: 'Instagram username is required' });

  try {
    // DB-only pre-checks
    const [count, existingTracker] = await Promise.all([
      Tracker.countDocuments({ userId: req.user.userId }),
      Tracker.findOne({
        userId: req.user.userId,
        instagramUsername: { $regex: `^${handle}$`, $options: 'i' },
      }),
    ]);
    if (count >= MAX_TRACKERS_PER_USER)
      return res.status(400).json({ message: 'Max trackers reached' });
    if (existingTracker)
      return res.status(409).json({ message: 'You are already tracking this username' });

    // Fetch profile to validate constraints
    const profile = await getProfile(handle);
    if (!profile) return res.status(502).json({ message: 'Failed to fetch profile' });
    if (profile.is_private)
      return res.status(400).json({ message: 'Account is private' });
    const followingCount = Number(profile.following_count || 0);
    if (followingCount > MAX_FOLLOWING)
      return res.status(400).json({ message: `Account follows more than ${MAX_FOLLOWING} users` });

    // Use Instagram numeric id (pk)
    const userPk = profile.pk;
    if (!userPk) return res.status(502).json({ message: 'Profile missing user id' });

    // Snapshot baseline "following" usernames
    const followings = await getFollowings(userPk);
    const baselineFollowing = Array.isArray(followings) ? followings.map(u => u?.username).filter(Boolean) : [];

    // Create tracker
    const tracker = await Tracker.create({
      userId: req.user.userId,
      instagramUsername: handle,
      targetPk: String(userPk),
      baselineFollowing,
      email,
    });
    res.status(201).json(tracker);
  } catch (err) {
    console.error('add tracker error:', err.message || err);
    res.status(500).json({ message: 'Server error' });
  }
});

// List all trackers for the user
router.get('/list', authMiddleware, async (req, res) => {
  try {
    const trackers = await Tracker.find({ userId: req.user.userId });
    res.json(trackers);
  } catch (err) {
    console.error('list trackers error:', err.message || err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove a tracker
router.delete('/remove/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await Tracker.deleteOne({ _id: id, userId: req.user.userId });
    res.json({ success: true });
  } catch (err) {
    console.error('remove tracker error:', err.message || err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
