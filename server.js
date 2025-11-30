const express = require('express');
const path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: [
        'http://localhost:5000', 
        'http://127.0.0.1:5000',
        'https://sudu3.onrender.com',
        'https://*.onrender.com'
    ],
    credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ==================== НАСТРОЙКА EMAIL ====================
const emailTransporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

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
    // Таблица пользователей
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email_verified BOOLEAN DEFAULT FALSE,
            verification_token TEXT NULL,
            reset_token TEXT NULL,
            reset_token_expires DATETIME NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('❌ Ошибка создания таблицы users:', err);
        } else {
            console.log('✅ Таблица users готова');
        }
    });
}

// ==================== EMAIL ФУНКЦИИ ====================
async function sendVerificationEmail(email, verificationToken) {
    const verificationLink = `${process.env.SERVER_URL || 'http://localhost:5000'}/verify-email.html?token=${verificationToken}`;
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Подтверждение email - СУДУ',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Добро пожаловать в СУДУ!</h2>
                <p>Для завершения регистрации подтвердите ваш email:</p>
                <a href="${verificationLink}" 
                   style="display: inline-block; padding: 12px 24px; background: #28a745; color: white; text-decoration: none; border-radius: 4px;">
                    Подтвердить email
                </a>
                <p style="margin-top: 20px; color: #666;">
                    Если вы не регистрировались в СУДУ, проигнорируйте это письмо.
                </p>
            </div>
        `
    };

    await emailTransporter.sendMail(mailOptions);
}

async function sendPasswordResetEmail(email, resetToken) {
    const resetLink = `${process.env.SERVER_URL || 'http://localhost:5000'}/reset-password.html?token=${resetToken}`;
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Восстановление пароля - СУДУ',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Восстановление пароля</h2>
                <p>Для восстановления пароля перейдите по ссылке ниже:</p>
                <a href="${resetLink}" 
                   style="display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">
                    Восстановить пароль
                </a>
                <p style="margin-top: 20px; color: #666;">
                    Если вы не запрашивали восстановление пароля, проигнорируйте это письмо.
                </p>
                <p style="color: #999; font-size: 12px;">
                    Ссылка действительна в течение 1 часа.
                </p>
            </div>
        `
    };

    await emailTransporter.sendMail(mailOptions);
}

// ==================== API ROUTES ====================

// Регистрация с отправкой verification email
app.post('/api/auth/register', async (req, res) => {
    const { full_name, email, password } = req.body;
    
    if (!full_name || !email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Все поля обязательны для заполнения'
        });
    }
    
    try {
        // Хешируем пароль
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Генерируем токен верификации
        const verificationToken = crypto.randomBytes(32).toString('hex');
        
        db.run(
            "INSERT INTO users (name, email, password, verification_token) VALUES (?, ?, ?, ?)",
            [full_name, email, hashedPassword, verificationToken],
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
                    console.log('✅ Пользователь зарегистрирован:', email);
                    
                    // Отправляем email подтверждения
                    sendVerificationEmail(email, verificationToken)
                        .then(() => {
                            res.json({
                                success: true,
                                message: 'Регистрация успешна! Проверьте ваш email для подтверждения.'
                            });
                        })
                        .catch(emailError => {
                            console.error('❌ Ошибка отправки email:', emailError);
                            res.json({
                                success: true,
                                message: 'Регистрация успешна, но не удалось отправить email подтверждения.'
                            });
                        });
                }
            }
        );
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка сервера'
        });
    }
});

// Подтверждение email
app.get('/api/auth/verify-email', (req, res) => {
    const { token } = req.query;
    
    db.get(
        "SELECT id FROM users WHERE verification_token = ? AND email_verified = FALSE",
        [token],
        (err, user) => {
            if (err || !user) {
                return res.redirect('/verification-failed.html');
            }
            
            // Активируем аккаунт
            db.run(
                "UPDATE users SET email_verified = TRUE, verification_token = NULL WHERE id = ?",
                [user.id],
                (err) => {
                    if (err) {
                        return res.redirect('/verification-failed.html');
                    }
                    res.redirect('/verification-success.html');
                }
            );
        }
    );
});

// Запрос восстановления пароля
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    db.get("SELECT id FROM users WHERE email = ?", [email], (err, user) => {
        if (err || !user) {
            // Всегда возвращаем успех для безопасности
            return res.json({ 
                success: true, 
                message: 'Если email существует, инструкции отправлены' 
            });
        }
        
        // Генерируем токен сброса
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 час
        
        db.run(
            "UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?",
            [resetToken, resetTokenExpires.toISOString(), user.id],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                
                // Отправляем email с ссылкой сброса
                sendPasswordResetEmail(email, resetToken)
                    .then(() => {
                        res.json({ 
                            success: true, 
                            message: 'Инструкции по восстановлению отправлены на email' 
                        });
                    })
                    .catch(emailError => {
                        console.error('❌ Ошибка отправки email:', emailError);
                        res.json({ 
                            success: false,
                            error: 'Ошибка отправки email' 
                        });
                    });
            }
        );
    });
});

// Сброс пароля
app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    
    // Проверяем токен
    db.get(
        "SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > datetime('now')",
        [token],
        async (err, user) => {
            if (err || !user) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Недействительная или просроченная ссылка' 
                });
            }
            
            try {
                // Хешируем новый пароль
                const hashedPassword = await bcrypt.hash(newPassword, 10);
                
                // Обновляем пароль и очищаем токен
                db.run(
                    "UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?",
                    [hashedPassword, user.id],
                    function(err) {
                        if (err) {
                            return res.status(500).json({ error: 'Ошибка смены пароля' });
                        }
                        
                        res.json({ 
                            success: true, 
                            message: 'Пароль успешно изменен' 
                        });
                    }
                );
            } catch (error) {
                res.status(500).json({ error: 'Ошибка сервера' });
            }
        }
    );
});

// Вход (с проверкой верификации email)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    db.get(
        "SELECT id, name, email, password, email_verified FROM users WHERE email = ?",
        [email],
        async (err, user) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else if (user) {
                // Проверяем пароль
                const passwordMatch = await bcrypt.compare(password, user.password);
                
                if (passwordMatch) {
                    if (!user.email_verified) {
                        return res.status(401).json({
                            success: false,
                            error: 'Подтвердите ваш email перед входом'
                        });
                    }
                    
                    res.json({ 
                        success: true, 
                        message: 'Вход выполнен!',
                        user: {
                            id: user.id,
                            name: user.name,
                            email: user.email
                        }
                    });
                } else {
                    res.status(401).json({
                        success: false,
                        error: 'Неверный email или пароль'
                    });
                }
            } else {
                res.status(401).json({
                    success: false,
                    error: 'Неверный email или пароль'
                });
            }
        }
    );
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎯 Сервер запущен на порту ${PORT}`);
});