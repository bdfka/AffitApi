
const BOT_TOKEN = '9061722239:AAHxzfgcKz6vJI8GvdttBDUrjdkE2NwrwKU';
const ADMIN_ID = '8640405491';
const BOT_USERNAME = 'AffitDev_bot'; // Юзернейм бота БЕЗ собаки (@)


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
const BOT_USERNAME = 'AffitDev_bot'; // Юзернейм бота БЕЗ собаки (@)
const SELF_URL = 'https://affitapi.onrender.com'; 

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();
app.use(express.json());

// Файл для хранения данных о файлах
const DB_FILE = path.join(__dirname, 'files.json');
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({}));

// ==========================================
// ВЕБ-СЕРВЕР
// ==========================================
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 3000, () => console.log('Web server running'));

// ==========================================
// ПИНГ ДЛЯ RENDER (ЧТОБЫ НЕ ЗАСЫПАЛ)
// ==========================================
setInterval(() => {
    fetch(SELF_URL)
        .then(res => console.log(`[PING] Статус сервера: ${res.status}`))
        .catch(err => console.error('[PING] Ошибка пинга:', err.message));
}, 3 * 60 * 1000); // 3 минуты (3 минуты * 60 секунд * 1000 мс)

// ==========================================
// ФУНКЦИЯ ВЫСТАВЛЕНИЯ СЧЕТА (INVOICE)
// ==========================================
async function sendStarsInvoice(chatId, amountStars, userId) {
    try {
        await bot.sendInvoice(chatId, 
            'Пополнение баланса', 
            `Пополнение на ${amountStars} Stars (${amountStars * 2} ₽)`, 
            `pay_${userId}_${Date.now()}`, 
            '', 
            'XTR', 
            [{ label: 'Telegram Stars', amount: amountStars }] 
        );
    } catch (e) {
        bot.sendMessage(chatId, '❌ Ошибка создания счета: ' + e.message);
    }
}

// ==========================================
// ОБРАБОТКА ССЫЛОК (Deep Linking)
// ==========================================
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const payload = match[1]; 

    if (!payload) {
        return bot.sendMessage(chatId, 
            `Привет, ${msg.from.first_name}! 👋\n\nДобро пожаловать в *AffitDev*.\n\n🔹 /buy — Пополнить баланс\n🔹 /list — Ресурсы`, 
            { parse_mode: 'Markdown' }
        );
    }

    // Если это ссылка на пополнение (pay_100)
    if (payload.startsWith('pay_')) {
        const amount = parseInt(payload.split('_')[1]);
        if (!isNaN(amount)) {
            return await sendStarsInvoice(chatId, amount, msg.from.id);
        }
    }

    // Если это ссылка на скачивание файла
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        const fileData = db[payload];

        if (!fileData) {
            return bot.sendMessage(chatId, '❌ Файл не найден. Возможно, ссылка устарела.');
        }

        bot.sendMessage(chatId, '⏳ Отправляю ваш файл...');
        await bot.sendDocument(chatId, fileData.file_id, {
            caption: `📦 *${fileData.file_name}*\n\nСкачано с AffitDev.`, 
            parse_mode: 'Markdown'
        });
        
    } catch (error) {
        console.error('Ошибка:', error);
        bot.sendMessage(chatId, '❌ Произошла ошибка при отправке файла.');
    }
});

// ==========================================
// КОМАНДА /buy
// ==========================================
bot.onText(/\/buy/, (msg) => {
    const chatId = msg.chat.id;
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '50 ⭐ (100 ₽)', callback_data: 'buy_50' }, { text: '100 ⭐ (200 ₽)', callback_data: 'buy_100' }],
                [{ text: '250 ⭐ (500 ₽)', callback_data: 'buy_250' }, { text: '500 ⭐ (1000 ₽)', callback_data: 'buy_500' }]
            ]
        }
    };
    bot.sendMessage(chatId, '💎 *Пополнение баланса*\nВыберите пакет (1 Star = 2 ₽):', { parse_mode: 'Markdown', reply_markup: opts.reply_markup });
});

// Обработка кнопок покупки
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('buy_')) {
        const amount = parseInt(data.split('_')[1]);
        await sendStarsInvoice(chatId, amount, query.from.id);
    }
    bot.answerCallbackQuery(query.id);
});

// Подтверждение оплаты
bot.on('pre_checkout_query', async (query) => {
    await bot.answerPreCheckoutQuery(query.id, true);
});

// Успешная оплата
bot.on('successful_payment', async (msg) => {
    const payment = msg.successful_payment;
    const chatId = msg.chat.id;
    const starsAmount = payment.total_amount;
    const rubAmount = starsAmount * 2;

    // Уведомляем админа (тебя) о покупке
    bot.sendMessage(ADMIN_ID, `💰 Новое пополнение! Пользователь @${msg.from.username} купил ${starsAmount} Stars (${rubAmount} ₽).`);

    // Отвечаем пользователю
    bot.sendMessage(chatId, `✅ *Оплата успешна!*\nНачислено: ${starsAmount} Stars\nСумма: ${rubAmount} ₽\n\nСпасибо за поддержку проекта!`, { parse_mode: 'Markdown' });
});

// ==========================================
// АДМИН-ПАНЕЛЬ (ЗАГРУЗКА ФАЙЛОВ)
// ==========================================
bot.onText(/\/admin/, (msg) => {
    if (msg.from.id.toString() !== ADMIN_ID) return;
    bot.sendMessage(msg.chat.id, '👑 Отправьте файл, чтобы получить ссылку для сайта.');
});

bot.on('document', async (msg) => {
    if (msg.from.id.toString() !== ADMIN_ID) return;

    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name;
    
    try {
        const shortCode = crypto.randomBytes(3).toString('hex');
        const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        db[shortCode] = { file_id: fileId, file_name: fileName };
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

        const deepLink = `https://t.me/${BOT_USERNAME}?start=${shortCode}`;
        bot.sendMessage(msg.chat.id, `✅ Файл сохранен!\n\n📄 Имя: ${fileName}\n🔗 <b>Ссылка для сайта:</b>\n<code>${deepLink}</code>`, { parse_mode: 'HTML' });
    } catch (error) {
        bot.sendMessage(msg.chat.id, `❌ Ошибка: ${error.message}`);
    }
});

console.log('Бот запущен!');
