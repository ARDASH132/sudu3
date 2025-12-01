// simple-db.js - простая БД без внешних зависимостей
class SimpleDB {
    constructor() {
        this.users = [
            {
                id: 1,
                name: 'Тестовый пользователь',
                email: 'test@example.com',
                password: 'test123',
                created_at: new Date().toISOString()
            }
        ];
        this.nextId = 2;
    }

    getAllUsers() {
        return this.users.map(user => {
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });
    }

    createUser(userData) {
        const user = {
            id: this.nextId++,
            ...userData,
            created_at: new Date().toISOString()
        };
        this.users.push(user);
        return user;
    }

    findUserByEmailAndPassword(email, password) {
        return this.users.find(u => u.email === email && u.password === password);
    }

    findUserByEmail(email) {
        return this.users.find(u => u.email === email);
    }
}

module.exports = SimpleDB;