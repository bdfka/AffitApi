require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ==========================================
// НАСТРОЙКИ
// ==========================================
const BOT_TOKEN = '9061722239:AAHxzfgcKz6vJI8GvdttBDUrjdkE2NwrwKU';
const ADMIN_ID = '8640405491';
const RENDER_URL = 'https://affitapi.onrender.com'; // Ссылка на твой сервис в Render (без слэша на конце)

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();

// Файл, где мы будем хранить связки "код -> ссылка"
const DB_FILE = path.join(__dirname, 'database.json');

// Создаем файл БД, если его нет
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({}));
}

// ==========================================
// ВЕБ-СЕРВЕР (Редирект и пробуждение)
// ==========================================
app.get('/', (req, res) => res.send('Bot is running!'));

// Обработка коротких ссылок для скачивания
app.get('/dl/:code', (req, res) => {
    const code = req.params.code;
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        const fileUrl = db[code];

        if (fileUrl) {
            // Перенаправляем пользователя на прямое скачивание с Telegram
            res.redirect(fileUrl);
        } else {
            res.status(404).send('Файл не найден или ссылка устарела.');
        }
    } catch (e) {
        res.status(500).send('Ошибка сервера.');
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Web server running'));

// ==========================================
// АДМИН-ПАНЕЛЬ (Генерация короткой ссылки)
// ==========================================
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `Привет! Это бот AffitDev.`);
});

bot.onText(/\/admin/, (msg) => {
    if (msg.from.id.toString() !== ADMIN_ID) return;
    bot.sendMessage(msg.chat.id, '👑 Отправьте файл, чтобы получить короткую ссылку для сайта.');
});

bot.on('document', async (msg) => {
    if (msg.from.id.toString() !== ADMIN_ID) return;

    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name;
    
    try {
        // 1. Получаем прямую ссылку на файл от Telegram
        const fileInfo = await bot.getFile(fileId);
        const directUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`;

        // 2. Генерируем короткий случайный код (например, 6 символов)
        const shortCode = crypto.randomBytes(3).toString('hex');

        // 3. Сохраняем в наш локальный файл database.json
        const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        db[shortCode] = directUrl;
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

        // 4. Формируем ссылку на наш сервер Render
        const finalLink = `${RENDER_URL}/dl/${shortCode}`;

        bot.sendMessage(msg.chat.id, 
            `✅ Файл получен!\n\n📄 Имя: ${fileName}\n\n🔗 <b>Ссылка для сайта:</b>\n<code>${finalLink}</code>\n\nВставьте эту ссылку в админ-панель сайта.`, 
            { parse_mode: 'HTML' }
        );
    } catch (error) {
        bot.sendMessage(msg.chat.id, `❌ Ошибка: ${error.message}`);
    }
});
