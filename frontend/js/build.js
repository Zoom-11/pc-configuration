import { get, post } from './api.js';
import { isAuthenticated, getUserRole, logout } from './auth.js';

const urlParams = new URLSearchParams(window.location.search);
const assemblyId = urlParams.get('id');
const from = urlParams.get('from');

const buildTitle = document.getElementById('buildTitle');
const buildMeta = document.getElementById('buildMeta');
const componentsTable = document.getElementById('componentsTable');
const ratingBlock = document.getElementById('ratingBlock');
const cloneBtn = document.getElementById('cloneBtn');
const backBtn = document.getElementById('backBtn');
const userInfo = document.getElementById('userInfo');

let currentAssembly = null;
let currentUseCase = 'gaming';
let currentPriceCategory = 'mid';

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

// --- Основная логика ---
function updateUserUI() {
    if (isAuthenticated()) {
        const role = getUserRole();
        if (role === 'admin' || role === 'manager') {
            userInfo.innerHTML = `
                <a href="/admin.html" style="color:${role === 'admin' ? '#ef4444' : '#e67e22'}; text-decoration:none; margin-right:1rem;">${role === 'admin' ? '👑 Админ-панель' : '📋 Управление заказами'}</a>
                <span>👤 ${role === 'admin' ? 'Администратор' : 'Менеджер'}</span>
                <button id="logoutBtn">Выйти</button>
            `;
            document.getElementById('logoutBtn')?.addEventListener('click', () => {
                logout();
                window.location.href = '/';
            });
            if (cloneBtn) cloneBtn.style.display = 'none';
        } else {
            userInfo.innerHTML = `
                <a href="/profile.html" style="color:#2563eb; text-decoration:none; margin-right:1rem;">👤 Личный кабинет</a>
                <span>👤 Пользователь</span>
                <button id="logoutBtn">Выйти</button>
            `;
            document.getElementById('logoutBtn')?.addEventListener('click', () => {
                logout();
                window.location.href = '/';
            });
            if (cloneBtn) cloneBtn.style.display = 'inline-block';
        }
    } else {
        userInfo.innerHTML = `<button id="loginBtn">Войти</button>`;
        document.getElementById('loginBtn')?.addEventListener('click', () => {
            window.location.href = '/';
        });
        if (cloneBtn) cloneBtn.style.display = 'none';
    }
}

// Функция для определения ценовой категории на основе цены сборки
function getPriceCategoryFromTotalPrice(totalPrice) {
    if (totalPrice < 50000) return 'budget';
    if (totalPrice < 100000) return 'mid';
    return 'high';
}

async function loadBuild() {
    if (!assemblyId) {
        buildTitle.innerText = 'Не указан ID сборки';
        return;
    }
    try {
        const assembly = await get(`/api/assemblies/${assemblyId}`);
        currentAssembly = assembly;
        buildTitle.innerText = assembly.title;
        
        // Автоматически определяем ценовую категорию на основе цены сборки
        currentPriceCategory = getPriceCategoryFromTotalPrice(assembly.total_price);
        
        buildMeta.innerHTML = `
            <p>👤 Автор: ID ${assembly.user_id} | 💰 Цена: ${assembly.total_price.toLocaleString()} ₽</p>
            <p>⭐ Рейтинг: ${assembly.performance_score ?? '—'}/100 | 📅 ${new Date(assembly.created_at).toLocaleDateString()}</p>
            <p>${assembly.is_public ? '🌍 Публичная сборка' : '🔒 Черновик (не публичный)'}</p>
        `;
        const components = await get(`/api/assemblies/${assemblyId}/components`);
        renderComponents(components);
        renderRating(assembly);
        await loadRating(assemblyId);
    } catch (err) {
        buildTitle.innerText = 'Ошибка загрузки сборки';
        console.error(err);
        buildMeta.innerHTML = '<p style="color:red;">Не удалось загрузить сборку. Проверьте ID или права доступа.</p>';
    }
}

function renderComponents(components) {
    if (!components.length) {
        componentsTable.innerHTML = '<p>Нет компонентов</p>';
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
    
    const ramModules = components.filter(c => c.category === 'ram');
    const storageModules = components.filter(c => c.category === 'storage');
    const otherComponents = components.filter(c => c.category !== 'ram' && c.category !== 'storage');
    
    let html = '';
    
    for (const comp of otherComponents) {
        const imgSrc = comp.image_url || '';
        html += `
            <div class="component-card">
                <div class="component-card-image">
                    <img src="${imgSrc}" alt="${comp.model_name}" style="width:100%; max-height:120px; object-fit:contain; background:#f8f9fa; border-radius:4px;" onerror="this.style.display='none'">
                </div>
                <h3>${categoryNames[comp.category] || comp.category}</h3>
                <div>${escapeHtml(comp.manufacturer)} ${escapeHtml(comp.model_name)}</div>
                <div class="specs">${Object.entries(comp.specs_json).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')}</div>
                <div class="price">💰 ${comp.price.toLocaleString()} ₽</div>
                <button class="details-btn" data-id="${comp.id}" style="margin-top:8px; padding:4px 12px; background:#e8f0fe; border:1px solid #2563eb; border-radius:4px; cursor:pointer;">📋 Подробнее</button>
            </div>
        `;
    }
    
    if (ramModules.length > 0) {
        const totalRamQuantity = ramModules.reduce((sum, r) => sum + (r.quantity || 1), 0);
        const ramSample = ramModules[0];
        const totalRamPrice = ramSample.price * totalRamQuantity;
        const imgSrc = ramSample.image_url || '';
        html += `
            <div class="component-card">
                <div class="component-card-image">
                    <img src="${imgSrc}" alt="${ramSample.model_name}" style="width:100%; max-height:120px; object-fit:contain; background:#f8f9fa; border-radius:4px;" onerror="this.style.display='none'">
                </div>
                <h3>${categoryNames.ram}</h3>
                <div>${totalRamQuantity} x ${escapeHtml(ramSample.manufacturer)} ${escapeHtml(ramSample.model_name)}</div>
                <div class="specs">${ramSample.specs_json?.capacity || ''}GB ${ramSample.specs_json?.type || ''} ${ramSample.specs_json?.speed || ''}MHz</div>
                <div class="price">💰 ${totalRamPrice.toLocaleString()} ₽</div>
                <button class="details-btn" data-id="${ramSample.id}" style="margin-top:8px; padding:4px 12px; background:#e8f0fe; border:1px solid #2563eb; border-radius:4px; cursor:pointer;">📋 Подробнее</button>
            </div>
        `;
    }
    
    if (storageModules.length > 0) {
        const storageMap = new Map();
        storageModules.forEach(s => {
            const key = s.id;
            if (storageMap.has(key)) {
                storageMap.get(key).quantity += (s.quantity || 1);
            } else {
                storageMap.set(key, { ...s, quantity: (s.quantity || 1) });
            }
        });
        
        for (const [key, comp] of storageMap.entries()) {
            const totalStoragePrice = comp.price * comp.quantity;
            const storageType = comp.specs_json?.type || 'SATA';
            const imgSrc = comp.image_url || '';
            html += `
                <div class="component-card">
                    <div class="component-card-image">
                        <img src="${imgSrc}" alt="${comp.model_name}" style="width:100%; max-height:120px; object-fit:contain; background:#f8f9fa; border-radius:4px;" onerror="this.style.display='none'">
                    </div>
                    <h3>${categoryNames.storage} (${storageType})</h3>
                    <div>${comp.quantity} x ${escapeHtml(comp.manufacturer)} ${escapeHtml(comp.model_name)}</div>
                    <div class="specs">${comp.specs_json?.capacity || ''}GB</div>
                    <div class="price">💰 ${totalStoragePrice.toLocaleString()} ₽</div>
                    <button class="details-btn" data-id="${comp.id}" style="margin-top:8px; padding:4px 12px; background:#e8f0fe; border:1px solid #2563eb; border-radius:4px; cursor:pointer;">📋 Подробнее</button>
                </div>
            `;
        }
    }
    
    componentsTable.innerHTML = html;
    
    document.querySelectorAll('.details-btn').forEach(btn => {
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
}

async function loadRating(assemblyId) {
    try {
        // Используем автоматически определенную ценовую категорию
        const rating = await get(`/api/assemblies/${assemblyId}/rating?use_case=${currentUseCase}&price_category=${currentPriceCategory}`);
        if (rating && rating.score !== undefined) {
            const useCaseNames = {
                gaming: '🎮 Игры',
                workstation: '💼 Рабочая станция',
                office: '🏢 Офис',
                universal: '🔄 Универсальный'
            };
            const priceNames = {
                budget: '💸 Бюджетная',
                mid: '💵 Средняя',
                high: '💎 Высокая'
            };
            
            // Обновляем мета-информацию с ценовой категорией
            const metaPriceCategory = document.querySelector('.build-meta p:first-child');
            if (metaPriceCategory && currentAssembly) {
                metaPriceCategory.textContent = `👤 Автор: ID ${currentAssembly.user_id} | 💰 Цена: ${currentAssembly.total_price.toLocaleString()} ₽ | 📊 Категория: ${priceNames[currentPriceCategory]}`;
            }
            
            let ratingHtml = `<div style="margin-top:0.5rem;"><strong>⭐ Рейтинг для ${useCaseNames[currentUseCase]} (${priceNames[currentPriceCategory]}):</strong> ${rating.score}/100</div>`;
            
            if (rating.components_scores) {
                ratingHtml += '<div style="font-size:0.85rem; margin-top:0.25rem;">';
                const compNames = { cpu: 'CPU', gpu: 'GPU', ram: 'RAM', storage: 'SSD', psu: 'PSU' };
                for (const [comp, score] of Object.entries(rating.components_scores)) {
                    if (compNames[comp] && score > 0) ratingHtml += `${compNames[comp]}: ${Math.round(score)}% `;
                }
                ratingHtml += '</div>';
            }
            
            if (rating.recommendations && rating.recommendations.length) {
                ratingHtml += `<div style="margin-top:0.5rem; font-size:0.85rem; color:#e67e22;"><strong>💡 Рекомендации:</strong><ul>${rating.recommendations.map(r => `<li>${escapeHtml(r.message)}</li>`).join('')}</ul></div>`;
            }
            
            const existingRatingDiv = document.getElementById('dynamicRating');
            if (existingRatingDiv) {
                existingRatingDiv.innerHTML = ratingHtml;
            } else {
                const newDiv = document.createElement('div');
                newDiv.id = 'dynamicRating';
                newDiv.innerHTML = ratingHtml;
                ratingBlock.insertAdjacentElement('afterend', newDiv);
            }
        }
    } catch (err) {
        console.error('Ошибка загрузки рейтинга:', err);
    }
}

function renderRating(assembly) {
    ratingBlock.innerHTML = `
        <div>
            <strong>Оценка пользователей:</strong> <span id="userRatingValue">—</span>/5
            ${isAuthenticated() && getUserRole() === 'user' ? `<button id="rateBtn" style="margin-left:0.5rem;">⭐ Оценить</button>` : ''}
        </div>
        <div style="margin-top:0.5rem;">
            <label for="ratingUseCaseSelect"><strong>Цель сборки:</strong></label>
            <select id="ratingUseCaseSelect" style="margin-left:0.5rem; padding:0.2rem;">
                <option value="gaming">🎮 Игровой ПК</option>
                <option value="workstation">💼 Рабочая станция</option>
                <option value="office">🏢 Офисный ПК</option>
                <option value="universal">🔄 Универсальный</option>
            </select>
        </div>
        <div style="margin-top:0.5rem; color:#64748b; font-size:0.85rem;">
            <span>💡 Ценовая категория определяется автоматически на основе цены сборки</span>
        </div>
        <div id="rateModal" class="modal" style="display:none;">
            <div class="modal-content">
                <h3>Оцените сборку (1-5)</h3>
                <input type="number" id="ratingScore" min="1" max="5" step="1" style="width:100%; margin:0.5rem 0;">
                <button id="submitRating">Отправить</button>
                <button id="closeModal">Отмена</button>
            </div>
        </div>
    `;
    
    loadAverageRating(assembly.id);
    
    const rateBtn = document.getElementById('rateBtn');
    const modal = document.getElementById('rateModal');
    if (rateBtn) {
        rateBtn.onclick = () => modal.style.display = 'flex';
    }
    
    const closeModal = document.getElementById('closeModal');
    if (closeModal) {
        closeModal.onclick = () => modal.style.display = 'none';
    }
    
    const submitRating = document.getElementById('submitRating');
    if (submitRating) {
        submitRating.onclick = async () => {
            const score = parseInt(document.getElementById('ratingScore').value);
            if (score < 1 || score > 5) return alert('Оценка от 1 до 5');
            try {
                await post(`/api/assemblies/${assembly.id}/rate`, { score });
                alert('Спасибо за оценку!');
                modal.style.display = 'none';
                loadAverageRating(assembly.id);
            } catch (err) {
                alert('Ошибка: ' + err.message);
            }
        };
    }
    
    const useCaseSelect = document.getElementById('ratingUseCaseSelect');
    if (useCaseSelect) {
        useCaseSelect.value = currentUseCase;
        useCaseSelect.addEventListener('change', (e) => {
            currentUseCase = e.target.value;
            loadRating(assembly.id);
        });
    }
}

async function loadAverageRating(assemblyId) {
    try {
        const avgSpan = document.getElementById('userRatingValue');
        if (avgSpan) avgSpan.textContent = '—';
    } catch (err) {
        console.error(err);
    }
}

if (cloneBtn) {
    cloneBtn.addEventListener('click', async () => {
        if (!isAuthenticated()) {
            alert('Войдите, чтобы клонировать сборку');
            return;
        }
        const role = getUserRole();
        if (role !== 'user') {
            alert('Клонирование доступно только обычным пользователям');
            return;
        }
        try {
            const newAssembly = await post('/api/assemblies', { title: `Клон: ${currentAssembly.title}` });
            const components = await get(`/api/assemblies/${assemblyId}/components`);
            for (const comp of components) {
                const qty = comp.quantity || 1;
                for (let i = 0; i < qty; i++) {
                    await post(`/api/assemblies/${newAssembly.id}/components`, { component_id: comp.id, quantity: 1 });
                }
            }
            alert('Сборка склонирована. Переход в конструктор...');
            window.location.href = `/builder.html?assembly=${newAssembly.id}`;
        } catch (err) {
            alert('Ошибка клонирования: ' + err.message);
        }
    });
}

backBtn?.addEventListener('click', () => {
    if (from === 'profile') {
        window.location.href = '/profile.html';
    } else {
        window.location.href = '/';
    }
});

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

updateUserUI();
loadBuild();