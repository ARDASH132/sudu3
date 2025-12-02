// index.js
require('dotenv').config();

console.log('🚀 Запуск приложения СУДУ...');
console.log('📋 Проверка окружения:');
console.log('- Платформа:', process.platform);
console.log('- PORT:', process.env.PORT || 5000);
console.log('- RAILWAY:', process.env.RAILWAY_STATIC_URL ? 'Да' : 'Нет');
console.log('- RENDER:', process.env.RENDER ? 'Да' : 'Нет');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'development');

// Проверяем, запущен ли уже сервер (для Railway может быть несколько инстансов)
let serverStarted = false;

// Запускаем сервер
try {
    const server = require('./server.js');
    serverStarted = true;
    console.log('✅ Сервер запущен');
} catch (error) {
    console.error('❌ Ошибка запуска сервера:', error.message);
    // Не завершаем процесс сразу, может быть бот нужен
}

// Запускаем бота если есть токен
if (process.env.TELEGRAM_BOT_TOKEN) {
    setTimeout(() => {
        try {
            console.log('🤖 Запуск Telegram бота...');
            require('./telegram-bot.js');
            console.log('✅ Бот запущен');
        } catch (error) {
            console.error('⚠️  Ошибка запуска бота:', error.message);
            if (!serverStarted) {
                console.error('❌ Ни сервер, ни бот не запущены, завершаю работу');
                process.exit(1);
            }
        }
    }, 5000);
} else {
    console.log('⚠️  TELEGRAM_BOT_TOKEN не установлен, бот не будет запущен');
    if (!serverStarted) {
        console.error('❌ Сервер не запущен и бот тоже, завершаю работу');
        process.exit(1);
    }
}

// Graceful shutdown
['SIGTERM', 'SIGINT'].forEach(signal => {
    process.on(signal, () => {
        console.log(`🛑 Получен ${signal}, завершение работы...`);
        process.exit(0);
    });
});