import { get, put, post, del } from './api.js';
import { isAuthenticated, getUserRole, logout } from './auth.js';

// Проверка доступа - только для обычных пользователей
const role = getUserRole();
if (role !== 'user') {
    window.location.href = '/admin.html';
}

const userInfo = document.getElementById('userInfo');
const profileUsername = document.getElementById('profileUsername');
const profileEmail = document.getElementById('profileEmail');
const profilePhone = document.getElementById('profilePhone');
const profileCreated = document.getElementById('profileCreated');
const editUsername = document.getElementById('editUsername');
const editEmail = document.getElementById('editEmail');
const editPhone = document.getElementById('editPhone');
const updateProfileBtn = document.getElementById('updateProfileBtn');
const assembliesList = document.getElementById('assembliesList');
const ordersList = document.getElementById('ordersList');
const oldPassword = document.getElementById('oldPassword');
const newPassword = document.getElementById('newPassword');
const confirmPassword = document.getElementById('confirmPassword');
const changePasswordBtn = document.getElementById('changePasswordBtn');

const statsAssembliesCount = document.getElementById('statsAssembliesCount');
const statsTotalPrice = document.getElementById('statsTotalPrice');
const statsAvgRating = document.getElementById('statsAvgRating');
const statsMemberSince = document.getElementById('statsMemberSince');
const statsOrdersCount = document.getElementById('statsOrdersCount');
const statsTotalSpent = document.getElementById('statsTotalSpent');

let currentUser = null;

function updateUserUI() {
    if (!isAuthenticated()) {
        window.location.href = '/';
        return;
    }
    const role = getUserRole();
    if (role === 'admin') {
        userInfo.innerHTML = `
            <a href="/admin.html" style="color:#ef4444; text-decoration:none; margin-right:1rem;">👑 Админ-панель</a>
            <span>👤 Администратор</span>
            <button id="logoutBtn">Выйти</button>
        `;
    } else if (role === 'manager') {
        userInfo.innerHTML = `
            <a href="/admin.html" style="color:#e67e22; text-decoration:none; margin-right:1rem;">📋 Управление заказами</a>
            <span>👤 Менеджер</span>
            <button id="logoutBtn">Выйти</button>
        `;
    } else {
        userInfo.innerHTML = `
            <a href="/profile.html" style="color:#2563eb; text-decoration:none; margin-right:1rem;">👤 Личный кабинет</a>
            <span>👤 Пользователь</span>
            <button id="logoutBtn">Выйти</button>
        `;
    }
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            logout();
            window.location.href = '/';
        });
    }
}

async function loadProfile() {
    try {
        currentUser = await get('/api/users/me');
        profileUsername.textContent = currentUser.username;
        profileEmail.textContent = currentUser.email;
        profilePhone.textContent = currentUser.phone || 'Не указан';
        profileCreated.textContent = new Date(currentUser.created_at).toLocaleDateString('ru-RU');
        editUsername.value = currentUser.username;
        editEmail.value = currentUser.email;
        editPhone.value = currentUser.phone || '';
        await loadStatistics();
    } catch (err) {
        console.error('Ошибка загрузки профиля:', err);
    }
}

async function loadStatistics() {
    try {
        const assemblies = await get('/api/assemblies/my');
        const orders = await get('/api/orders/my');
        
        const count = assemblies.length;
        const totalPrice = assemblies.reduce((sum, a) => sum + a.total_price, 0);
        const avgRating = assemblies.filter(a => a.performance_score).reduce((sum, a, _, arr) => sum + (a.performance_score || 0) / (arr.length || 1), 0);
        
        if (statsAssembliesCount) statsAssembliesCount.textContent = count;
        if (statsTotalPrice) statsTotalPrice.textContent = totalPrice.toLocaleString() + ' ₽';
        if (statsAvgRating) statsAvgRating.textContent = avgRating.toFixed(1) || '—';
        if (statsMemberSince && currentUser) statsMemberSince.textContent = new Date(currentUser.created_at).toLocaleDateString('ru-RU');
        if (statsOrdersCount) statsOrdersCount.textContent = orders.length;
        if (statsTotalSpent) statsTotalSpent.textContent = orders.reduce((sum, o) => sum + o.total_price, 0).toLocaleString() + ' ₽';
    } catch (err) {
        console.error('Ошибка загрузки статистики:', err);
    }
}

async function updateProfile() {
    const username = editUsername.value.trim();
    const email = editEmail.value.trim();
    const phone = editPhone.value.trim();
    if (!username && !email && !phone) return alert('Введите хотя бы одно поле');
    try {
        await put('/api/users/me', { username, email, phone });
        alert('✅ Профиль обновлён');
        loadProfile();
    } catch (err) {
        alert('❌ Ошибка: ' + err.message);
    }
}

async function changePassword() {
    const old = oldPassword.value;
    const newPwd = newPassword.value;
    const confirm = confirmPassword.value;
    if (!old || !newPwd || newPwd !== confirm) {
        alert('❌ Заполните все поля и проверьте совпадение паролей');
        return;
    }
    if (newPwd.length < 6) {
        alert('❌ Новый пароль должен содержать минимум 6 символов');
        return;
    }
    try {
        await post('/api/users/change-password', { old_password: old, new_password: newPwd });
        alert('✅ Пароль изменён');
        oldPassword.value = '';
        newPassword.value = '';
        confirmPassword.value = '';
    } catch (err) {
        alert('❌ Ошибка: ' + err.message);
    }
}

async function loadAssemblies() {
    if (!assembliesList) return;
    try {
        const assemblies = await get('/api/assemblies/my');
        if (!assemblies.length) {
            assembliesList.innerHTML = '<p>📭 У вас нет сборок. <a href="/builder.html">Создать новую</a></p>';
            return;
        }
        
        // Для каждой сборки получаем компоненты и считаем количество ОЗУ и накопителей
        const assembliesWithDetails = await Promise.all(assemblies.map(async (a) => {
            const components = await get(`/api/assemblies/${a.id}/components`);
            const ramCount = components.filter(c => c.category === 'ram').length;
            // Считаем уникальные накопители и их количество
            const storageMap = new Map();
            components.filter(c => c.category === 'storage').forEach(c => {
                storageMap.set(c.id, (storageMap.get(c.id) || 0) + 1);
            });
            const storageDetails = Array.from(storageMap.entries()).map(([id, count]) => {
                const comp = components.find(c => c.id === id);
                return { model: comp.model_name, count, type: comp.specs_json?.type || 'SATA' };
            });
            return { ...a, ramCount, storageDetails };
        }));
        
        assembliesList.innerHTML = assembliesWithDetails.map(a => `
            <div class="component-card" data-id="${a.id}">
                <h3>${escapeHtml(a.title)}</h3>
                <p>💰 ${a.total_price.toLocaleString()} ₽</p>
                <p>⭐ ${a.performance_score ?? '—'}/100</p>
                <p>📌 Статус: ${a.is_public ? '🌍 Опубликована' : '🔒 Черновик'}</p>
                <p>💾 ОЗУ: ${a.ramCount} планок</p>
                <p>💿 Накопители: ${a.storageDetails.map(s => `${s.count} x ${s.model} (${s.type})`).join(', ')}</p>
                <div class="assembly-actions">
                    <button class="edit-btn" data-id="${a.id}">✏️ Редактировать</button>
                    <button class="view-btn" data-id="${a.id}">👁️ Просмотр</button>
                    <button class="publish-btn" data-id="${a.id}" data-pub="${a.is_public}">${a.is_public ? '📁 Снять с публикации' : '🚀 Опубликовать'}</button>
                    <button class="delete-btn" data-id="${a.id}">🗑️ Удалить</button>
                    <button class="order-btn" data-id="${a.id}" data-price="${a.total_price}">🛒 Заказать</button>
                </div>
            </div>
        `).join('');
        
        // Обработчики кнопок (без изменений)
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                window.location.href = `/builder.html?assembly=${id}`;
            });
        });
        
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                window.location.href = `/build.html?id=${id}&from=profile`;
            });
        });
        
        document.querySelectorAll('.publish-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const currentPub = btn.dataset.pub === 'true';
                try {
                    await put(`/api/assemblies/${id}`, { is_public: !currentPub });
                    await loadAssemblies();
                    await loadStatistics();
                } catch (err) {
                    alert('❌ Ошибка: ' + err.message);
                }
            });
        });
        
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('🗑️ Удалить сборку?')) {
                    const id = btn.dataset.id;
                    try {
                        await del(`/api/assemblies/${id}`);
                        await loadAssemblies();
                        await loadStatistics();
                    } catch (err) {
                        alert('❌ Ошибка: ' + err.message);
                    }
                }
            });
        });
        
        document.querySelectorAll('.order-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const price = parseInt(btn.dataset.price);
                if (confirm(`🛒 Оформить заказ на сборку "${id}" на сумму ${price.toLocaleString()} ₽?`)) {
                    window.location.href = `/builder.html?assembly=${id}`;
                }
            });
        });
    } catch (err) {
        if (assembliesList) assembliesList.innerHTML = '<p>❌ Ошибка загрузки сборок</p>';
        console.error(err);
    }
}

async function loadOrders() {
    if (!ordersList) return;
    try {
        const orders = await get('/api/orders/my');
        if (!orders.length) {
            ordersList.innerHTML = '<p>📭 У вас нет заказов</p>';
            return;
        }
        
        ordersList.innerHTML = orders.map(order => `
            <div class="component-card">
                <h3>Заказ #${order.id}</h3>
                <p>📅 ${new Date(order.created_at).toLocaleDateString('ru-RU')}</p>
                <p>📦 Сборка: ${escapeHtml(order.assembly_title)}</p>
                <p>💰 Сумма: ${order.total_price.toLocaleString()} ₽</p>
                <p>📞 Телефон: ${order.phone}</p>
                <p>🏠 Адрес: ${order.address || 'Не указан'}</p>
                <p>📌 Статус: ${getStatusText(order.status)}</p>
                ${order.comment ? `<p>💬 Комментарий: ${escapeHtml(order.comment)}</p>` : ''}
            </div>
        `).join('');
    } catch (err) {
        ordersList.innerHTML = '<p>❌ Ошибка загрузки заказов</p>';
        console.error(err);
    }
}

function getStatusText(status) {
    const statuses = {
        'pending': '⏳ Ожидает подтверждения',
        'confirmed': '✅ Подтверждён',
        'shipped': '🚚 Отправлен',
        'delivered': '📦 Доставлен',
        'cancelled': '❌ Отменён'
    };
    return statuses[status] || status;
}

function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = btn.dataset.tab;
            contents.forEach(content => content.classList.remove('active'));
            tabs.forEach(b => b.classList.remove('active'));
            const targetTab = document.getElementById(`${tabId}Tab`);
            if (targetTab) targetTab.classList.add('active');
            btn.classList.add('active');
            
            if (tabId === 'assemblies') {
                loadAssemblies();
            } else if (tabId === 'orders') {
                loadOrders();
            } else if (tabId === 'profile') {
                loadProfile();
            }
        });
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function init() {
    updateUserUI();
    initTabs();
    loadProfile();
    
    const assembliesTab = document.querySelector('.tab-btn[data-tab="assemblies"]');
    if (assembliesTab) {
        assembliesTab.classList.add('active');
        const assembliesContent = document.getElementById('assembliesTab');
        if (assembliesContent) assembliesContent.classList.add('active');
        loadAssemblies();
    } else {
        const profileTab = document.querySelector('.tab-btn[data-tab="profile"]');
        if (profileTab) profileTab.classList.add('active');
        const profileContent = document.getElementById('profileTab');
        if (profileContent) profileContent.classList.add('active');
    }
}

if (updateProfileBtn) updateProfileBtn.addEventListener('click', updateProfile);
if (changePasswordBtn) changePasswordBtn.addEventListener('click', changePassword);

init();