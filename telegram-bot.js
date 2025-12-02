require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

// Никогда не храните токены в коде!
const token = process.env.TELEGRAM_BOT_TOKEN || '8522502658:AAGEDmPCiqsU8aZk5mCflXoE6HaJ06s4yoU';

// Проверка токена
if (!token || token === '8522502658:AAGEDmPCiqsU8aZk5mCflXoE6HaJ06s4yoU') {
    console.error('❌ ОШИБКА: TELEGRAM_BOT_TOKEN не установлен в переменных окружения!');
    console.log('ℹ️  Установите токен в Railway/Render Dashboard');
    process.exit(1);
}

const bot = new TelegramBot(token, { 
    polling: {
        interval: 300,
        autoStart: true,
        params: {
            timeout: 10,
            allowed_updates: ["message", "callback_query"]
        }
    }
});

// Определяем URL сервера в зависимости от платформы
let SERVER_URL;

if (process.env.RENDER) {
    // Render: локальный сервер
    SERVER_URL = `http://localhost:${process.env.PORT || 5000}`;
    console.log('🚀 Платформа: Render');
} else if (process.env.RAILWAY_STATIC_URL) {
    // Railway: локальный сервер (Railway проксирует запросы)
    SERVER_URL = `http://localhost:${process.env.PORT || 5000}`;
    console.log('🚄 Платформа: Railway');
} else {
    // Локальная разработка
    SERVER_URL = process.env.SERVER_URL || 'http://localhost:5000';
    console.log('💻 Режим: Локальная разработка');
}

console.log('🔗 Подключение к серверу:', SERVER_URL);
console.log('📡 Режим бота: Polling');

// Проверка соединения с сервером
async function checkServerConnection() {
    try {
        console.log('🔍 Проверка соединения с сервером...');
        const response = await fetch(`${SERVER_URL}/api/health`, {
            timeout: 5000
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Сервер доступен:', data.message);
            return true;
        } else {
            console.log('⚠️  Сервер ответил с ошибкой:', response.status);
            return false;
        }
    } catch (error) {
        console.error('❌ Не удалось подключиться к серверу:', error.message);
        console.log('ℹ️  Бот будет работать, но некоторые функции могут не работать');
        return false;
    }
}

// Проверяем соединение при запуске
checkServerConnection().then(isConnected => {
    if (!isConnected) {
        console.log('⚠️  Предупреждение: сервер недоступен');
        console.log('ℹ️  Убедитесь что сервер запущен на порту', process.env.PORT || 5000);
    }
});

// Команда /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    bot.sendMessage(chatId, 
        `🔐 Бот восстановления пароля СУДУ\n\n` +
        `Для привязки аккаунта введите:\n` +
        `/link КОД_ИЗ_САЙТА\n\n` +
        `Для восстановления пароля:\n` +
        `1. На сайте нажмите "Забыли пароль?"\n` +
        `2. Введите ваш email\n` +
        `3. Код автоматически придет сюда\n\n` +
        `Для помощи:\n` +
        `/help`
    );
});

// Команда /status - проверка статуса
bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        const isConnected = await checkServerConnection();
        
        bot.sendMessage(chatId,
            `📊 Статус системы:\n\n` +
            `🤖 Бот: ✅ Работает\n` +
            `🌐 Сервер: ${isConnected ? '✅ Доступен' : '❌ Недоступен'}\n` +
            `🔗 Платформа: ${process.env.RENDER ? 'Render' : process.env.RAILWAY_STATIC_URL ? 'Railway' : 'Локальная'}\n` +
            `⏰ Время: ${new Date().toLocaleTimeString()}\n\n` +
            `${isConnected ? '✅ Все системы работают нормально' : '⚠️  Проблемы с подключением к серверу'}`
        );
    } catch (error) {
        bot.sendMessage(chatId, '❌ Ошибка при проверке статуса');
    }
});

// Команда /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    
    bot.sendMessage(chatId,
        `📖 Доступные команды:\n\n` +
        `/start - начать работу с ботом\n` +
        `/link КОД - привязать аккаунт (код с сайта)\n` +
        `/status - проверить статус системы\n` +
        `/help - показать эту справку\n\n` +
        `💡 Для восстановления пароля:\n` +
        `1. На сайте нажмите "Забыли пароль?"\n` +
        `2. Введите ваш email\n` +
        `3. Код автоматически придет в этот чат\n` +
        `4. Введите код на сайте`
    );
});

// Привязка аккаунта по коду
bot.onText(/\/link (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const linkCode = match[1].trim();
    
    console.log(`🔗 Получена команда /link ${linkCode} от chatId: ${chatId}`);
    
    try {
        // Сначала проверяем доступность сервера
        const isConnected = await checkServerConnection();
        if (!isConnected) {
            throw new Error('Сервер недоступен');
        }
        
        const response = await fetch(`${SERVER_URL}/api/auth/confirm-telegram-link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                linkCode: linkCode,
                telegram_chat_id: chatId 
            }),
            timeout: 10000
        });
        
        console.log('📡 Статус ответа сервера:', response.status);
        
        const data = await response.json();
        console.log('📊 Данные ответа:', data);
        
        if (data.success) {
            bot.sendMessage(chatId, 
                `✅ Telegram успешно привязан к аккаунту:\n` +
                `📧 ${data.email}\n` +
                `👤 ${data.name}\n\n` +
                `Теперь вы можете восстанавливать пароль! Для этого:\n` +
                `1. На сайте нажмите "Забыли пароль?"\n` +
                `2. Введите ваш email: ${data.email}\n` +
                `3. Код придет сюда автоматически`
            );
        } else {
            bot.sendMessage(chatId, 
                `❌ Ошибка: ${data.error || 'Неизвестная ошибка'}\n\n` +
                `Убедитесь что:\n` +
                `• Вы завершили регистрацию на сайте\n` +
                `• Используете правильный код привязки\n` +
                `• Код не просрочен (действует 10 минут)\n` +
                `• Telegram еще не привязан к другому аккаунту`
            );
        }
    } catch (error) {
        console.error('❌ Ошибка привязки:', error);
        
        let errorMessage = '❌ Ошибка соединения с сервером\n\n';
        
        if (process.env.RENDER || process.env.RAILWAY_STATIC_URL) {
            errorMessage += `Платформа: ${process.env.RENDER ? 'Render' : 'Railway'}\n`;
            errorMessage += 'Проверьте:\n';
            errorMessage += '• Что сервер запущен\n';
            errorMessage += '• Логи в панели управления\n';
            errorMessage += '• Переменные окружения\n';
        } else {
            errorMessage += 'Убедитесь что:\n';
            errorMessage += '• Сервер запущен на localhost:5000\n';
            errorMessage += '• Бот и сервер на одном компьютере\n';
        }
        
        errorMessage += '\nПопробуйте команду /status для проверки';
        
        bot.sendMessage(chatId, errorMessage);
    }
});

// Обработка любых других сообщений
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Игнорируем команды
    if (text && !text.startsWith('/')) {
        bot.sendMessage(chatId,
            `🤖 Я бот для восстановления пароля СУДУ\n\n` +
            `Используйте команды:\n` +
            `/start - начать работу\n` +
            `/link КОД - привязать аккаунт\n` +
            `/status - проверить статус\n` +
            `/help - помощь\n\n` +
            `Для восстановления пароля используйте сайт!`
        );
    }
});

// Обработка ошибок
bot.on('polling_error', (error) => {
    console.error('❌ Ошибка polling Telegram:', error.code, error.message);
    
    // Автоматический перезапуск при некоторых ошибках
    if (error.code === 'EFATAL' || error.code === 'ETELEGRAM') {
        console.log('🔄 Попытка перезапуска бота через 10 секунд...');
        setTimeout(() => {
            console.log('🔄 Перезапуск бота...');
            bot.startPolling();
        }, 10000);
    }
});

bot.on('webhook_error', (error) => {
    console.error('❌ Ошибка webhook:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Получен SIGTERM, останавливаю бота...');
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Получен SIGINT, останавливаю бота...');
    bot.stopPolling();
    process.exit(0);
});

console.log('🤖 Telegram Bot успешно запущен!');
console.log('👤 Токен бота:', token.substring(0, 10) + '...'); // Показываем только начало токена

// Экспортируем бота для использования в index.js
module.exports = bot;