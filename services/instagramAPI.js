/**
 * Instagram API Service (RapidAPI)
 * - Reads RAPIDAPI_KEY, RAPIDAPI_HOST (and optional RAPIDAPI_BASE)
 * - Endpoints configurable via env PATH_* to match your provider
 * - Retries on 429, TTL cache, and clear upstream error surfacing
 */
const axios = require('axios');

// ---------- Config ----------
const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'instagram-best-experience.p.rapidapi.com';
const BASE_URL      = process.env.RAPIDAPI_BASE || `https://${RAPIDAPI_HOST}`;

// You can override these per-provider in Railway Variables if paths differ
const PATH_USER_ID  = process.env.PATH_USER_ID  || '/user_id_by_username';
const PATH_PROFILE  = process.env.PATH_PROFILE  || '/profile';
const PATH_FOLLOW   = process.env.PATH_FOLLOW   || '/following';
const PATH_FEED     = process.env.PATH_FEED     || '/feed';

if (!RAPIDAPI_KEY) {
  console.warn('⚠️ RAPIDAPI_KEY not set — RapidAPI calls will fail.');
}
console.log(`[RapidAPI] base=${BASE_URL} host=${RAPIDAPI_HOST}`);
console.log(`[RapidAPI] paths: uid=${PATH_USER_ID} profile=${PATH_PROFILE} follow=${PATH_FOLLOW} feed=${PATH_FEED}`);

// Create a client so baseURL and headers always match the same host
const rapid = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'X-RapidAPI-Key': RAPIDAPI_KEY,
    'X-RapidAPI-Host': RAPIDAPI_HOST,
  },
});

// ---------- Tiny TTL cache ----------
const cache = new Map(); // key -> { val, exp }
function cacheGet(k) {
  const hit = cache.get(k);
  if (!hit) return null;
  if (hit.exp && Date.now() > hit.exp) { cache.delete(k); return null; }
  return hit.val;
}
function cacheSet(k, val, ttlMs = 10 * 60 * 1000) {
  cache.set(k, { val, exp: Date.now() + ttlMs });
}

// ---------- Helpers ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function enhanceError(err) {
  const status = err?.response?.status ?? 502;
  const data   = err?.response?.data;
  const msg =
    data?.message || data?.error || err?.message || 'Upstream error';
  const e = new Error(msg);
  e.status = status;
  e.payload = { status, message: msg, data };
  return e;
}

async function requestWith429Retry(cfg, { retries = 3, baseDelayMs = 1500 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await rapid.request(cfg);
    } catch (err) {
      const status = err?.response?.status;
      if (status !== 429 || attempt === retries) throw enhanceError(err);
      const retryAfter = Number(err.response?.headers?.['retry-after']);
      const waitMs = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 400);
      console.warn(`429 received. Backing off ${waitMs}ms (attempt ${attempt + 1}/${retries})`);
      await sleep(waitMs);
    }
  }
}

// ---------- API functions (paths/params may need tweaking per provider) ----------
function normUsername(u) {
  return String(u || '').trim().replace(/^@+/, '').toLowerCase();
}

async function getUserIdByUsername(username) {
  const u = normUsername(username);
  if (!u) { const e = new Error('Missing username'); e.status = 400; throw e; }

  const key = `uid:${u}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const { data } = await requestWith429Retry({
      url: PATH_USER_ID,
      method: 'GET',
      params: { username: u }, // change if your provider expects a different param name
    });
    const userId = data?.user_id ?? data?.id ?? data?.data?.id ?? null;
    if (userId) cacheSet(key, userId, 12 * 60 * 60 * 1000); // 12h
    return userId;
  } catch (err) {
    throw err; // already enhanced
  }
}

async function getProfile(username) {
  const u = normUsername(username);
  if (!u) { const e = new Error('Missing username'); e.status = 400; throw e; }

  const key = `profile:${u}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const { data } = await requestWith429Retry({
      url: PATH_PROFILE,
      method: 'GET',
      params: { username: u }, // adjust if provider uses different param
    });
    if (data) cacheSet(key, data, 10 * 60 * 1000);
    return data;
  } catch (err) {
    throw err;
  }
}

async function getFollowings(userId) {
  const id = String(userId || '').trim();
  if (!id) { const e = new Error('Missing userId'); e.status = 400; throw e; }

  const key = `followings:${id}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const { data } = await requestWith429Retry({
      url: PATH_FOLLOW,
      method: 'GET',
      params: { user_id: id }, // adjust to `id` if your provider expects that
    });
    const users = data?.users || data?.data?.users || data || [];
    cacheSet(key, users, 10 * 60 * 1000);
    return users;
  } catch (err) {
    throw err;
  }
}

async function getRecentPosts(userId) {
  const id = String(userId || '').trim();
  if (!id) { const e = new Error('Missing userId'); e.status = 400; throw e; }

  try {
    const { data } = await requestWith429Retry({
      url: PATH_FEED,
      method: 'GET',
      params: { user_id: id }, // adjust param name per provider
    });
    return Array.isArray(data) ? data : (data?.items || data?.data?.items || []);
  } catch (err) {
    throw err;
  }
}

module.exports = {
  getUserIdByUsername,
  getProfile,
  getFollowings,
  getRecentPosts,
};
