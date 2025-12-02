// index.js - основной файл для запуска на Render
require('dotenv').config();

console.log('🚀 Запуск приложения СУДУ...');

// Проверяем переменные окружения
console.log('📋 Проверка окружения:');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('- RENDER:', process.env.RENDER ? 'Да' : 'Нет');
console.log('- PORT:', process.env.PORT || 5000);

// Запускаем сервер
try {
    console.log('🌐 Запуск сервера...');
    require('./server.js');
    console.log('✅ Сервер запущен');
} catch (error) {
    console.error('❌ Ошибка запуска сервера:', error.message);
    process.exit(1);
}

// Запускаем бота с задержкой
setTimeout(() => {
    try {
        console.log('🤖 Запуск Telegram бота...');
        require('./telegram-bot.js');
        console.log('✅ Бот запущен');
    } catch (error) {
        console.error('⚠️  Ошибка запуска бота:', error.message);
        console.log('ℹ️  Сервер продолжает работать, но бот отключен');
    }
}, 3000);

// Обработка завершения
process.on('SIGTERM', () => {
    console.log('🛑 Получен SIGTERM, завершение работы...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Получен SIGINT, завершение работы...');
    process.exit(0);
});