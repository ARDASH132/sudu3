require('dotenv').config();
const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const cors = require('cors');
app.use(cors({ origin: '*', credentials: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
// Отладочный middleware для логирования всех запросов
app.use((req, res, next) => {
    console.log('\n📨 Входящий запрос:');
    console.log('  Метод:', req.method);
    console.log('  URL:', req.url);
    console.log('  Path:', req.path);
    console.log('  Полный URL:', req.originalUrl);
    console.log('  Headers:', JSON.stringify(req.headers, null, 2).substring(0, 200) + '...');
    console.log('  Body:', JSON.stringify(req.body, null, 2).substring(0, 200) + '...');
    next();
});
app.use(express.static(path.join(__dirname)));
app.use(express.static('.'));

// ==================== ПОДКЛЮЧЕНИЕ К SQLite ====================
const Database = require('better-sqlite3');
const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'sudu_database.sqlite');
const db = new Database(dbPath);
console.log('✅ Подключение к SQLite установлено');

function initializeDatabase() {
    try {
        // Таблица пользователей
        db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                telegram_chat_id BIGINT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Таблица users готова');
        
        // Таблица для кодов восстановления
        db.exec(`
            CREATE TABLE IF NOT EXISTS telegram_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                code VARCHAR(6) NOT NULL,
                expires_at DATETIME NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Таблица telegram_codes готова');
        
        // Таблица для кодов привязки Telegram
        db.exec(`
            CREATE TABLE IF NOT EXISTS telegram_link_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                code VARCHAR(6) NOT NULL,
                expires_at DATETIME NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Таблица telegram_link_codes готова');
        
        // Проверяем наличие колонки telegram_chat_id
        try {
            db.exec("ALTER TABLE users ADD COLUMN telegram_chat_id BIGINT NULL");
            console.log('✅ Колонка telegram_chat_id добавлена');
        } catch (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('✅ Колонка telegram_chat_id уже существует');
            }
        }
    } catch (err) {
        console.error('❌ Ошибка инициализации базы данных:', err);
    }
}

initializeDatabase();

// ==================== ФУНКЦИИ TELEGRAM ====================

async function sendTelegramMessage(chatId, message) {
    try {
        const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        
        if (!TELEGRAM_TOKEN) {
            console.error('❌ TELEGRAM_BOT_TOKEN не найден в переменных окружения');
            throw new Error('TELEGRAM_BOT_TOKEN не настроен');
        }
        
        console.log(`📤 Отправка сообщения в Telegram через токен: ${TELEGRAM_TOKEN.substring(0, 10)}...`);
        console.log(`👤 Chat ID: ${chatId}`);
        
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            })
        });
        
        const result = await response.json();
        console.log('📤 Результат отправки в Telegram:', result.ok ? '✅ Успешно' : '❌ Ошибка');
        
        if (!result.ok) {
            console.error('❌ Ошибка Telegram API:', result.description);
            throw new Error(result.description || 'Unknown Telegram error');
        }
        
        return result;
    } catch (error) {
        console.error('❌ Ошибка отправки Telegram сообщения:', error.message);
        throw error;
    }
}
// ==================== API ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Сервер работает!',
        timestamp: new Date().toISOString()
    });
});

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Другие страницы
app.get('/main.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'main.html'));
});

app.get('/register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/forgot-password-telegram.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'forgot-password-telegram.html'));
});

app.get('/courses.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'courses.html'));
});

app.get('/leaderboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'leaderboard.html'));
});

// Получение всех пользователей
app.get('/api/users', (req, res) => {
    try {
        const rows = db.prepare("SELECT id, name, email, telegram_chat_id, created_at FROM users ORDER BY created_at DESC").all();
        res.json({ success: true, users: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== РЕГИСТРАЦИЯ И ПРИВЯЗКА TELEGRAM ====================

// Регистрация пользователя
app.post('/api/auth/register', (req, res) => {
    const { full_name, email, password } = req.body;
    
    if (!full_name || !email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Все поля обязательны для заполнения'
        });
    }
    
    try {
        const stmt = db.prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)");
        const result = stmt.run(full_name, email, password);
        
        console.log('✅ Пользователь зарегистрирован:', email, 'ID:', result.lastInsertRowid);
        
        res.json({
            success: true,
            message: 'Регистрация успешна! Теперь привяжите Telegram.',
            user_id: result.lastInsertRowid
        });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            res.status(400).json({
                success: false,
                error: 'Пользователь с таким email уже существует'
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Ошибка регистрации: ' + err.message
            });
        }
    }
});

// Запрос кода для привязки Telegram
app.post('/api/auth/request-telegram-link', (req, res) => {
    const { email } = req.body;
    
    console.log('🔗 Запрос кода привязки для:', email);
    
    try {
        const user = db.prepare("SELECT id, name FROM users WHERE email = ?").get(email);
        
        if (!user) {
            return res.status(400).json({
                success: false,
                error: 'Пользователь не найден. Сначала завершите регистрацию.'
            });
        }
        
        const existingLink = db.prepare("SELECT telegram_chat_id FROM users WHERE id = ? AND telegram_chat_id IS NOT NULL").get(user.id);
        
        if (existingLink) {
            return res.json({
                success: false,
                error: 'Telegram уже привязан к этому аккаунту'
            });
        }
        
        const linkCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        
        const stmt = db.prepare("INSERT INTO telegram_link_codes (user_id, code, expires_at) VALUES (?, ?, ?)");
        stmt.run(user.id, linkCode, expiresAt.toISOString());
        
        console.log('✅ Код привязки сгенерирован:', linkCode, 'для пользователя:', user.id);
        
        res.json({ 
            success: true, 
            linkCode: linkCode,
            instructions: `Отправьте боту команду: /link ${linkCode}`,
            message: 'Код для привязки Telegram получен'
        });
    } catch (err) {
        console.error('❌ Ошибка:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Подтверждение привязки Telegram
app.post('/api/auth/confirm-telegram-link', (req, res) => {
    const { linkCode, telegram_chat_id } = req.body;
    
    console.log('\n=== 🔗 ПОДТВЕРЖДЕНИЕ ПРИВЯЗКИ TELEGRAM ===');
    console.log('📋 Входные данные:');
    console.log('- Код:', linkCode);
    console.log('- Chat ID:', telegram_chat_id);
    console.log('- Время:', new Date().toISOString());
    
    if (!linkCode || !telegram_chat_id) {
        console.log('❌ Ошибка: отсутствуют обязательные параметры');
        return res.status(400).json({ 
            success: false, 
            error: 'Отсутствуют обязательные параметры' 
        });
    }
    
    try {
        // 1. Показать ВСЕ коды в базе (не только актуальные)
        const allCodes = db.prepare(`
            SELECT tlc.id, tlc.code, tlc.used, 
                   tlc.expires_at, tlc.user_id,
                   u.email as user_email
            FROM telegram_link_codes tlc 
            LEFT JOIN users u ON tlc.user_id = u.id 
            ORDER BY tlc.id DESC LIMIT 20
        `).all();
        
        console.log('\n📋 ВСЕ коды в БД (последние 20):');
        allCodes.forEach((code, i) => {
            console.log(`${i+1}. Код: "${code.code}", Использован: ${code.used}, Истекает: ${code.expires_at}, Email: ${code.user_email || 'нет'}`);
        });
        
        // 2. Поиск нашего кода
        console.log('\n🔍 Поиск кода "' + linkCode + '" в базе...');
        const codeRecord = db.prepare(`
            SELECT tlc.*, u.email, u.name
            FROM telegram_link_codes tlc 
            LEFT JOIN users u ON tlc.user_id = u.id 
            WHERE tlc.code = ?
        `).get(linkCode);
        
        if (!codeRecord) {
            console.log('❌ Код НЕ НАЙДЕН в базе данных!');
            console.log('💡 Возможные причины:');
            console.log('   1. Код введен неправильно');
            console.log('   2. База данных очищена/пересоздана');
            console.log('   3. Проблема с синхронизацией БД');
            return res.status(400).json({ 
                success: false, 
                error: 'Неверный или просроченный код привязки' 
            });
        }
        
        console.log('✅ Код найден! Данные:');
        console.log('- ID записи:', codeRecord.id);
        console.log('- Код:', codeRecord.code);
        console.log('- Использован:', codeRecord.used);
        console.log('- Истекает:', codeRecord.expires_at);
        console.log('- Пользователь ID:', codeRecord.user_id);
        console.log('- Email:', codeRecord.email);
        console.log('- Имя:', codeRecord.name);
        
        // 3. Проверка использования
        if (codeRecord.used) {
            console.log('❌ Код уже был использован ранее');
            return res.status(400).json({ 
                success: false, 
                error: 'Этот код уже использован. Запросите новый код.' 
            });
        }
        
        // 4. Проверка срока действия
        const expiresAt = new Date(codeRecord.expires_at);
        const now = new Date();
        const timeLeft = (expiresAt - now) / 60000; // в минутах
        
        console.log('\n⏰ Проверка срока действия:');
        console.log('- Время истечения:', expiresAt.toISOString());
        console.log('- Текущее время:', now.toISOString());
        console.log('- Осталось минут:', Math.round(timeLeft));
        
        if (expiresAt <= now) {
            console.log('❌ Код просрочен!');
            console.log('- Просрочен на', Math.abs(Math.round(timeLeft)), 'минут');
            return res.status(400).json({ 
                success: false, 
                error: 'Код просрочен. Запросите новый код.' 
            });
        }
        
        // 5. Проверка на дублирование привязки
        const existingUser = db.prepare("SELECT email, name FROM users WHERE telegram_chat_id = ?").get(telegram_chat_id);
        
        if (existingUser) {
            console.log('❌ Этот Telegram уже привязан к:', existingUser.email);
            return res.status(400).json({ 
                success: false, 
                error: `Этот Telegram уже привязан к аккаунту ${existingUser.email}` 
            });
        }
        
        // 6. ВСЁ ОК - выполняем привязку
        console.log('\n✅ Все проверки пройдены! Привязываю...');
        
        db.prepare("UPDATE users SET telegram_chat_id = ? WHERE id = ?").run(telegram_chat_id, codeRecord.user_id);
        db.prepare("UPDATE telegram_link_codes SET used = TRUE WHERE id = ?").run(codeRecord.id);
        
        console.log('🎉 Telegram успешно привязан!');
        console.log('- Пользователь:', codeRecord.email);
        console.log('- Chat ID:', telegram_chat_id);
        
        // 7. Отправка подтверждения
        console.log('\n📤 Отправляю приветственное сообщение...');
        sendTelegramMessage(telegram_chat_id,
            `✅ Telegram успешно привязан!\n\n` +
            `📧 Аккаунт: ${codeRecord.email}\n` +
            `👤 Имя: ${codeRecord.name}\n\n` +
            `Теперь вы можете восстанавливать пароль через сайт!`
        ).then(() => {
            console.log('✅ Сообщение отправлено');
        }).catch(err => {
            console.error('⚠️ Ошибка отправки:', err.message);
        });
        
        res.json({ 
            success: true, 
            message: 'Telegram успешно привязан',
            email: codeRecord.email,
            name: codeRecord.name
        });
        
    } catch (err) {
        console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', err);
        console.error(err.stack);
        res.status(500).json({ 
            success: false, 
            error: 'Внутренняя ошибка сервера' 
        });
    }
});

// Проверка привязки Telegram
app.post('/api/auth/check-telegram-link', (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.json({ 
            success: false,
            error: 'Email обязателен'
        });
    }
    
    try {
        const user = db.prepare("SELECT telegram_chat_id FROM users WHERE email = ?").get(email);
        
        if (!user) {
            return res.json({ 
                success: false,
                linked: false,
                error: 'Пользователь не найден'
            });
        }
        
        res.json({ 
            success: true,
            linked: !!user.telegram_chat_id,
            telegram_chat_id: user.telegram_chat_id 
        });
    } catch (err) {
        res.json({ 
            success: false,
            error: err.message
        });
    }
});

// ==================== ВОССТАНОВЛЕНИЕ ПАРОЛЯ ====================

// Вход
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    try {
        const user = db.prepare("SELECT id, name, email FROM users WHERE email = ? AND password = ?").get(email, password);
        
        if (user) {
            res.json({ 
                success: true, 
                message: 'Вход выполнен!',
                user: user
            });
        } else {
            res.status(401).json({
                success: false,
                error: 'Неверный email или пароль'
            });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Запрос кода восстановления через сайт
app.post('/api/auth/request-password-reset', (req, res) => {
    const { email } = req.body;
    
    console.log('🔐 Запрос восстановления для:', email);
    
    try {
        const user = db.prepare("SELECT id, name, telegram_chat_id FROM users WHERE email = ?").get(email);
        
        if (!user) {
            return res.json({ 
                success: false,
                error: 'Пользователь с таким email не найден'
            });
        }
        
        if (!user.telegram_chat_id) {
            return res.json({
                success: false,
                error: 'Telegram не привязан к аккаунту. Сначала привяжите Telegram в настройках профиля.'
            });
        }
        
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        
        console.log('✅ Код восстановления сгенерирован:', code, 'для пользователя:', email, 'chat_id:', user.telegram_chat_id);
        
        db.prepare("INSERT INTO telegram_codes (user_id, code, expires_at) VALUES (?, ?, ?)")
          .run(user.id, code, expiresAt.toISOString());
        
        sendTelegramMessage(user.telegram_chat_id, 
            `🔐 Код восстановления пароля СУДУ\n\n` +
            `📧 Для: ${email}\n` +
            `👤 Пользователь: ${user.name}\n` +
            `🔢 Код: ${code}\n` +
            `⏰ Действует 10 минут\n\n` +
            `Введите этот код на сайте для смены пароля`
        ).then(() => {
            console.log('✅ Код отправлен в Telegram');
            res.json({ 
                success: true, 
                message: 'Код отправлен в привязанный Telegram'
            });
        }).catch(error => {
            console.error('❌ Ошибка отправки в Telegram:', error);
            res.json({ 
                success: false,
                error: 'Ошибка отправки кода в Telegram: ' + error.message
            });
        });
    } catch (err) {
        console.error('❌ Ошибка:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Проверка кода и смена пароля
app.post('/api/auth/reset-password', (req, res) => {
    const { email, code, newPassword } = req.body;
    
    try {
        const codeRecord = db.prepare(`
            SELECT tc.* FROM telegram_codes tc
            JOIN users u ON tc.user_id = u.id
            WHERE u.email = ? AND tc.code = ? AND tc.used = FALSE AND tc.expires_at > datetime('now')
        `).get(email, code);
        
        if (!codeRecord) {
            return res.status(400).json({ 
                success: false, 
                error: 'Неверный или просроченный код' 
            });
        }
        
        db.prepare("UPDATE users SET password = ? WHERE email = ?").run(newPassword, email);
        db.prepare("UPDATE telegram_codes SET used = TRUE WHERE id = ?").run(codeRecord.id);
        
        res.json({ 
            success: true, 
            message: 'Пароль успешно изменен' 
        });
    } catch (err) {
        console.error('❌ Ошибка:', err);
        res.status(500).json({ error: 'Ошибка смены пароля' });
    }
});

// Запрос кода восстановления для бота
app.post('/api/auth/request-telegram-code', (req, res) => {
    const { email } = req.body;
    
    console.log('🔐 Бот запрашивает код для:', email);
    
    try {
        const user = db.prepare(
            "SELECT id, name, telegram_chat_id FROM users WHERE email = ? AND telegram_chat_id IS NOT NULL"
        ).get(email);
        
        if (!user) {
            return res.json({ 
                success: false, 
                error: 'Пользователь не найден или Telegram не привязан' 
            });
        }
        
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        
        db.prepare("INSERT INTO telegram_codes (user_id, code, expires_at) VALUES (?, ?, ?)")
          .run(user.id, code, expiresAt.toISOString());
        
        console.log('✅ Код восстановления сгенерирован:', code, 'для пользователя:', email);
        
        sendTelegramMessage(user.telegram_chat_id,
            `🔐 Код восстановления пароля:\n` +
            `📧 Для: ${email}\n` +
            `🔢 Код: ${code}\n` +
            `⏰ Действует 10 минут\n\n` +
            `Введите этот код на сайте для смены пароля`
        ).then(() => {
            res.json({ 
                success: true, 
                message: 'Код отправлен в Telegram',
                code: code
            });
        }).catch(error => {
            res.json({ 
                success: false,
                error: 'Ошибка отправки кода в Telegram'
            });
        });
    } catch (err) {
        console.error('❌ Ошибка:', err);
        res.status(500).json({ 
            success: false, 
            error: 'Ошибка сервера' 
        });
    }
});

// Тестовый endpoint для проверки отправки сообщений
app.get('/api/test-telegram', (req, res) => {
    const { chat_id, message } = req.query;
    
    if (!chat_id || !message) {
        return res.json({ error: 'Укажите chat_id и message параметры' });
    }
    
    sendTelegramMessage(chat_id, message)
        .then(result => {
            res.json({ success: true, result });
        })
        .catch(error => {
            res.json({ success: false, error: error.message });
        });
});


// ==================== ОТЛАДОЧНЫЕ ENDPOINT'Ы ====================

// Отладка кодов
app.get('/api/debug/codes', (req, res) => {
    try {
        console.log('\n=== 🔍 ОТЛАДКА КОДОВ ===');
        
        // 1. Проверим структуру таблицы
        const tableInfo = db.prepare("PRAGMA table_info(telegram_link_codes)").all();
        console.log('📋 Структура таблицы telegram_link_codes:');
        tableInfo.forEach(col => {
            console.log(`  - ${col.name} (${col.type})`);
        });
        
        // 2. Посчитаем записи
        const count = db.prepare("SELECT COUNT(*) as count FROM telegram_link_codes").get();
        console.log('📊 Всего записей в таблице:', count.count);
        
        // 3. Показать все записи
        const allCodes = db.prepare(`
            SELECT 
                tlc.id,
                tlc.code,
                tlc.used,
                tlc.expires_at,
                tlc.created_at,
                u.email as user_email,
                u.telegram_chat_id
            FROM telegram_link_codes tlc 
            LEFT JOIN users u ON tlc.user_id = u.id 
            ORDER BY tlc.id DESC
        `).all();
        
        console.log('\n📋 ВСЕ записи:');
        if (allCodes.length === 0) {
            console.log('   Таблица ПУСТА!');
        } else {
            allCodes.forEach(code => {
                console.log(`  ID: ${code.id}, Код: "${code.code}", Использован: ${code.used}, Email: ${code.user_email || 'нет'}`);
            });
        }
        
        // 4. Проверим пользователей
        const users = db.prepare("SELECT id, email, telegram_chat_id FROM users").all();
        console.log('\n👤 Пользователи:');
        users.forEach(user => {
            console.log(`  ID: ${user.id}, Email: ${user.email}, Chat ID: ${user.telegram_chat_id || 'не привязан'}`);
        });
        
        res.json({
            success: true,
            codes_count: count.count,
            codes: allCodes,
            users: users,
            table_structure: tableInfo
        });
        
    } catch (err) {
        console.error('❌ Ошибка отладки:', err);
        res.status(500).json({ error: err.message });
    }
});

// Тестовый endpoint для создания кода
app.post('/api/debug/create-code', (req, res) => {
    const { email, code } = req.body;
    
    try {
        console.log('\n=== 🧪 ТЕСТОВОЕ СОЗДАНИЕ КОДА ===');
        
        // Найти пользователя
        const user = db.prepare("SELECT id, email FROM users WHERE email = ?").get(email);
        
        if (!user) {
            console.log('❌ Пользователь не найден:', email);
            return res.json({ error: 'Пользователь не найден' });
        }
        
        console.log('👤 Пользователь найден:', user);
        
        // Создать код
        const testCode = code || Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 минут
        
        console.log('🔢 Создаю код:', testCode);
        console.log('⏰ Истекает:', expiresAt.toISOString());
        
        const stmt = db.prepare("INSERT INTO telegram_link_codes (user_id, code, expires_at) VALUES (?, ?, ?)");
        const result = stmt.run(user.id, testCode, expiresAt.toISOString());
        
        console.log('✅ Код создан! ID записи:', result.lastInsertRowid);
        
        // Проверить
        const saved = db.prepare("SELECT * FROM telegram_link_codes WHERE id = ?").get(result.lastInsertRowid);
        console.log('📋 Проверка сохранения:', saved);
        
        res.json({
            success: true,
            message: 'Тестовый код создан',
            code: testCode,
            expires_at: expiresAt,
            record_id: result.lastInsertRowid,
            data: saved
        });
        
    } catch (err) {
        console.error('❌ Ошибка:', err);
        res.json({ error: err.message });
    }
});

// Очистка кодов (только для отладки)
app.get('/api/debug/clear-codes', (req, res) => {
    try {
        console.log('\n=== 🧹 ОЧИСТКА КОДОВ ===');
        const result = db.prepare("DELETE FROM telegram_link_codes").run();
        console.log('✅ Удалено записей:', result.changes);
        res.json({ 
            success: true, 
            message: 'Коды очищены',
            deleted: result.changes 
        });
    } catch (err) {
        console.error('❌ Ошибка:', err);
        res.json({ error: err.message });
    }
});

// Проверка конкретного пользователя
app.get('/api/debug/user/:email', (req, res) => {
    const email = req.params.email;
    
    try {
        console.log('\n=== 👤 ПРОВЕРКА ПОЛЬЗОВАТЕЛЯ ===');
        console.log('Email:', email);
        
        const user = db.prepare(`
            SELECT u.*, 
                   (SELECT COUNT(*) FROM telegram_link_codes WHERE user_id = u.id) as codes_count,
                   (SELECT COUNT(*) FROM telegram_link_codes WHERE user_id = u.id AND used = 0) as active_codes
            FROM users u 
            WHERE u.email = ?
        `).get(email);
        
        if (!user) {
            console.log('❌ Пользователь не найден');
            return res.json({ error: 'Пользователь не найден' });
        }
        
        console.log('✅ Пользователь найден:', user);
        
        // Получить все коды этого пользователя
        const userCodes = db.prepare(`
            SELECT * FROM telegram_link_codes 
            WHERE user_id = ? 
            ORDER BY id DESC
        `).all(user.id);
        
        console.log('🔢 Коды пользователя:');
        userCodes.forEach(code => {
            console.log(`  Код: "${code.code}", Использован: ${code.used}, Истекает: ${code.expires_at}`);
        });
        
        res.json({
            success: true,
            user: user,
            codes: userCodes,
            codes_count: userCodes.length
        });
        
    } catch (err) {
        console.error('❌ Ошибка:', err);
        res.json({ error: err.message });
    }
});
// Обработка 404 для API
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// Обработка 404 для страниц
app.use('*', (req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'index.html'));
});
// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎯 Сервер запущен на порту ${PORT} (слушает все интерфейсы)`);
});
