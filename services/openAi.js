/**
 * OpenAI Service
 * Uses OpenAI to check if an image contains a baby (yes/no answer).
 */
const axios = require('axios');
const OpenAI = require('openai');
const { lookup: mimeLookup } = require('mime-types');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Download the image and return a data URL (data:<mime>;base64,<payload>)
async function fetchImageAsDataURL(imageUrl) {
  const res = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    // Some CDNs (incl. Instagram) care about UA / referer
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://www.instagram.com/',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
    timeout: 15000,
    maxContentLength: 20 * 1024 * 1024, // 20 MB safety
  });

  // Prefer server-provided content-type; otherwise guess from URL
  const contentType =
    res.headers['content-type'] ||
    mimeLookup(new URL(imageUrl).pathname) ||
    'image/jpeg';

  const base64 = Buffer.from(res.data).toString('base64');
  return `data:${contentType};base64,${base64}`;
}

// Use OpenAI to check if image contains a baby
async function checkImageForBaby(imageUrl) {
  try {
    const dataUrl = await fetchImageAsDataURL(imageUrl);
    const result = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an assistant that answers strictly "yes" or "no" on whether an image contains a baby (infant/toddler).',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Does this image contain a baby? Answer only "yes" or "no".' },
            { type: 'image_url', image_url: { url: dataUrl } }, // Use data URL, not remote URL
          ],
        },
      ],
      max_tokens: 1,
    });
    // Extract answer from OpenAI response
    const answer = result.choices?.[0]?.message?.content?.trim().toLowerCase();
    return answer === 'yes' ? 'yes' : 'no';
  } catch (err) {
    // On error, default to 'no'
    return 'no';
  }
}

module.exports = { checkImageForBaby };
