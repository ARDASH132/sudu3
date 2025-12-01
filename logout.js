// logout.js - аналог PHP logout
class LogoutService {
    logoutUser() {
        // Очищаем localStorage (аналог $_SESSION = array())
        localStorage.removeItem('userid');
        localStorage.removeItem('user');
        localStorage.removeItem('auth_token');
        
        // Отправляем запрос на сервер для удаления сессии в PostgreSQL
        fetch('/api/v1/auth/logout', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });
        
        // Перенаправляем на главную (аналог header("location: main.html"))
        window.location.href = 'index.html';
    }
}

// Использование
const logoutService = new LogoutService();
logoutService.logoutUser();