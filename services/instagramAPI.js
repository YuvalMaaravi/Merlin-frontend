/**
 * Instagram API Service
 * Handles requests to RapidAPI Instagram endpoints with caching and retry logic.
 */
const axios = require('axios');

const INSTAGRAM_API = 'https://instagram-best-experience.p.rapidapi.com';
const headers = {
  'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
  'X-RapidAPI-Host': 'instagram-best-experience.p.rapidapi.com',
};

// --- Simple in-memory TTL cache ---
const cache = new Map(); // key -> { value, exp }
function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.exp && Date.now() > hit.exp) { cache.delete(key); return null; }
  return hit.value;
}
function cacheSet(key, value, ttlMs = 10 * 60 * 1000) { // default 10 minutes
  cache.set(key, { value, exp: Date.now() + ttlMs });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Request with retry for 429 errors (rate limit)
async function requestWith429Retry(config, { retries = 3, baseDelayMs = 1500 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios.request(config);
    } catch (err) {
      const status = err?.response?.status;
      if (status !== 429 || attempt === retries) throw err;
      const retryAfterHeader = err.response.headers?.['retry-after'];
      const jitter = Math.floor(Math.random() * 400); // a little jitter helps
      const waitMs = retryAfterHeader
        ? Number(retryAfterHeader) * 1000
        : baseDelayMs * Math.pow(2, attempt) + jitter;
      console.warn(`429 received. Backing off for ${waitMs}ms (attempt ${attempt + 1}/${retries})`);
      await sleep(waitMs);
    }
  }
}

// Get Instagram user ID by username
async function getUserIdByUsername(username) {
  const key = `uid:${username.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const res = await axios.get(`${INSTAGRAM_API}/user_id_by_username`, {
    params: { username },
    headers,
  });
  const userId = res.data?.user_id;
  if (userId) cacheSet(key, userId);
  return userId;
}

// Get Instagram profile info
async function getProfile(username) {
  const key = `profile:${username.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const res = await requestWith429Retry({
    url: `${INSTAGRAM_API}/user_info`,
    method: 'GET',
    params: { username },
    headers,
  });
  if (res.data) cacheSet(key, res.data);
  return res.data;
}

// Get followings for a user by pk
async function getFollowings(pk) {
  const key = `followings:${pk}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const res = await requestWith429Retry({
    url: `${INSTAGRAM_API}/user_following`,
    method: 'GET',
    params: { user_id: pk },
    headers,
  });
  if (res.data?.users) cacheSet(key, res.data.users);
  return res.data?.users || [];
}

// Get recent posts for a user by pk
async function getRecentPosts(pk) {
  const res = await requestWith429Retry({
    url: `${INSTAGRAM_API}/user_feed`,
    method: 'GET',
    params: { user_id: pk },
    headers,
  });
  return res.data?.items || [];
}

module.exports = {
  getUserIdByUsername,
  getProfile,
  getFollowings,
  getRecentPosts,
};
