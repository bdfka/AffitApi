require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();
app.use(express.json());

const BOT_TOKEN = '9061722239:AAHxzfgcKz6vJI8GvdttBDUrjdkE2NwrwKU';
const ADMIN_ID = '8640405491';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.post('/api/notify-download', async (req, res) => {
    const { userId, resourceName } = req.body;
    if (userId) {
        try {
            await bot.sendMessage(userId, `✅ Вы скачали: *${resourceName}*`, { parse_mode: 'Markdown' });
        } catch(e) {}
    }
    res.json({ ok: true });
});
app.listen(3000);

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `Привет! Это бот AffitDev.\n\n/list - Ресурсы\n/account - Профиль`);
});

bot.onText(/\/admin/, (msg) => {
    if (msg.from.id.toString() !== ADMIN_ID) return;
    bot.sendMessage(msg.chat.id, 'Админка: Отправь файл, чтобы получить ссылку.');
});

bot.on('document', async (msg) => {
    if (msg.from.id.toString() !== ADMIN_ID) return;
    const link = await bot.getFileLink(msg.document.file_id);
    bot.sendMessage(msg.chat.id, `Ссылка на файл:\n${link}`);
});