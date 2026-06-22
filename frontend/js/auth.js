import { post, get } from './api.js';

const TOKEN_KEY = 'access_token';
const ROLE_KEY = 'user_role';

export function isAuthenticated() {
    return !!localStorage.getItem(TOKEN_KEY);
}

export function getUserRole() {
    const savedRole = localStorage.getItem(ROLE_KEY);
    if (savedRole) return savedRole;
    
    try {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return null;
        const payload = JSON.parse(atob(token.split('.')[1]));
        const role = payload.role || 'user';
        localStorage.setItem(ROLE_KEY, role);
        return role;
    } catch (e) {
        return null;
    }
}

export async function login(username, password) {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    
    const response = await fetch('/api/auth/login', {
        method: 'POST',
        body: formData,
    });
    
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        data = await response.json();
    } else {
        const text = await response.text();
        throw new Error(text || 'Ошибка сервера');
    }
    
    if (!response.ok) {
        const msg = data.detail || data.message || 'Неверный логин или пароль';
        throw new Error(msg);
    }
    
    if (data.access_token) {
        localStorage.setItem(TOKEN_KEY, data.access_token);
        try {
            const payload = JSON.parse(atob(data.access_token.split('.')[1]));
            const role = payload.role || 'user';
            localStorage.setItem(ROLE_KEY, role);
        } catch (e) {
            localStorage.setItem(ROLE_KEY, 'user');
        }
        return data;
    } else {
        throw new Error('Токен не получен');
    }
}

export async function register(username, email, password) {
    // Проверка на пустые поля
    if (!username || !email || !password) {
        throw new Error('Все поля обязательны для заполнения');
    }
    
    // Простая проверка email - только наличие @ и точки
    if (!email.includes('@') || !email.includes('.')) {
        throw new Error('Введите корректный email (например, test@example.com)');
    }
    
    // Дополнительная проверка: email не должен содержать пробелы
    if (email.includes(' ')) {
        throw new Error('Email не должен содержать пробелы');
    }
    
    console.log('📤 Отправка регистрации:', { username, email, password: '***' });
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password }),
        });
        
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            console.error('❌ Ответ сервера (не JSON):', text);
            throw new Error(text || 'Ошибка сервера (не JSON)');
        }
        
        console.log('📥 Ответ сервера:', data);
        
        if (!response.ok) {
            let msg = 'Ошибка регистрации';
            if (data.detail) {
                if (typeof data.detail === 'string') {
                    msg = data.detail;
                } else if (Array.isArray(data.detail)) {
                    msg = data.detail.map(err => {
                        const field = err.loc ? err.loc.join('.') : 'unknown';
                        return `${field}: ${err.msg}`;
                    }).join('; ');
                } else {
                    msg = JSON.stringify(data.detail);
                }
            } else if (data.message) {
                msg = data.message;
            }
            throw new Error(msg);
        }
        
        return data;
    } catch (err) {
        console.error('❌ Ошибка регистрации:', err);
        throw err;
    }
}

export function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
}