/**
 * BabyCheck Routes
 * Analyze Instagram posts for baby-related images using OpenAI.
 */
const express = require('express');
const { getProfile, getRecentPosts } = require('../services/instagramAPI');
const { checkImageForBaby } = require('../services/openAi');

const router = express.Router();

// Helper: Pick largest image candidate from Instagram API
function pickLargestFromCandidates(candidates = []) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => (b.width * b.height) - (a.width * a.height));
  return sorted[0]?.url || null;
}

// Helper: Collect image URLs from Instagram post item
function collectImageUrlsFromItem(item) {
  const urls = [];
  // media_type: 1=photo, 2=video, 8=carousel
  const type = item?.media_type;
  // photo post
  if ((type === 1 || type === undefined) && item?.image_versions2?.candidates) {
    const url = pickLargestFromCandidates(item.image_versions2.candidates);
    if (url) urls.push(url);
  }
  // carousel: include only image frames
  if (type === 8 && Array.isArray(item?.carousel_media)) {
    for (const media of item.carousel_media) {
      const mType = media?.media_type;
      if (mType === 1 && media?.image_versions2?.candidates) {
        const url = pickLargestFromCandidates(media.image_versions2.candidates);
        if (url) urls.push(url);
      }
    }
  }
  return urls;
}

// Helper: Run OpenAI checks with limited concurrency
async function checkImagesWithLimit(urls, limit = 4) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < urls.length) {
      const i = index++;
      const url = urls[i];
      try {
        const isBaby = await checkImageForBaby(url);
        if (isBaby === 'yes') results.push(url);
      } catch (err) {
        // Ignore errors for individual images
      }
    }
  }
  // Start workers
  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);
  return results;
}

// POST /api/babycheck/:username
router.get('/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const profile = await getProfile(username);
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    const posts = await getRecentPosts(profile.pk);
    if (!Array.isArray(posts) || posts.length === 0) {
      return res.status(404).json({ message: 'No posts found' });
    }
    // Collect image URLs from posts
    let images = [];
    for (const item of posts) {
      images = images.concat(collectImageUrlsFromItem(item));
    }
    // Check images for baby content
    const babyImages = await checkImagesWithLimit(images);
    res.json({ images: babyImages, message: babyImages.length ? null : 'No baby images found' });
  } catch (err) {
    console.error('babycheck error:', err.message || err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
