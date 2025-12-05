const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const express = require('express');
const app = express();

// Basic express check
app.get('/', (req, res) => {
  res.send('Bot is running successfully!');
});

const port = 8080;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// Load Telegram Bot Token
const botToken = process.env.TELEGRAM_BOT_TOKEN;

// Create bot instance
const bot = new TelegramBot(botToken, { polling: true });


// ========================
//        /start
// ========================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || "User";

  const messageStart = `
👋 Hello **${username}**!

Send your **Smallshorturl API Key** from **[Dashboard](https://dashboard.smallshorturl.myvippanel.shop/member/tools/api)** *send /api with your API key*

Once your API key is set, just send any link — I will shorten it instantly 🔗🚀
`;

  bot.sendMessage(chatId, messageStart, { parse_mode: "Markdown" });
});


// ========================
//      /api (SET API + VALIDATION)
// ========================
bot.onText(/\/api (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userToken = match[1].trim();

  try {
    // Test API key
    const testUrl = `https://smallshorturl.myvippanel.shop/api?api=${userToken}&url=https://google.com`;
    const response = await axios.get(testUrl);

    if (!response.data.shortenedUrl) {
      bot.sendMessage(
        chatId,
        `❌ *Invalid API.* Please send your API key.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    saveUserToken(chatId, userToken);

    bot.sendMessage(
      chatId,
      `✅ Your **Smallshorturl API Key** has been successfully saved!\n🔑 Token: **${userToken}**`,
      { parse_mode: "Markdown" }
    );

  } catch (error) {
    bot.sendMessage(
      chatId,
      `❌ *Invalid API.* Please send your API key.`,
      { parse_mode: "Markdown" }
    );
  }
});


// ========================
//    MAIN MESSAGE HANDLER
// ========================
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.text && !msg.caption) return;

  const text = msg.text || msg.caption;

  // Prevent loop for commands
  if (/^\/start/.test(text) || /^\/api/.test(text)) return;

  const links = extractLinks(text);
  if (links.length === 0) return;

  const shortened = await shortenMultipleLinks(chatId, links);
  const finalText = replaceLinksInText(text, links, shortened);

  bot.sendMessage(chatId, finalText, {
    reply_to_message_id: msg.message_id,
    parse_mode: "Markdown"
  });
});


// ========================
//   EXTRACT URL
// ========================
function extractLinks(text) {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})([^\s]*)/g;
  return [...text.matchAll(urlRegex)].map(m => m[0]);
}


// ========================
//    REPLACE LINKS
// ========================
function replaceLinksInText(text, original, shortened) {
  let updated = text;
  original.forEach((link, i) => {
    updated = updated.replace(link, shortened[i]);
  });
  return updated;
}


// ========================
// SHORT MULTIPLE LINKS
// ========================
async function shortenMultipleLinks(chatId, links) {
  const result = [];

  for (const url of links) {
    const s = await shortenUrl(chatId, url);
    result.push(s || url);
  }

  return result;
}


// ========================
//     SHORT SINGLE URL
// ========================
async function shortenUrl(chatId, url) {
  const token = getUserToken(chatId);

  if (!token) {
    bot.sendMessage(
      chatId,
      `❌ Please set your **Smallshorturl API Key** first.\nUse: /api YOUR_API_KEY`,
      { parse_mode: "Markdown" }
    );
    return null;
  }

  try {
    const apiUrl = `https://smallshorturl.myvippanel.shop/api?api=${token}&url=${encodeURIComponent(url)}`;
    const response = await axios.get(apiUrl);

    const short = response.data.shortenedUrl;
    if (!short) return null;

    const safeOriginal = escapeMd(url);
    const safeShort = escapeMd(short);

    const successMsg = 
`✨✨ *Congratulations!* Your URL has been successfully shortened! 🚀🔗

🔗 *Original URL:*  
${safeOriginal}

🌐 *Shortened URL:*  
\`${safeShort}\`
`;

    bot.sendMessage(chatId, successMsg, { parse_mode: "MarkdownV2" });

    return short;

  } catch (error) {
    return null;
  }
}


// ========================
//    SAVE TOKEN
// ========================
function saveUserToken(chatId, token) {
  const db = getDatabaseData();
  db[chatId] = token;
  fs.writeFileSync('./src/database.json', JSON.stringify(db, null, 2));
}

function getUserToken(chatId) {
  const db = getDatabaseData();
  return db[chatId];
}

function getDatabaseData() {
  try {
    return JSON.parse(fs.readFileSync('./src/database.json', "utf8"));
  } catch {
    return {};
  }
}


// ========================
//  ESCAPE MARKDOWN V2
// ========================
function escapeMd(text) {
  return text
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/~/g, "\\~")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#")
    .replace(/\+/g, "\\+")
    .replace(/-/g, "\\-")
    .replace(/=/g, "\\=")
    .replace(/\|/g, "\\|")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\./g, "\\.")
    .replace(/!/g, "\\!");
}
