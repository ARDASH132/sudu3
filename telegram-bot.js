// telegram-bot.js - ИСПРАВЛЕННАЯ ВЕРСИЯ
const path = require('path');
const fs = require('fs');

console.log('🚀 Запуск Telegram бота...');
console.log('📁 Текущая директория:', __dirname);

// Проверяем .env файл
const envPath = path.join(__dirname, '.env');
console.log('🔍 Проверка файла .env:', envPath);

if (fs.existsSync(envPath)) {
    console.log('✅ Файл .env найден');
    const envContent = fs.readFileSync(envPath, 'utf8');
    console.log('📄 Содержимое (первые 100 символов):', envContent.substring(0, 100) + '...');
} else {
    console.error('❌ Файл .env не найден!');
    console.log('📝 Создайте файл .env с содержанием:');
    console.log('TELEGRAM_BOT_TOKEN=ваш_токен');
    console.log('SERVER_URL=http://localhost:5000');
    process.exit(1);
}

// Загружаем переменные окружения
require('dotenv').config({ path: envPath });

const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

// Получаем токен
const token = process.env.TELEGRAM_BOT_TOKEN;

console.log('\n🔍 Проверка токена...');
console.log('- TELEGRAM_BOT_TOKEN:', token ? '✅ Найден' : '❌ Не найден');

// Базовая проверка
if (!token) {
    console.error('\n❌ ОШИБКА: TELEGRAM_BOT_TOKEN не найден в .env');
    console.log('ℹ️  Убедитесь, что в файле .env есть строка:');
    console.log('    TELEGRAM_BOT_TOKEN=ваш_токен');
    process.exit(1);
}

console.log('- Длина токена:', token.length, 'символов');
console.log('- Первые 15 символов:', token.substring(0, 15) + '...');

// Проверка формата
if (!token.includes(':')) {
    console.error('\n❌ ОШИБКА: Неправильный формат токена');
    console.log('ℹ️  Токен должен содержать двоеточие (:)');
    console.log('ℹ️  Пример: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz');
    process.exit(1);
}

const tokenParts = token.split(':');
if (tokenParts.length !== 2) {
    console.error('\n❌ ОШИБКА: Неправильный формат токена');
    console.log('ℹ️  Должно быть ровно 2 части разделенные двоеточием');
    process.exit(1);
}

console.log('✅ Формат токена правильный!');
console.log('🤖 Bot ID:', tokenParts[0]);

// Создаем бота
console.log('\n🚀 Создаем Telegram бота...');
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

// 🔴 ИСПРАВЛЕНО: Правильное определение SERVER_URL
let SERVER_URL;

// Проверяем, запущено ли на Render
if (process.env.RENDER) {
    SERVER_URL = `https://${process.env.RENDER_SERVICE_NAME}.onrender.com`;
    console.log('🚀 Платформа: Render');
    console.log('🌐 Внешний URL:', SERVER_URL);
} 
// Проверяем, запущено ли на Railway
else if (process.env.RAILWAY_STATIC_URL) {
    SERVER_URL = process.env.RAILWAY_STATIC_URL;
    console.log('🚄 Платформа: Railway');
    console.log('🌐 Внешний URL:', SERVER_URL);
} 
// Проверяем, есть ли в .env SERVER_URL
else if (process.env.SERVER_URL) {
    SERVER_URL = process.env.SERVER_URL;
    console.log('💻 Режим: Локальная разработка');
    console.log('🌐 URL из .env:', SERVER_URL);
} 
// По умолчанию используем localhost
else {
    SERVER_URL = 'http://localhost:5000';
    console.log('💻 Режим: Локальная разработка (по умолчанию)');
    console.log('🌐 URL:', SERVER_URL);
}

// Убедимся, что URL заканчивается на /
if (!SERVER_URL.endsWith('/')) {
    SERVER_URL = SERVER_URL + '/';
}

console.log('🔗 Подключение к серверу:', SERVER_URL);
console.log('📡 Режим бота: Polling');

// Проверка соединения с сервером
async function checkServerConnection() {
    try {
        console.log('🔍 Проверка соединения с сервером...');
        const url = `${SERVER_URL}api/health`;
        console.log('🌐 Запрос к:', url);
        
        const response = await fetch(url, { 
            timeout: 10000,
            headers: {
                'User-Agent': 'TelegramBot/1.0'
            }
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
        console.log('ℹ️  Убедитесь что сервер запущен на', SERVER_URL);
        console.log('ℹ️  Проверьте что сервер слушает все интерфейсы (0.0.0.0)');
        console.log('ℹ️  Проверьте настройки файрвола и порты');
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

// Команда /status
bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        const isConnected = await checkServerConnection();
        
        bot.sendMessage(chatId,
            `📊 Статус системы:\n\n` +
            `🤖 Бот: ✅ Работает\n` +
            `🌐 Сервер: ${isConnected ? '✅ Доступен' : '❌ Недоступен'}\n` +
            `🔗 URL: ${SERVER_URL}\n` +
            `⏰ Время: ${new Date().toLocaleTimeString()}\n\n` +
            `${isConnected ? '✅ Все системы работают' : '⚠️  Проблемы с подключением к серверу'}`
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
        `/link КОД - привязать аккаунт\n` +
        `/status - проверить статус системы\n` +
        `/help - показать эту справку\n\n` +
        `💡 Для восстановления пароля:\n` +
        `1. На сайте нажмите "Забыли пароль?"\n` +
        `2. Введите ваш email\n` +
        `3. Код автоматически придет в этот чат`
    );
});

// Привязка аккаунта по коду
// Привязка аккаунта по коду
bot.onText(/\/link (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const linkCode = match[1].trim();
    
    console.log(`🔗 Получена команда /link ${linkCode} от chatId: ${chatId}`);
    
    try {
        const url = `${SERVER_URL}api/auth/confirm-telegram-link`;
        console.log('🌐 Отправка запроса на:', url);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'TelegramBot/1.0'
            },
            body: JSON.stringify({ 
                linkCode: linkCode,
                telegram_chat_id: chatId 
            }),
            timeout: 15000
        });
        
        console.log('📡 Статус ответа:', response.status);
        
        // 🔴 ИСПРАВЬТЕ ЭТУ ЧАСТЬ:
        if (!response.ok) {
            // Пытаемся прочитать JSON с ошибкой
            let errorMessage = `HTTP ${response.status}`;
            
            try {
                const errorData = await response.json();
                if (errorData.error) {
                    errorMessage = errorData.error;
                } else if (errorData.message) {
                    errorMessage = errorData.message;
                }
            } catch (e) {
                // Если не удалось прочитать JSON, читаем как текст
                const errorText = await response.text();
                errorMessage = errorText || `HTTP ${response.status}`;
            }
            
            // Отправляем понятное сообщение пользователю
            bot.sendMessage(chatId, `❌ ${errorMessage}`);
            return; // 🔴 ВАЖНО: завершаем выполнение
        }
        
        const data = await response.json();
        
        if (data.success) {
            let message = `✅ Telegram успешно привязан!\n📧 ${data.email}\n👤 ${data.name}`;
            
            // Если Telegram уже был привязан
            if (data.already_linked) {
                message = `ℹ️ ${data.message}\n📧 ${data.email}\n👤 ${data.name}`;
            }
            
            bot.sendMessage(chatId, message);
        } else {
            bot.sendMessage(chatId, `❌ Ошибка: ${data.error || 'Неизвестная ошибка'}`);
        }
    } catch (error) {
        console.error('❌ Ошибка привязки:', error);
        
        // Проверяем тип ошибки
        let errorMsg = error.message;
        if (error.name === 'FetchError' && error.code === 'ECONNREFUSED') {
            errorMsg = 'Сервер недоступен. Проверьте, запущен ли сервер.';
        } else if (error.name === 'TimeoutError') {
            errorMsg = 'Таймаут соединения с сервером.';
        }
        
        bot.sendMessage(chatId, `❌ Ошибка соединения: ${errorMsg}`);
    }
});
// Обработка других сообщений
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (text && !text.startsWith('/')) {
        bot.sendMessage(chatId, 'Используйте /help для списка команд');
    }
});

// Обработка ошибок
bot.on('polling_error', (error) => {
    console.error('❌ Ошибка polling Telegram:', error.code, error.message);
});

bot.on('webhook_error', (error) => {
    console.error('❌ Ошибка webhook:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM, останавливаю бота...');
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT, останавливаю бота...');
    bot.stopPolling();
    process.exit(0);
});

console.log('\n✅ Telegram Bot успешно запущен!');
console.log('📱 Перейдите в Telegram и отправьте /start вашему боту');

module.exports = bot;
