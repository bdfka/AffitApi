


require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// ==========================================
// НАСТРОЙКИ (ВСТАВЬ СВОИ ЗНАЧЕНИЯ)
// ==========================================
const BOT_TOKEN = '9061722239:AAHxzfgcKz6vJI8GvdttBDUrjdkE2NwrwKU';
const ADMIN_ID = '8640405491';

// Инициализация бота и веб-сервера
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();
app.use(express.json());

// ==========================================
// ВЕБ-СЕРВЕР ДЛЯ УВЕДОМЛЕНИЙ С САЙТА (И ДЛЯ RENDER)
// ==========================================
app.post('/api/notify-download', async (req, res) => {
    const { userId, resourceName } = req.body;
    
    if (!userId) return res.status(400).json({ error: 'No userId' });

    try {
        await bot.sendMessage(userId, 
            `✅ Вы успешно скачали ресурс:\n📦 *${resourceName}*\n\nСпасибо за использование AffitDev!`, 
            { parse_mode: 'Markdown' }
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка отправки уведомления:', error.message);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Этот маршрут нужен, чтобы Render не усыплял сервер
app.get('/', (req, res) => {
    res.send('Bot is running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});

// ==========================================
// ПРОВЕРКА НА АДМИНА
// ==========================================
function isAdmin(msg) {
    return msg.from && msg.from.id.toString() === ADMIN_ID;
}

// ==========================================
// ПОЛЬЗОВАТЕЛЬСКИЕ КОМАНДЫ
// ==========================================
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 
        `Привет, ${msg.from.first_name}! 👋\n\nДобро пожаловать в *AffitDev*.\n\n🔹 /account — Личный кабинет\n🔹 /list — Меню ресурсов\n🔹 /help — Помощь`, 
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/account/, (msg) => {
    bot.sendMessage(msg.chat.id, `👤 *Личный кабинет*\n\nПерейдите на сайт:\n🔗 bdfka.github.io/AffitDev/profile.html`, { parse_mode: 'Markdown' });
});

bot.onText(/\/list/, (msg) => {
    bot.sendMessage(msg.chat.id, `📦 *Меню ресурсов*\n\nВсе доступные ресурсы на сайте:\n🔗 bdfka.github.io/AffitDev/resources.html`, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, `❓ *Помощь*\n\nЕсли возникли проблемы, напишите админу: @MinecraftCoderBdfka`);
});

// ==========================================
// АДМИН-ПАНЕЛЬ
// ==========================================
bot.onText(/\/admin/, (msg) => {
    const chatId = msg.chat.id;

    if (!isAdmin(msg)) {
        return bot.sendMessage(chatId, '⛔ У вас нет доступа к этой команде.');
    }

    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📤 Получить ссылку на файл', callback_data: 'upload_resource' }],
                [{ text: '📊 Статистика', callback_data: 'stats' }]
            ]
        }
    };

    bot.sendMessage(chatId, '👑 *Админ-панель AffitDev*\nВыберите действие:', { parse_mode: 'Markdown', reply_markup: opts.reply_markup });
});

// Обработка кнопок админки
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (query.from.id.toString() !== ADMIN_ID) {
        return bot.answerCallbackQuery(query.id, { text: 'Доступ запрещен', show_alert: true });
    }

    if (data === 'upload_resource') {
        bot.sendMessage(chatId, '📎 Отправьте файл (мод, карту, сборку), и я сгенерирую прямую ссылку для сайта.');
        
        bot.once('document', async (msg) => {
            if (!isAdmin(msg)) return;

            const fileId = msg.document.file_id;
            const fileName = msg.document.file_name;
            
            try {
                console.log(`[LOG] Получен файл: ${fileName} (ID: ${fileId})`);
                
                // ЗАПРАШИВАЕМ ИНФОРМАЦИЮ О ФАЙЛЕ
                const fileInfo = await bot.getFile(fileId);
                
                // ВЫВОДИМ ИНФОРМАЦИЮ В КОНСОЛЬ (Для отладки на Render)
                console.log('[LOG] Ответ от Telegram (fileInfo):', fileInfo);

                // Генерируем ссылку
                const fileLink = await bot.getFileLink(fileId);
                console.log('[LOG] Сгенерированная ссылка:', fileLink);

                bot.sendMessage(chatId, 
                    `✅ *Файл получен!*\n\n📄 Имя: \`${fileName}\`\n🔗 Ссылка: ${fileLink}\n\nСкопируйте ссылку и вставьте её в админ-панель сайта.`, 
                    { parse_mode: 'HTML' }
                );
            } catch (error) {
                console.error('[ERROR] Ошибка при получении файла:', error);
                bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
            }
        });
    }

    if (data === 'stats') {
        bot.sendMessage(chatId, `📊 *Статистика*\n\nСервер работает исправно.`, { parse_mode: 'Markdown' });
    }

    bot.answerCallbackQuery(query.id);
});

// ==========================================
// ЗАЩИТА ОТ СПАМА ФАЙЛАМИ
// ==========================================
bot.on('document', (msg) => {
    if (!isAdmin(msg)) {
        bot.sendMessage(msg.chat.id, '⛔ Отправка файлов доступна только администратору.');
    }
});

console.log('Бот запущен. Ожидание сообщений...');
