import { get, del, put } from './api.js';
import { isAuthenticated, logout } from './auth.js';

const userInfo = document.getElementById('userInfo');
const assembliesDiv = document.getElementById('assembliesList');

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

function updateUI() {
    if (!isAuthenticated()) {
        window.location.href = '/';
        return;
    }
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

async function loadAssemblies() {
    try {
        const assemblies = await get('/api/assemblies/my');
        if (!assemblies.length) {
            assembliesDiv.innerHTML = '<p>📭 У вас пока нет сборок. Создайте новую в <a href="/builder.html">конструкторе</a>.</p>';
            return;
        }
        
        const assembliesWithComponents = await Promise.all(assemblies.map(async (assembly) => {
            try {
                const comps = await get(`/api/assemblies/${assembly.id}/components`);
                return { ...assembly, components: comps };
            } catch (e) {
                return { ...assembly, components: [] };
            }
        }));
        
        assembliesDiv.innerHTML = assembliesWithComponents.map(assembly => {
            const comps = assembly.components || [];
            
            // Находим фото корпуса для превью
            const caseComp = comps.find(c => c.category === 'case');
            const previewImage = caseComp?.image_url || '';
            
            // Краткий список компонентов для отображения (без количества ОЗУ и накопителей)
            const compList = comps.slice(0, 5).map(c => {
                return c.model_name;
            }).join(', ');
            const more = comps.length > 5 ? ` и ещё ${comps.length - 5}` : '';
            
            return `
                <div class="component-card assembly-card" data-id="${assembly.id}">
                    <div style="display:flex; gap:1rem; align-items:flex-start;">
                        <div style="flex:0 0 120px;">
                            <img src="${previewImage}" alt="Превью сборки" style="width:100%; height:100px; object-fit:contain; background:#f8f9fa; border-radius:8px;" onerror="this.style.display='none'">
                        </div>
                        <div style="flex:1;">
                            <h3>${escapeHtml(assembly.title)}</h3>
                            <p>💰 ${assembly.total_price.toLocaleString()} ₽</p>
                            <p>⭐ ${assembly.performance_score ?? '—'}/100</p>
                            <p>📌 Статус: ${assembly.is_public ? '🌍 Опубликована' : '🔒 Черновик'}</p>
                            <p style="font-size:0.85rem; color:#64748b;">${compList}${more}</p>
                        </div>
                    </div>
                    <div class="assembly-actions" style="margin-top:1rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
                        <button class="edit-btn" data-id="${assembly.id}">✏️ Редактировать</button>
                        <button class="view-btn" data-id="${assembly.id}">👁️ Просмотр</button>
                        <button class="publish-btn" data-id="${assembly.id}" data-pub="${assembly.is_public}">
                            ${assembly.is_public ? '📁 Снять с публикации' : '🚀 Опубликовать'}
                        </button>
                        <button class="delete-btn" data-id="${assembly.id}">🗑️ Удалить</button>
                        <button class="order-btn" data-id="${assembly.id}" data-price="${assembly.total_price}">🛒 Заказать</button>
                    </div>
                    <div style="margin-top:0.5rem; display:flex; gap:4px; flex-wrap:wrap;">
                        ${comps.slice(0, 6).map(c => `
                            <button class="component-details-btn" data-id="${c.id}" style="padding:2px 8px; font-size:0.7rem; background:#e8f0fe; border:1px solid #2563eb; border-radius:4px; cursor:pointer;">🔍 ${c.model_name.substring(0, 15)}</button>
                        `).join('')}
                        ${comps.length > 6 ? `<span style="font-size:0.7rem; color:#888;">+${comps.length-6} ещё</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                window.location.href = `/builder.html?assembly=${id}`;
            });
        });
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                window.location.href = `/build.html?id=${id}&from=profile`;
            });
        });
        document.querySelectorAll('.publish-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const currentPub = btn.dataset.pub === 'true';
                await put(`/api/assemblies/${id}`, { is_public: !currentPub });
                loadAssemblies();
            });
        });
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('🗑️ Удалить сборку?')) {
                    const id = btn.dataset.id;
                    await del(`/api/assemblies/${id}`);
                    loadAssemblies();
                }
            });
        });
        document.querySelectorAll('.order-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const price = parseInt(btn.dataset.price);
                if (confirm(`🛒 Оформить заказ на сборку "${id}" на сумму ${price.toLocaleString()} ₽?`)) {
                    alert(`✅ Заказ на сборку #${id} оформлен. С вами свяжутся.`);
                }
            });
        });
        document.querySelectorAll('.component-details-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                try {
                    const comp = await get(`/api/components/${id}`);
                    openComponentModal(comp);
                } catch (err) {
                    alert('Ошибка загрузки данных компонента');
                }
            });
        });
    } catch (err) {
        assembliesDiv.innerHTML = '<p>❌ Ошибка загрузки сборок</p>';
        console.error(err);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

updateUI();
loadAssemblies();