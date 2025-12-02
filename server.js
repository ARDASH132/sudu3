require('dotenv').config();
require('./telegram-bot.js');
const express = require('express');
const path = require('path');

const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// Вместо жестких localhost ссылок
const cors = require('cors');

// Разрешаем запросы с разных доменов
app.use(cors({
    origin: '*', // Или укажите ваш домен при хостинге
    credentials: true
}));

// Удалите или измените статические пути
// app.use(express.static('.')); // Может быть небезопасно на хостинге

// Вместо этого лучше указать конкретную папку
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use(express.static('.')); // Добавляем эту строку

// ==================== ПОДКЛЮЧЕНИЕ К SQLite ====================
// Используйте путь к базе данных в зависимости от окружения
const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'sudu_database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к SQLite:', err.message);
    } else {
        console.log('✅ Подключение к SQLite установлено');
        initializeDatabase();
    }
});

function initializeDatabase() {
    // Таблица пользователей
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

    // Таблица для кодов восстановления
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

// ==================== ФУНКЦИИ TELEGRAM ====================

// Функция отправки сообщения в Telegram
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
    db.all("SELECT id, name, email, telegram_chat_id, created_at FROM users ORDER BY created_at DESC", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true, users: rows });
        }
    });
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
            
            // Проверяем, не привязан ли уже этот chat_id к другому аккаунту
            db.get(
                "SELECT email FROM users WHERE telegram_chat_id = ?",
                [telegram_chat_id],
                (err, existingUser) => {
                    if (err) {
                        console.error('❌ Ошибка проверки chat_id:', err);
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Ошибка сервера' 
                        });
                    }
                    
                    if (existingUser) {
                        return res.status(400).json({ 
                            success: false, 
                            error: 'Этот Telegram уже привязан к другому аккаунту' 
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

// ==================== ВОССТАНОВЛЕНИЕ ПАРОЛЯ ====================

// Вход
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
                
                // Отправляем код через Telegram API напрямую
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

// Запрос кода восстановления для бота
app.post('/api/auth/request-telegram-code', (req, res) => {
    const { email } = req.body;
    
    console.log('🔐 Бот запрашивает код для:', email);
    
    // Ищем пользователя с привязанным Telegram
    db.get(
        "SELECT id, name, telegram_chat_id FROM users WHERE email = ? AND telegram_chat_id IS NOT NULL",
        [email],
        (err, user) => {
            if (err || !user) {
                return res.json({ 
                    success: false, 
                    error: 'Пользователь не найден или Telegram не привязан' 
                });
            }
            
            // Генерируем код восстановления
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
            
            // Сохраняем код в базу
            db.run(
                "INSERT INTO telegram_codes (user_id, code, expires_at) VALUES (?, ?, ?)",
                [user.id, code, expiresAt.toISOString()],
                function(err) {
                    if (err) {
                        console.error('❌ Ошибка сохранения кода:', err);
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Ошибка сервера' 
                        });
                    }
                    
                    console.log('✅ Код восстановления сгенерирован:', code, 'для пользователя:', user.email);
                    
                    // Отправляем код через Telegram
                    sendTelegramMessage(user.telegram_chat_id,
                        `🔐 Код восстановления пароля:\n` +
                        `📧 Для: ${user.email}\n` +
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
                }
            );
        }
    );
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
});а