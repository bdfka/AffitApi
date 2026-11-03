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

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();

// Файл для хранения связок "Короткий код -> ID файла"
const DB_FILE = path.join(__dirname, 'files.json');

// Создаем файл, если его нет
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({}));
}

// ==========================================
// ВЕБ-СЕРВЕР (Чтобы Render не засыпал)
// ==========================================
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 3000, () => console.log('Web server running'));

// ==========================================
// ОБРАБОТКА ССЫЛОК (Скачивание через бота)
// ==========================================
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const payload = match[1]; // Короткий код (например, "a1b2c3")

    if (!payload) {
        return bot.sendMessage(chatId, 
            `Привет, ${msg.from.first_name}! 👋\n\nДобро пожаловать в *AffitDev*.\n\n🔹 /account — Личный кабинет\n🔹 /list — Меню ресурсов`, 
            { parse_mode: 'Markdown' }
        );
    }

    if (payload) {
        try {
            const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            const fileData = db[payload];

            if (!fileData) {
                return bot.sendMessage(chatId, '❌ Файл не найден. Возможно, ссылка устарела.');
            }

            bot.sendMessage(chatId, '⏳ Отправляю ваш файл...');

            // Отправляем файл пользователю (копируем из хранилища Telegram)
            await bot.sendDocument(chatId, fileData.file_id, {
                caption: `📦 *${fileData.file_name}*\n\nСкачано с AffitDev.`, 
                parse_mode: 'Markdown'
            });
            
        } catch (error) {
            console.error('Ошибка:', error);
            bot.sendMessage(chatId, '❌ Произошла ошибка при отправке файла.');
        }
    }
});

// ==========================================
// ОБРАБОТКА ПЛАТЕЖЕЙ TELEGRAM STARS
// ==========================================

// Команда для пополнения (вызывается по ссылке из сайта)
bot.onText(/\/start pay_(\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const amountStars = parseInt(match[1]); // Количество звезд

    // Создаем счет (Invoice) на оплату
    try {
        await bot.sendInvoice(chatId, 
            'Пополнение баланса AffitDev', 
            `Пополнение на ${amountStars} Stars`, 
            `pay_${userId}_${Date.now()}`, // Payload (уникальный ID заказа)
            '', // provider_token (пустой для Stars)
            'XTR', // Валюта Telegram Stars
            [{ label: 'Stars', amount: amountStars }] // Цена в Stars
        );
    } catch (e) {
        bot.sendMessage(chatId, 'Ошибка создания счета: ' + e.message);
    }
});

// Подтверждение перед оплатой (обязательно, Telegram требует ответ за 10 секунд)
bot.on('pre_checkout_query', async (query) => {
    // Всегда подтверждаем (можно добавить проверки)
    await bot.answerPreCheckoutQuery(query.id, true);
});

// Успешная оплата
bot.on('successful_payment', async (msg) => {
    const payment = msg.successful_payment;
    const chatId = msg.chat.id;
    
    // Достаем ID пользователя из payload (pay_USERID_TIMESTAMP)
    const parts = payment.invoice_payload.split('_');
    const telegramUserId = parts[1]; 

    // Сумма Stars (в копейках, т.е. 1 Star = 1 единица)
    const starsAmount = payment.total_amount;
    
    // Курс: 1 Star = 2 рубля (можешь изменить)
    const rubAmount = starsAmount * 2;

    console.log(`[PAYMENT] User ${telegramUserId} paid ${starsAmount} Stars`);

    // Обновляем баланс в Supabase (используем service key, который у тебя уже есть в боте)
    try {
        // Получаем текущий баланс
        const { data: profile } = await supabase
            .from('profiles')
            .select('balance')
            .eq('telegram_id', telegramUserId.toString())
            .single();

        if (profile) {
            const newBalance = (parseFloat(profile.balance) || 0) + rubAmount;
            await supabase
                .from('profiles')
                .update({ balance: newBalance })
                .eq('telegram_id', telegramUserId.toString());

            bot.sendMessage(chatId, `✅ Баланс пополнен на ${rubAmount} ₽! (${starsAmount} Stars)`);
        } else {
            bot.sendMessage(chatId, '❌ Ошибка: ваш Telegram ID не привязан к аккаунту на сайте. Зайдите в профиль и укажите ID.');
        }
    } catch (e) {
        console.error('Ошибка обновления баланса:', e);
        bot.sendMessage(chatId, '❌ Ошибка зачисления. Напишите админу.');
    }
});

// ==========================================
// АДМИН-ПАНЕЛЬ (Загрузка файла и генерация ссылки)
// ==========================================
bot.onText(/\/admin/, (msg) => {
    if (msg.from.id.toString() !== ADMIN_ID) return;
    bot.sendMessage(msg.chat.id, '👑 Отправьте файл, чтобы получить ссылку на скачивание через бота.');
});

// ==========================================
// ПОПОЛНЕНИЕ БАЛАНСА (КОМАНДА /buy)
// ==========================================

// 1. Сама команда /buy
bot.onText(/\/buy/, (msg) => {
    const chatId = msg.chat.id;
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '50 ⭐ (100 ₽)', callback_data: 'buy_50' },
                    { text: '100 ⭐ (200 ₽)', callback_data: 'buy_100' }
                ],
                [
                    { text: '250 ⭐ (500 ₽)', callback_data: 'buy_250' },
                    { text: '500 ⭐ (1000 ₽)', callback_data: 'buy_500' }
                ],
                [
                    { text: 'Своя сумма', callback_data: 'buy_custom' }
                ]
            ]
        }
    };

    bot.sendMessage(chatId, 
        '💎 *Пополнение баланса AffitDev*\n\nВыберите пакет Telegram Stars.\nКурс: 1 Star = 2 ₽.\n\n👇 Нажмите на кнопку ниже:', 
        { parse_mode: 'Markdown', reply_markup: opts.reply_markup }
    );
});

// 2. Обработка нажатий на кнопки выбора суммы
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // Если пользователь нажал кнопку покупки (например, buy_100)
    if (data.startsWith('buy_')) {
        const amount = data.split('_')[1]; // Получаем число (100, 250 и т.д.)

        if (amount === 'custom') {
            // Если выбрал свою сумму
            bot.sendMessage(chatId, 'Введите желаемое количество Stars (числом от 10 до 1000):');
            
            // Ждем следующее текстовое сообщение от этого пользователя
            bot.once('message', async (msg) => {
                const customAmount = parseInt(msg.text);
                if (isNaN(customAmount) || customAmount < 10 || customAmount > 1000) {
                    return bot.sendMessage(chatId, '❌ Ошибка: введите число от 10 до 1000.');
                }
                // Выставляем счет на кастомную сумму
                await sendStarsInvoice(chatId, customAmount, msg.from.id);
            });
            return;
        }

        // Если выбрана готовая сумма
        await sendStarsInvoice(chatId, parseInt(amount), query.from.id);
    }

    bot.answerCallbackQuery(query.id);
});

// 3. Функция выставления счета (Invoice)
async function sendStarsInvoice(chatId, amountStars, userId) {
    try {
        await bot.sendInvoice(chatId, 
            'Пополнение баланса', 
            `Пополнение на ${amountStars} Stars (${amountStars * 2} ₽)`, 
            `pay_${userId}_${Date.now()}`, // Payload (содержит ID юзера)
            '', // provider_token (пустой для Stars)
            'XTR', // Валюта Telegram Stars
            [{ label: 'Telegram Stars', amount: amountStars }] 
        );
    } catch (e) {
        bot.sendMessage(chatId, '❌ Ошибка создания счета: ' + e.message);
    }
}

// 4. Подтверждение оплаты (ОБЯЗАТЕЛЬНО)
bot.on('pre_checkout_query', async (query) => {
    await bot.answerPreCheckoutQuery(query.id, true);
});

// 5. Успешная оплата (Зачисление баланса)
bot.on('successful_payment', async (msg) => {
    const payment = msg.successful_payment;
    const chatId = msg.chat.id;
    
    // Достаем ID пользователя из payload (pay_USERID_TIMESTAMP)
    const parts = payment.invoice_payload.split('_');
    const telegramUserId = parts[1]; 
    
    const starsAmount = payment.total_amount;
    const rubAmount = starsAmount * 2; // 1 Star = 2 рубля

    console.log(`[PAYMENT] User TG ${telegramUserId} paid ${starsAmount} Stars`);

    try {
        // 1. Ищем пользователя в БД по его Telegram ID
        const { data: profile, error: findError } = await supabase
            .from('profiles')
            .select('id, balance')
            .eq('telegram_id', telegramUserId.toString())
            .single();

        // Если пользователь не привязал TG ID к сайту
        if (!profile) {
            return bot.sendMessage(chatId, 
                `⚠️ Вы оплатили ${starsAmount} Stars, но ваш Telegram ID не привязан к аккаунту на сайте!\n\nЗайдите в личный кабинет на сайте и укажите ваш ID: ${telegramUserId}`, 
                { parse_mode: 'Markdown' }
            );
        }

        // 2. Зачисляем баланс
        const newBalance = (parseFloat(profile.balance) || 0) + rubAmount;
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ balance: newBalance })
            .eq('id', profile.id);

        if (updateError) throw updateError;

        // 3. Отправляем успешное сообщение
        bot.sendMessage(chatId, 
            `✅ *Оплата прошла успешно!*\n\n⭐ Начислено: ${starsAmount} Stars\n💵 Зачислено на баланс: ${rubAmount} ₽\n\n💰 Ваш текущий баланс: *${newBalance} ₽*`, 
            { parse_mode: 'Markdown' }
        );

    } catch (e) {
        console.error('Ошибка зачисления:', e);
        bot.sendMessage(chatId, '❌ Ошибка базы данных при зачислении. Свяжитесь с админом.');
    }
});

bot.on('document', async (msg) => {
    if (msg.from.id.toString() !== ADMIN_ID) return;

    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name;
    
    try {
        // Генерируем случайный 6-значный код
        const shortCode = crypto.randomBytes(3).toString('hex');

        // Сохраняем ID файла и его имя в локальный файл
        const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        db[shortCode] = {
            file_id: fileId,
            file_name: fileName
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

        // Формируем ссылку на бота (Deep Link)
        const deepLink = `https://t.me/${BOT_USERNAME}?start=${shortCode}`;

        bot.sendMessage(msg.chat.id, 
            `✅ Файл загружен!\n\n📄 Имя: ${fileName}\n\n🔗 <b>Ссылка для сайта:</b>\n<code>${deepLink}</code>\n\nВставьте эту ссылку в админ-панель сайта. Когда пользователь нажмет "Скачать", он перейдет в бота и получит файл.`, 
            { parse_mode: 'HTML' }
        );
    } catch (error) {
        bot.sendMessage(msg.chat.id, `❌ Ошибка: ${error.message}`);
    }
});

const SELF_URL = 'https://affitapi.onrender.com'; 

setInterval(() => {
    fetch(SELF_URL)
        .then(res => console.log(`[PING] Статус сервера: ${res.status}`))
        .catch(err => console.error('[PING] Ошибка пинга:', err.message));
}, 3 * 60 * 1000); // 3 минуты (3 * 60 секунд * 1000 мс)
