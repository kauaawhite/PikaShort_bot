// bot.js - FINAL V6
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const express = require('express');
const app = express();

// Express health check
app.get('/', (req, res) => {
  res.send('Bot V6 is running ✅');
});
app.listen(8080, () => console.log('Server listening on port 8080'));

// ---------- CONFIG ----------
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('Please set TELEGRAM_BOT_TOKEN env variable.');
  process.exit(1);
}
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Admin password (as requested)
const ADMIN_PASSWORD = 'afiya1310';

// Header / Footer configuration (OFF by default)
let headerFooterEnabled = false;
const headerText = 'not available now';
const footerText = 'not available now';

// Inactive user config
const INACTIVE_DAYS = 3; // days
const INACTIVE_CHECK_INTERVAL_HOURS = 12; // how often to scan
const inactiveMessage = `👋 Hey! It’s been a while since you used me.  
Need to shorten links? Just send me any URL 🔗  
I'm here to help 😎`;

// Default ads message (editable in file)
const adsMessage = `
🔥 *SPECIAL OFFER!*  
Earn More With SmallshortURL!  
Visit 👉 https://smallshorturl.myvippanel.shop
`;

// ----------------------------
// Utility: DB (simple JSON file)
// structure: { tokens: {chatId: token}, lastActive: {chatId: timestamp}, admins: [chatId,...] }
// ----------------------------
const DB_PATH = './src/database.json';
function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { tokens: {}, lastActive: {}, admins: [] };
  }
}
function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ----------------------------
// Helper: Escape for MarkdownV2
// ----------------------------
function escapeMdV2(text) {
  if (!text && text !== '') return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}

// ----------------------------
// DB wrappers
// ----------------------------
function saveUserToken(chatId, token) {
  const db = readDB();
  db.tokens[chatId] = token;
  writeDB(db);
}
function getUserToken(chatId) {
  const db = readDB();
  return db.tokens[chatId];
}
function saveLastActive(chatId) {
  const db = readDB();
  db.lastActive[chatId] = Date.now();
  writeDB(db);
}
function addAdmin(chatId) {
  const db = readDB();
  db.admins = db.admins || [];
  if (!db.admins.includes(chatId)) {
    db.admins.push(chatId);
    writeDB(db);
  }
}
function isAdmin(chatId) {
  const db = readDB();
  db.admins = db.admins || [];
  return db.admins.includes(Number(chatId)) || db.admins.includes(String(chatId));
}
function getAllUsers() {
  const db = readDB();
  return Object.keys(db.lastActive || {});
}

// ----------------------------
// /start - welcome message
// ----------------------------
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name || 'User';
  // mark active
  saveLastActive(chatId);

  const text = `👋 Hello *${escapeMdV2(username)}*!\n\n` +
    `Send your *Smallshorturl API Key* from *[Dashboard](https://smallshorturl.myvippanel.shop/member/tools/api)* (send /api with your api)\n\n` +
    `Once your API key is set, just send any link — I will shorten it instantly 🔗🚀`;

  bot.sendMessage(chatId, text, { parse_mode: 'MarkdownV2' }).catch(console.error);
});

// ----------------------------
// /api <key> - set & validate API key
// ----------------------------
bot.onText(/\/api (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const token = (match && match[1]) ? match[1].trim() : null;
  saveLastActive(chatId);

  if (!token) {
    bot.sendMessage(chatId, '❌ Please provide an API key. Usage: /api YOUR_API_KEY');
    return;
  }

  try {
    // Test call
    const testUrl = `https://smallshorturl.myvippanel.shop/api?api=${encodeURIComponent(token)}&url=${encodeURIComponent('https://google.com')}`;
    const res = await axios.get(testUrl, { timeout: 15000 });

    if (!res.data || !res.data.shortenedUrl) {
      bot.sendMessage(chatId, '❌ Invalid API. Please send your API key.', { parse_mode: 'Markdown' });
      return;
    }

    saveUserToken(chatId, token);
    bot.sendMessage(chatId, `✅ Your *Smallshorturl API Key* has been saved!`, { parse_mode: 'Markdown' });

  } catch (err) {
    bot.sendMessage(chatId, '❌ Invalid API. Please send your API key.', { parse_mode: 'Markdown' });
  }
});

// ----------------------------
// /admin <password> - become admin (password protected)
// ----------------------------
bot.onText(/\/admin (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const pass = (match && match[1]) ? match[1].trim() : '';
  saveLastActive(chatId);

  if (pass !== ADMIN_PASSWORD) {
    bot.sendMessage(chatId, '❌ Incorrect password.');
    return;
  }

  addAdmin(chatId);
  bot.sendMessage(chatId, '✅ You are now an *Admin*! 🎉', { parse_mode: 'Markdown' });
});

// ----------------------------
// URL detection and shorten flow
// ----------------------------
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  // ignore if no content
  if (!msg.text && !msg.caption) return;

  const text = msg.text || msg.caption;

  // ignore commands handled elsewhere
  if (/^\/(start|api|admin|sendads|sendimgads|sendvideoads|broadcast)/i.test(text.trim())) {
    // still update last active for commands
    if (!/^\/sendads|^\/sendimgads|^\/sendvideoads/i.test(text.trim())) {
      saveLastActive(chatId);
    }
    return;
  }

  saveLastActive(chatId);

  const links = extractLinks(text);
  if (!links || links.length === 0) return;

  // shorten all links
  const shortened = await shortenMultiple(chatId, links);

  // replace in text (if you want to forward full message back)
  let finalText = replaceLinks(text, links, shortened);

  // header/footer if enabled
  if (headerFooterEnabled) {
    finalText = `${headerText}\n\n${finalText}\n\n${footerText}`;
  }

  // send result (as plain message)
  bot.sendMessage(chatId, finalText, { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }).catch(console.error);
});

// ----------------------------
// Extract links helper
// ----------------------------
function extractLinks(text) {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})([^\s]*)/g;
  const matches = [...text.matchAll(urlRegex)].map(m => m[0]);
  return matches;
}
function replaceLinks(text, originals, replacements) {
  let out = text;
  originals.forEach((o, i) => {
    out = out.replace(o, replacements[i] || o);
  });
  return out;
}

// ----------------------------
// Shortening helpers
// ----------------------------
async function shortenMultiple(chatId, links) {
  const out = [];
  for (const l of links) {
    const s = await shortenSingle(chatId, l);
    out.push(s || l);
  }
  return out;
}
async function shortenSingle(chatId, url) {
  const token = getUserToken(chatId);
  if (!token) {
    // instruct user to set token
    bot.sendMessage(chatId, '❌ Please set your *Smallshorturl API Key* first.\nUse: /api YOUR_API_KEY', { parse_mode: 'Markdown' }).catch(console.error);
    return null;
  }

  try {
    const apiUrl = `https://smallshorturl.myvippanel.shop/api?api=${encodeURIComponent(token)}&url=${encodeURIComponent(url)}`;
    const res = await axios.get(apiUrl, { timeout: 15000 });

    const short = res.data && res.data.shortenedUrl ? res.data.shortenedUrl : null;
    if (!short) return null;

    // send success message with monospace and MarkdownV2 escaping
    const safeOrig = escapeMdV2(url);
    const safeShort = escapeMdV2(short);

    const success = `✨✨ *Congratulations!* Your URL has been successfully shortened! 🚀🔗\n\n` +
      `🔗 *Original URL:*  \n\`${safeOrig}\`\n\n` +
      `🌐 *Shortened URL:*  \n\`${safeShort}\``;

    bot.sendMessage(chatId, success, { parse_mode: 'MarkdownV2' }).catch(console.error);

    return short;
  } catch (err) {
    // fail silently for shorten, user already informed when token missing
    console.error('Shorten error:', err?.response?.data || err?.message || err);
    return null;
  }
}

// ----------------------------
// Admin-only: send ads text to all users
// Usage: admin types /sendads
// ----------------------------
bot.onText(/\/sendads/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ You are not authorized to use this command.');
    return;
  }

  const users = getAllUsers();
  users.forEach(uid => {
    try {
      bot.sendMessage(uid, adsMessage, { parse_mode: 'Markdown' });
    } catch (e) { console.error('Send ad error to', uid, e); }
  });

  bot.sendMessage(chatId, '📢 Ads sent to all users successfully!');
});

// ----------------------------
// Admin-only: send image ads
// Usage: admin types /sendimgads -> bot asks to send an image -> admin sends image (photo)
// ----------------------------
bot.onText(/\/sendimgads/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ You are not authorized to use this command.');
    return;
  }

  bot.sendMessage(chatId, '📸 Send the image (photo) you want to broadcast with an optional caption.');
  // listen once for the next photo from ANY user — ensure it's from same admin by checking incoming msg.from.id
  const listener = (imgMsg) => {
    if (!imgMsg.photo) return;
    if (imgMsg.from.id !== chatId) return; // ignore photos from others
    const fileId = imgMsg.photo[imgMsg.photo.length - 1].file_id;
    const caption = imgMsg.caption || '';

    const users = getAllUsers();
    users.forEach(uid => {
      try {
        bot.sendPhoto(uid, fileId, { caption, parse_mode: 'Markdown' });
      } catch (e) { console.error('Send photo ad error to', uid, e); }
    });

    bot.sendMessage(chatId, '📢 Image Ads sent successfully!');
    // remove the listener
    bot.removeListener('message', messageWatcher);
  };

  // Watch for message that contains photo from same admin
  const messageWatcher = (m) => {
    if (m.from && m.from.id === chatId && m.photo) {
      listener(m);
    }
  };
  bot.on('message', messageWatcher);

  // Auto-remove listener after 2 minutes to avoid dangling watchers
  setTimeout(() => bot.removeListener('message', messageWatcher), 2 * 60 * 1000);
});

// ----------------------------
// Admin-only: send video ads
// Usage: admin types /sendvideoads -> bot asks to send a video -> admin sends video
// ----------------------------
bot.onText(/\/sendvideoads/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ You are not authorized to use this command.');
    return;
  }

  bot.sendMessage(chatId, '🎬 Send the video you want to broadcast with an optional caption.');
  const listener = (vmsg) => {
    if (!vmsg.video) return;
    if (vmsg.from.id !== chatId) return;
    const fileId = vmsg.video.file_id;
    const caption = vmsg.caption || '';

    const users = getAllUsers();
    users.forEach(uid => {
      try {
        bot.sendVideo(uid, fileId, { caption, parse_mode: 'Markdown' });
      } catch (e) { console.error('Send video ad error to', uid, e); }
    });

    bot.sendMessage(chatId, '📢 Video Ads sent successfully!');
    bot.removeListener('message', messageWatcher);
  };

  const messageWatcher = (m) => {
    if (m.from && m.from.id === chatId && m.video) {
      listener(m);
    }
  };
  bot.on('message', messageWatcher);
  setTimeout(() => bot.removeListener('message', messageWatcher), 2 * 60 * 1000);
});

// ----------------------------
// Inactive checker (runs every INACTIVE_CHECK_INTERVAL_HOURS)
// Sends inactiveMessage to users inactive >= INACTIVE_DAYS
// ----------------------------
setInterval(() => {
  const db = readDB();
  const now = Date.now();
  const limit = INACTIVE_DAYS * 24 * 60 * 60 * 1000;

  for (const uid of Object.keys(db.lastActive || {})) {
    try {
      if (now - db.lastActive[uid] >= limit) {
        bot.sendMessage(uid, inactiveMessage, { parse_mode: 'Markdown' }).catch(err => console.error('Inactive msg error', uid, err));
        // reset timer so we don't spam every interval
        db.lastActive[uid] = now;
      }
    } catch (e) {
      console.error('Inactive check error for', uid, e);
    }
  }
  writeDB(db);
}, INACTIVE_CHECK_INTERVAL_HOURS * 60 * 60 * 1000); // interval in ms

// ----------------------------
// Small helpers & startup log
// ----------------------------
console.log('Bot V6 started. Admin password set. Header/Footer currently OFF.');

// End of file
