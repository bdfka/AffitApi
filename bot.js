require('dotenv').config();
const express = require('express');

// ==========================================
// 1. НАСТРОЙКИ (ВСТАВЬ СВОИ ЗНАЧЕНИЯ)
// ==========================================
const BOT_TOKEN = '9061722239:AAHxzfgcKz6vJI8GvdttBDUrjdkE2NwrwKU';
const ADMIN_ID = '8640405491';

// Сайт (нужен для ссылок в сообщениях)
const SITE_URL = 'https://bdfka.github.io/AffitDev'; // Замени на свой реальный адрес

// ==========================================
// 2. ИНИЦИАЛИЗАЦИЯ ВЕБ-СЕРВЕРА (ДЛЯ RENDER)
// ==========================================
const app = express();
app.use(express.json());

// Эндпоинт для уведомлений с сайта
app.post('/api/notify-download', async (req, res) => {
    const { userId, resourceName } = req.body;
    if (!userId) return res.status(400).json({ error: 'No userId' });

    try {
        if (global.botInstance) {
            await global.botInstance.sendMessage(userId, 
                `✅ Вы успешно скачали ресурс:\n📦 *${resourceName}*\n\nСпасибо за использование AffitDev!`, 
                { parse_mode: 'Markdown' }
            );
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка отправки уведомления:', error.message);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Запускаем сервер (Render требует, чтобы бот слушал порт)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});

// ==========================================
// 3. ЗАПУСК БОТА (С ПОДДЕРЖКОЙ НОВЫХ ВЕРСИЙ)
// ==========================================
(async () => {
    try {
        // Импортируем библиотеку по-новому (ESM), чтобы избежать ошибки "not a constructor"
        const { default: TelegramBot } = await import('node-telegram-bot-api');
        
        const bot = new TelegramBot(BOT_TOKEN, { polling: true });
        global.botInstance = bot; // Сохраняем в глобальную переменную для веб-сервера

        console.log('Бот успешно запущен...');

        // Функция проверки на админа
        const isAdmin = (msg) => msg.from && msg.from.id.toString() === ADMIN_ID;

        // ==========================================
        // 4. ПОЛЬЗОВАТЕЛЬСКИЕ КОМАНДЫ
        // ==========================================
        bot.onText(/\/start/, (msg) => {
            bot.sendMessage(msg.chat.id, 
                `Привет, ${msg.from.first_name}! 👋\n\nДобро пожаловать в *AffitDev* — место, где рождается проект.\n\n🔹 /account — Личный кабинет\n🔹 /list — Меню ресурсов\n🔹 /help — Помощь`, 
                { parse_mode: 'Markdown' }
            );
        });

        bot.onText(/\/account/, (msg) => {
            bot.sendMessage(msg.chat.id, 
                `👤 *Личный кабинет*\n\nПерейдите на сайт, чтобы сменить ник или проверить баланс:\n🔗 ${SITE_URL}/profile.html`, 
                { parse_mode: 'Markdown' }
            );
        });

        bot.onText(/\/list/, (msg) => {
            bot.sendMessage(msg.chat.id, 
                `📦 *Меню ресурсов*\n\nВсе доступные моды, плагины и сборки вы можете найти на нашем сайте:\n🔗 ${SITE_URL}/resources.html`, 
                { parse_mode: 'Markdown' }
            );
        });

        bot.onText(/\/help/, (msg) => {
            bot.sendMessage(msg.chat.id, 
                `❓ *Помощь по боту*\n\nЕсли у вас возникли проблемы, напишите администратору.\n\nДоступные команды:\n/start - Перезапуск\n/account - Личный кабинет\n/list - Ресурсы`, 
                { parse_mode: 'Markdown' }
            );
        });

        // ==========================================
        // 5. АДМИН-ПАНЕЛЬ (ТОЛЬКО ДЛЯ ADMIN_ID)
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
                        const fileLink = await bot.getFileLink(fileId);
                        bot.sendMessage(chatId, 
                            `✅ *Файл получен!*\n\n📄 Имя: \`${fileName}\`\n🔗 Ссылка: ${fileLink}\n\nСкопируйте ссылку и вставьте её в админ-панель сайта.`, 
                            { parse_mode: 'Markdown' }
                        );
                    } catch (error) {
                        bot.sendMessage(chatId, '❌ Ошибка при получении ссылки: ' + error.message);
                    }
                });
            }

            if (data === 'stats') {
                bot.sendMessage(chatId, `📊 *Статистика*\n\nСервер работает исправно.`, { parse_mode: 'Markdown' });
            }

            bot.answerCallbackQuery(query.id);
        });

        // Защита от спама файлами для обычных юзеров
bot.on('document', async (msg) => {
    if (!isAdmin(msg)) return;

    try {
        // 1. Сначала получаем информацию о файле (file_path)
        const fileInfo = await bot.getFile(msg.document.file_id);
        
        // 2. Теперь получаем прямую ссылку, используя file_path из ответа
        const fileLink = await bot.getFileLink(fileInfo.file_path);
        
        // 3. Отправляем ссылку в чат
        await bot.sendMessage(msg.chat.id, 
            `✅ *Файл получен!*\n\n📄 Имя: \`${msg.document.file_name}\`\n🔗 Ссылка: ${fileLink}\n\nСкопируйте ссылку и вставьте её в админ-панель сайта.`, 
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        // Если произошла ошибка, бот сообщит о ней
        bot.sendMessage(msg.chat.id, `❌ Ошибка: ${error.message}`);
    }
});

    } catch (error) {
        console.error('Критическая ошибка при запуске бота:', error);
    }
})();
