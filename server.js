const express = require('express');
const path = require('path');
const cors = require('cors');
const Database = require('better-sqlite3'); // ← только better-sqlite3
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
const emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ==================== БАЗА ДАННЫХ ====================
const db = new Database('sudu_database.sqlite');

// Инициализация базы данных
function initializeDatabase() {
    try {
        // Таблица пользователей
        db.exec(`
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
        `);
        console.log('✅ Таблица users готова');
    } catch (err) {
        console.error('❌ Ошибка создания таблицы users:', err);
    }
}

// Инициализируем базу при запуске
initializeDatabase();

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
        
        try {
            const stmt = db.prepare(
                "INSERT INTO users (name, email, password, verification_token) VALUES (?, ?, ?, ?)"
            );
            const result = stmt.run(full_name, email, hashedPassword, verificationToken);
            
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
                
        } catch (dbError) {
            if (dbError.message.includes('UNIQUE constraint failed')) {
                res.status(400).json({
                    success: false,
                    error: 'Пользователь с таким email уже существует'
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: 'Ошибка регистрации: ' + dbError.message
                });
            }
        }
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
    
    try {
        const stmt = db.prepare(
            "SELECT id FROM users WHERE verification_token = ? AND email_verified = FALSE"
        );
        const user = stmt.get(token);
        
        if (!user) {
            return res.redirect('/verification-failed.html');
        }
        
        // Активируем аккаунт
        const updateStmt = db.prepare(
            "UPDATE users SET email_verified = TRUE, verification_token = NULL WHERE id = ?"
        );
        updateStmt.run(user.id);
        
        res.redirect('/verification-success.html');
    } catch (error) {
        res.redirect('/verification-failed.html');
    }
});

// Запрос восстановления пароля
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    try {
        const stmt = db.prepare("SELECT id FROM users WHERE email = ?");
        const user = stmt.get(email);
        
        if (!user) {
            // Всегда возвращаем успех для безопасности
            return res.json({ 
                success: true, 
                message: 'Если email существует, инструкции отправлены' 
            });
        }
        
        // Генерируем токен сброса
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 час
        
        const updateStmt = db.prepare(
            "UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?"
        );
        updateStmt.run(resetToken, resetTokenExpires.toISOString(), user.id);
        
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
            
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Сброс пароля
app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    
    try {
        // Проверяем токен
        const stmt = db.prepare(
            "SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > datetime('now')"
        );
        const user = stmt.get(token);
        
        if (!user) {
            return res.status(400).json({ 
                success: false, 
                error: 'Недействительная или просроченная ссылка' 
            });
        }
        
        // Хешируем новый пароль
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Обновляем пароль и очищаем токен
        const updateStmt = db.prepare(
            "UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?"
        );
        updateStmt.run(hashedPassword, user.id);
        
        res.json({ 
            success: true, 
            message: 'Пароль успешно изменен' 
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход (с проверкой верификации email)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const stmt = db.prepare(
            "SELECT id, name, email, password, email_verified FROM users WHERE email = ?"
        );
        const user = stmt.get(email);
        
        if (user) {
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
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Сервер работает!',
        timestamp: new Date().toISOString()
    });
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎯 Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Доступен по: http://localhost:${PORT}`);
});