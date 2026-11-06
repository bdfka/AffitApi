require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ==========================================
// НАСТРОЙКИ БОТА
// ==========================================
const BOT_TOKEN = '9061722239:AAHxzfgcKz6vJI8GvdttBDUrjdkE2NwrwKU';
const ADMIN_ID = '8640405491'; // Твой ID
const BOT_USERNAME = 'AffitDev_bot'; // Юзернейм бота (без @)
const SELF_URL = 'https://affitapi.onrender.com'; // Ссылка на Render

// ==========================================
// НАСТРОЙКИ SUPABASE (СЕКРЕТНЫЙ КЛЮЧ)
// ==========================================
const SUPABASE_URL = 'https://hzwsxszdslebzmzpamjs.supabase.co'; 
// Вставь ключ sb_secret_... или старый service_role
const SUPABASE_SECRET_KEY = 'sb_secret_jnUPAhVR2MPBSf29trlfXg_6GVvbrlF'; 

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
const app = express();
app.use(express.json());

// Файл для хранения файлов (ссылок на ресурсы)
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
}, 3 * 60 * 1000); // 3 минуты

// ==========================================
// ФУНКЦИЯ ВЫСТАВЛЕНИЯ СЧЕТА (INVOICE)
// ==========================================
async function sendStarsInvoice(chatId, amountStars, userId) {
    try {
        await bot.sendInvoice(chatId, 
            'Обмен звёзд на рубли', 
            `Вы отдаете ${amountStars} Telegram Stars. На баланс сайта будет зачислено ${amountStars * 2} рублей.`, 
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
    let payload = match[1] ? match[1].trim() : null;

    if (!payload) {
        return bot.sendMessage(chatId, 
            `Привет, ${msg.from.first_name}! 👋\n\nДобро пожаловать в *AffitDev*.\n\n🔹 /buy — Пополнить баланс на сайте\n🔹 /account — Личный кабинет\n🔹 /стата — Проверить статус сервера`, 
            { parse_mode: 'Markdown' }
        );
    }

    // 1. Если это оплата (pay_100)
    if (payload.includes('pay_')) {
        const amountStr = payload.replace('pay_', '').replace(/[^0-9]/g, ''); 
        const amount = parseInt(amountStr);
        
        if (!isNaN(amount) && amount > 0) {
            await sendStarsInvoice(chatId, amount, msg.from.id);
            return;
        }
    }

    // 2. Если это ссылка на файл
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
                [
                    { text: '⭐ 50 Stars → 100 ₽', callback_data: 'buy_50' }, 
                    { text: '⭐ 100 Stars → 200 ₽', callback_data: 'buy_100' }
                ],
                [
                    { text: '⭐ 250 Stars → 500 ₽', callback_data: 'buy_250' }, 
                    { text: '⭐ 500 Stars → 1000 ₽', callback_data: 'buy_500' }
                ]
            ]
        }
    };
    bot.sendMessage(chatId, '💎 *Обмен звёзд на рубли*\n\nВыберите, сколько Stars вы хотите отдать. Эти рубли зачислятся на ваш баланс на сайте (1 ⭐ = 2 ₽):', { parse_mode: 'Markdown', reply_markup: opts.reply_markup });
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

// ==========================================
// УСПЕШНАЯ ОПЛАТА (ЗАЧИСЛЕНИЕ БАЛАНСА В SUPABASE)
// ==========================================
bot.on('successful_payment', async (msg) => {
    const payment = msg.successful_payment;
    const chatId = msg.chat.id;
    const telegramUserId = msg.from.id; 
    const starsAmount = payment.total_amount;
    const rubAmount = starsAmount * 2; // Курс: 1 Star = 2 рубля

    try {
        // 1. Ищем пользователя на сайте по его Telegram ID
        const { data: profile, error: findError } = await supabase
            .from('profiles')
            .select('id, balance')
            .eq('telegram_id', telegramUserId.toString())
            .single();

        // Если пользователь не привязал TG ID в профиле на сайте
        if (!profile) {
            return bot.sendMessage(chatId, 
                `⚠️ *Внимание!* Оплата прошла успешно, но ваш Telegram ID (<code>${telegramUserId}</code>) не привязан к аккаунту на сайте!\n\nЗайдите на сайт в личный кабинет, вставьте этот ID в поле "Telegram" и сохраните. После этого напишите админу, чтобы он начислил вам ${rubAmount} ₽ вручную.`, 
                { parse_mode: 'HTML' }
            );
        }

        // 2. Начисляем рубли к текущему балансу
        const newBalance = (parseFloat(profile.balance) || 0) + rubAmount;
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ balance: newBalance })
            .eq('id', profile.id);

        if (updateError) throw updateError;

        // 3. Отвечаем пользователю
        bot.sendMessage(chatId, 
            `✅ *Обмен успешно завершен!*\n\n⭐ Вы отдали: *${starsAmount} Stars*\n💵 На баланс сайта зачислено: *${rubAmount} ₽*\n\n💰 Ваш текущий баланс на сайте: *${newBalance} ₽*\n\n_(Обновите страницу кошелька на сайте, чтобы увидеть изменения)_`, 
            { parse_mode: 'Markdown' }
        );

        // 4. Уведомляем тебя (админа)
        bot.sendMessage(ADMIN_ID, 
            `💰 *Новое пополнение!*\nПользователь: @${msg.from.username || 'без_юзернейма'} (TG ID: ${telegramUserId})\nОтдал: ${starsAmount} Stars\nНа сайт зачислено: ${rubAmount} ₽`, 
            { parse_mode: 'Markdown' }
        );

    } catch (e) {
        console.error('Ошибка зачисления:', e);
        bot.sendMessage(chatId, '❌ Ошибка базы данных при зачислении. Свяжитесь с админом.');
    }
});

// ==========================================
// СТАТУС MINECRAFT СЕРВЕРА (РАБОТАЕТ В ГРУППАХ)
// ==========================================
bot.onText(/\/стата(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const serverIp = match[1] ? match[1].trim() : null;

    if (!serverIp) {
        return bot.sendMessage(chatId, '❌ Укажите IP сервера. Пример: `/стата mc.viollamine.su`', { parse_mode: 'Markdown' });
    }

    // Отправляем сообщение "Загрузка..."
    const loadingMsg = await bot.sendMessage(chatId, '⏳ Проверяю статус сервера...');

    try {
        // Запрос к бесплатному API mcsrvstat.us
        const response = await fetch(`https://api.mcsrvstat.us/3/${serverIp}`, {
            headers: {
                'User-Agent': 'AffitDev-Bot/1.0 (https://t.me/AffitDev_bot)' // API требует User-Agent
            }
        });
        const data = await response.json();

        // Если сервер офлайн
        if (!data.online) {
            return bot.editMessageText(`❌ Сервер \`${serverIp}\` не найден или выключен.`, {
                chat_id: chatId,
                message_id: loadingMsg.message_id,
                parse_mode: 'Markdown'
            });
        }

        // Формируем красивый текст
        const playersOnline = data.players?.online || 0;
        const playersMax = data.players?.max || 0;
        const version = data.version || 'Неизвестно';
        const motd = data.motd?.clean ? data.motd.clean.join('\n') : 'Нет описания';
        const ping = data.debug?.ping ? `${data.debug.ping} мс` : 'Неизвестно';

        const statusText = `
<b>📊 Статус сервера:</b> <code>${serverIp}</code>
        
✅ <b>Статус:</b> Онлайн
👥 <b>Онлайн:</b> ${playersOnline} / ${playersMax}
⚡ <b>Пинг:</b> ${ping}
📦 <b>Версия:</b> ${version}

📝 <b>Описание:</b>
${motd}
        `;

        // Редактируем сообщение "Загрузка..." на результат
        await bot.editMessageText(statusText, {
            chat_id: chatId,
            message_id: loadingMsg.message_id,
            parse_mode: 'HTML'
        });

    } catch (error) {
        console.error('Ошибка при проверке сервера:', error);
        bot.editMessageText('❌ Ошибка при получении данных о сервере. Попробуйте позже.', {
            chat_id: chatId,
            message_id: loadingMsg.message_id
        });
    }
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
