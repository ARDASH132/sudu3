// session.js - Проверка авторизации через PostgreSQL API

class SessionManager {
    constructor() {
        this.API_URL = 'https://your-backend.com/api/v1'; // Ваш бэкенд
        this.STORAGE_KEYS = {
            USER_ID: 'user_id',
            USER_DATA: 'user_data',
            AUTH_TOKEN: 'auth_token'
        };
    }

    // Запуск сессии (аналог session_start())
    async startSession() {
        try {
            const token = localStorage.getItem(this.STORAGE_KEYS.AUTH_TOKEN);
            
            if (!token) {
                return { isValid: false, user: null };
            }

            // Проверяем валидность токена через PostgreSQL API
            const response = await fetch(`${this.API_URL}/auth/verify`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const userData = await response.json();
                return { 
                    isValid: true, 
                    user: userData 
                };
            } else {
                this.destroySession();
                return { isValid: false, user: null };
            }

        } catch (error) {
            console.error('Ошибка сессии:', error);
            return { isValid: false, user: null };
        }
    }

    // Проверка вошел ли пользователь в систему (аналог isset($_SESSION["userid"]))
    async isUserLoggedIn() {
        const session = await this.startSession();
        return session.isValid;
    }

    // Перенаправление на главную страницу если пользователь авторизован
    async redirectIfLoggedIn() {
        const isLoggedIn = await this.isUserLoggedIn();
        
        if (isLoggedIn && this.shouldRedirectToMain()) {
            window.location.href = 'main.html';
            return true;
        }
        
        return false;
    }

    // Проверка нужно ли перенаправлять на главную
    shouldRedirectToMain() {
        const currentPage = window.location.pathname;
        return currentPage.includes('index.html') || 
               currentPage.includes('register.html') ||
               currentPage === '/' ||
               currentPage.endsWith('/');
    }

    // Уничтожение сессии
    destroySession() {
        localStorage.removeItem(this.STORAGE_KEYS.USER_ID);
        localStorage.removeItem(this.STORAGE_KEYS.USER_DATA);
        localStorage.removeItem(this.STORAGE_KEYS.AUTH_TOKEN);
        
        // Также отправляем запрос на сервер для удаления сессии в PostgreSQL
        fetch(`${this.API_URL}/auth/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem(this.STORAGE_KEYS.AUTH_TOKEN)}`
            }
        }).catch(error => console.error('Ошибка выхода:', error));
    }

    // Создание сессии после успешного входа
    createSession(userData, authToken) {
        localStorage.setItem(this.STORAGE_KEYS.USER_ID, userData.id);
        localStorage.setItem(this.STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
        localStorage.setItem(this.STORAGE_KEYS.AUTH_TOKEN, authToken);
    }

    // Получение данных пользователя
    getUserData() {
        const userData = localStorage.getItem(this.STORAGE_KEYS.USER_DATA);
        return userData ? JSON.parse(userData) : null;
    }

    // Получение ID пользователя
    getUserId() {
        return localStorage.getItem(this.STORAGE_KEYS.USER_ID);
    }
}

// Создаем глобальный экземпляр
const sessionManager = new SessionManager();

// Автоматическая проверка при загрузке страницы
document.addEventListener('DOMContentLoaded', async function() {
    await sessionManager.redirectIfLoggedIn();
});

// Экспорт для использования в других файлах
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SessionManager, sessionManager };
}