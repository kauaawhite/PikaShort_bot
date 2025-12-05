// bot.js - FIXED bot6.js (message handler, HTML escaping, admin add, robust API handling)
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const express = require('express');
const app = express();

// Express health check
app.get('/', (req, res) => {
  res.send('Bot V7 is running ✅');
});
app.listen(8080, () => console.log('Server listening on port 8080'));

// ---------- CONFIG ----------
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('Please set TELEGRAM_BOT_TOKEN env variable.');
  process.exit(1);
}
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Admin password
const ADMIN_PASSWORD = 'afiya1310';

// Header / Footer (OFF)
let headerFooterEnabled = false;
const headerText = 'not available now';
const footerText = 'not available now';

// Inactive user config
const INACTIVE_DAYS = 3;
const INACTIVE_CHECK_INTERVAL_HOURS = 12;
const inactiveMessage = `👋 Hey! It’s been a while since you used me.  
Need to shorten links? Just send me any URL 🔗  
I'm here to help 😎`;

// Default Ads Message
const adsMessage = `
🔥 <b>SPECIAL OFFER!</b>  
Earn More With SmallshortURL!  
Visit 👉 https://smallshorturl.myvippanel.shop
`;

// Database Path
const DB_PATH = './src/database.json';

// Read DB
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { tokens: {}, lastActive: {}, admins: [] };
  }
}

// Write DB
function writeDB(db) {
  // ensure dir exists
  try {
    const dir = DB_PATH.split('/').slice(0, -1).join('/');
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {}
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// HTML escape for safe HTML parse_mode
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// DB Helpers
function saveUserToken(chatId, token) {
  const db = readDB();
  db.tokens[chatId] = token;
  writeDB(db);
}
function getUserToken(chatId) {
  return readDB().tokens[chatId];
}
function saveLastActive(chatId) {
  const db = readDB();
  db.lastActive[chatId] = Date.now();
  writeDB(db);
}
function addAdmin(chatId) {
  const db = readDB();
  if (!db.admins.includes(chatId)) db.admins.push(chatId);
  writeDB(db);
}
function isAdmin(chatId) {
  return readDB().admins.includes(chatId);
}
function getAllUsers() {
  return Object.keys(readDB().lastActive || {});
}

// /start
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name || 'User';

  saveLastActive(chatId);

  const text = `👋 Hello <b>${escapeHtml(username)}</b>!\n\n` +
    `Send your <b>Smallshorturl API Key</b> from <a href="https://smallshorturl.myvippanel.shop/member/tools/api">Dashboard</a> (use /api YOUR_API_KEY)\n\n` +
    `Once your API key is set, just send any link — I will shorten it instantly 🔗🚀`;

  bot.sendMessage(chatId, text, { parse_mode: "HTML", disable_web_page_preview: true });
});

// /api <key>
bot.onText(/\/api (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const token = match[1].trim();

  saveLastActive(chatId);

  try {
    // quick test: try shortening google.com to validate token
    const testUrl = `https://smallshorturl.myvippanel.shop/api?api=${encodeURIComponent(token)}&url=https://google.com`;
    const res = await axios.get(testUrl, { timeout: 8000 });

    // try multiple possible keys
    const short =
      res.data?.shortenedUrl ||
      res.data?.shortened_url ||
      res.data?.short ||
      res.data?.url ||
      res.data?.result_url ||
      null;

    if (!short) {
      console.warn('API test returned unexpected data:', res.data);
      return bot.sendMessage(chatId, "❌ Invalid API or unexpected API response. Please check your API key and try again.");
    }

    saveUserToken(chatId, token);
    bot.sendMessage(chatId, "✅ API Saved Successfully!");
  } catch (err) {
    console.error('API test error:', err?.response?.data || err?.message || err);
    bot.sendMessage(chatId, "❌ Invalid API or network error. Please send your API key again.");
  }
});

// /addadmin <password>
bot.onText(/\/addadmin (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const password = match[1].trim();
  if (password !== ADMIN_PASSWORD) return bot.sendMessage(chatId, "❌ Wrong admin password.");
  addAdmin(chatId);
  bot.sendMessage(chatId, "✅ You are now an admin.");
});

// FAST API CHECK (lightweight)
async function fastValidateApi(token) {
  return token && token.length >= 8; // simple length check — optional
}

// Extract URLs
function extractLinks(text) {
  if (!text) return [];
  const re = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9.-]+\.[a-z]{2,})/gi;
  return [...text.matchAll(re)].map(m => m[0]);
}

// Replace URLs
function replaceLinks(text, originals, shorts) {
  let out = text;
  originals.forEach((o, i) => out = out.replace(o, shorts[i] || o));
  return out;
}

// Multiple shorten
async function shortenMultiple(chatId, links) {
  const out = [];
  for (const link of links) out.push(await shortenSingle(chatId, link) || null);
  return out;
}

// Shorten Single - returns shortened URL (does NOT send message)
async function shortenSingle(chatId, url) {
  const token = getUserToken(chatId);

  if (!token) {
    // do not spam user for every link; throw so caller can notify once
    throw new Error('NO_API_TOKEN');
  }

  // FAST validation
  const isValid = await fastValidateApi(token);
  if (!isValid) {
    throw new Error('INVALID_API_TOKEN');
  }

  try {
    const apiUrl = `https://smallshorturl.myvippanel.shop/api?api=${encodeURIComponent(token)}&url=${encodeURIComponent(url)}`;
    const res = await axios.get(apiUrl, { timeout: 10000 });

    // Support multiple possible response keys
    const short =
      res.data?.shortenedUrl ||
      res.data?.shortened_url ||
      res.data?.short ||
      res.data?.url ||
      res.data?.result_url ||
      null;

    if (!short) {
      console.warn('shortenSingle: unexpected API response', res.data);
      throw new Error('API_NO_SHORT');
    }

    // update last active since user used shortening
    saveLastActive(chatId);

    return short;
  } catch (err) {
    // pass error up so caller can format user message
    console.error('shortenSingle error:', err?.response?.data || err?.message || err);
    throw err;
  }
}

// Message handler: listens for any user message and shortens links inside
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || msg.caption || '';

  // ignore bot commands here
  if (text && text.trim().startsWith('/')) return;

  saveLastActive(chatId);

  const links = extractLinks(text);
  if (!links || links.length === 0) {
    // if you want to automatically shorten your own fixed site when no link provided,
    // uncomment next lines and change fixedUrl below:
    // const fixedUrl = 'https://smallshorturl.myvippanel.shop';
    // try { const short = await shortenSingle(chatId, fixedUrl); bot.sendMessage(chatId, `<b>Short:</b>\n<code>${escapeHtml(short)}</code>`, { parse_mode: 'HTML' }); } catch(e){}
    return;
  }

  // try to shorten all links; collect results and report
  let shortened = [];
  try {
    shortened = await shortenMultiple(chatId, links);
  } catch (err) {
    if (err.message === 'NO_API_TOKEN') {
      return bot.sendMessage(chatId, "❌ Please set your Smallshorturl API Key first.\nUse: /api YOUR_API_KEY");
    } else if (err.message === 'INVALID_API_TOKEN') {
      return bot.sendMessage(chatId, "❌ Your API Key seems invalid. Use /api YOUR_API_KEY to set a valid one.");
    } else {
      console.error('Error while shortening links:', err);
      return bot.sendMessage(chatId, "❌ Failed to shorten links due to API error. Check logs.");
    }
  }

  // Build a friendly reply
  const parts = links.map((orig, idx) => {
    const s = shortened[idx];
    if (!s) {
      return `<b>Original:</b>\n<code>${escapeHtml(orig)}</code>\n<b>Shortening failed.</b>`;
    }
    return `<b>Original:</b>\n<code>${escapeHtml(orig)}</code>\n<b>Short:</b>\n<code>${escapeHtml(s)}</code>`;
  });

  // optional header/footer
  let reply = parts.join('\n\n');
  if (headerFooterEnabled) reply = `<b>${escapeHtml(headerText)}</b>\n\n` + reply + `\n\n<b>${escapeHtml(footerText)}</b>`;

  bot.sendMessage(chatId, reply, { parse_mode: 'HTML', reply_to_message_id: msg.message_id, disable_web_page_preview: true });
});

// /sendads
bot.onText(/\/sendads/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "❌ You are not authorized.");

  const users = getAllUsers();
  users.forEach(uid => {
    try { bot.sendMessage(uid, adsMessage, { parse_mode: "HTML", disable_web_page_preview: true }); } catch (e) {}
  });

  bot.sendMessage(chatId, "📢 Ads sent to all users successfully!");
});

// /sendimgads
bot.onText(/\/sendimgads/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "❌ You are not authorized.");

  bot.sendMessage(chatId, "📸 Send the image you want to broadcast!");

  const listener = (m) => {
    if (!m.photo || m.from.id !== chatId) return;

    const fileId = m.photo[m.photo.length - 1].file_id;
    const caption = m.caption || "";
    const users = getAllUsers();

    users.forEach(uid => {
      try { bot.sendPhoto(uid, fileId, { caption, parse_mode: "HTML" }); } catch (e) {}
    });
    bot.sendMessage(chatId, "📢 Image Ads sent successfully!");

    bot.removeListener("message", messageWatcher);
  };

  const messageWatcher = (m) => listener(m);
  bot.on("message", messageWatcher);

  setTimeout(() => bot.removeListener("message", messageWatcher), 2 * 60 * 1000);
});

// /sendvideoads
bot.onText(/\/sendvideoads/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "❌ You are not authorized.");

  bot.sendMessage(chatId, "🎬 Send the video you want to broadcast!");

  const listener = (m) => {
    if (!m.video || m.from.id !== chatId) return;

    const fileId = m.video.file_id;
    const caption = m.caption || "";
    const users = getAllUsers();

    users.forEach(uid => {
      try { bot.sendVideo(uid, fileId, { caption, parse_mode: "HTML" }); } catch (e) {}
    });
    bot.sendMessage(chatId, "📢 Video Ads sent successfully!");

    bot.removeListener("message", messageWatcher);
  };

  const messageWatcher = (m) => listener(m);
  bot.on("message", messageWatcher);

  setTimeout(() => bot.removeListener("message", messageWatcher), 2 * 60 * 1000);
});

// Inactive user auto-message
setInterval(() => {
  const db = readDB();
  const now = Date.now();
  const limit = INACTIVE_DAYS * 86400000;

  for (const uid of Object.keys(db.lastActive || {})) {
    if (now - db.lastActive[uid] >= limit) {
      try { bot.sendMessage(uid, inactiveMessage, { parse_mode: "HTML" }); } catch (e) {}
      db.lastActive[uid] = now;
    }
  }
  writeDB(db);
}, INACTIVE_CHECK_INTERVAL_HOURS * 3600000);

// Startup message
console.log("Bot V7 started successfully! 🚀 (Fixed message handler, HTML replies, admin add)");
