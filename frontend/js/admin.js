import { get, put, post, del } from './api.js';
import { isAuthenticated, getUserRole, logout } from './auth.js';

// Проверка доступа - только для admin и manager
const role = getUserRole();
if (role !== 'admin' && role !== 'manager') {
    window.location.href = '/';
}

const userInfo = document.getElementById('userInfo');
const ordersTableBody = document.getElementById('ordersTableBody');
const usersTableBody = document.getElementById('usersTableBody');
const componentsList = document.getElementById('componentsList');
const statisticsContent = document.getElementById('statisticsContent');
const periodSelect = document.getElementById('periodSelect');
const refreshStatsBtn = document.getElementById('refreshStatsBtn');
const statusFilter = document.getElementById('statusFilter');
const refreshOrdersBtn = document.getElementById('refreshOrdersBtn');
const addComponentBtn = document.getElementById('addComponentBtn');
const componentCategoryFilter = document.getElementById('componentCategoryFilter');
const componentSearchInput = document.getElementById('componentSearchInput');
const componentSortBy = document.getElementById('componentSortBy');
const refreshComponentsBtn = document.getElementById('refreshComponentsBtn');

const orderSearchInput = document.getElementById('orderSearchInput');
const orderDateFrom = document.getElementById('orderDateFrom');
const orderDateTo = document.getElementById('orderDateTo');
const applyOrderFiltersBtn = document.getElementById('applyOrderFiltersBtn');
const resetOrderFiltersBtn = document.getElementById('resetOrderFiltersBtn');

const userSearchInput = document.getElementById('userSearchInput');
const userRoleFilter = document.getElementById('userRoleFilter');
const applyUserFiltersBtn = document.getElementById('applyUserFiltersBtn');
const resetUserFiltersBtn = document.getElementById('resetUserFiltersBtn');

// Модальное окно для просмотра состава заказа
const orderComponentsModal = document.getElementById('orderComponentsModal');
const orderComponentsList = document.getElementById('orderComponentsList');
const orderComponentsTitle = document.getElementById('orderComponentsTitle');
const closeOrderComponentsBtn = document.getElementById('closeOrderComponentsBtn');

// --- Модальное окно для просмотра характеристик компонента ---
const componentModal = document.getElementById('componentModal');
const modalComponentName = document.getElementById('modalComponentName');
const modalComponentImage = document.getElementById('modalComponentImage');
const modalComponentGallery = document.getElementById('modalComponentGallery');
const modalComponentSpecs = document.getElementById('modalComponentSpecs');
const modalComponentPrice = document.getElementById('modalComponentPrice');
const modalComponentCategory = document.getElementById('modalComponentCategory');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalPrevBtn = document.getElementById('modalPrevBtn');
const modalNextBtn = document.getElementById('modalNextBtn');

let currentModalComponent = null;
let currentImageIndex = 0;

// --- Функции для модального окна компонента ---
function openComponentModal(component) {
    if (!component) {
        alert('Данные компонента не найдены');
        return;
    }
    if (!modalComponentName || !modalComponentImage || !modalComponentGallery || !modalComponentSpecs || !modalComponentPrice || !modalComponentCategory) {
        console.error('Ошибка: не найдены элементы модального окна');
        alert('Ошибка отображения: не все элементы загружены');
        return;
    }
    currentModalComponent = component;
    currentImageIndex = 0;
    modalComponentName.textContent = `${component.manufacturer} ${component.model_name}`;
    modalComponentCategory.textContent = `Категория: ${component.category}`;
    modalComponentPrice.textContent = `💰 ${component.price.toLocaleString()} ₽`;
    
    const allImages = [];
    if (component.image_url) allImages.push(component.image_url);
    if (component.images && Array.isArray(component.images)) {
        allImages.push(...component.images);
    }
    
    if (allImages.length > 0) {
        modalComponentImage.src = allImages[0];
        modalComponentImage.style.display = 'block';
        modalComponentGallery.innerHTML = allImages.map((url, idx) => `
            <img src="${url}" class="gallery-thumb ${idx === 0 ? 'active' : ''}" data-index="${idx}" style="width:60px; height:60px; object-fit:cover; cursor:pointer; border:2px solid ${idx === 0 ? '#2563eb' : 'transparent'}; border-radius:4px; margin:2px;">
        `).join('');
        document.querySelectorAll('.gallery-thumb').forEach(thumb => {
            thumb.addEventListener('click', function() {
                const idx = parseInt(this.dataset.index);
                currentImageIndex = idx;
                modalComponentImage.src = allImages[idx];
                document.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
            });
        });
        modalPrevBtn.style.display = allImages.length > 1 ? 'inline-block' : 'none';
        modalNextBtn.style.display = allImages.length > 1 ? 'inline-block' : 'none';
    } else {
        modalComponentImage.src = '';
        modalComponentImage.style.display = 'none';
        modalComponentGallery.innerHTML = '<p style="color:#888;">Нет изображений</p>';
        modalPrevBtn.style.display = 'none';
        modalNextBtn.style.display = 'none';
    }
    
    let specsHtml = '<table style="width:100%; border-collapse:collapse;">';
    for (const [key, value] of Object.entries(component.specs_json)) {
        specsHtml += `<tr><td style="padding:6px; border-bottom:1px solid #eee; font-weight:bold;">${key}</td><td style="padding:6px; border-bottom:1px solid #eee;">${value}</td></tr>`;
    }
    specsHtml += '</table>';
    modalComponentSpecs.innerHTML = specsHtml;
    
    componentModal.style.display = 'flex';
}

function closeComponentModal() {
    componentModal.style.display = 'none';
}

function prevImage() {
    if (!currentModalComponent) return;
    const allImages = [];
    if (currentModalComponent.image_url) allImages.push(currentModalComponent.image_url);
    if (currentModalComponent.images && Array.isArray(currentModalComponent.images)) {
        allImages.push(...currentModalComponent.images);
    }
    if (allImages.length === 0) return;
    currentImageIndex = (currentImageIndex - 1 + allImages.length) % allImages.length;
    modalComponentImage.src = allImages[currentImageIndex];
    document.querySelectorAll('.gallery-thumb').forEach((t, idx) => {
        t.classList.toggle('active', idx === currentImageIndex);
    });
}

function nextImage() {
    if (!currentModalComponent) return;
    const allImages = [];
    if (currentModalComponent.image_url) allImages.push(currentModalComponent.image_url);
    if (currentModalComponent.images && Array.isArray(currentModalComponent.images)) {
        allImages.push(...currentModalComponent.images);
    }
    if (allImages.length === 0) return;
    currentImageIndex = (currentImageIndex + 1) % allImages.length;
    modalComponentImage.src = allImages[currentImageIndex];
    document.querySelectorAll('.gallery-thumb').forEach((t, idx) => {
        t.classList.toggle('active', idx === currentImageIndex);
    });
}

if (closeModalBtn) closeModalBtn.addEventListener('click', closeComponentModal);
if (modalPrevBtn) modalPrevBtn.addEventListener('click', prevImage);
if (modalNextBtn) modalNextBtn.addEventListener('click', nextImage);
window.addEventListener('click', (e) => {
    if (e.target === componentModal) closeComponentModal();
});
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeComponentModal();
    if (e.key === 'ArrowLeft' && componentModal.style.display === 'flex') prevImage();
    if (e.key === 'ArrowRight' && componentModal.style.display === 'flex') nextImage();
});

// --- Закрытие модального окна состава заказа ---
if (closeOrderComponentsBtn) {
    closeOrderComponentsBtn.addEventListener('click', () => {
        orderComponentsModal.style.display = 'none';
    });
}
window.addEventListener('click', (e) => {
    if (e.target === orderComponentsModal) {
        orderComponentsModal.style.display = 'none';
    }
});

let currentUser = null;
let allComponents = [];
let allOrders = [];
let allUsers = [];

function updateUserUI() {
    if (!isAuthenticated()) {
        window.location.href = '/';
        return;
    }
    const userRole = getUserRole();
    if (userRole === 'admin') {
        userInfo.innerHTML = `
            <a href="/admin.html" style="color:#ef4444; text-decoration:none; margin-right:1rem;">👑 Админ-панель</a>
            <span>👤 Администратор</span>
            <button id="logoutBtn">Выйти</button>
        `;
    } else if (userRole === 'manager') {
        userInfo.innerHTML = `
            <a href="/admin.html" style="color:#e67e22; text-decoration:none; margin-right:1rem;">📋 Управление заказами</a>
            <span>👤 Менеджер</span>
            <button id="logoutBtn">Выйти</button>
        `;
    } else {
        window.location.href = '/';
        return;
    }
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            logout();
            window.location.href = '/';
        });
    }
}

async function checkAdminAccess() {
    try {
        const user = await get('/api/users/me');
        if (user.role !== 'admin' && user.role !== 'manager') {
            alert('Доступ запрещён');
            window.location.href = '/';
        }
        currentUser = user;
    } catch (err) {
        window.location.href = '/';
    }
}

async function showOrderComponents(assemblyId, orderId) {
    if (!assemblyId) {
        alert('ID сборки не найден');
        return;
    }
    let listContainer = document.getElementById('orderComponentsList');
    if (!listContainer) {
        const modalContent = document.querySelector('#orderComponentsModal .modal-content');
        if (modalContent) {
            listContainer = document.createElement('div');
            listContainer.id = 'orderComponentsList';
            modalContent.appendChild(listContainer);
        } else {
            alert('Ошибка: не найден контейнер для списка компонентов');
            return;
        }
    }
    try {
        const components = await get(`/api/assemblies/${assemblyId}/components`);
        if (!components.length) {
            listContainer.innerHTML = '<p>Нет компонентов в сборке</p>';
        } else {
            const ramItems = components.filter(c => c.category === 'ram');
            const storageItems = components.filter(c => c.category === 'storage');
            const otherItems = components.filter(c => c.category !== 'ram' && c.category !== 'storage');
            
            let html = '<ul style="list-style:none; padding:0;">';
            
            if (ramItems.length) {
                const totalQty = ramItems.reduce((s, r) => s + (r.quantity || 1), 0);
                const sample = ramItems[0];
                const imgSrc = sample.image_url || '';
                html += `
                    <li style="display:flex; gap:0.5rem; align-items:center; padding:4px 0; border-bottom:1px solid #eee;">
                        <img src="${imgSrc}" style="width:40px; height:40px; object-fit:contain; background:#f8f9fa; border-radius:4px;" onerror="this.style.display='none'">
                        <div><strong>ОЗУ:</strong> ${totalQty} × ${escapeHtml(sample.model_name)} — ${(sample.price * totalQty).toLocaleString()} ₽</div>
                        <button class="component-details-btn" data-id="${sample.id}" style="margin-left:auto; padding:2px 8px; font-size:0.7rem; background:#e8f0fe; border:1px solid #2563eb; border-radius:4px; cursor:pointer;">🔍</button>
                    </li>
                `;
            }
            
            if (storageItems.length) {
                const storageMap = new Map();
                storageItems.forEach(s => {
                    const key = s.id;
                    if (storageMap.has(key)) {
                        storageMap.get(key).quantity += (s.quantity || 1);
                    } else {
                        storageMap.set(key, { ...s, quantity: (s.quantity || 1) });
                    }
                });
                for (const [key, comp] of storageMap.entries()) {
                    const imgSrc = comp.image_url || '';
                    html += `
                        <li style="display:flex; gap:0.5rem; align-items:center; padding:4px 0; border-bottom:1px solid #eee;">
                            <img src="${imgSrc}" style="width:40px; height:40px; object-fit:contain; background:#f8f9fa; border-radius:4px;" onerror="this.style.display='none'">
                            <div><strong>Накопитель:</strong> ${comp.quantity} × ${escapeHtml(comp.model_name)} — ${(comp.price * comp.quantity).toLocaleString()} ₽</div>
                            <button class="component-details-btn" data-id="${comp.id}" style="margin-left:auto; padding:2px 8px; font-size:0.7rem; background:#e8f0fe; border:1px solid #2563eb; border-radius:4px; cursor:pointer;">🔍</button>
                        </li>
                    `;
                }
            }
            
            otherItems.forEach(comp => {
                const imgSrc = comp.image_url || '';
                html += `
                    <li style="display:flex; gap:0.5rem; align-items:center; padding:4px 0; border-bottom:1px solid #eee;">
                        <img src="${imgSrc}" style="width:40px; height:40px; object-fit:contain; background:#f8f9fa; border-radius:4px;" onerror="this.style.display='none'">
                        <div><strong>${comp.category.toUpperCase()}:</strong> ${escapeHtml(comp.model_name)} — ${comp.price.toLocaleString()} ₽</div>
                        <button class="component-details-btn" data-id="${comp.id}" style="margin-left:auto; padding:2px 8px; font-size:0.7rem; background:#e8f0fe; border:1px solid #2563eb; border-radius:4px; cursor:pointer;">🔍</button>
                    </li>
                `;
            });
            
            html += '</ul>';
            listContainer.innerHTML = html;
            
            document.querySelectorAll('.component-details-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = parseInt(btn.dataset.id);
                    try {
                        const comp = await get(`/api/components/${id}`);
                        if (comp) {
                            // Скрываем модалку состава, чтобы не мешала
                            orderComponentsModal.style.display = 'none';
                            openComponentModal(comp);
                            // После закрытия модалки компонента – показываем снова
                            const closeModalObserver = new MutationObserver(() => {
                                if (componentModal.style.display === 'none') {
                                    orderComponentsModal.style.display = 'flex';
                                    closeModalObserver.disconnect();
                                }
                            });
                            closeModalObserver.observe(componentModal, { attributes: true, attributeFilter: ['style'] });
                        } else {
                            alert('Компонент не найден');
                        }
                    } catch (err) {
                        console.error('Ошибка загрузки компонента:', err);
                        alert('Ошибка загрузки данных компонента');
                    }
                });
            });
        }
        orderComponentsTitle.textContent = `Состав заказа #${orderId}`;
        orderComponentsModal.style.display = 'flex';
    } catch (err) {
        console.error('Ошибка загрузки состава:', err);
        alert('Ошибка загрузки состава: ' + err.message);
        listContainer.innerHTML = '<p>❌ Не удалось загрузить состав</p>';
        orderComponentsModal.style.display = 'flex';
    }
}

// ---------- Остальные функции ----------
async function loadOrders() {
    if (!ordersTableBody) return;
    try {
        const status = statusFilter ? statusFilter.value : '';
        let url = '/api/admin/orders';
        if (status) url += `?status=${status}`;
        const orders = await get(url);
        allOrders = orders;
        
        let users = [];
        try {
            users = await get('/api/admin/users');
        } catch (e) {}
        const userMap = new Map();
        users.forEach(u => userMap.set(u.id, u.username));
        
        let filtered = [...allOrders];
        
        const searchTerm = orderSearchInput?.value.toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(order => 
                order.id.toString().includes(searchTerm) ||
                order.phone.includes(searchTerm) ||
                (userMap.get(order.user_id) || '').toLowerCase().includes(searchTerm) ||
                (order.assembly_title || '').toLowerCase().includes(searchTerm)
            );
        }
        
        const dateFrom = orderDateFrom?.value;
        const dateTo = orderDateTo?.value;
        if (dateFrom) {
            const fromDate = new Date(dateFrom);
            fromDate.setHours(0, 0, 0, 0);
            filtered = filtered.filter(order => new Date(order.created_at) >= fromDate);
        }
        if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            filtered = filtered.filter(order => new Date(order.created_at) <= toDate);
        }
        
        if (!filtered.length) {
            ordersTableBody.innerHTML = '<tr><td colspan="8">Нет заказов</td></tr>';
            return;
        }
        
        ordersTableBody.innerHTML = filtered.map(order => `
            <tr>
                <td>${order.id}</td>
                <td>${userMap.get(order.user_id) || 'Пользователь #' + order.user_id}</td>
                <td>${escapeHtml(order.assembly_title || 'Сборка #' + order.assembly_id)}</td>
                <td>${order.total_price.toLocaleString()} ₽</td>
                <td>${order.phone}</td>
                <td>
                    <select class="order-status-select" data-id="${order.id}" data-status="${order.status}">
                        <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>⏳ Ожидает</option>
                        <option value="confirmed" ${order.status === 'confirmed' ? 'selected' : ''}>✅ Подтверждён</option>
                        <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>🚚 Отправлен</option>
                        <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>📦 Доставлен</option>
                        <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>❌ Отменён</option>
                    </select>
                </td>
                <td>${new Date(order.created_at).toLocaleDateString()}</td>
                <td><button class="view-order-components-btn" data-order-id="${order.id}" data-assembly-id="${order.assembly_id}">📋 Состав</button></td>
            </tr>
        `).join('');
        
        document.querySelectorAll('.order-status-select').forEach(select => {
            select.addEventListener('change', async () => {
                const orderId = select.dataset.id;
                const newStatus = select.value;
                if (confirm(`Изменить статус заказа #${orderId} на ${newStatus}?`)) {
                    try {
                        await put(`/api/admin/orders/${orderId}`, { status: newStatus });
                        alert('✅ Статус обновлён');
                        loadOrders();
                    } catch (err) {
                        alert('❌ Ошибка: ' + err.message);
                        select.value = select.dataset.status;
                    }
                } else {
                    select.value = select.dataset.status;
                }
            });
        });
        
        document.querySelectorAll('.view-order-components-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const assemblyId = btn.dataset.assemblyId;
                const orderId = btn.dataset.orderId;
                await showOrderComponents(assemblyId, orderId);
            });
        });
    } catch (err) {
        if (ordersTableBody) ordersTableBody.innerHTML = '<tr><td colspan="8">❌ Ошибка загрузки</td></tr>';
        console.error(err);
    }
}

async function loadUsers() {
    const userRole = getUserRole();
    if (userRole !== 'admin') {
        if (usersTableBody) usersTableBody.innerHTML = '<tr><td colspan="6">Доступ только для администратора</td></tr>';
        return;
    }
    
    if (!usersTableBody) return;
    try {
        const users = await get('/api/admin/users');
        allUsers = users;
        
        let filtered = [...allUsers];
        
        const searchTerm = userSearchInput?.value.toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(user => 
                user.username.toLowerCase().includes(searchTerm) ||
                user.email.toLowerCase().includes(searchTerm) ||
                (user.phone || '').includes(searchTerm)
            );
        }
        
        const roleFilter = userRoleFilter?.value;
        if (roleFilter) {
            filtered = filtered.filter(user => user.role === roleFilter);
        }
        
        filtered.sort((a, b) => a.id - b.id);
        
        if (!filtered.length) {
            usersTableBody.innerHTML = '<tr><td colspan="6">Нет пользователей</td></tr>';
            return;
        }
        
        usersTableBody.innerHTML = filtered.map(user => `
            <tr>
                <td>${user.id}</td>
                <td>${escapeHtml(user.username)}</td>
                <td>${user.email}</td>
                <td>${user.phone || '—'}</td>
                <td>
                    <select class="user-role-select" data-id="${user.id}" data-role="${user.role}" ${user.id === currentUser?.id ? 'disabled' : ''}>
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>👤 Пользователь</option>
                        <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>📋 Менеджер</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>👑 Администратор</option>
                    </select>
                </td>
                <td>${user.orders_count} / ${user.total_spent?.toLocaleString()} ₽</td>
            </tr>
        `).join('');
        
        document.querySelectorAll('.user-role-select').forEach(select => {
            if (select.disabled) return;
            select.addEventListener('change', async () => {
                const userId = select.dataset.id;
                const newRole = select.value;
                if (confirm(`Изменить роль пользователя #${userId} на ${newRole}?`)) {
                    try {
                        await put(`/api/admin/users/${userId}/role`, { role: newRole });
                        alert('✅ Роль обновлена');
                        loadUsers();
                    } catch (err) {
                        alert('❌ Ошибка: ' + err.message);
                        select.value = select.dataset.role;
                    }
                } else {
                    select.value = select.dataset.role;
                }
            });
        });
    } catch (err) {
        if (usersTableBody) usersTableBody.innerHTML = '<tr><td colspan="6">❌ Ошибка загрузки</td></tr>';
        console.error(err);
    }
}

async function loadComponents() {
    if (!componentsList) return;
    const userRole = getUserRole();
    if (userRole !== 'admin') {
        if (componentsList) componentsList.innerHTML = '<p>Доступ только для администратора</p>';
        return;
    }
    
    try {
        const categories = ['cpu', 'gpu', 'motherboard', 'ram', 'storage', 'psu', 'cooler', 'case'];
        let allComps = [];
        for (const cat of categories) {
            const comps = await get(`/api/components?category=${cat}`);
            allComps.push(...comps);
        }
        
        const categoryFilter = componentCategoryFilter?.value;
        const searchTerm = componentSearchInput?.value.toLowerCase();
        let filtered = allComps;
        if (categoryFilter) {
            filtered = filtered.filter(c => c.category === categoryFilter);
        }
        if (searchTerm) {
            filtered = filtered.filter(c => 
                c.model_name.toLowerCase().includes(searchTerm) || 
                c.manufacturer.toLowerCase().includes(searchTerm)
            );
        }
        
        const sortBy = componentSortBy?.value;
        if (sortBy === 'price_asc') {
            filtered.sort((a, b) => a.price - b.price);
        } else if (sortBy === 'price_desc') {
            filtered.sort((a, b) => b.price - a.price);
        } else if (sortBy === 'name_asc') {
            filtered.sort((a, b) => a.model_name.localeCompare(b.model_name));
        } else if (sortBy === 'name_desc') {
            filtered.sort((a, b) => b.model_name.localeCompare(a.model_name));
        } else if (sortBy === 'created_desc') {
            filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }
        
        allComponents = filtered;
        
        if (!filtered.length) {
            componentsList.innerHTML = '<p>Нет компонентов</p>';
            return;
        }
        
        const categoryNames = {
            cpu: '🖥️ Процессор',
            gpu: '🎮 Видеокарта',
            motherboard: '🔌 Материнская плата',
            ram: '💾 ОЗУ',
            storage: '💿 Накопитель',
            psu: '⚡ Блок питания',
            cooler: '❄️ Охлаждение',
            case: '🏠 Корпус'
        };
        
        componentsList.innerHTML = filtered.map(comp => {
            const imgSrc = comp.image_url || '';
            return `
                <div class="component-card admin-component-card" data-id="${comp.id}">
                    <div style="display:flex; gap:1rem; align-items:center;">
                        <div style="flex:0 0 80px;">
                            <img src="${imgSrc}" style="width:80px; height:80px; object-fit:contain; background:#f8f9fa; border-radius:4px;" onerror="this.style.display='none'">
                        </div>
                        <div style="flex:1;">
                            <h3>${categoryNames[comp.category]} | ${escapeHtml(comp.manufacturer)} ${escapeHtml(comp.model_name)}</h3>
                            <p>💰 ${comp.price.toLocaleString()} ₽</p>
                            <div class="specs-preview">${Object.entries(comp.specs_json).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')}</div>
                        </div>
                    </div>
                    <div class="component-actions" style="margin-top:0.5rem;">
                        <button class="component-details-btn" data-id="${comp.id}" style="padding:4px 12px; background:#e8f0fe; border:1px solid #2563eb; border-radius:4px; cursor:pointer;">📋 Подробнее</button>
                        <button class="edit-component-btn" data-id="${comp.id}">✏️ Редактировать</button>
                        <button class="delete-component-btn" data-id="${comp.id}">🗑️ Удалить</button>
                    </div>
                </div>
            `;
        }).join('');
        
        document.querySelectorAll('.delete-component-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                if (confirm('Удалить компонент?')) {
                    try {
                        await del(`/api/components/${id}`);
                        alert('✅ Компонент удалён');
                        loadComponents();
                    } catch (err) {
                        alert('❌ Ошибка: ' + err.message);
                    }
                }
            });
        });
        
        document.querySelectorAll('.edit-component-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                showEditComponentModal(id);
            });
        });
        
        document.querySelectorAll('.component-details-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                try {
                    const comp = await get(`/api/components/${id}`);
                    if (comp) {
                        openComponentModal(comp);
                    } else {
                        alert('Компонент не найден');
                    }
                } catch (err) {
                    console.error('Ошибка загрузки компонента:', err);
                    alert('Ошибка загрузки данных компонента');
                }
            });
        });
    } catch (err) {
        if (componentsList) componentsList.innerHTML = '<p>❌ Ошибка загрузки</p>';
        console.error(err);
    }
}

function getSpecsFieldsForCategory(category) {
    const fields = {
        cpu: [
            { name: 'socket', label: 'Сокет', type: 'text', placeholder: 'LGA1700, AM4, AM5', required: true },
            { name: 'cores', label: 'Количество ядер', type: 'number', placeholder: '4, 6, 8, 12, 16', required: true },
            { name: 'threads', label: 'Количество потоков', type: 'number', placeholder: '8, 12, 16, 24, 32', required: true },
            { name: 'base_clock', label: 'Базовая частота (ГГц)', type: 'number', step: '0.1', placeholder: '3.0', required: true },
            { name: 'boost_clock', label: 'Макс. частота (ГГц)', type: 'number', step: '0.1', placeholder: '4.5', required: true },
            { name: 'tdp', label: 'TDP (Вт)', type: 'number', placeholder: '65, 105, 125', required: true },
            { name: 'benchmark_score', label: 'Benchmark Score', type: 'number', placeholder: '15000, 20000', required: true },
            { name: 'integrated_graphics', label: 'Встроенная графика', type: 'checkbox' }
        ],
        gpu: [
            { name: 'chipset', label: 'Чипсет', type: 'text', placeholder: 'GA106, AD104, Navi 32', required: true },
            { name: 'memory_size', label: 'Объём памяти (ГБ)', type: 'number', placeholder: '8, 12, 16, 24', required: true },
            { name: 'memory_type', label: 'Тип памяти', type: 'text', placeholder: 'GDDR6, GDDR6X', required: true },
            { name: 'tdp', label: 'TDP (Вт)', type: 'number', placeholder: '150, 200, 300', required: true },
            { name: 'benchmark_score', label: 'Benchmark Score', type: 'number', placeholder: '15000, 25000', required: true },
            { name: 'length', label: 'Длина (мм)', type: 'number', placeholder: '250, 300, 350', required: true },
            { name: 'power_connectors', label: 'Разъёмы питания', type: 'text', placeholder: '1x8-pin, 2x8-pin, 1x12-pin' }
        ],
        motherboard: [
            { name: 'socket', label: 'Сокет', type: 'text', placeholder: 'LGA1700, AM4, AM5', required: true },
            { name: 'chipset', label: 'Чипсет', type: 'text', placeholder: 'B660, B760, Z790, B550, B650', required: true },
            { name: 'form_factor', label: 'Форм-фактор', type: 'select', options: ['ATX', 'mATX', 'ITX', 'E-ATX'], required: true },
            { name: 'ram_slots', label: 'Слоты ОЗУ', type: 'number', placeholder: '2, 4', required: true },
            { name: 'max_ram', label: 'Макс. ОЗУ (ГБ)', type: 'number', placeholder: '64, 128, 192', required: true },
            { name: 'ram_type', label: 'Тип ОЗУ', type: 'select', options: ['DDR4', 'DDR5'], required: true },
            { name: 'm2_slots', label: 'Слоты M.2', type: 'number', placeholder: '1, 2, 3, 4', required: true },
            { name: 'sata_ports', label: 'Порты SATA', type: 'number', placeholder: '4, 6, 8', required: true },
            { name: 'max_gpu_length', label: 'Макс. длина GPU (мм)', type: 'number', placeholder: '350', required: true }
        ],
        ram: [
            { name: 'capacity', label: 'Объём (ГБ)', type: 'number', placeholder: '8, 16, 32, 64', required: true },
            { name: 'type', label: 'Тип', type: 'select', options: ['DDR4', 'DDR5'], required: true },
            { name: 'speed', label: 'Частота (МГц)', type: 'number', placeholder: '3200, 3600, 4800, 6000', required: true },
            { name: 'modules', label: 'Количество модулей', type: 'number', placeholder: '1, 2, 4', required: true },
            { name: 'tdp', label: 'TDP (Вт)', type: 'number', placeholder: '3, 5, 8, 10', required: true }
        ],
        storage: [
            { name: 'capacity', label: 'Объём (ГБ)', type: 'number', placeholder: '256, 512, 1024, 2048', required: true },
            { name: 'type', label: 'Тип', type: 'select', options: ['NVMe', 'SATA'], required: true },
            { name: 'interface', label: 'Интерфейс', type: 'text', placeholder: 'PCIe 3.0, PCIe 4.0, SATA 3', required: true },
            { name: 'read_speed', label: 'Скорость чтения (МБ/с)', type: 'number', placeholder: '3500, 5000, 7000', required: true },
            { name: 'tdp', label: 'TDP (Вт)', type: 'number', placeholder: '3, 5, 7', required: true }
        ],
        psu: [
            { name: 'power_watts', label: 'Мощность (Вт)', type: 'number', placeholder: '450, 550, 650, 750, 850, 1000', required: true },
            { name: 'efficiency', label: 'Эффективность', type: 'select', options: ['80+ Bronze', '80+ Silver', '80+ Gold', '80+ Platinum', '80+ Titanium'], required: true },
            { name: 'modular', label: 'Модульный', type: 'checkbox' },
            { name: 'tdp', label: 'TDP (Вт)', type: 'number', placeholder: '15, 18, 20, 25', required: true }
        ],
        cooler: [
            { name: 'type', label: 'Тип', type: 'select', options: ['air', 'liquid'], required: true },
            { name: 'tdp_max', label: 'Макс. TDP (Вт)', type: 'number', placeholder: '150, 200, 250', required: true },
            { name: 'socket_support', label: 'Поддерживаемые сокеты', type: 'text', placeholder: 'LGA1700,AM4,AM5', required: true },
            { name: 'height', label: 'Высота (мм)', type: 'number', placeholder: '150, 160, 165', required: true },
            { name: 'noise', label: 'Шум (дБ)', type: 'number', placeholder: '20, 25, 30', required: true }
        ],
        case: [
            { name: 'form_factor', label: 'Форм-фактор', type: 'select', options: ['ATX', 'mATX', 'ITX', 'E-ATX'], required: true },
            { name: 'size', label: 'Размер', type: 'text', placeholder: 'Mid Tower, Full Tower, Mini Tower', required: true },
            { name: 'max_gpu_length', label: 'Макс. длина GPU (мм)', type: 'number', placeholder: '350, 400', required: true },
            { name: 'max_cpu_cooler_height', label: 'Макс. высота кулера (мм)', type: 'number', placeholder: '160, 165, 180', required: true },
            { name: 'supported_form_factors', label: 'Поддерживаемые форм-факторы', type: 'text', placeholder: 'ATX,mATX,ITX', required: true }
        ]
    };
    return fields[category] || [];
}

function generateSpecsFields(category) {
    const container = document.getElementById('specsFields');
    if (!container) return;
    const fields = getSpecsFieldsForCategory(category);
    
    let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">';
    for (const field of fields) {
        if (field.type === 'checkbox') {
            html += `
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <input type="checkbox" id="spec_${field.name}" name="${field.name}">
                    <label for="spec_${field.name}">${field.label}</label>
                </div>
            `;
        } else if (field.type === 'select') {
            html += `
                <div>
                    <label style="font-size: 0.8rem;">${field.label} ${field.required ? '*' : ''}</label>
                    <select id="spec_${field.name}" name="${field.name}" style="width: 100%; padding: 0.4rem; border-radius: 0.5rem; border: 1px solid #ccc;">
                        <option value="">Выберите...</option>
                        ${field.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                    </select>
                </div>
            `;
        } else {
            html += `
                <div>
                    <label style="font-size: 0.8rem;">${field.label} ${field.required ? '*' : ''}</label>
                    <input type="${field.type}" id="spec_${field.name}" name="${field.name}" placeholder="${field.placeholder}" style="width: 100%; padding: 0.4rem; border-radius: 0.5rem; border: 1px solid #ccc;" ${field.step ? `step="${field.step}"` : ''}>
                </div>
            `;
        }
    }
    html += '</div>';
    container.innerHTML = html;
}

function collectSpecsFromForm() {
    const category = document.getElementById('compCategory')?.value;
    if (!category) return {};
    const fields = getSpecsFieldsForCategory(category);
    const specs = {};
    for (const field of fields) {
        const element = document.getElementById(`spec_${field.name}`);
        if (element) {
            if (field.type === 'checkbox') {
                specs[field.name] = element.checked;
            } else if (element.value) {
                let value = element.value;
                if (field.type === 'number') {
                    value = parseFloat(value);
                }
                specs[field.name] = value;
            }
        }
    }
    return specs;
}

function showAddComponentModal() {
    const userRole = getUserRole();
    if (userRole !== 'admin') {
        alert('Доступ только для администратора');
        return;
    }
    
    const modal = document.getElementById('addComponentModal');
    if (!modal) return;
    
    document.getElementById('compManufacturer').value = '';
    document.getElementById('compModelName').value = '';
    document.getElementById('compPrice').value = '';
    document.getElementById('compImageUrl').value = '';
    document.getElementById('compImages').value = '';
    document.getElementById('compSpecs').value = '';
    
    const category = document.getElementById('compCategory').value;
    generateSpecsFields(category);
    
    modal.style.display = 'flex';
    
    const closeBtn = document.getElementById('closeComponentModal');
    if (closeBtn) {
        closeBtn.onclick = () => { modal.style.display = 'none'; };
    }
    
    const cancelBtn = document.getElementById('cancelComponentBtn');
    if (cancelBtn) {
        cancelBtn.onclick = () => { modal.style.display = 'none'; };
    }
    
    const categorySelect = document.getElementById('compCategory');
    categorySelect.onchange = () => {
        generateSpecsFields(categorySelect.value);
    };
    
    const submitBtn = document.getElementById('submitComponentBtn');
    submitBtn.onclick = async () => {
        const category = document.getElementById('compCategory').value;
        const manufacturer = document.getElementById('compManufacturer').value.trim();
        const modelName = document.getElementById('compModelName').value.trim();
        const price = parseFloat(document.getElementById('compPrice').value);
        const imageUrl = document.getElementById('compImageUrl').value.trim();
        const imagesStr = document.getElementById('compImages').value.trim();
        const extraSpecs = document.getElementById('compSpecs').value;
        
        if (!manufacturer || !modelName || !price) {
            alert('Заполните обязательные поля (производитель, модель, цена)');
            return;
        }
        
        const specs = collectSpecsFromForm();
        if (extraSpecs) {
            try {
                const parsed = JSON.parse(extraSpecs);
                Object.assign(specs, parsed);
            } catch (e) {
                console.warn('Ошибка парсинга JSON');
            }
        }
        
        let images = [];
        if (imageUrl) images.push(imageUrl);
        if (imagesStr) {
            try {
                const parsed = JSON.parse(imagesStr);
                if (Array.isArray(parsed)) {
                    images = [...images, ...parsed];
                }
            } catch (e) {
                const parts = imagesStr.split(',').map(s => s.trim()).filter(s => s);
                images = [...images, ...parts];
            }
        }
        
        try {
            await post('/api/components', {
                category,
                manufacturer,
                model_name: modelName,
                price,
                image_url: imageUrl || null,
                images: images,
                specs_json: specs
            });
            alert('✅ Компонент добавлен');
            modal.style.display = 'none';
            loadComponents();
        } catch (err) {
            alert('❌ Ошибка: ' + err.message);
        }
    };
}

async function showEditComponentModal(componentId) {
    const userRole = getUserRole();
    if (userRole !== 'admin') {
        alert('Доступ только для администратора');
        return;
    }
    
    const component = allComponents.find(c => c.id === componentId);
    if (!component) return;
    
    const modal = document.getElementById('editComponentModal');
    const content = document.getElementById('editComponentContent');
    if (!modal || !content) return;
    
    const imagesJson = Array.isArray(component.images) ? JSON.stringify(component.images) : '';
    
    content.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <label>Категория</label>
            <select id="editCompCategory" style="width: 100%; padding: 0.5rem;">
                <option value="cpu" ${component.category === 'cpu' ? 'selected' : ''}>Процессор</option>
                <option value="gpu" ${component.category === 'gpu' ? 'selected' : ''}>Видеокарта</option>
                <option value="motherboard" ${component.category === 'motherboard' ? 'selected' : ''}>Материнская плата</option>
                <option value="ram" ${component.category === 'ram' ? 'selected' : ''}>ОЗУ</option>
                <option value="storage" ${component.category === 'storage' ? 'selected' : ''}>Накопитель</option>
                <option value="psu" ${component.category === 'psu' ? 'selected' : ''}>Блок питания</option>
                <option value="cooler" ${component.category === 'cooler' ? 'selected' : ''}>Охлаждение</option>
                <option value="case" ${component.category === 'case' ? 'selected' : ''}>Корпус</option>
            </select>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
            <div>
                <label>Производитель *</label>
                <input type="text" id="editCompManufacturer" value="${escapeHtml(component.manufacturer)}" style="width: 100%; padding: 0.5rem;">
            </div>
            <div>
                <label>Модель *</label>
                <input type="text" id="editCompModelName" value="${escapeHtml(component.model_name)}" style="width: 100%; padding: 0.5rem;">
            </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
            <div>
                <label>Цена (₽) *</label>
                <input type="number" id="editCompPrice" value="${component.price}" style="width: 100%; padding: 0.5rem;">
            </div>
            <div>
                <label>Основное фото (URL)</label>
                <input type="text" id="editCompImageUrl" value="${component.image_url || ''}" style="width: 100%; padding: 0.5rem;">
            </div>
        </div>
        <div style="margin-bottom: 1rem;">
            <label>Дополнительные фото (JSON-массив или через запятую)</label>
            <input type="text" id="editCompImages" value="${escapeHtml(imagesJson)}" style="width: 100%; padding: 0.5rem;">
        </div>
        <div style="margin-bottom: 1rem;">
            <label>Характеристики (JSON)</label>
            <textarea id="editCompSpecs" rows="5" style="width: 100%; padding: 0.5rem; font-family: monospace;">${JSON.stringify(component.specs_json, null, 2)}</textarea>
        </div>
    `;
    
    modal.style.display = 'flex';
    
    const closeBtn = document.getElementById('closeEditComponentModal');
    if (closeBtn) {
        closeBtn.onclick = () => { modal.style.display = 'none'; };
    }
    
    const cancelBtn = document.getElementById('cancelEditComponentBtn');
    if (cancelBtn) {
        cancelBtn.onclick = () => { modal.style.display = 'none'; };
    }
    
    const saveBtn = document.getElementById('saveEditComponentBtn');
    saveBtn.onclick = async () => {
        const category = document.getElementById('editCompCategory').value;
        const manufacturer = document.getElementById('editCompManufacturer').value.trim();
        const modelName = document.getElementById('editCompModelName').value.trim();
        const price = parseFloat(document.getElementById('editCompPrice').value);
        const imageUrl = document.getElementById('editCompImageUrl').value.trim();
        const imagesStr = document.getElementById('editCompImages').value.trim();
        const specsJson = document.getElementById('editCompSpecs').value;
        
        if (!manufacturer || !modelName || !price) {
            alert('Заполните обязательные поля');
            return;
        }
        
        let specs = {};
        try {
            specs = JSON.parse(specsJson);
        } catch (e) {
            alert('Ошибка парсинга JSON');
            return;
        }
        
        let images = [];
        if (imageUrl) images.push(imageUrl);
        if (imagesStr) {
            try {
                const parsed = JSON.parse(imagesStr);
                if (Array.isArray(parsed)) {
                    images = [...images, ...parsed];
                }
            } catch (e) {
                const parts = imagesStr.split(',').map(s => s.trim()).filter(s => s);
                images = [...images, ...parts];
            }
        }
        
        try {
            await put(`/api/components/${componentId}`, {
                category,
                manufacturer,
                model_name: modelName,
                price,
                image_url: imageUrl || null,
                images: images,
                specs_json: specs
            });
            alert('✅ Компонент обновлён');
            modal.style.display = 'none';
            loadComponents();
        } catch (err) {
            alert('❌ Ошибка: ' + err.message);
        }
    };
}

async function loadStatistics() {
    if (!statisticsContent) return;
    try {
        const period = periodSelect ? periodSelect.value : 'week';
        const stats = await get(`/api/admin/statistics?period=${period}`);
        
        const summaryHtml = `
            <div class="stats-summary">
                <div class="stat-card">
                    <h3>📦 Всего заказов</h3>
                    <p>${stats.total_orders}</p>
                </div>
                <div class="stat-card">
                    <h3>💰 Выручка</h3>
                    <p>${stats.total_revenue.toLocaleString()} ₽</p>
                </div>
                <div class="stat-card">
                    <h3>📊 Средний чек</h3>
                    <p>${stats.avg_check.toLocaleString()} ₽</p>
                </div>
                <div class="stat-card">
                    <h3>👤 Уникальных пользователей</h3>
                    <p>${stats.unique_users}</p>
                </div>
                <div class="stat-card">
                    <h3>⏳ Ожидают</h3>
                    <p>${stats.pending_orders}</p>
                </div>
                <div class="stat-card">
                    <h3>✅ Подтверждены</h3>
                    <p>${stats.confirmed_orders}</p>
                </div>
                <div class="stat-card">
                    <h3>🚚 Отправлены</h3>
                    <p>${stats.shipped_orders}</p>
                </div>
                <div class="stat-card">
                    <h3>📦 Доставлены</h3>
                    <p>${stats.delivered_orders}</p>
                </div>
                <div class="stat-card">
                    <h3>❌ Отменены</h3>
                    <p>${stats.cancelled_orders}</p>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0;">
                <div>
                    <h3>📈 Динамика заказов</h3>
                    <canvas id="statsChart" width="400" height="200"></canvas>
                </div>
                <div>
                    <h3>📊 Распределение по статусам</h3>
                    <canvas id="statusChart" width="400" height="200"></canvas>
                </div>
            </div>
            
            <h3>🏆 Топ-10 сборок по заказам</h3>
            <div class="top-assemblies-list">
                ${stats.top_assemblies.map(a => `
                    <div class="top-assembly-item">
                        <span>${escapeHtml(a.title)}</span>
                        <span>📦 ${a.orders_count} заказов</span>
                        <span>💰 ${a.revenue.toLocaleString()} ₽</span>
                    </div>
                `).join('')}
            </div>
            
            <h3 style="margin-top: 1.5rem;">💎 Топ-3 самых дорогих заказа</h3>
            <div class="top-assemblies-list">
                ${stats.top_orders.map(o => `
                    <div class="top-assembly-item">
                        <span>Заказ #${o.order_id}</span>
                        <span>👤 ${escapeHtml(o.user)}</span>
                        <span>💰 ${o.total_price.toLocaleString()} ₽</span>
                        <span>📌 ${getStatusText(o.status)}</span>
                    </div>
                `).join('')}
            </div>
        `;
        
        statisticsContent.innerHTML = summaryHtml;
        
        const chartData = period === 'year' ? stats.monthly_stats : stats.daily_stats;
        const labels = chartData.map(item => period === 'year' ? item.month : item.date);
        const counts = chartData.map(item => item.count);
        const revenues = chartData.map(item => item.revenue);
        
        const ctx = document.getElementById('statsChart')?.getContext('2d');
        if (ctx) {
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Количество заказов',
                            data: counts,
                            borderColor: '#2563eb',
                            backgroundColor: 'rgba(37, 99, 235, 0.1)',
                            yAxisID: 'y',
                            tension: 0.3
                        },
                        {
                            label: 'Выручка (₽)',
                            data: revenues,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            yAxisID: 'y1',
                            tension: 0.3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y: { title: { display: true, text: 'Количество заказов' } },
                        y1: { position: 'right', title: { display: true, text: 'Выручка (₽)' } }
                    }
                }
            });
        }
        
        const statusCtx = document.getElementById('statusChart')?.getContext('2d');
        if (statusCtx) {
            const statusData = stats.status_distribution;
            new Chart(statusCtx, {
                type: 'doughnut',
                data: {
                    labels: ['⏳ Ожидают', '✅ Подтверждены', '🚚 Отправлены', '📦 Доставлены', '❌ Отменены'],
                    datasets: [{
                        data: [
                            statusData.pending,
                            statusData.confirmed,
                            statusData.shipped,
                            statusData.delivered,
                            statusData.cancelled
                        ],
                        backgroundColor: ['#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444']
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }
    } catch (err) {
        statisticsContent.innerHTML = '<p>❌ Ошибка загрузки статистики</p>';
        console.error(err);
    }
}

function getStatusText(status) {
    const statuses = {
        'pending': '⏳ Ожидает',
        'confirmed': '✅ Подтверждён',
        'shipped': '🚚 Отправлен',
        'delivered': '📦 Доставлен',
        'cancelled': '❌ Отменён'
    };
    return statuses[status] || status;
}

function initTabs() {
    const userRole = getUserRole();
    const tabs = document.querySelectorAll('.admin-tab-btn');
    const contents = document.querySelectorAll('.admin-tab-content');
    
    tabs.forEach(btn => {
        btn.style.display = 'none';
    });
    
    if (userRole === 'admin') {
        const ordersTab = document.querySelector('.admin-tab-btn[data-tab="orders"]');
        const usersTab = document.querySelector('.admin-tab-btn[data-tab="users"]');
        const componentsTab = document.querySelector('.admin-tab-btn[data-tab="components"]');
        const statisticsTab = document.querySelector('.admin-tab-btn[data-tab="statistics"]');
        if (ordersTab) ordersTab.style.display = 'inline-block';
        if (usersTab) usersTab.style.display = 'inline-block';
        if (componentsTab) componentsTab.style.display = 'inline-block';
        if (statisticsTab) statisticsTab.style.display = 'inline-block';
        
        const addBtn = document.getElementById('addComponentBtn');
        if (addBtn) addBtn.style.display = 'inline-block';
    } else if (userRole === 'manager') {
        const ordersTab = document.querySelector('.admin-tab-btn[data-tab="orders"]');
        const statisticsTab = document.querySelector('.admin-tab-btn[data-tab="statistics"]');
        if (ordersTab) ordersTab.style.display = 'inline-block';
        if (statisticsTab) statisticsTab.style.display = 'inline-block';
        
        const addBtn = document.getElementById('addComponentBtn');
        if (addBtn) addBtn.style.display = 'none';
    }
    
    const visibleTabs = Array.from(tabs).filter(btn => btn.style.display !== 'none');
    if (visibleTabs.length) {
        visibleTabs[0].classList.add('active');
        const tabId = visibleTabs[0].dataset.tab;
        const targetTab = document.getElementById(`${tabId}Tab`);
        if (targetTab) targetTab.classList.add('active');
        
        if (tabId === 'orders') loadOrders();
        else if (tabId === 'users') loadUsers();
        else if (tabId === 'components') loadComponents();
        else if (tabId === 'statistics') loadStatistics();
    }
    
    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            contents.forEach(content => content.classList.remove('active'));
            tabs.forEach(b => b.classList.remove('active'));
            const targetTab = document.getElementById(`${tabId}Tab`);
            if (targetTab) targetTab.classList.add('active');
            btn.classList.add('active');
            
            if (tabId === 'orders') loadOrders();
            else if (tabId === 'users') loadUsers();
            else if (tabId === 'components') loadComponents();
            else if (tabId === 'statistics') loadStatistics();
        });
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Исправление z-index для модального окна компонента
const style = document.createElement('style');
style.textContent = `
    #componentModal { z-index: 1002 !important; }
    #orderComponentsModal { z-index: 1000 !important; }
`;
document.head.appendChild(style);

async function init() {
    await checkAdminAccess();
    updateUserUI();
    initTabs();
    
    if (refreshOrdersBtn) refreshOrdersBtn.addEventListener('click', loadOrders);
    if (refreshStatsBtn) refreshStatsBtn.addEventListener('click', loadStatistics);
    if (periodSelect) periodSelect.addEventListener('change', loadStatistics);
    if (statusFilter) statusFilter.addEventListener('change', loadOrders);
    if (addComponentBtn) addComponentBtn.addEventListener('click', showAddComponentModal);
    if (refreshComponentsBtn) refreshComponentsBtn.addEventListener('click', loadComponents);
    if (componentCategoryFilter) componentCategoryFilter.addEventListener('change', loadComponents);
    if (componentSearchInput) {
        componentSearchInput.addEventListener('input', debounce(loadComponents, 300));
    }
    if (componentSortBy) componentSortBy.addEventListener('change', loadComponents);
    
    if (applyOrderFiltersBtn) applyOrderFiltersBtn.addEventListener('click', loadOrders);
    if (resetOrderFiltersBtn) {
        resetOrderFiltersBtn.addEventListener('click', () => {
            if (orderSearchInput) orderSearchInput.value = '';
            if (orderDateFrom) orderDateFrom.value = '';
            if (orderDateTo) orderDateTo.value = '';
            loadOrders();
        });
    }
    
    if (applyUserFiltersBtn) applyUserFiltersBtn.addEventListener('click', loadUsers);
    if (resetUserFiltersBtn) {
        resetUserFiltersBtn.addEventListener('click', () => {
            if (userSearchInput) userSearchInput.value = '';
            if (userRoleFilter) userRoleFilter.value = '';
            loadUsers();
        });
    }
    
    const activeTab = document.querySelector('.admin-tab-btn.active');
    if (activeTab) {
        const tabId = activeTab.dataset.tab;
        if (tabId === 'orders') loadOrders();
        else if (tabId === 'users') loadUsers();
        else if (tabId === 'components') loadComponents();
        else if (tabId === 'statistics') loadStatistics();
    } else {
        loadOrders();
    }
}

init();