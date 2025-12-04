const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Hello World!');
});

const port = 8080;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// Retrieve the Telegram bot token from the environment variable
const botToken = process.env.TELEGRAM_BOT_TOKEN;

// Create the Telegram bot instance
const bot = new TelegramBot(botToken, { polling: true });

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;
  const welcomeMessage = `😇 Hello, ${username}!\n\n`
    + 'Welcome to the Pikashort URL Shortener Bot!\n'
    + 'This bot will always shorten this website URL for you: [Smallshorturl Website](https://smallshorturl.myvippanel.shop)\n\n'
    + 'If you haven\'t set your API token yet, use:\n/setapi YOUR_API_KEY\n\n'
    + 'How To Use Me 👇👇 \n\n'
    + '✅ Go To [Smallshorturl Website](https://smallshorturl.myvippanel.shop) & Complete Registration.\n'
    + '✅ Copy Your API Key from [API Page](https://smallshorturl.myvippanel.shop/member/tools/api)\n'
    + '✅ Then add your API using command: /setapi YOUR_API_KEY\n\n'
    + 'Made with ❤️ By: @Sahilkhan0785\n'
    + '**Just send anything, and you will get the shortened Smallshorturl link!**';

  bot.sendMessage(chatId, welcomeMessage, { parse_mode: "Markdown" });
});

// Command: /setapi
bot.onText(/\/setapi (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userToken = match[1].trim();
  // Save the user's API token to the database
  saveUserToken(chatId, userToken);

  const response = `Your Smallshorturl API token set successfully. ✅️✅️ Your token is: ${userToken}`;
  bot.sendMessage(chatId, response);
});

// Listen for any message (works for ALL messages: text, photo, etc.)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  
  // Don't respond to /start or /setapi messages here to avoid duplicate replies
  const text = msg.text || msg.caption || "";
  if (/^\/start/.test(text) || /^\/setapi/.test(text)) return;

  // The fixed URL to be shortened (always this)
  const fixedUrl = "https://smallshorturl.myvippanel.shop";

  const shortenedLink = await shortenUrl(chatId, fixedUrl);

  if (shortenedLink) {
    bot.sendMessage(chatId, `Here is your shortened link:\n${shortenedLink}`, {
      reply_to_message_id: msg.message_id,
    });
  } else {
    bot.sendMessage(chatId, `Failed to shorten the link. Please set your API key using /setapi YOUR_API_KEY and try again.`, {
      reply_to_message_id: msg.message_id,
    });
  }
});

// Function to shorten a single URL
async function shortenUrl(chatId, url) {
  const apiToken = getUserToken(chatId);

  if (!apiToken) {
    bot.sendMessage(chatId, 'Please set up your Smallshorturl API token first. Use the command: /setapi YOUR_API_KEY');
    return null;
  }

  try {
    const apiUrl = `https://smallshorturl.myvippanel.shop/api?api=${apiToken}&url=${encodeURIComponent(url)}`;
    const response = await axios.get(apiUrl);
    // Log the API response for debugging
    console.log("API Response:", response.data);
    // Pick the URL from the response (update key as per real API)
    return response.data.shortenedUrl || 
           response.data.shortened_url || 
           response.data.short || 
           response.data.url ||
           response.data.result_url || 
           null;
  } catch (error) {
    console.error('Shorten URL Error:', error?.response?.data || error?.message || error);
    return null;
  }
}

// Function to save user's API token
function saveUserToken(chatId, token) {
  const dbData = getDatabaseData();
  dbData[chatId] = token;
  fs.writeFileSync('./src/database.json', JSON.stringify(dbData, null, 2));
}

// Function to retrieve user's API token
function getUserToken(chatId) {
  const dbData = getDatabaseData();
  return dbData[chatId];
}

// Function to read the database file
function getDatabaseData() {
  try {
    return JSON.parse(fs.readFileSync('./src/database.json', 'utf8'));
  } catch (error) {
    return {};
  }
}