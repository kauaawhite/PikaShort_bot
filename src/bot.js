const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is running successfully!');
});

const port = 8080;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// Load Telegram bot token
const botToken = process.env.TELEGRAM_BOT_TOKEN;

// Create Telegram bot instance
const bot = new TelegramBot(botToken, { polling: true });


// 🔥 FIRST MESSAGE WHEN BOT RESTARTS
bot.on("polling_error", console.log);
console.log(`
🚀 I’m back, fam!  
Bot is now fully online 🔥  

All features are working perfectly again —  
✅ Link Shortening  
✅ Media + Forward Support  
✅ Header/Footer Customization  
✅ Instant Response  

Aa jao sab 😎 — try your commands now!  
/type /start or send any link 🔗
`);


// ==========================
//      /start COMMAND
// ==========================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || "User";

  const messageStart = `
👋 Hello **${username}**!

Send your **Smallshorturl API Key** from Dashboard:
https://dashboard.smallshorturl.myvippanel.shop/member/tools/api

Once your API key is set, just send any link — I will shorten it instantly 🔗🚀
`;

  bot.sendMessage(chatId, messageStart, { parse_mode: "Markdown" });
});


// ==========================
//        SET API KEY
// ==========================
bot.onText(/\/setapi (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userToken = match[1].trim();

  saveUserToken(chatId, userToken);

  const response = `
✅ Your Smallshorturl API Key has been saved successfully!
🔑 Token: *${userToken}*

Now send any link to shorten it 🔗
`;

  bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
});


// ==========================
//   MAIN MESSAGE HANDLER
// ==========================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.text && !msg.caption) return;

  const text = msg.text || msg.caption;
  const links = extractLinks(text);

  if (links.length === 0) return;

  const shortenedLinks = await shortenMultipleLinks(chatId, links);

  const updatedText = replaceLinksInText(text, links, shortenedLinks);

  bot.sendMessage(chatId, updatedText, {
    reply_to_message_id: msg.message_id,
    parse_mode: "Markdown"
  });
});


// ==========================
//   EXTRACT URL FUNCTION
// ==========================
function extractLinks(text) {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})([^\s]*)/g;
  const links = [...text.matchAll(urlRegex)].map(m => m[0]);
  return links;
}


// ==========================
// REPLACE URL WITH SHORT URL
// ==========================
function replaceLinksInText(text, originalLinks, newLinks) {
  let updated = text;
  originalLinks.forEach((link, i) => {
    updated = updated.replace(link, newLinks[i]);
  });
  return updated;
}


// ==========================
// SHORT MULTIPLE LINKS
// ==========================
async function shortenMultipleLinks(chatId, links) {
  const results = [];

  for (const url of links) {
    const shortUrl = await shortenUrl(chatId, url);
    results.push(shortUrl || url);
  }

  return results;
}


// ==========================
// SHORT A SINGLE URL
// ==========================
async function shortenUrl(chatId, url) {
  const token = getUserToken(chatId);

  if (!token) {
    bot.sendMessage(chatId,
      `❌ You haven't set your API Key yet.
Use: /setapi YOUR_API_KEY`
    );
    return null;
  }

  try {
    const apiURL = `https://smallshorturl.myvippanel.shop/api?api=${token}&url=${encodeURIComponent(url)}`;

    const res = await axios.get(apiURL);

    if (!res.data.shortenedUrl) return null;

    const message = `
✨✨ *Congratulations!* Your URL has been successfully shortened! 🚀🔗

🔗 *Original URL:*  
${url}

🌐 *Shortened URL:*  
${res.data.shortenedUrl}
`;

    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });

    return res.data.shortenedUrl;

  } catch (err) {
    console.error("Shorten error:", err);
    bot.sendMessage(chatId, "⚠️ Error while shortening URL.");
    return null;
  }
}


// ==========================
// SAVE USER TOKEN
// ==========================
function saveUserToken(chatId, token) {
  const db = getDatabaseData();
  db[chatId] = token;
  fs.writeFileSync('./src/database.json', JSON.stringify(db, null, 2));
}

// GET USER TOKEN
function getUserToken(chatId) {
  const db = getDatabaseData();
  return db[chatId];
}

// READ DATABASE
function getDatabaseData() {
  try {
    return JSON.parse(fs.readFileSync('./src/database.json'));
  } catch {
    return {};
  }
}
