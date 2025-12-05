// bot.js - FINAL FIXED VERSION (V8)
// Fixes: Added Link Listener, Admin Login, and Auto-Directory Creation

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path'); // Added for directory safety
const express = require('express');
const app = express();

// Express health check
app.get('/', (req, res) => {
  res.send('Bot V8 (Fixed) is running ✅');
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
const ADMIN_PASSWORD = 'jadu1310';

// Inactive user config
const INACTIVE_DAYS = 3;
const INACTIVE_CHECK_INTERVAL_HOURS = 12;
const inactiveMessage = `👋 Hey! It’s been a while since you used me.  
Need to shorten links? Just send me any URL 🔗  
I'm here to help 😎`;

// Default Ads Message
const adsMessage = `
🔥 *SPECIAL OFFER!* Earn More With SmallshortURL!  
Visit 👉 https://smallshorturl.myvippanel.shop
`;

// Database Path
const DB_PATH = './src/database.json';

// --- FIX 1: Ensure Database Directory Exists ---
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Read DB
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return { tokens: {}, lastActive: {}, admins: [] };
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { tokens: {}, lastActive: {}, admins: [] };
  }
}

// Write DB
function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// Markdown Escape
function escapeMdV2(text) {
  if (!text && text !== '') return '';
  return String(text)
    .replace(/\\/g, '\\\\').replace(/_/g, '\\_').replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)').replace(/~/g, '\\~').replace(/`/g, '\\`')
    .replace(/>/g, '\\>').replace(/#/g, '\\#').replace(/\+/g, '\\+')
    .replace(/-/g, '\\-').replace(/=/g, '\\=').replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
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

// --- COMMANDS ---

// /start
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name || 'User';

  saveLastActive(chatId);

  const text = `👋 Hello *${escapeMdV2(username)}*!\n\n` +
    `Send your *Smallshorturl API Key* from *[Dashboard](https://smallshorturl.myvippanel.shop/member/tools/api)* (send /api with your api)\n\n` +
    `Once your API key is set, just send any link — I will shorten it instantly 🔗🚀`;

  bot.sendMessage(chatId, text, { parse_mode: "MarkdownV2" });
});

// /api <key>
bot.onText(/\/api (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const token = match[1].trim();

  saveLastActive(chatId);

  try {
    // Basic format check
    if(token.length < 10) throw new Error("Short Token");

    const testUrl = `https://smallshorturl.myvippanel.shop/api?api=${token}&url=https://google.com`;
    const res = await axios.get(testUrl);

    if (!res.data.shortenedUrl) {
      return bot.sendMessage(chatId, "❌ Invalid API. Please send your API key.");
    }

    saveUserToken(chatId, token);
    bot.sendMessage(chatId, "✅ API Saved Successfully! Now send me any link.");
  } catch {
    bot.sendMessage(chatId, "❌ Invalid API or Connection Error.");
  }
});

// --- FIX 2: Admin Login Command ---
bot.onText(/\/adminlogin (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const password = match[1].trim();

  // Delete user message for security
  try { bot.deleteMessage(chatId, msg.message_id); } catch(e){}

  if (password === ADMIN_PASSWORD) {
    addAdmin(chatId);
    bot.sendMessage(chatId, "✅ *Password Accepted!* You are now an Admin.", {parse_mode: "Markdown"});
  } else {
    bot.sendMessage(chatId, "❌ Wrong Password!");
  }
});

// FAST API CHECK
async function fastValidateApi(token) {
  return token && token.length >= 10;
}

// Extract URLs
function extractLinks(text) {
  const re = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9.-]+\.[a-z]{2,})/gi;
  if (!text) return [];
  return [...text.matchAll(re)].map(m => m[0]);
}

// Shorten Single
async function shortenSingle(chatId, url) {
  const token = getUserToken(chatId);

  if (!token) {
    bot.sendMessage(chatId, "❌ Please set your *Smallshorturl API Key* first.\nUse: /api YOUR_API_KEY", { parse_mode: "Markdown" });
    return null;
  }

  const isValid = await fastValidateApi(token);
  if (!isValid) {
    bot.sendMessage(chatId, "❌ Invalid API Format. Please check your key.", { parse_mode: "Markdown" });
    return null;
  }

  try {
    const apiUrl = `https://smallshorturl.myvippanel.shop/api?api=${token}&url=${encodeURIComponent(url)}`;
    const res = await axios.get(apiUrl);

    const short = res.data?.shortenedUrl || null;
    if (!short) return null;

    const safeOrig = escapeMdV2(url);
    const safeShort = escapeMdV2(short);

    const msg =
      `✨✨ *Congratulations!* Your URL has been successfully shortened! 🚀🔗\n\n` +
      `🔗 *Original URL:* \n\`${safeOrig}\`\n\n` +
      `🌐 *Shortened URL:* \n\`${safeShort}\``;

    bot.sendMessage(chatId, msg, { parse_mode: "MarkdownV2" });

    return short;
  } catch (e) {
    console.error(e);
    return null;
  }
}

// --- FIX 3: Link Listener (The Missing Part) ---
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // Ignore if message starts with '/' (Commands)
  if (msg.text && msg.text.startsWith('/')) return;
  
  // Ignore if not text
  if (!msg.text) return;

  const links = extractLinks(msg.text);
  
  if (links.length > 0) {
    saveLastActive(chatId);
    // Shorten the first link found
    await shortenSingle(chatId, links[0]);
  }
});

// /sendads
bot.onText(/\/sendads/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "❌ You are not authorized.");

  const users = getAllUsers();
  let count = 0;
  users.forEach(uid => {
    try { 
        bot.sendMessage(uid, adsMessage, { parse_mode: "Markdown" }); 
        count++;
    } catch {}
  });

  bot.sendMessage(chatId, `📢 Ads sent to ${count} users successfully!`);
});

// /sendimgads
bot.onText(/\/sendimgads/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "❌ You are not authorized.");

  bot.sendMessage(chatId, "📸 Send the image you want to broadcast!");

  const listener = (m) => {
    if (m.chat.id !== chatId) return; // Security check
    if (!m.photo) return;

    const fileId = m.photo[m.photo.length - 1].file_id;
    const caption = m.caption || "";
    const users = getAllUsers();

    users.forEach(uid => bot.sendPhoto(uid, fileId, { caption, parse_mode: "Markdown" }).catch(()=>{}));
    bot.sendMessage(chatId, "📢 Image Ads sent successfully!");

    bot.removeListener("message", messageWatcher);
  };

  const messageWatcher = (m) => listener(m);
  bot.on("message", messageWatcher);

  // Timeout to stop listening if admin doesn't send image
  setTimeout(() => bot.removeListener("message", messageWatcher), 60 * 1000);
});

// /sendvideoads
bot.onText(/\/sendvideoads/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, "❌ You are not authorized.");

  bot.sendMessage(chatId, "🎬 Send the video you want to broadcast!");

  const listener = (m) => {
    if (m.chat.id !== chatId) return;
    if (!m.video) return;

    const fileId = m.video.file_id;
    const caption = m.caption || "";
    const users = getAllUsers();

    users.forEach(uid => bot.sendVideo(uid, fileId, { caption, parse_mode: "Markdown" }).catch(()=>{}));
    bot.sendMessage(chatId, "📢 Video Ads sent successfully!");

    bot.removeListener("message", messageWatcher);
  };

  const messageWatcher = (m) => listener(m);
  bot.on("message", messageWatcher);

  setTimeout(() => bot.removeListener("message", messageWatcher), 60 * 1000);
});

// Inactive user auto-message
setInterval(() => {
  const db = readDB();
  const now = Date.now();
  const limit = INACTIVE_DAYS * 86400000;

  for (const uid of Object.keys(db.lastActive || {})) {
    if (now - db.lastActive[uid] >= limit) {
      bot.sendMessage(uid, inactiveMessage, { parse_mode: "Markdown" }).catch(()=>{});
      db.lastActive[uid] = now; // Reset so we don't spam instantly
    }
  }
  writeDB(db);
}, INACTIVE_CHECK_INTERVAL_HOURS * 3600000);

// Startup message
console.log("Bot V8 started successfully! 🚀 (Full Features + Fixes Applied)");
