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
app.use(express.static(path.join(__dirname)));
app.use(express.static('.'));

// ==================== ПОДКЛЮЧЕНИЕ К SQLite ====================
const Database = require('better-sqlite3');
const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'sudu_database.sqlite');
const db = new Database(dbPath);
console.log('✅ Подключение к SQLite установлено');

function initializeDatabase() {
    try {
        // Таблица для временных регистраций
        db.exec(`
            CREATE TABLE IF NOT EXISTS pending_registrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                link_code VARCHAR(6) NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Таблица pending_registrations готова');
        
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
        const TELEGRAM_TOKEN = '8522502658:AAGEDmPCiqsU8aZk5mCflXoE6HaJ06s4yoU';
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
        console.log('📤 Результат отправки в Telegram:', result);
        
        if (!result.ok) {
            throw new Error(result.description || 'Unknown Telegram error');
        }
        
        return result;
    } catch (error) {
        console.error('❌ Ошибка отправки Telegram сообщения:', error);
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

// Функция очистки просроченных регистраций
function cleanupPendingRegistrations() {
    try {
        const result = db.prepare(`
            DELETE FROM pending_registrations 
            WHERE expires_at <= datetime('now')
        `).run();
        
        if (result.changes > 0) {
            console.log(`🧹 Очищено ${result.changes} просроченных регистраций`);
        }
    } catch (err) {
        console.error('❌ Ошибка очистки временных регистраций:', err);
    }
}

// Запускаем очистку каждые 5 минут
setInterval(cleanupPendingRegistrations, 5 * 60 * 1000);
// И при старте
cleanupPendingRegistrations();

// Регистрация пользователя (временная, без добавления в users)
app.post('/api/auth/register', (req, res) => {
    const { full_name, email, password } = req.body;
    
    if (!full_name || !email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Все поля обязательны для заполнения'
        });
    }
    
    try {
        // Проверяем, нет ли уже такого email в основной базе
        const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Пользователь с таким email уже существует'
            });
        }
        
        // Проверяем, нет ли в ожидающих регистрации
        const existingPending = db.prepare("SELECT id FROM pending_registrations WHERE email = ?").get(email);
        if (existingPending) {
            // Удаляем старую запись
            db.prepare("DELETE FROM pending_registrations WHERE email = ?").run(email);
        }
        
        // Генерируем код для привязки Telegram
        const linkCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 минут
        
        // Сохраняем во временную таблицу
        const stmt = db.prepare(`
            INSERT INTO pending_registrations (name, email, password, link_code, expires_at) 
            VALUES (?, ?, ?, ?, ?)
        `);
        const result = stmt.run(full_name, email, password, linkCode, expiresAt.toISOString());
        
        console.log('✅ Временная регистрация:', email, 'Код:', linkCode);
        
        res.json({
            success: true,
            message: 'Регистрация успешна! Теперь привяжите Telegram.',
            linkCode: linkCode,
            instructions: `Отправьте боту команду: /link ${linkCode}`,
            expiresIn: '15 минут',
            nextStep: 'telegram_link'
        });
    } catch (err) {
        console.error('❌ Ошибка регистрации:', err);
        res.status(400).json({
            success: false,
            error: 'Ошибка регистрации: ' + err.message
        });
    }
});

// Запрос кода для привязки Telegram (для существующих пользователей ИЛИ ожидающих регистрации)
app.post('/api/auth/request-telegram-link', (req, res) => {
    const { email } = req.body;
    
    console.log('🔗 Запрос кода привязки для пользователя:', email);
    
    try {
        // Сначала проверяем в основной таблице users (существующие пользователи)
        const existingUser = db.prepare("SELECT id, name FROM users WHERE email = ?").get(email);
        
        if (existingUser) {
            // Проверяем, не привязан ли уже Telegram
            const existingLink = db.prepare("SELECT telegram_chat_id FROM users WHERE id = ? AND telegram_chat_id IS NOT NULL").get(existingUser.id);
            
            if (existingLink) {
                return res.json({
                    success: false,
                    error: 'Telegram уже привязан к этому аккаунту'
                });
            }
            
            // Генерируем код привязки для существующего пользователя
            const linkCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 минут
            
            // Сохраняем код в таблицу telegram_link_codes
            const stmt = db.prepare("INSERT INTO telegram_link_codes (user_id, code, expires_at) VALUES (?, ?, ?)");
            stmt.run(existingUser.id, linkCode, expiresAt.toISOString());
            
            console.log('✅ Код привязки для существующего пользователя:', linkCode);
            
            return res.json({ 
                success: true, 
                linkCode: linkCode,
                instructions: `Отправьте боту команду: /link ${linkCode}`,
                message: 'Код для привязки Telegram получен',
                userType: 'existing'
            });
        }
        
        // Если не найден в users, проверяем в pending_registrations
        const pendingUser = db.prepare(`
            SELECT id, name FROM pending_registrations 
            WHERE email = ? AND expires_at > datetime('now')
        `).get(email);
        
        if (pendingUser) {
            // Пользователь уже зарегистрирован, но не привязал Telegram
            // В этом случае код уже был сгенерирован при регистрации и находится в pending_registrations
            const pendingRecord = db.prepare(`
                SELECT link_code FROM pending_registrations 
                WHERE email = ? AND expires_at > datetime('now')
            `).get(email);
            
            if (pendingRecord) {
                return res.json({
                    success: true,
                    linkCode: pendingRecord.link_code,
                    instructions: `Отправьте боту команду: /link ${pendingRecord.link_code}`,
                    message: 'Используйте код, полученный при регистрации',
                    userType: 'pending',
                    expiresIn: '15 минут с момента регистрации'
                });
            }
        }
        
        // Если не найден нигде
        return res.status(400).json({
            success: false,
            error: 'Пользователь не найден. Сначала зарегистрируйтесь.'
        });
        
    } catch (err) {
        console.error('❌ Ошибка:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Функция обработки новой регистрации
function processNewUserRegistration(pendingUser, telegram_chat_id, res) {
    try {
        // Проверяем, не занят ли telegram_chat_id
        const existingUser = db.prepare(`
            SELECT email FROM users 
            WHERE telegram_chat_id = ?
        `).get(telegram_chat_id);
        
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                error: `Этот Telegram уже привязан к аккаунту: ${existingUser.email}`
            });
        }
        
        // Проверяем, нет ли уже такого email в основной базе
        const emailExists = db.prepare("SELECT id FROM users WHERE email = ?").get(pendingUser.email);
        if (emailExists) {
            // Удаляем временную запись
            db.prepare("DELETE FROM pending_registrations WHERE id = ?").run(pendingUser.id);
            return res.status(400).json({ 
                success: false, 
                error: 'Пользователь с таким email уже существует'
            });
        }
        
        // Добавляем пользователя в основную базу с привязанным Telegram
        const stmt = db.prepare(`
            INSERT INTO users (name, email, password, telegram_chat_id) 
            VALUES (?, ?, ?, ?)
        `);
        const result = stmt.run(
            pendingUser.name, 
            pendingUser.email, 
            pendingUser.password, 
            telegram_chat_id
        );
        
        // Удаляем временную запись
        db.prepare("DELETE FROM pending_registrations WHERE id = ?").run(pendingUser.id);
        
        console.log('✅ Новый пользователь зарегистрирован и привязан:', pendingUser.email);
        
        // Отправляем приветственное сообщение
        sendTelegramMessage(telegram_chat_id,
            `✅ Регистрация завершена!\n\n` +
            `📧 Ваш аккаунт: ${pendingUser.email}\n` +
            `👤 Имя: ${pendingUser.name}\n\n` +
            `Теперь вы можете:\n` +
            `1. Войти на сайт с вашими данными\n` +
            `2. Восстанавливать пароль через этого бота\n\n` +
            `Для восстановления пароля:\n` +
            `1. Нажмите "Забыли пароль?" на сайте\n` +
            `2. Введите email: ${pendingUser.email}\n` +
            `3. Код придет сюда автоматически`
        ).catch(err => {
            console.error('Ошибка отправки приветственного сообщения:', err);
        });
        
        res.json({ 
            success: true, 
            message: 'Регистрация и привязка Telegram завершены!',
            email: pendingUser.email,
            name: pendingUser.name,
            isNewUser: true
        });
        
    } catch (err) {
        console.error('❌ Ошибка регистрации нового пользователя:', err);
        throw err;
    }
}

// Функция обработки привязки существующего пользователя
function processExistingUserLink(codeRecord, telegram_chat_id, res) {
    try {
        // Проверяем, не привязан ли уже этот telegram_chat_id к ДРУГОМУ пользователю
        const existingUser = db.prepare(`
            SELECT email, name FROM users 
            WHERE telegram_chat_id = ? AND id != ?
        `).get(telegram_chat_id, codeRecord.user_id);
        
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                error: `Этот Telegram уже привязан к аккаунту: ${existingUser.email}`
            });
        }
        
        // Проверяем, не привязан ли у текущего пользователя уже другой Telegram
        if (codeRecord.current_chat_id && codeRecord.current_chat_id.toString() !== telegram_chat_id.toString()) {
            return res.status(400).json({ 
                success: false, 
                error: 'У этого аккаунта уже привязан другой Telegram. Сначала отвяжите его в настройках.'
            });
        }
        
        // Если у пользователя уже привязан этот chat_id
        if (codeRecord.current_chat_id && codeRecord.current_chat_id.toString() === telegram_chat_id.toString()) {
            db.prepare("UPDATE telegram_link_codes SET used = TRUE WHERE id = ?").run(codeRecord.id);
            
            console.log('✅ Telegram уже привязан к пользователю:', codeRecord.email);
            
            return res.json({ 
                success: false, 
                error: 'Telegram уже привязан к этому аккаунту',
                email: codeRecord.email,
                name: codeRecord.name
            });
        }
        
        // Привязываем новый chat_id
        db.prepare("UPDATE users SET telegram_chat_id = ? WHERE id = ?").run(telegram_chat_id, codeRecord.user_id);
        db.prepare("UPDATE telegram_link_codes SET used = TRUE WHERE id = ?").run(codeRecord.id);
        
        console.log('✅ Telegram привязан к существующему пользователю:', codeRecord.email);
        
        sendTelegramMessage(telegram_chat_id,
            `✅ Telegram успешно привязан!\n\n` +
            `📧 Аккаунт: ${codeRecord.email}\n` +
            `👤 Имя: ${codeRecord.name}\n\n` +
            `Теперь вы можете восстанавливать пароль через сайт!\n\n` +
            `Для восстановления:\n` +
            `1. Нажмите "Забыли пароль?" на сайте\n` +
            `2. Введите email: ${codeRecord.email}\n` +
            `3. Код придет сюда автоматически`
        ).catch(err => {
            console.error('Ошибка отправки приветственного сообщения:', err);
        });
        
        res.json({ 
            success: true, 
            message: 'Telegram успешно привязан',
            email: codeRecord.email,
            name: codeRecord.name,
            isNewUser: false
        });
    } catch (err) {
        console.error('❌ Ошибка привязки существующего пользователя:', err);
        throw err;
    }
}

// Подтверждение привязки Telegram
app.post('/api/auth/confirm-telegram-link', (req, res) => {
    const { linkCode, telegram_chat_id } = req.body;
    
    console.log('🔗 Подтверждение привязки, код:', linkCode, 'chat_id:', telegram_chat_id);
    
    if (!linkCode || !telegram_chat_id) {
        return res.status(400).json({ 
            success: false, 
            error: 'Отсутствуют обязательные параметры' 
        });
    }
    
    try {
        // Сначала проверяем в таблице pending_registrations (новые пользователи)
        const pendingUser = db.prepare(`
            SELECT * FROM pending_registrations 
            WHERE link_code = ? AND expires_at > datetime('now')
        `).get(linkCode);
        
        if (pendingUser) {
            // Это новый пользователь из временной регистрации
            return processNewUserRegistration(pendingUser, telegram_chat_id, res);
        }
        
        // Проверяем в таблице telegram_link_codes (существующие пользователи)
        const codeRecord = db.prepare(`
            SELECT tlc.*, u.email, u.name, u.telegram_chat_id as current_chat_id
            FROM telegram_link_codes tlc 
            JOIN users u ON tlc.user_id = u.id 
            WHERE tlc.code = ? AND tlc.used = FALSE AND tlc.expires_at > datetime('now')
        `).get(linkCode);
        
        if (!codeRecord) {
            return res.status(400).json({ 
                success: false, 
                error: 'Неверный или просроченный код привязки' 
            });
        }
        
        // Обрабатываем привязку для существующего пользователя
        return processExistingUserLink(codeRecord, telegram_chat_id, res);
        
    } catch (err) {
        console.error('❌ Ошибка:', err);
        res.status(500).json({ 
            success: false, 
            error: 'Ошибка сервера' 
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
        // Сначала проверяем в основной таблице
        const user = db.prepare("SELECT telegram_chat_id FROM users WHERE email = ?").get(email);
        
        if (user) {
            return res.json({ 
                success: true,
                linked: !!user.telegram_chat_id,
                telegram_chat_id: user.telegram_chat_id,
                userExists: true
            });
        }
        
        // Если не найден в users, проверяем в pending_registrations
        const pendingUser = db.prepare(`
            SELECT link_code FROM pending_registrations 
            WHERE email = ? AND expires_at > datetime('now')
        `).get(email);
        
        if (pendingUser) {
            return res.json({ 
                success: true,
                linked: false,
                userExists: true,
                isPending: true,
                hasLinkCode: true
            });
        }
        
        // Если не найден нигде
        return res.json({ 
            success: false,
            linked: false,
            error: 'Пользователь не найден'
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
// Вход
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    console.log('🔐 Попытка входа:', email);
    
    try {
        // Определяем, это ли Глеб
        const isGleb = email === 'ShGleb@mail.ru' && password === 'glebb202';
        
        if (isGleb) {
            console.log('✅ Глеб авторизован');
            
            return res.json({ 
                success: true, 
                message: 'Вход выполнен!',
                user: {
                    id: 'user_001',
                    name: 'Шеметов Глеб Денисович',
                    email: 'ShGleb@mail.ru',
                    telegram_linked: true,
                    telegram_id: 'test_telegram_001',
                    role: 'student',
                    // КЛЮЧЕВОЕ: Добавляем флаг isGleb
                    isGleb: true
                }
            });
        }
        
        // Проверка в базе данных для остальных пользователей
        const user = db.prepare("SELECT id, name, email, telegram_chat_id FROM users WHERE email = ? AND password = ?").get(email, password);
        
        if (user) {
            res.json({ 
                success: true, 
                message: 'Вход выполнен!',
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    telegram_linked: !!user.telegram_chat_id,
                    telegram_id: user.telegram_chat_id,
                    role: 'student',
                    // Обычные пользователи не Глеб
                    isGleb: false
                }
            });
        } else {
            res.status(401).json({
                success: false,
                error: 'Неверный email или пароль'
            });
        }
    } catch (err) {
        console.error('❌ Ошибка при входе:', err);
        res.status(500).json({ 
            success: false,
            error: 'Ошибка сервера' 
        });
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

// Обработка 404 для API
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// Обработка 404 для страниц
app.use('*', (req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🎯 Сервер запущен на порту ${PORT}`);
});