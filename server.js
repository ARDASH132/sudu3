const express = require('express');
const path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN || '8522502658:AAGEDmPCiqsU8aZk5mCflXoE6HaJ06s4yoU');
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// Middleware
// В самое начало роутов, после middleware:
app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
app.post(`/bot${process.env.TELEGRAM_TOKEN || '8522502658:AAGEDmPCiqsU8aZk5mCflXoE6HaJ06s4yoU'}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

app.get('/', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'SUDU API',
        message: 'Сервер работает корректно',
        timestamp: new Date().toISOString()
    });
});

// А затем уже другие роуты
app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.use(cors({
    origin: function(origin, callback) {
        // Разрешаем все origins в Railway
        const allowedOrigins = [
            'http://localhost:5000', 
            'http://127.0.0.1:5000',
            /\.railway\.app$/  // Все поддомены Railway
        ];
        
        if (!origin || allowedOrigins.some(allowed => {
            if (typeof allowed === 'string') return origin === allowed;
            if (allowed instanceof RegExp) return allowed.test(origin);
            return false;
        })) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ==================== TELEGRAM ФУНКЦИИ ====================

// Функция отправки сообщения в Telegram
// Функция отправки сообщения в Telegram
async function sendTelegramMessage(chatId, message) {
    try {
        const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8522502658:AAGEDmPCiqsU8aZk5mCflXoE6HaJ06s4yoU';
        // ... остальной код без изменений
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

// ==================== БАЗА ДАННЫХ ====================
const dbPath = path.join(__dirname, 'sudu_database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к SQLite:', err.message);
    } else {
        console.log('✅ Подключение к SQLite установлено');
        initializeDatabase();
    }
});

function initializeDatabase() {
    // Таблица пользователей с telegram_chat_id
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            telegram_chat_id BIGINT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('❌ Ошибка создания таблицы users:', err);
        } else {
            console.log('✅ Таблица users готова');
            addTelegramChatIdColumn();
        }
    });

    // Таблица для кодов привязки Telegram
    db.run(`
        CREATE TABLE IF NOT EXISTS telegram_link_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            code VARCHAR(6) NOT NULL,
            expires_at DATETIME NOT NULL,
            used BOOLEAN DEFAULT FALSE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('❌ Ошибка создания таблицы telegram_link_codes:', err);
        } else {
            console.log('✅ Таблица telegram_link_codes готова');
        }
    });

    // Таблица для кодов восстановления пароля
    db.run(`
        CREATE TABLE IF NOT EXISTS telegram_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            code VARCHAR(6) NOT NULL,
            expires_at DATETIME NOT NULL,
            used BOOLEAN DEFAULT FALSE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('❌ Ошибка создания таблицы telegram_codes:', err);
        } else {
            console.log('✅ Таблица telegram_codes готова');
        }
    });
}

// Функция для добавления колонки telegram_chat_id если её нет
function addTelegramChatIdColumn() {
    console.log('🔄 Добавляем колонку telegram_chat_id...');
    db.run("ALTER TABLE users ADD COLUMN telegram_chat_id BIGINT NULL", (err) => {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('✅ Колонка telegram_chat_id уже существует');
            } else {
                console.error('❌ Ошибка добавления колонки:', err.message);
            }
        } else {
            console.log('✅ Колонка telegram_chat_id успешно добавлена');
        }
    });
}

// ==================== API ROUTES ====================

// Регистрация пользователя
app.post('/api/auth/register', (req, res) => {
    const { full_name, email, password } = req.body;
    
    if (!full_name || !email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Все поля обязательны для заполнения'
        });
    }
    
    db.run(
        "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
        [full_name, email, password],
        function(err) {
            if (err) {
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
            } else {
                console.log('✅ Пользователь зарегистрирован:', email, 'ID:', this.lastID);
                
                res.json({
                    success: true,
                    message: 'Регистрация успешна! Теперь привяжите Telegram.',
                    user_id: this.lastID
                });
            }
        }
    );
});

// Запрос кода для привязки Telegram
app.post('/api/auth/request-telegram-link', (req, res) => {
    const { email } = req.body;
    
    console.log('🔗 Запрос кода привязки для:', email);
    
    // Ищем пользователя по email
    db.get("SELECT id, name FROM users WHERE email = ?", [email], (err, user) => {
        if (err || !user) {
            return res.status(400).json({
                success: false,
                error: 'Пользователь не найден. Сначала завершите регистрацию.'
            });
        }
        
        // Проверяем, не привязан ли уже Telegram
        db.get("SELECT telegram_chat_id FROM users WHERE id = ? AND telegram_chat_id IS NOT NULL", [user.id], (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            if (result) {
                return res.json({
                    success: false,
                    error: 'Telegram уже привязан к этому аккаунту'
                });
            }
            
            // Генерируем код привязки
            const linkCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
            
            // Сохраняем код в базу
            db.run(
                "INSERT INTO telegram_link_codes (user_id, code, expires_at) VALUES (?, ?, ?)",
                [user.id, linkCode, expiresAt.toISOString()],
                function(err) {
                    if (err) {
                        console.error('❌ Ошибка сохранения кода привязки:', err);
                        return res.status(500).json({ error: 'Ошибка сервера' });
                    }
                    
                    console.log('✅ Код привязки сгенерирован:', linkCode, 'для пользователя:', user.id);
                    
                    res.json({ 
                        success: true, 
                        linkCode: linkCode,
                        instructions: `Отправьте боту команду: /link ${linkCode}`,
                        message: 'Код для привязки Telegram получен'
                    });
                }
            );
        });
    });
});

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
    
    // Ищем код привязки в базе
    db.get(
        `SELECT tlc.*, u.email, u.name 
         FROM telegram_link_codes tlc 
         JOIN users u ON tlc.user_id = u.id 
         WHERE tlc.code = ? AND tlc.used = FALSE AND tlc.expires_at > datetime('now')`,
        [linkCode],
        (err, codeRecord) => {
            if (err) {
                console.error('❌ Ошибка поиска кода:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Ошибка сервера' 
                });
            }
            
            if (!codeRecord) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Неверный или просроченный код привязки' 
                });
            }
            
            // Привязываем Telegram к пользователю
            db.run(
                "UPDATE users SET telegram_chat_id = ? WHERE id = ?",
                [telegram_chat_id, codeRecord.user_id],
                function(err) {
                    if (err) {
                        console.error('❌ Ошибка привязки Telegram:', err);
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Ошибка привязки' 
                        });
                    }
                    
                    // Помечаем код как использованный
                    db.run(
                        "UPDATE telegram_link_codes SET used = TRUE WHERE id = ?",
                        [codeRecord.id]
                    );
                    
                    console.log('✅ Telegram привязан к пользователю:', codeRecord.email);
                    
                    // Отправляем приветственное сообщение
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
                        name: codeRecord.name
                    });
                }
            );
        }
    );
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
    
    db.get("SELECT telegram_chat_id FROM users WHERE email = ?", [email], (err, user) => {
        if (err || !user) {
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
    });
});

// Запрос кода восстановления через сайт
app.post('/api/auth/request-password-reset', (req, res) => {
    const { email } = req.body;
    
    console.log('🔐 Запрос восстановления для:', email);
    
    // Ищем пользователя
    db.get("SELECT id, name, telegram_chat_id FROM users WHERE email = ?", [email], (err, user) => {
        if (err || !user) {
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
        
        // Генерируем код
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        
        console.log('✅ Код восстановления сгенерирован:', code, 'для пользователя:', user.email, 'chat_id:', user.telegram_chat_id);
        
        // Сохраняем код в базу
        db.run(
            "INSERT INTO telegram_codes (user_id, code, expires_at) VALUES (?, ?, ?)",
            [user.id, code, expiresAt.toISOString()],
            function(err) {
                if (err) {
                    console.error('❌ Ошибка сохранения кода:', err);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                
                // Отправляем код через Telegram
                sendTelegramMessage(user.telegram_chat_id, 
                    `🔐 Код восстановления пароля СУДУ\n\n` +
                    `📧 Для: ${user.email}\n` +
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
            }
        );
    });
});

// Проверка кода и смена пароля
app.post('/api/auth/reset-password', (req, res) => {
    const { email, code, newPassword } = req.body;
    
    // Проверяем код
    db.get(
        `SELECT tc.* FROM telegram_codes tc
         JOIN users u ON tc.user_id = u.id
         WHERE u.email = ? AND tc.code = ? AND tc.used = FALSE AND tc.expires_at > datetime('now')`,
        [email, code],
        (err, codeRecord) => {
            if (err || !codeRecord) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Неверный или просроченный код' 
                });
            }
            
            // Меняем пароль
            db.run(
                "UPDATE users SET password = ? WHERE email = ?",
                [newPassword, email],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Ошибка смены пароля' });
                    }
                    
                    // Помечаем код как использованный
                    db.run("UPDATE telegram_codes SET used = TRUE WHERE id = ?", [codeRecord.id]);
                    
                    res.json({ 
                        success: true, 
                        message: 'Пароль успешно изменен' 
                    });
                }
            );
        }
    );
});

// Вход пользователя
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    db.get(
        "SELECT id, name, email FROM users WHERE email = ? AND password = ?",
        [email, password],
        (err, user) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else if (user) {
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
        }
    );
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Сервер работает!',
        timestamp: new Date().toISOString()
    });
});
// После всех API роутов добавьте:
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


// Запуск сервера
// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚂 Сервер запущен на Railway`);
    console.log(`🌐 Порт: ${PORT}`);
    console.log(`⚡ Готов к работе!`);
});
// Обработка ошибок
console.log('✅ Server started');
console.log('✅ Telegram bot running via webhook');
app.use((err, req, res, next) => {
    console.error('❌ Ошибка сервера:', err.stack);
    res.status(500).json({ 
        success: false, 
        error: 'Внутренняя ошибка сервера' 
    });
});