// login.js - Проверка учетных данных через PostgreSQL API

class LoginService {
    constructor() {
        this.API_URL = 'https://your-backend.com/api/v1'; // Ваш бэкенд
    }

    // Аналог PHP проверки учетных данных
    async loginUser(email, password) {
        let error = '';

        // Проверка заполненности полей (аналог PHP empty())
        if (!email || email.trim() === '') {
            error += '<p class="error">Пожалуйста, введите email.</p>';
        }

        if (!password || password.trim() === '') {
            error += '<p class="error">Пожалуйста, введите пароль.</p>';
        }

        // Если есть ошибки - возвращаем их
        if (error) {
            return { success: false, error };
        }

        try {
            // Аналог PHP: SELECT * FROM users WHERE email = ?
            const response = await fetch(`${this.API_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email.trim(),
                    password: password
                })
            });

            const result = await response.json();

            if (response.ok) {
                // Аналог PHP: $_SESSION["userid"] = $row['id']
                this.setUserSession(result.user);
                
                // Аналог PHP: header("location: welcome.php")
                return { 
                    success: true, 
                    redirectTo: 'main.html' // аналог welcome.php
                };
            } else {
                // Обработка ошибок PostgreSQL
                if (result.error === 'USER_NOT_FOUND') {
                    error += '<p class="error">Пользователь с таким email не найден.</p>';
                } else if (result.error === 'INVALID_PASSWORD') {
                    error += '<p class="error">Неверный пароль.</p>';
                } else {
                    error += `<p class="error">${result.error || 'Ошибка входа'}</p>`;
                }
                
                return { success: false, error };
            }

        } catch (error) {
            return { 
                success: false, 
                error: '<p class="error">Ошибка подключения к серверу.</p>' 
            };
        }
    }

    // Аналог PHP сессии - сохранение userid
    setUserSession(userData) {
        // Сохраняем в localStorage (аналог $_SESSION)
        localStorage.setItem('userid', userData.id);
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('auth_token', userData.token); // JWT токен
    }

    // Проверка авторизации (аналог проверки сессии)
    isUserLoggedIn() {
        return localStorage.getItem('userid') !== null;
    }

    // Выход пользователя
    logoutUser() {
        localStorage.removeItem('userid');
        localStorage.removeItem('user');
        localStorage.removeItem('auth_token');
    }

    // Получение данных пользователя
    getUserData() {
        const userData = localStorage.getItem('user');
        return userData ? JSON.parse(userData) : null;
    }
}

// Создаем глобальный экземпляр
const loginService = new LoginService();

// Функция для использования в HTML формах
async function handleLoginForm(email, password) {
    const result = await loginService.loginUser(email, password);
    
    if (result.success) {
        // Перенаправление на главную страницу
        window.location.href = result.redirectTo;
        return true;
    } else {
        // Показ ошибок в форме
        return result.error;
    }
}

// Экспорт для использования в других файлах
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LoginService, loginService, handleLoginForm };
}