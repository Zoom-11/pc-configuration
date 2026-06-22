const API_BASE = '';

export async function request(endpoint, options = {}) {
    const token = localStorage.getItem('access_token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });
    
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        data = await response.json();
    } else {
        data = await response.text();
    }
    
    if (!response.ok) {
        if (response.status === 401) {
            localStorage.removeItem('access_token');
        }
        let errorMessage = 'Ошибка запроса';
        if (typeof data === 'object' && data !== null) {
            if (data.detail) {
                if (typeof data.detail === 'string') {
                    errorMessage = data.detail;
                } else if (Array.isArray(data.detail)) {
                    errorMessage = data.detail.map(err => err.msg || JSON.stringify(err)).join('; ');
                } else {
                    errorMessage = JSON.stringify(data.detail);
                }
            } else if (data.message) {
                errorMessage = data.message;
            } else {
                errorMessage = JSON.stringify(data);
            }
        } else if (typeof data === 'string') {
            errorMessage = data;
        }
        throw new Error(errorMessage);
    }
    return data;
}

export function get(endpoint) {
    return request(endpoint, { method: 'GET' });
}
export function post(endpoint, data) {
    return request(endpoint, { method: 'POST', body: JSON.stringify(data) });
}
export function put(endpoint, data) {
    return request(endpoint, { method: 'PUT', body: JSON.stringify(data) });
}
export function del(endpoint) {
    return request(endpoint, { method: 'DELETE' });
}
export function patch(endpoint, data) {
    return request(endpoint, { method: 'PATCH', body: JSON.stringify(data) });
}