import sys
import os
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Component

# Путь к папке с изображениями
IMAGES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "images")

# Правила сопоставления: категория -> префикс имени файла
IMAGE_RULES = {
    "cpu": {
        "intel": "intel",
        "amd": "amd_ryzen",
    },
    "gpu": {
        "nvidia": "geforce",
        "geforce": "geforce",
        "amd": "amd_radeon",
    },
    "motherboard": {
        "asus": "asus",
        "gigabyte": "gigabyte",
        "msi": "msi",
    },
    # Для остальных категорий можно добавить позже
}


def get_image_paths(component):
    """Возвращает список путей к изображениям для компонента."""
    category = component.category
    manufacturer = component.manufacturer.lower()
    
    # Проверяем, есть ли правило для этой категории
    if category not in IMAGE_RULES:
        return None
    
    # Проверяем, есть ли правило для производителя
    rule = IMAGE_RULES[category]
    image_prefix = None
    
    # Проверяем по точному совпадению
    if manufacturer in rule:
        image_prefix = rule[manufacturer]
    else:
        # Проверяем по вхождению
        for key, prefix in rule.items():
            if key in manufacturer:
                image_prefix = prefix
                break
    
    if not image_prefix:
        return None
    
    # Формируем пути к изображениям с точными именами файлов
    folder = category
    images = []
    
    # Точные имена файлов, которые вы предоставили
    # Варианты: имя_без_цифры, имя1, имя2, имя3
    possible_names = [
        f"{image_prefix}.jpg",      # intel.jpg, amd_ryzen.jpg, geforce.jpg
        f"{image_prefix}1.jpg",     # intel1.jpg, amd_ryzen1.jpg, geforce1.jpg
        f"{image_prefix}2.jpg",     # intel2.jpg, amd_ryzen2.jpg, geforce2.jpg
        f"{image_prefix}3.jpg",     # intel3.jpg, amd_ryzen3.jpg, geforce3.jpg
    ]
    
    # Проверяем каждый вариант
    for name in possible_names:
        full_path = os.path.join(IMAGES_DIR, folder, name)
        if os.path.exists(full_path):
            images.append(f"/images/{folder}/{name}")
            print(f"  ✅ Найден: {folder}/{name}")
    
    # Если ничего не нашли, пробуем найти все файлы с этим префиксом
    if not images:
        folder_path = os.path.join(IMAGES_DIR, folder)
        if os.path.exists(folder_path):
            for filename in os.listdir(folder_path):
                if filename.startswith(image_prefix) and filename.endswith('.jpg'):
                    images.append(f"/images/{folder}/{filename}")
                    print(f"  ✅ Найден: {folder}/{filename}")
    
    # Сортируем и берем первые 3 (или сколько есть)
    images = sorted(set(images))[:3]
    
    if not images:
        print(f"⚠️  Не найдены изображения для {component.manufacturer} {component.model_name} (префикс: {image_prefix})")
        return None
    
    return images


def assign_images():
    db = SessionLocal()
    try:
        components = db.query(Component).all()
        updated = 0
        skipped = 0
        
        print("🔍 Поиск изображений для компонентов...")
        print("-" * 50)
        
        for comp in components:
            images = get_image_paths(comp)
            if not images:
                skipped += 1
                continue
            
            # Сохраняем изображения в БД
            comp.image_url = images[0]
            comp.images = images
            updated += 1
            
            if updated % 5 == 0:
                db.commit()
                print(f"✅ Обновлено {updated} компонентов...")
        
        db.commit()
        print("-" * 50)
        print(f"\n📊 Итог: обновлено {updated} компонентов, пропущено {skipped}")
        
        # Показываем примеры
        print("\n📋 Примеры обновлённых компонентов:")
        samples = db.query(Component).filter(Component.image_url.isnot(None)).limit(5).all()
        for comp in samples:
            print(f"  - {comp.manufacturer} {comp.model_name} -> {comp.image_url}")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    print("🖼️  Привязка изображений к компонентам...")
    print(f"📁 Папка с изображениями: {IMAGES_DIR}")
    assign_images()