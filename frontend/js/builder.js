import { get, post, put, del, patch } from './api.js';
import { isAuthenticated, getUserRole, login, register, logout } from './auth.js';

// Проверка доступа для админов и менеджеров
const userRole = getUserRole();
if (userRole === 'admin' || userRole === 'manager') {
    alert('Доступ запрещён. Администраторы и менеджеры не могут собирать ПК.');
    window.location.href = '/admin.html';
}

const urlParams = new URLSearchParams(window.location.search);
const editAssemblyId = urlParams.get('assembly');
const urlUseCase = urlParams.get('use_case');

let currentAssemblyId = null;
let selectedCategory = 'cpu';
let allComponents = [];
let assemblyComponents = {};
let totalPrice = 0;
let currentUseCase = 'gaming';

const categoriesList = document.getElementById('categoriesList');
const componentListDiv = document.getElementById('componentList');
const assemblyDiv = document.getElementById('assemblyComponents');
const totalPriceSpan = document.getElementById('totalPrice');
const performanceScoreSpan = document.getElementById('performanceScore');
const compatibilityDiv = document.getElementById('compatibilityIssues');
const saveBtn = document.getElementById('saveAssemblyBtn');
const publishBtn = document.getElementById('publishBtn');
const orderBtn = document.getElementById('orderBtn');
const searchInput = document.getElementById('searchInput');
const manufacturerFilter = document.getElementById('manufacturerFilter');
const priceMinInput = document.getElementById('priceMin');
const priceMaxInput = document.getElementById('priceMax');
const applyFiltersBtn = document.getElementById('applyFilters');
const clearFiltersBtn = document.getElementById('clearFilters');
const userInfoDiv = document.getElementById('userInfo');
const authModal = document.getElementById('authModal');
const useCaseSelect = document.getElementById('useCaseSelect');

let pendingSaveCallback = null;

// Установка цели из URL
if (urlUseCase && ['gaming', 'workstation', 'office', 'universal'].includes(urlUseCase)) {
    currentUseCase = urlUseCase;
    if (useCaseSelect) useCaseSelect.value = currentUseCase;
}

// Функция для определения ценовой категории
function getPriceCategoryFromTotalPrice(totalPrice) {
    if (totalPrice < 50000) return 'budget';
    if (totalPrice < 100000) return 'mid';
    return 'high';
}

function saveGuestAssembly() {
    localStorage.setItem('guest_assembly', JSON.stringify({ components: assemblyComponents, totalPrice }));
}

function loadGuestAssembly() {
    const saved = localStorage.getItem('guest_assembly');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            assemblyComponents = data.components || {};
            totalPrice = data.totalPrice || 0;
            renderAssemblyPanel(assemblyComponents);
            totalPriceSpan.textContent = totalPrice.toLocaleString();
        } catch(e) { console.error(e); }
    }
}

function clearGuestAssembly() {
    localStorage.removeItem('guest_assembly');
}

// --- Проверка совместимости ---
function checkTwoComponentsCompatibility(comp1, comp2) {
    // Защита от undefined
    if (!comp1 || !comp2) {
        return { compatible: true, reason: '' };
    }
    
    if ((comp1.category === 'cpu' && comp2.category === 'motherboard') ||
        (comp1.category === 'motherboard' && comp2.category === 'cpu')) {
        const cpu = comp1.category === 'cpu' ? comp1 : comp2;
        const mb = comp1.category === 'motherboard' ? comp1 : comp2;
        if (cpu.specs_json?.socket && mb.specs_json?.socket && cpu.specs_json.socket !== mb.specs_json.socket) {
            return { compatible: false, reason: `Сокет процессора ${cpu.specs_json.socket} не подходит для материнской платы с сокетом ${mb.specs_json.socket}` };
        }
        return { compatible: true, reason: '' };
    }
    if ((comp1.category === 'ram' && comp2.category === 'motherboard') ||
        (comp1.category === 'motherboard' && comp2.category === 'ram')) {
        const ram = comp1.category === 'ram' ? comp1 : comp2;
        const mb = comp1.category === 'motherboard' ? comp1 : comp2;
        if (ram.specs_json?.type && mb.specs_json?.ram_type && ram.specs_json.type !== mb.specs_json.ram_type) {
            return { compatible: false, reason: `Тип памяти ${ram.specs_json.type} не поддерживается материнской платой (требуется ${mb.specs_json.ram_type})` };
        }
        const ramSpeed = ram.specs_json?.speed || 0;
        const maxSpeed = mb.specs_json?.max_ram_speed || 0;
        if (maxSpeed && ramSpeed > maxSpeed) {
            return { compatible: false, reason: `ОЗУ ${ramSpeed}МГц быстрее максимально поддерживаемой материнской платой (${maxSpeed}МГц)` };
        }
        return { compatible: true, reason: '' };
    }
    if ((comp1.category === 'cooler' && comp2.category === 'cpu') ||
        (comp1.category === 'cpu' && comp2.category === 'cooler')) {
        const cooler = comp1.category === 'cooler' ? comp1 : comp2;
        const cpu = comp1.category === 'cpu' ? comp1 : comp2;
        const coolerSockets = cooler.specs_json?.socket_support || [];
        const cpuSocket = cpu.specs_json?.socket;
        if (coolerSockets.length && cpuSocket && !coolerSockets.includes(cpuSocket)) {
            return { compatible: false, reason: `Кулер не поддерживает сокет ${cpuSocket}` };
        }
        const coolerTdp = cooler.specs_json?.tdp_max || 0;
        const cpuTdp = cpu.specs_json?.tdp || 0;
        if (coolerTdp && cpuTdp && coolerTdp < cpuTdp) {
            return { compatible: false, reason: `Кулер рассчитан на TDP ${coolerTdp}Вт, а процессор потребляет ${cpuTdp}Вт` };
        }
        return { compatible: true, reason: '' };
    }
    if ((comp1.category === 'case' && comp2.category === 'motherboard') ||
        (comp1.category === 'motherboard' && comp2.category === 'case')) {
        const caseComp = comp1.category === 'case' ? comp1 : comp2;
        const mb = comp1.category === 'motherboard' ? comp1 : comp2;
        const supportedFF = caseComp.specs_json?.supported_form_factors || ["ATX", "mATX", "ITX"];
        const mbFF = mb.specs_json?.form_factor || "ATX";
        if (!supportedFF.includes(mbFF)) {
            return { compatible: false, reason: `Корпус не поддерживает форм-фактор материнской платы ${mbFF}` };
        }
        return { compatible: true, reason: '' };
    }
    if ((comp1.category === 'case' && comp2.category === 'gpu') ||
        (comp1.category === 'gpu' && comp2.category === 'case')) {
        const caseComp = comp1.category === 'case' ? comp1 : comp2;
        const gpu = comp1.category === 'gpu' ? comp1 : comp2;
        const caseMaxGpu = caseComp.specs_json?.max_gpu_length || 350;
        const gpuLength = gpu.specs_json?.length || 300;
        if (gpuLength > caseMaxGpu) {
            return { compatible: false, reason: `Видеокарта длиной ${gpuLength}мм не помещается в корпус (макс. ${caseMaxGpu}мм)` };
        }
        return { compatible: true, reason: '' };
    }
    if ((comp1.category === 'case' && comp2.category === 'cooler') ||
        (comp1.category === 'cooler' && comp2.category === 'case')) {
        const caseComp = comp1.category === 'case' ? comp1 : comp2;
        const cooler = comp1.category === 'cooler' ? comp1 : comp2;
        const caseMaxCooler = caseComp.specs_json?.max_cpu_cooler_height || 160;
        const coolerHeight = cooler.specs_json?.height || 150;
        if (coolerHeight > caseMaxCooler) {
            return { compatible: false, reason: `Кулер высотой ${coolerHeight}мм не помещается в корпус (макс. ${caseMaxCooler}мм)` };
        }
        return { compatible: true, reason: '' };
    }
    return { compatible: true, reason: '' };
}

function isComponentCompatibleWithAssembly(component, assembly) {
    // Защита от undefined
    if (!component) {
        return { compatible: true, reason: '' };
    }
    
    const currentComponents = Object.values(assembly).map(item => item.component);
    for (const existing of currentComponents) {
        if (!existing) continue; // Пропускаем undefined
        const result = checkTwoComponentsCompatibility(component, existing);
        if (!result.compatible) {
            return { compatible: false, reason: result.reason };
        }
    }
    return { compatible: true, reason: '' };
}

// --- Модальное окно компонента ---
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

// --- Основные функции ---

async function loadComponents() {
    try {
        let url = `/api/components?category=${selectedCategory}`;
        if (currentAssemblyId) url += `&assembly_id=${currentAssemblyId}`;
        const priceMin = priceMinInput.value, priceMax = priceMaxInput.value;
        if (priceMin) url += `&price_min=${priceMin}`;
        if (priceMax) url += `&price_max=${priceMax}`;
        const data = await get(url);
        
        if (!currentAssemblyId) {
            for (const comp of data) {
                // Защита от undefined и проверка, что компонент корректен
                if (!comp || !comp.category) {
                    console.warn('Пропущен некорректный компонент:', comp);
                    continue;
                }
                // Проверяем, есть ли компоненты в сборке
                if (Object.keys(assemblyComponents).length > 0) {
                    const compatibility = isComponentCompatibleWithAssembly(comp, assemblyComponents);
                    comp.is_compatible = compatibility.compatible;
                    comp.incompatibility_reason = compatibility.reason;
                } else {
                    comp.is_compatible = true;
                    comp.incompatibility_reason = null;
                }
            }
        }
        
        allComponents = data;
        
        // --- Обновление производителей ---
        manufacturerFilter.innerHTML = '<option value="">Все производители</option>';
        const manufacturers = [...new Set(allComponents.map(c => c.manufacturer))];
        manufacturers.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            manufacturerFilter.appendChild(opt);
        });
        const currentSelected = manufacturerFilter.dataset.lastSelected || '';
        if (currentSelected && manufacturers.includes(currentSelected)) {
            manufacturerFilter.value = currentSelected;
        } else {
            manufacturerFilter.value = '';
            manufacturerFilter.dataset.lastSelected = '';
        }
        
        renderComponentList();
    } catch (err) {
        componentListDiv.innerHTML = '<p>❌ Ошибка загрузки компонентов</p>';
        console.error(err);
    }
}

function renderComponentList() {
    let filtered = [...allComponents];
    const search = searchInput.value.toLowerCase();
    if (search) {
        filtered = filtered.filter(c => c.model_name.toLowerCase().includes(search) || c.manufacturer.toLowerCase().includes(search));
    }
    const manuf = manufacturerFilter.value;
    if (manuf) filtered = filtered.filter(c => c.manufacturer === manuf);
    if (!filtered.length) {
        componentListDiv.innerHTML = '<p class="empty-msg">🔍 Компоненты не найдены</p>';
        return;
    }
    componentListDiv.innerHTML = filtered.map(comp => {
        const isCompatible = comp.is_compatible !== false;
        const disabledAttr = !isCompatible ? 'disabled' : '';
        const disabledClass = !isCompatible ? 'disabled-card' : '';
        const buttonText = !isCompatible ? `🚫 ${comp.incompatibility_reason || 'Несовместим с выбранными компонентами'}` : '➕ Выбрать';
        const titleAttr = !isCompatible ? `title="${comp.incompatibility_reason || 'Несовместим с выбранными компонентами'}"` : '';
        const isSelected = (() => {
            if (comp.category === 'ram') {
                return assemblyComponents.ram && assemblyComponents.ram.component.id === comp.id;
            }
            if (comp.category === 'storage') {
                return assemblyComponents.storageList && assemblyComponents.storageList.some(s => s.component.id === comp.id);
            }
            return assemblyComponents[comp.category] && assemblyComponents[comp.category].component.id === comp.id;
        })();
        const selectedClass = isSelected ? 'selected' : '';
        const selectedBadge = isSelected ? ' ✅ Выбрано' : '';
        const imgSrc = comp.image_url || '';
        return `
            <div class="component-card ${disabledClass} ${selectedClass}" ${titleAttr}>
                <div class="component-card-image">
                    <img src="${imgSrc}" alt="${comp.model_name}" style="width:100%; max-height:120px; object-fit:contain; background:#f8f9fa; border-radius:4px;" onerror="this.style.display='none'">
                </div>
                <h3>${escapeHtml(comp.manufacturer)} ${escapeHtml(comp.model_name)}</h3>
                <div class="specs">${Object.entries(comp.specs_json).slice(0, 4).map(([k,v]) => `${k}: ${v}`).join(', ')}</div>
                <div class="price">💰 ${comp.price.toLocaleString()} ₽</div>
                <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                    <button class="add-btn" data-id="${comp.id}" data-category="${comp.category}" ${disabledAttr}>${buttonText}</button>
                    <button class="details-btn" data-id="${comp.id}">📋 Подробнее</button>
                </div>
                ${selectedBadge}
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.add-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            const category = btn.dataset.category;
            await addComponent(id, category);
        });
    });
    
    document.querySelectorAll('.details-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            const comp = allComponents.find(c => c.id === id);
            if (comp) {
                openComponentModal(comp);
            } else {
                try {
                    const fullComp = await get(`/api/components/${id}`);
                    openComponentModal(fullComp);
                } catch (err) {
                    alert('Ошибка загрузки данных компонента');
                }
            }
        });
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

async function handleQuantityChange(category, componentId, action) {
    if (!currentAssemblyId) {
        let item = null;
        if (category === 'ram' && assemblyComponents.ram) {
            item = assemblyComponents.ram;
        } else if (category === 'storage' && assemblyComponents.storageList) {
            const found = assemblyComponents.storageList.find(s => s.component.id === componentId);
            if (found) item = found;
        }
        if (!item) return;
        let newQty = item.quantity || 1;
        if (action === 'increment') {
            const totalRam = assemblyComponents.ram ? assemblyComponents.ram.quantity : 0;
            const totalStorage = assemblyComponents.storageList ? assemblyComponents.storageList.reduce((sum, s) => sum + s.quantity, 0) : 0;
            if (category === 'ram' && totalRam >= 4) { alert('Максимум 4 планки ОЗУ'); return; }
            if (category === 'storage' && totalStorage >= 4) { alert('Максимум 4 накопителя'); return; }
            newQty++;
        } else if (action === 'decrement') {
            if (newQty <= 1) {
                if (category === 'ram') {
                    delete assemblyComponents.ram;
                } else if (category === 'storage') {
                    const idx = assemblyComponents.storageList.findIndex(s => s.component.id === componentId);
                    if (idx !== -1) assemblyComponents.storageList.splice(idx, 1);
                }
                recalcTotalPrice();
                renderAssemblyPanel(assemblyComponents);
                saveGuestAssembly();
                await loadComponents();
                calculateLocalRating();
                return;
            }
            newQty--;
        }
        item.quantity = newQty;
        recalcTotalPrice();
        renderAssemblyPanel(assemblyComponents);
        saveGuestAssembly();
        await loadComponents();
        calculateLocalRating();
    } else {
        try {
            const comps = await get(`/api/assemblies/${currentAssemblyId}/components`);
            const found = comps.find(c => c.id === componentId);
            if (!found) return;
            let newQty = found.quantity || 1;
            if (action === 'increment') {
                const totalRam = comps.filter(c => c.category === 'ram').reduce((sum, c) => sum + c.quantity, 0);
                const totalStorage = comps.filter(c => c.category === 'storage').reduce((sum, c) => sum + c.quantity, 0);
                if (category === 'ram' && totalRam >= 4) { alert('Максимум 4 планки ОЗУ'); return; }
                if (category === 'storage' && totalStorage >= 4) { alert('Максимум 4 накопителя'); return; }
                newQty++;
            } else if (action === 'decrement') {
                if (newQty <= 1) {
                    await del(`/api/assemblies/${currentAssemblyId}/components/${componentId}`);
                    await refreshAssembly();
                    await loadComponents();
                    await loadRating();
                    return;
                }
                newQty--;
            }
            await patch(`/api/assemblies/${currentAssemblyId}/components/${componentId}?quantity=${newQty}`, {});
            await refreshAssembly();
            await loadComponents();
            await loadRating();
        } catch (err) {
            alert('❌ Ошибка изменения количества: ' + err.message);
        }
    }
}

async function addComponent(componentId, category) {
    const component = allComponents.find(c => c.id === componentId);
    if (!component) return;
    
    if (!currentAssemblyId && component.is_compatible === false) {
        alert(component.incompatibility_reason || 'Этот компонент несовместим с текущей сборкой');
        return;
    }
    
    if (currentAssemblyId) {
        if (category === 'ram') {
            const comps = await get(`/api/assemblies/${currentAssemblyId}/components`);
            const existingRam = comps.filter(c => c.category === 'ram');
            if (existingRam.length > 0 && existingRam[0].id !== componentId) {
                if (!confirm(`⚠️ В сборке уже есть ОЗУ (${existingRam[0].model_name}). Заменить на ${component.model_name}?`)) {
                    return;
                }
            }
            if (existingRam.length > 0 && existingRam[0].id === componentId && existingRam[0].quantity >= 4) {
                alert('Максимум 4 планки ОЗУ');
                return;
            }
        }
        if (category === 'storage') {
            const comps = await get(`/api/assemblies/${currentAssemblyId}/components`);
            const storageCount = comps.filter(c => c.category === 'storage').reduce((sum, c) => sum + c.quantity, 0);
            if (storageCount >= 4) {
                alert('Максимум 4 накопителя');
                return;
            }
        }
        try {
            await post(`/api/assemblies/${currentAssemblyId}/components`, { component_id: componentId, quantity: 1 });
            await refreshAssembly();
            await loadComponents();
            await loadRating();
        } catch (err) {
            alert('❌ Ошибка добавления: ' + err.message);
        }
    } else {
        const uniqueCategories = ['motherboard', 'gpu', 'psu', 'cooler', 'case'];
        if (uniqueCategories.includes(category) && assemblyComponents[category]) {
            if (confirm(`⚠️ Заменить ${category} на ${component.model_name}?`)) {
                delete assemblyComponents[category];
            } else {
                return;
            }
        }
        if (category === 'ram') {
            if (assemblyComponents.ram) {
                if (assemblyComponents.ram.component.id === componentId) {
                    if (assemblyComponents.ram.quantity >= 4) {
                        alert('Максимум 4 планки ОЗУ');
                        return;
                    }
                    assemblyComponents.ram.quantity = (assemblyComponents.ram.quantity || 1) + 1;
                } else {
                    if (!confirm(`⚠️ Заменить ОЗУ на ${component.model_name}?`)) return;
                    assemblyComponents.ram = { component, quantity: 1 };
                }
            } else {
                assemblyComponents.ram = { component, quantity: 1 };
            }
        } else if (category === 'storage') {
            if (!assemblyComponents.storageList) assemblyComponents.storageList = [];
            const storageCount = assemblyComponents.storageList.reduce((sum, s) => sum + s.quantity, 0);
            if (storageCount >= 4) {
                alert('Максимум 4 накопителя');
                return;
            }
            const existing = assemblyComponents.storageList.find(s => s.component.id === componentId);
            if (existing) {
                existing.quantity = (existing.quantity || 1) + 1;
            } else {
                assemblyComponents.storageList.push({ component, quantity: 1 });
            }
        } else {
            assemblyComponents[category] = { component, quantity: 1 };
        }
        recalcTotalPrice();
        renderAssemblyPanel(assemblyComponents);
        saveGuestAssembly();
        await loadComponents();
        calculateLocalRating();
    }
}

async function removeComponent(componentId, category) {
    if (currentAssemblyId) {
        try {
            await del(`/api/assemblies/${currentAssemblyId}/components/${componentId}`);
            await refreshAssembly();
            await loadComponents();
            await loadRating();
        } catch (err) {
            alert('❌ Ошибка удаления: ' + err.message);
        }
    } else {
        if (category === 'ram') {
            delete assemblyComponents.ram;
        } else if (category === 'storage') {
            const idx = assemblyComponents.storageList.findIndex(s => s.component.id === componentId);
            if (idx !== -1) assemblyComponents.storageList.splice(idx, 1);
        } else {
            delete assemblyComponents[category];
        }
        recalcTotalPrice();
        renderAssemblyPanel(assemblyComponents);
        saveGuestAssembly();
        await loadComponents();
        if (Object.keys(assemblyComponents).length > 0) {
            calculateLocalRating();
        } else {
            performanceScoreSpan.innerHTML = '⭐ Рейтинг: —/100';
            compatibilityDiv.style.display = 'none';
        }
    }
}

function recalcTotalPrice() {
    let total = 0;
    if (assemblyComponents.ram) {
        total += assemblyComponents.ram.component.price * (assemblyComponents.ram.quantity || 1);
    }
    if (assemblyComponents.storageList) {
        assemblyComponents.storageList.forEach(s => {
            total += s.component.price * (s.quantity || 1);
        });
    }
    ['cpu', 'gpu', 'motherboard', 'psu', 'cooler', 'case'].forEach(cat => {
        if (assemblyComponents[cat]) {
            total += assemblyComponents[cat].component.price;
        }
    });
    totalPrice = total;
    totalPriceSpan.textContent = totalPrice.toLocaleString();
}

function calculateLocalRating() {
    const components = [];
    if (assemblyComponents.ram) components.push(assemblyComponents.ram.component);
    if (assemblyComponents.storageList) {
        assemblyComponents.storageList.forEach(s => components.push(s.component));
    }
    ['cpu', 'gpu', 'motherboard', 'psu', 'cooler', 'case'].forEach(cat => {
        if (assemblyComponents[cat]) components.push(assemblyComponents[cat].component);
    });
    if (components.length === 0) return;
    let totalScore = 0;
    let scores = {};
    const cpu = components.find(c => c.category === 'cpu');
    const gpu = components.find(c => c.category === 'gpu');
    const ram = components.find(c => c.category === 'ram');
    const storage = components.find(c => c.category === 'storage');
    const psu = components.find(c => c.category === 'psu');
    const weights = { cpu: 0.25, gpu: 0.4, ram: 0.15, storage: 0.1, psu: 0.1 };
    
    if (cpu) {
        const benchmark = cpu.specs_json?.benchmark_score || 0;
        scores.cpu = Math.min(100, benchmark / 400);
    } else { scores.cpu = 0; }
    if (gpu) {
        const benchmark = gpu.specs_json?.benchmark_score || 0;
        scores.gpu = Math.min(100, benchmark / 400);
    } else if (cpu && cpu.specs_json?.integrated_graphics) {
        scores.gpu = 40;
    } else { scores.gpu = 0; }
    if (ram) {
        const capacity = ram.specs_json?.capacity || 0;
        scores.ram = Math.min(100, (capacity / 64) * 100);
    } else { scores.ram = 0; }
    if (storage) {
        const speed = storage.specs_json?.read_speed || 0;
        scores.storage = Math.min(100, (speed / 7000) * 100);
    } else { scores.storage = 0; }
    if (psu) { scores.psu = 75; } else { scores.psu = 0; }
    
    totalScore = (scores.cpu * weights.cpu) + (scores.gpu * weights.gpu) + 
                 (scores.ram * weights.ram) + (scores.storage * weights.storage) + 
                 (scores.psu * weights.psu);
    
    const priceCategory = getPriceCategoryFromTotalPrice(totalPrice);
    const priceNames = { budget: 'бюджетная', mid: 'средняя', high: 'высокая' };
    performanceScoreSpan.innerHTML = `⭐ Рейтинг: ${Math.round(totalScore)}/100 (гостевой режим, ${priceNames[priceCategory]} ценовая категория)`;
    
    let issues = [];
    if (cpu && gpu) {
        const cpuScore = cpu.specs_json?.benchmark_score || 0;
        const gpuScore = gpu.specs_json?.benchmark_score || 0;
        if (cpuScore > 0 && gpuScore > 0 && cpuScore < gpuScore * 0.7) {
            issues.push('⚠️ Процессор может быть узким местом для видеокарты');
        }
    }
    if (ram && ram.specs_json?.capacity < 16) {
        issues.push('⚠️ Рекомендуется 16ГБ ОЗУ и более');
    }
    
    if (issues.length > 0) {
        compatibilityDiv.style.display = 'block';
        compatibilityDiv.innerHTML = `<strong>⚠️ Узкие места:</strong><ul>${issues.map(i => `<li>${i}</li>`).join('')}</ul>`;
    } else if (components.length > 0) {
        compatibilityDiv.style.display = 'block';
        compatibilityDiv.innerHTML = '<strong>✅ Сборка выглядит сбалансированной!</strong>';
    }
}

async function refreshAssembly() {
    if (!currentAssemblyId) return;
    try {
        const meta = await get(`/api/assemblies/${currentAssemblyId}`);
        totalPrice = meta.total_price;
        totalPriceSpan.textContent = totalPrice.toLocaleString();
        
        const comps = await get(`/api/assemblies/${currentAssemblyId}/components`);
        const flatMap = {};
        const ramItems = comps.filter(c => c.category === 'ram');
        const storageItems = comps.filter(c => c.category === 'storage');
        const otherItems = comps.filter(c => c.category !== 'ram' && c.category !== 'storage');
        
        if (ramItems.length > 0) {
            const ram = ramItems[0];
            flatMap.ram = { component: ram, quantity: ram.quantity };
        }
        const storageMap = {};
        storageItems.forEach(st => {
            const key = st.id;
            if (storageMap[key]) {
                storageMap[key].quantity += st.quantity;
            } else {
                storageMap[key] = { component: st, quantity: st.quantity };
            }
        });
        flatMap.storageList = Object.values(storageMap);
        otherItems.forEach(comp => {
            flatMap[comp.category] = { component: comp, quantity: 1 };
        });
        assemblyComponents = flatMap;
        renderAssemblyPanel(assemblyComponents);
        
        const bottlenecks = await get(`/api/assemblies/${currentAssemblyId}/bottlenecks`);
        if (bottlenecks && bottlenecks.issues && bottlenecks.issues.length > 0) {
            compatibilityDiv.style.display = 'block';
            compatibilityDiv.innerHTML = `<strong>⚠️ Узкие места (${bottlenecks.score}%):</strong><ul>${bottlenecks.issues.map(i => `<li>${escapeHtml(i.message)}</li>`).join('')}</ul>`;
        } else {
            compatibilityDiv.style.display = 'none';
        }
        const constraints = await get(`/api/assemblies/${currentAssemblyId}/constraints`);
        if (constraints && constraints.total_power) {
            let powerDiv = document.getElementById('powerWarning');
            if (!powerDiv) {
                powerDiv = document.createElement('div');
                powerDiv.id = 'powerWarning';
                powerDiv.className = 'compatibility-warning';
                powerDiv.style.marginTop = '0.5rem';
                compatibilityDiv.insertAdjacentElement('afterend', powerDiv);
            }
            powerDiv.style.display = 'block';
            powerDiv.innerHTML = `<strong>⚡ Энергопотребление:</strong><ul>
                <li>🔋 Расчётное потребление: ~${constraints.total_power} Вт</li>
                <li>⚡ Рекомендуемый БП: от ${constraints.recommended_psu} Вт</li>
            </ul>`;
        }
        await loadRating();
    } catch (err) { console.error(err); }
}

async function loadRating() {
    if (!currentAssemblyId) return;
    try {
        const meta = await get(`/api/assemblies/${currentAssemblyId}`);
        const priceCategory = getPriceCategoryFromTotalPrice(meta.total_price);
        const rating = await get(`/api/assemblies/${currentAssemblyId}/rating?use_case=${currentUseCase}&price_category=${priceCategory}`);
        if (rating && rating.score !== undefined) {
            const useCaseNames = { gaming: '🎮 Игры', workstation: '💼 Рабочая станция', office: '🏢 Офис', universal: '🔄 Универсальный' };
            const priceNames = { budget: '💸 Бюджетная', mid: '💵 Средняя', high: '💎 Высокая' };
            performanceScoreSpan.innerHTML = `⭐ Рейтинг: ${rating.score}/100 (${useCaseNames[currentUseCase]}, ${priceNames[priceCategory]})`;
            
            if (rating.components_scores) {
                let scoresHtml = '<div style="margin-top:0.5rem; font-size:0.75rem; color:#64748b;">';
                const compNames = { cpu: 'CPU', gpu: 'GPU', ram: 'RAM', storage: 'SSD', psu: 'PSU' };
                for (const [comp, score] of Object.entries(rating.components_scores)) {
                    if (compNames[comp] && score > 0) scoresHtml += `${compNames[comp]}: ${Math.round(score)}% `;
                }
                scoresHtml += '</div>';
                let scoresBlock = performanceScoreSpan.nextSibling;
                if (!scoresBlock || !scoresBlock.classList?.contains('scores-block')) {
                    scoresBlock = document.createElement('div');
                    scoresBlock.className = 'scores-block';
                    performanceScoreSpan.insertAdjacentElement('afterend', scoresBlock);
                }
                scoresBlock.innerHTML = scoresHtml;
            }
            
            if (rating.recommendations && rating.recommendations.length) {
                const recHtml = `<div style="margin-top:0.5rem; font-size:0.8rem; color:#e67e22;"><strong>💡 Рекомендации:</strong><ul>${rating.recommendations.map(r => `<li>${escapeHtml(r.message)}</li>`).join('')}</ul></div>`;
                let recBlock = performanceScoreSpan.nextSibling?.nextSibling;
                if (!recBlock || !recBlock.classList?.contains('rec-block')) {
                    recBlock = document.createElement('div');
                    recBlock.className = 'rec-block';
                    performanceScoreSpan.insertAdjacentElement('afterend', recBlock);
                }
                recBlock.innerHTML = recHtml;
            }
        }
    } catch (err) { console.error('Ошибка загрузки рейтинга:', err); }
}

function renderAssemblyPanel(componentsList) {
    if (!componentsList || Object.keys(componentsList).length === 0) {
        assemblyDiv.innerHTML = '<p class="empty-msg">📦 Компоненты не добавлены</p>';
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
    let html = '';
    
    if (componentsList.ram) {
        const item = componentsList.ram;
        const qty = item.quantity || 1;
        html += `
            <div class="assembly-item" data-category="ram" data-id="${item.component.id}">
                <div>
                    <strong>${categoryNames.ram}:</strong> ${qty} x ${escapeHtml(item.component.model_name)}
                    <br><span style="font-size:0.8rem;color:#2563eb;">${(item.component.price * qty).toLocaleString()} ₽</span>
                </div>
                <div class="qty-controls">
                    <button class="qty-btn minus" data-category="ram" data-id="${item.component.id}" data-action="decrement">−</button>
                    <span class="qty-display">${qty}</span>
                    <button class="qty-btn plus" data-category="ram" data-id="${item.component.id}" data-action="increment">+</button>
                    <button class="remove-btn" data-category="ram" data-id="${item.component.id}">✕</button>
                </div>
            </div>
        `;
    }
    
    if (componentsList.storageList && componentsList.storageList.length > 0) {
        componentsList.storageList.forEach((item, index) => {
            const qty = item.quantity || 1;
            const comp = item.component;
            const total = comp.price * qty;
            html += `
                <div class="assembly-item" data-category="storage" data-id="${comp.id}" data-index="${index}">
                    <div>
                        <strong>${categoryNames.storage}:</strong> ${qty} x ${escapeHtml(comp.model_name)}
                        <br><span style="font-size:0.8rem;color:#2563eb;">${total.toLocaleString()} ₽</span>
                    </div>
                    <div class="qty-controls">
                        <button class="qty-btn minus" data-category="storage" data-id="${comp.id}" data-action="decrement">−</button>
                        <span class="qty-display">${qty}</span>
                        <button class="qty-btn plus" data-category="storage" data-id="${comp.id}" data-action="increment">+</button>
                        <button class="remove-btn" data-category="storage" data-id="${comp.id}">✕</button>
                    </div>
                </div>
            `;
        });
    }
    
    const uniqueCats = ['cpu', 'gpu', 'motherboard', 'psu', 'cooler', 'case'];
    uniqueCats.forEach(cat => {
        if (componentsList[cat]) {
            const item = componentsList[cat];
            html += `
                <div class="assembly-item" data-category="${cat}" data-id="${item.component.id}">
                    <div>
                        <strong>${categoryNames[cat]}:</strong> ${escapeHtml(item.component.model_name)}
                        <br><span style="font-size:0.8rem;color:#2563eb;">${item.component.price.toLocaleString()} ₽</span>
                    </div>
                    <button class="remove-btn" data-category="${cat}" data-id="${item.component.id}">✕</button>
                </div>
            `;
        }
    });
    
    assemblyDiv.innerHTML = html;
    
    document.querySelectorAll('.qty-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const category = btn.dataset.category;
            const id = parseInt(btn.dataset.id);
            const action = btn.dataset.action;
            await handleQuantityChange(category, id, action);
        });
    });
    
    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const category = btn.dataset.category;
            const id = parseInt(btn.dataset.id);
            await removeComponent(id, category);
        });
    });
}

async function loadUserAssembly() {
    if (!isAuthenticated()) return false;
    try {
        const assemblies = await get('/api/assemblies/my');
        if (assemblies.length > 0) {
            if (editAssemblyId && assemblies.some(a => a.id == editAssemblyId)) {
                currentAssemblyId = parseInt(editAssemblyId);
                await refreshAssembly();
                await loadRating();
                clearGuestAssembly();
                return true;
            }
            currentAssemblyId = assemblies[0].id;
            await refreshAssembly();
            await loadRating();
            clearGuestAssembly();
            return true;
        } else {
            const newAssembly = await post('/api/assemblies', { title: 'Моя сборка' });
            currentAssemblyId = newAssembly.id;
            assemblyComponents = {};
            renderAssemblyPanel({});
            totalPriceSpan.textContent = '0';
            return true;
        }
    } catch (err) { return false; }
}

async function migrateGuestAssembly() {
    if (!isAuthenticated()) return;
    if (Object.keys(assemblyComponents).length === 0) return;
    const newAssembly = await post('/api/assemblies', { title: 'Моя сборка' });
    currentAssemblyId = newAssembly.id;
    const addWithQty = async (comp, qty) => {
        for (let i = 0; i < qty; i++) {
            await post(`/api/assemblies/${currentAssemblyId}/components`, { component_id: comp.id, quantity: 1 });
        }
    };
    if (assemblyComponents.ram) {
        await addWithQty(assemblyComponents.ram.component, assemblyComponents.ram.quantity);
    }
    if (assemblyComponents.storageList) {
        for (const s of assemblyComponents.storageList) {
            await addWithQty(s.component, s.quantity);
        }
    }
    ['cpu', 'gpu', 'motherboard', 'psu', 'cooler', 'case'].forEach(async cat => {
        if (assemblyComponents[cat]) {
            await addWithQty(assemblyComponents[cat].component, 1);
        }
    });
    clearGuestAssembly();
    await refreshAssembly();
    await loadRating();
    await loadComponents();
}

async function handleSave() {
    if (currentAssemblyId) {
        const completeness = await get(`/api/assemblies/${currentAssemblyId}/completeness`);
        if (!completeness.is_complete) {
            const modal = document.getElementById('incompleteBuildModal');
            const missingList = document.getElementById('missingComponentsList');
            const modalTitle = document.getElementById('incompleteModalTitle');
            if (modalTitle) modalTitle.textContent = '⚠️ Неполная сборка';
            document.getElementById('confirmSaveBtn').style.display = 'inline-block';
            document.getElementById('publishCancelBtn').style.display = 'none';
            missingList.innerHTML = completeness.missing_names.map(m => `<li>${m}</li>`).join('');
            modal.style.display = 'flex';
            pendingSaveCallback = async () => {
                modal.style.display = 'none';
                alert('✅ Сборка сохранена (неполная)');
                pendingSaveCallback = null;
            };
            return;
        }
        alert('✅ Сборка уже сохранена на сервере');
    } else if (!isAuthenticated()) {
        showAuthModal(() => migrateGuestAssembly().then(() => alert('✅ Сборка сохранена на сервер')));
    } else {
        await migrateGuestAssembly();
        alert('✅ Сборка сохранена');
    }
}

async function handlePublish() {
    if (currentAssemblyId) {
        const completeness = await get(`/api/assemblies/${currentAssemblyId}/completeness`);
        if (!completeness.is_complete) {
            const modal = document.getElementById('incompleteBuildModal');
            const missingList = document.getElementById('missingComponentsList');
            const modalTitle = document.getElementById('incompleteModalTitle');
            if (modalTitle) modalTitle.textContent = '⚠️ Невозможно опубликовать';
            document.getElementById('confirmSaveBtn').style.display = 'none';
            document.getElementById('publishCancelBtn').style.display = 'inline-block';
            missingList.innerHTML = completeness.missing_names.map(m => `<li>${m}</li>`).join('');
            modal.style.display = 'flex';
            return;
        }
        await put(`/api/assemblies/${currentAssemblyId}`, { is_public: true });
        alert('✅ Сборка опубликована');
    } else if (!isAuthenticated()) {
        showAuthModal(async () => {
            await migrateGuestAssembly();
            await put(`/api/assemblies/${currentAssemblyId}`, { is_public: true });
            alert('✅ Сборка опубликована');
        });
    } else {
        await migrateGuestAssembly();
        await put(`/api/assemblies/${currentAssemblyId}`, { is_public: true });
        alert('✅ Сборка опубликована');
    }
}

function showOrderModal() {
    const modal = document.getElementById('orderModal');
    if (!modal) return;
    const phoneInput = document.getElementById('orderPhone');
    const addressInput = document.getElementById('orderAddress');
    const commentInput = document.getElementById('orderComment');
    phoneInput.value = '';
    addressInput.value = '';
    commentInput.value = '';
    get('/api/users/me').then(user => {
        if (user.phone) phoneInput.value = user.phone;
    }).catch(() => {});
    modal.style.display = 'flex';
    const closeOrderModalBtn = document.getElementById('closeOrderModalBtn');
    if (closeOrderModalBtn) {
        closeOrderModalBtn.onclick = () => { modal.style.display = 'none'; };
    }
    const submitOrderBtn = document.getElementById('submitOrderBtn');
    const cancelOrderBtn = document.getElementById('cancelOrderBtn');
    if (submitOrderBtn) {
        const newSubmitBtn = submitOrderBtn.cloneNode(true);
        submitOrderBtn.parentNode.replaceChild(newSubmitBtn, submitOrderBtn);
        newSubmitBtn.onclick = async () => {
            const phone = phoneInput.value.trim();
            if (!phone) { alert('Введите номер телефона'); return; }
            const address = addressInput.value.trim();
            const comment = commentInput.value.trim();
            try {
                const result = await post(`/api/assemblies/${currentAssemblyId}/order`, { phone, address, comment });
                if (result && result.message) {
                    alert(`✅ ${result.message} на сумму ${result.total_price.toLocaleString()} ₽`);
                } else {
                    alert('✅ Заказ оформлен');
                }
                modal.style.display = 'none';
            } catch (err) {
                let errorMsg = 'Неизвестная ошибка';
                if (err.message) {
                    try {
                        const parsed = JSON.parse(err.message);
                        errorMsg = parsed.detail || err.message;
                    } catch (e) { errorMsg = err.message; }
                }
                alert('❌ Ошибка: ' + errorMsg);
            }
        };
    }
    if (cancelOrderBtn) {
        cancelOrderBtn.onclick = () => { modal.style.display = 'none'; };
    }
}

if (orderBtn) {
    orderBtn.addEventListener('click', async () => {
        if (!currentAssemblyId) { alert('Сначала сохраните сборку'); return; }
        try {
            const completeness = await get(`/api/assemblies/${currentAssemblyId}/completeness`);
            if (!completeness.is_complete) {
                alert(`❌ Нельзя оформить заказ. ${completeness.message}`);
                return;
            }
            showOrderModal();
        } catch (err) {
            alert('❌ Ошибка: ' + err.message);
        }
    });
}

document.getElementById('confirmSaveBtn')?.addEventListener('click', async () => {
    if (pendingSaveCallback) {
        await pendingSaveCallback();
        pendingSaveCallback = null;
    }
    document.getElementById('incompleteBuildModal').style.display = 'none';
});

document.getElementById('cancelSaveBtn')?.addEventListener('click', () => {
    document.getElementById('incompleteBuildModal').style.display = 'none';
    pendingSaveCallback = null;
});

document.getElementById('publishCancelBtn')?.addEventListener('click', () => {
    document.getElementById('incompleteBuildModal').style.display = 'none';
});

// --- Модальное окно авторизации ---
let authCallback = null;
function showAuthModal(callback) {
    if (!authModal) return;
    authCallback = callback;
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
                await loadUserAssembly();
                await loadComponents();
            } catch (err) {
                alert('❌ Ошибка: ' + err.message);
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

function updateUserUI() {
    if (isAuthenticated()) {
        const role = getUserRole();
        if (role === 'admin' || role === 'manager') {
            window.location.href = '/admin.html';
            return;
        }
        if (userInfoDiv) {
            userInfoDiv.innerHTML = `<a href="/profile.html" style="color:#2563eb; text-decoration:none; margin-right:1rem;">👤 Личный кабинет</a><span>👤 Пользователь</span><button id="logoutBtn" style="margin-left:0.5rem;">🚪 Выйти</button>`;
            document.getElementById('logoutBtn')?.addEventListener('click', () => {
                logout();
                window.location.href = '/';
            });
        }
    } else {
        if (userInfoDiv) {
            userInfoDiv.innerHTML = `<button id="loginBtn">🔑 Войти</button>`;
            document.getElementById('loginBtn')?.addEventListener('click', () => showAuthModal(() => {}));
        }
    }
}

// --- Мастер подбора (Wizard) ---
const wizardModal = document.getElementById('wizardModal');
const wizardBtn = document.getElementById('wizardBtn');
const closeWizardBtn = document.getElementById('closeWizardBtn');
const step1 = document.getElementById('wizardStep1');
const step2 = document.getElementById('wizardStep2');
const step3 = document.getElementById('wizardStep3');
const next1 = document.getElementById('wizardNext1');
const next2 = document.getElementById('wizardNext2');
const back1 = document.getElementById('wizardBack1');
const back2 = document.getElementById('wizardBack2');
const submitWizard = document.getElementById('wizardSubmit');
const wizardBudgetInput = document.getElementById('wizardBudgetInput');
const minBudgetValueSpan = document.getElementById('minBudgetValue');
const minBudgetWarning = document.getElementById('minBudgetWarning');

let wizardUseCase = '';
let wizardBudget = 0;
let minBudget = 0;

async function loadMinBudget() {
    try {
        const result = await get('/api/wizard/min-budget');
        minBudget = result.min_budget;
        if (minBudgetValueSpan) {
            minBudgetValueSpan.textContent = minBudget.toLocaleString();
            minBudgetValueSpan.style.fontWeight = 'bold';
            minBudgetValueSpan.style.color = '#e67e22';
        }
        if (wizardBudgetInput) {
            wizardBudgetInput.placeholder = `Введите сумму (мин. ${minBudget.toLocaleString()} ₽)`;
            wizardBudgetInput.style.borderColor = '#ccc';
        }
        if (minBudgetWarning) {
            minBudgetWarning.style.display = 'block';
            minBudgetWarning.style.backgroundColor = '#fff3e0';
            minBudgetWarning.style.padding = '0.5rem';
            minBudgetWarning.style.borderRadius = '0.5rem';
            minBudgetWarning.style.marginTop = '0.5rem';
            minBudgetWarning.innerHTML = `⚠️ <strong>Минимальная стоимость базовой сборки: ${minBudget.toLocaleString()} ₽</strong><br>Ваш бюджет не может быть меньше этой суммы.`;
        }
    } catch (err) {
        console.error('❌ Ошибка загрузки минимального бюджета:', err);
        minBudget = 50000;
        if (minBudgetValueSpan) {
            minBudgetValueSpan.textContent = minBudget.toLocaleString();
        }
    }
}

if (wizardBtn) {
    wizardBtn.addEventListener('click', () => {
        const role = getUserRole();
        if (role === 'admin' || role === 'manager') {
            alert('Доступ запрещён');
            return;
        }
        wizardModal.style.display = 'flex';
        step1.style.display = 'block';
        step2.style.display = 'none';
        step3.style.display = 'none';
        loadMinBudget();
    });
}
if (closeWizardBtn) {
    closeWizardBtn.addEventListener('click', () => {
        wizardModal.style.display = 'none';
    });
}
next1?.addEventListener('click', () => {
    wizardUseCase = document.getElementById('wizardUseCase').value;
    step1.style.display = 'none';
    step2.style.display = 'block';
});
back1?.addEventListener('click', () => {
    step2.style.display = 'none';
    step1.style.display = 'block';
});
next2?.addEventListener('click', () => {
    const enteredBudget = parseInt(wizardBudgetInput?.value);
    if (isNaN(enteredBudget) || wizardBudgetInput?.value === '') {
        alert(`❌ Пожалуйста, введите сумму бюджета.\nМинимальная сумма: ${minBudget.toLocaleString()} ₽`);
        wizardBudgetInput.style.borderColor = '#ef4444';
        return;
    }
    if (enteredBudget < minBudget) {
        alert(`❌ Бюджет не может быть меньше минимальной стоимости сборки (${minBudget.toLocaleString()} ₽).\nПожалуйста, увеличьте бюджет.`);
        wizardBudgetInput.style.borderColor = '#ef4444';
        return;
    }
    wizardBudget = enteredBudget;
    wizardBudgetInput.style.borderColor = '#10b981';
    step2.style.display = 'none';
    step3.style.display = 'block';
});
back2?.addEventListener('click', () => {
    step3.style.display = 'none';
    step2.style.display = 'block';
});
submitWizard?.addEventListener('click', async () => {
    const role = getUserRole();
    if (role === 'admin' || role === 'manager') {
        alert('Доступ запрещён');
        return;
    }
    if (wizardBudget < minBudget) {
        alert(`❌ Бюджет (${wizardBudget.toLocaleString()} ₽) меньше минимальной стоимости сборки (${minBudget.toLocaleString()} ₽)`);
        return;
    }
    const preferences = {
        performance: document.getElementById('prefPerformance')?.checked || false,
        quiet: document.getElementById('prefQuiet')?.checked || false,
        compact: document.getElementById('prefCompact')?.checked || false,
        rgb: document.getElementById('prefRgb')?.checked || false,
    };
    try {
        const result = await post('/api/wizard/recommend', {
            use_case: wizardUseCase,
            budget: wizardBudget,
            preferences
        });
        const items = result.components;
        if (!items.length) throw new Error('Нет компонентов');
        wizardModal.style.display = 'none';
        if (isAuthenticated()) {
            const newAssembly = await post('/api/assemblies', { title: 'Рекомендованная сборка' });
            for (const item of items) {
                for (let i = 0; i < item.quantity; i++) {
                    await post(`/api/assemblies/${newAssembly.id}/components`, { component_id: item.component_id, quantity: 1 });
                }
            }
            window.location.href = `/builder.html?assembly=${newAssembly.id}&use_case=${wizardUseCase}`;
        } else {
            const components = await Promise.all(items.map(item => get(`/api/components/${item.component_id}`)));
            const guest = { components: {} };
            components.forEach((comp, idx) => {
                const qty = items[idx].quantity || 1;
                if (comp.category === 'ram') {
                    guest.components.ram = { component: comp, quantity: qty };
                } else if (comp.category === 'storage') {
                    if (!guest.components.storageList) guest.components.storageList = [];
                    guest.components.storageList.push({ component: comp, quantity: qty });
                } else {
                    guest.components[comp.category] = { component: comp, quantity: qty };
                }
            });
            localStorage.setItem('guest_assembly', JSON.stringify(guest));
            window.location.href = `/builder.html?use_case=${wizardUseCase}`;
        }
    } catch (err) {
        let errorMsg = err.message;
        try {
            const parsed = JSON.parse(err.message);
            if (parsed.detail && typeof parsed.detail === 'object') {
                errorMsg = parsed.detail.message;
                if (parsed.detail.min_budget) {
                    errorMsg += `\nМинимальная сумма: ${parsed.detail.min_budget.toLocaleString()} ₽`;
                }
            } else if (parsed.detail) {
                errorMsg = parsed.detail;
            }
        } catch (e) {}
        alert('❌ Ошибка: ' + errorMsg);
    }
});

if (useCaseSelect) {
    useCaseSelect.addEventListener('change', async () => {
        currentUseCase = useCaseSelect.value;
        if (currentAssemblyId) await loadRating();
    });
}

if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', loadComponents);
if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
        searchInput.value = '';
        manufacturerFilter.value = '';
        priceMinInput.value = '';
        priceMaxInput.value = '';
        loadComponents();
    });
}
if (categoriesList) {
    categoriesList.addEventListener('click', e => {
        const li = e.target.closest('li');
        if (li && li.dataset.category) {
            selectedCategory = li.dataset.category;
            document.querySelectorAll('.categories li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            loadComponents();
        }
    });
}
saveBtn?.addEventListener('click', handleSave);
publishBtn?.addEventListener('click', handlePublish);

async function init() {
    const role = getUserRole();
    if (role === 'admin' || role === 'manager') {
        window.location.href = '/admin.html';
        return;
    }
    updateUserUI();
    
    // --- Обработка mode=help (открыть мастер подбора) ---
    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'help') {
        // Ждём загрузки DOM и открываем мастер
        setTimeout(() => {
            const wizardBtn = document.getElementById('wizardBtn');
            if (wizardBtn) {
                wizardBtn.click();
            } else {
                const wizardModal = document.getElementById('wizardModal');
                if (wizardModal) {
                    wizardModal.style.display = 'flex';
                    const step1 = document.getElementById('wizardStep1');
                    const step2 = document.getElementById('wizardStep2');
                    const step3 = document.getElementById('wizardStep3');
                    if (step1) step1.style.display = 'block';
                    if (step2) step2.style.display = 'none';
                    if (step3) step3.style.display = 'none';
                    loadMinBudget();
                }
            }
        }, 500);
    }
    
    if (editAssemblyId && isAuthenticated()) {
        currentAssemblyId = parseInt(editAssemblyId);
        await refreshAssembly();
        await loadRating();
        clearGuestAssembly();
    } else if (isAuthenticated()) {
        await loadUserAssembly();
    } else {
        loadGuestAssembly();
        currentAssemblyId = null;
        if (Object.keys(assemblyComponents).length > 0) {
            calculateLocalRating();
        }
    }
    await loadComponents();
}

init();