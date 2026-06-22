import { get, post } from './api.js';
import { isAuthenticated, getUserRole, login, register, logout } from './auth.js';

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

// --- Основная логика главной страницы ---

const popularAssemblies = document.getElementById('popularAssemblies');
const userInfo = document.getElementById('userInfo');
const wizardBtn = document.getElementById('wizardBtn');
const helpBtn = document.getElementById('helpBtn');
const heroWizardBtn = document.getElementById('heroWizardBtn');
const heroHelpBtn = document.getElementById('heroHelpBtn');
const authModal = document.getElementById('authModal');

// --- Аутентификация ---
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
        }
    } else {
        userInfo.innerHTML = `<button id="loginBtn">🔑 Войти</button>`;
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => showAuthModal());
        }
    }
}

// --- Модальное окно авторизации ---
let authCallback = null;
function showAuthModal(callback) {
    if (!authModal) {
        alert('Ошибка: форма авторизации не найдена');
        return;
    }
    authCallback = callback || null;
    authModal.style.display = 'flex';
    
    const closeBtn = document.getElementById('closeAuthModalBtn');
    if (closeBtn) {
        closeBtn.onclick = () => {
            authModal.style.display = 'none';
            authCallback = null;
        };
    }
    
    window.onclick = function(event) {
        if (event.target == authModal) {
            authModal.style.display = 'none';
            authCallback = null;
        }
    };
    
    if (!window.authInitialized) {
        window.authInitialized = true;
        const authSubmitBtn = document.getElementById('authSubmit');
        const toggleBtn = document.getElementById('toggleAuthMode');
        const authTitle = document.getElementById('authTitle');
        const authEmail = document.getElementById('authEmail');
        const authLogin = document.getElementById('authLogin');
        const authPassword = document.getElementById('authPassword');
        
        if (!authSubmitBtn || !toggleBtn || !authTitle || !authEmail || !authLogin || !authPassword) {
            console.error('Ошибка: элементы формы авторизации не найдены');
            return;
        }
        
        authSubmitBtn.onclick = async () => {
            const loginOrEmail = authLogin.value.trim();
            const email = authEmail.value.trim();
            const password = authPassword.value;
            const isLogin = authTitle.textContent === 'Вход';
            
            if (!loginOrEmail || !password) {
                alert('Заполните все поля');
                return;
            }
            
            try {
                if (isLogin) {
                    await login(loginOrEmail, password);
                } else {
                    if (!email) {
                        alert('Введите email');
                        return;
                    }
                    await register(loginOrEmail, email, password);
                    await login(loginOrEmail, password);
                }
                authModal.style.display = 'none';
                authLogin.value = '';
                authEmail.value = '';
                authPassword.value = '';
                if (authCallback) await authCallback();
                authCallback = null;
                updateUserUI();
                loadPopularAssemblies();
                
                const role = getUserRole();
                if (role === 'admin' || role === 'manager') {
                    window.location.href = '/admin.html';
                } else {
                    window.location.href = '/profile.html';
                }
            } catch (err) {
                console.error('❌ Ошибка:', err);
                alert('❌ Ошибка: ' + (err.message || 'Неизвестная ошибка'));
            }
        };
        
        toggleBtn.onclick = () => {
            const isLogin = authTitle.textContent === 'Вход';
            authTitle.textContent = isLogin ? 'Регистрация' : 'Вход';
            authSubmitBtn.textContent = isLogin ? 'Зарегистрироваться' : 'Войти';
            toggleBtn.textContent = isLogin ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться';
            authEmail.style.display = isLogin ? 'block' : 'none';
            authLogin.placeholder = isLogin ? 'Логин или Email' : 'Логин';
        };
    }
}

// --- Загрузка популярных сборок ---
async function loadPopularAssemblies() {
    if (!popularAssemblies) return;
    try {
        const assemblies = await get('/api/assemblies/public?limit=6');
        if (!assemblies.length) {
            popularAssemblies.innerHTML = '<p>Нет опубликованных сборок</p>';
            return;
        }
        
        for (const assembly of assemblies) {
            try {
                const components = await get(`/api/assemblies/${assembly.id}/components`);
                assembly._components = components;
                const caseComp = components.find(c => c.category === 'case');
                assembly._previewImage = caseComp?.image_url || '';
            } catch (e) {
                console.warn('Не удалось загрузить компоненты для сборки', assembly.id);
                assembly._components = [];
                assembly._previewImage = '';
            }
        }
        
        popularAssemblies.innerHTML = assemblies.map(assembly => {
            const comps = assembly._components || [];
            const previewImage = assembly._previewImage || '';
            
            const compList = comps.slice(0, 3).map(c => {
                const qty = c.quantity || 1;
                return `${qty}×${c.model_name}`;
            }).join(', ');
            const more = comps.length > 3 ? ` и ещё ${comps.length - 3}` : '';
            
            return `
                <div class="assembly-card" data-id="${assembly.id}">
                    <div style="display:flex; gap:1rem; align-items:flex-start;">
                        <div style="flex:0 0 120px;">
                            <img src="${previewImage}" alt="Превью сборки" style="width:100%; height:100px; object-fit:contain; background:#f8f9fa; border-radius:8px;" onerror="this.style.display='none'">
                        </div>
                        <div style="flex:1;">
                            <h3>${escapeHtml(assembly.title)}</h3>
                            <div class="assembly-meta">
                                <span>💰 ${assembly.total_price.toLocaleString()} ₽</span>
                                <span>⭐ ${assembly.performance_score ?? '—'}/100</span>
                            </div>
                            <p style="font-size:0.85rem; color:#64748b; margin-top:0.25rem;">${compList}${more}</p>
                        </div>
                    </div>
                    <div style="margin-top:0.5rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
                        <button class="view-btn" data-id="${assembly.id}">👁️ Просмотр сборки</button>
                        ${comps.length > 0 ? `<button class="view-components-btn" data-id="${assembly.id}">🔍 Показать комплектующие</button>` : ''}
                    </div>
                    <div id="components-preview-${assembly.id}" style="display:none; margin-top:0.5rem; border-top:1px solid #eee; padding-top:0.5rem; flex-wrap:wrap; gap:4px;">
                        ${comps.map(c => `
                            <button class="component-details-btn" data-id="${c.id}" style="padding:2px 8px; font-size:0.7rem; background:#e8f0fe; border:1px solid #2563eb; border-radius:4px; cursor:pointer;">🔍 ${c.model_name.substring(0, 20)}</button>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
        
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                window.location.href = `/build.html?id=${id}`;
            });
        });
        
        document.querySelectorAll('.view-components-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                const previewDiv = document.getElementById(`components-preview-${id}`);
                if (previewDiv) {
                    if (previewDiv.style.display === 'none' || previewDiv.style.display === '') {
                        previewDiv.style.display = 'flex';
                        this.textContent = '🔽 Скрыть комплектующие';
                    } else {
                        previewDiv.style.display = 'none';
                        this.textContent = '🔍 Показать комплектующие';
                    }
                }
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
                    alert('Ошибка загрузки данных компонента. Проверьте подключение к серверу.');
                }
            });
        });
        
    } catch (err) {
        console.error('Ошибка загрузки популярных сборок:', err);
        popularAssemblies.innerHTML = '<p>❌ Ошибка загрузки популярных сборок</p>';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// --- Инициализация ---
document.addEventListener('DOMContentLoaded', function() {
    updateUserUI();
    loadPopularAssemblies();
});

// --- Кнопка "Собрать ПК" (шапка) ---
if (wizardBtn) {
    wizardBtn.addEventListener('click', function(e) {
        e.preventDefault();
        window.location.href = '/builder.html';
    });
} else {
    console.warn('Кнопка "Собрать ПК" (шапка) не найдена');
}

// --- Кнопка "Помощь в выборе" (шапка) ---
if (helpBtn) {
    helpBtn.addEventListener('click', function(e) {
        e.preventDefault();
        window.location.href = '/builder.html?mode=help';
    });
} else {
    console.warn('Кнопка "Помощь в выборе" (шапка) не найдена');
}

// --- Кнопка "Собрать ПК" (герой) ---
if (heroWizardBtn) {
    heroWizardBtn.addEventListener('click', function(e) {
        e.preventDefault();
        window.location.href = '/builder.html';
    });
} else {
    console.warn('Кнопка "Собрать ПК" (герой) не найдена');
}

// --- Кнопка "Помощь в выборе" (герой) ---
if (heroHelpBtn) {
    heroHelpBtn.addEventListener('click', function(e) {
        e.preventDefault();
        window.location.href = '/builder.html?mode=help';
    });
} else {
    console.warn('Кнопка "Помощь в выборе" (герой) не найдена');
}

// Экспорт для использования в других скриптах
export { openComponentModal, closeComponentModal };