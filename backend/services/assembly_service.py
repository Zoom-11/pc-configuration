from sqlalchemy.orm import Session
from models import Assembly, AssemblyComponent, Component
from schemas import AssemblyCreate, AssemblyUpdate
from typing import List, Optional, Dict, Any

class AssemblyService:
    @staticmethod
    def _recalculate_totals(db: Session, assembly_id: int):
        assembly = db.query(Assembly).filter(Assembly.id == assembly_id).first()
        if not assembly:
            return
        total_price = sum(ac.component.price * ac.quantity for ac in assembly.components_rel)
        total_tdp = sum(ac.component.specs_json.get('tdp', 0) * ac.quantity for ac in assembly.components_rel if 'tdp' in ac.component.specs_json)
        assembly.total_price = total_price
        assembly.total_tdp = total_tdp
        db.commit()

    @staticmethod
    def create_assembly(db: Session, user_id: int, data: AssemblyCreate) -> Assembly:
        assembly = Assembly(
            user_id=user_id,
            title=data.title,
            description=data.description,
            total_price=0.0,
            total_tdp=0,
            performance_score=None,
            is_public=False
        )
        db.add(assembly)
        db.commit()
        db.refresh(assembly)
        return assembly

    @staticmethod
    def get_assembly(db: Session, assembly_id: int, user_id: Optional[int] = None) -> Assembly:
        query = db.query(Assembly).filter(Assembly.id == assembly_id)
        if user_id is not None:
            query = query.filter(Assembly.user_id == user_id)
        assembly = query.first()
        if not assembly:
            raise ValueError("Assembly not found")
        return assembly

    @staticmethod
    def update_assembly(db: Session, assembly_id: int, data: AssemblyUpdate, user_id: int) -> Assembly:
        assembly = AssemblyService.get_assembly(db, assembly_id, user_id)
        if data.title is not None:
            assembly.title = data.title
        if data.description is not None:
            assembly.description = data.description
        if data.is_public is not None:
            assembly.is_public = data.is_public
        db.commit()
        db.refresh(assembly)
        return assembly

    @staticmethod
    def add_component(db: Session, assembly_id: int, component_id: int, quantity: int, user_id: int) -> Assembly:
        assembly = AssemblyService.get_assembly(db, assembly_id, user_id)
        component = db.query(Component).filter(Component.id == component_id).first()
        if not component:
            raise ValueError("Component not found")
        
        # Особое правило для RAM: только один тип (заменяем все существующие)
        if component.category == "ram":
            # Удаляем все существующие RAM в сборке
            existing_ram = db.query(AssemblyComponent).filter(
                AssemblyComponent.assembly_id == assembly_id,
                AssemblyComponent.component.has(category="ram")
            ).all()
            for ac in existing_ram:
                db.delete(ac)
            db.commit()
            # Добавляем новую RAM с указанным quantity (обычно 1)
            new_ac = AssemblyComponent(assembly_id=assembly_id, component_id=component_id, quantity=quantity)
            db.add(new_ac)
        else:
            # Для остальных компонентов (включая Storage) – добавляем новую запись
            existing = db.query(AssemblyComponent).filter(
                AssemblyComponent.assembly_id == assembly_id,
                AssemblyComponent.component_id == component_id
            ).first()
            if existing:
                existing.quantity += quantity
            else:
                new_ac = AssemblyComponent(assembly_id=assembly_id, component_id=component_id, quantity=quantity)
                db.add(new_ac)
        
        db.commit()
        AssemblyService._recalculate_totals(db, assembly_id)
        db.refresh(assembly)
        return assembly

    @staticmethod
    def remove_component(db: Session, assembly_id: int, component_id: int, user_id: int) -> Assembly:
        assembly = AssemblyService.get_assembly(db, assembly_id, user_id)
        ac = db.query(AssemblyComponent).filter(
            AssemblyComponent.assembly_id == assembly_id,
            AssemblyComponent.component_id == component_id
        ).first()
        if not ac:
            raise ValueError("Component not in assembly")
        db.delete(ac)
        db.commit()
        AssemblyService._recalculate_totals(db, assembly_id)
        db.refresh(assembly)
        return assembly

    @staticmethod
    def replace_component(db: Session, assembly_id: int, new_component_id: int, category: str, user_id: int) -> Assembly:
        """Заменяет компонент в уникальной категории"""
        assembly = AssemblyService.get_assembly(db, assembly_id, user_id)
        
        existing_ac = None
        for ac in assembly.components_rel:
            if ac.component.category == category:
                existing_ac = ac
                break
        
        if existing_ac:
            db.delete(existing_ac)
        
        new_ac = AssemblyComponent(assembly_id=assembly_id, component_id=new_component_id, quantity=1)
        db.add(new_ac)
        db.commit()
        
        AssemblyService._recalculate_totals(db, assembly_id)
        db.refresh(assembly)
        return assembly

    @staticmethod
    def update_component_quantity(db: Session, assembly_id: int, component_id: int, new_quantity: int, user_id: int) -> Assembly:
        """Обновить количество конкретного компонента в сборке (для RAM/Storage)"""
        assembly = AssemblyService.get_assembly(db, assembly_id, user_id)
        ac = db.query(AssemblyComponent).filter(
            AssemblyComponent.assembly_id == assembly_id,
            AssemblyComponent.component_id == component_id
        ).first()
        if not ac:
            raise ValueError("Component not in assembly")
        if new_quantity <= 0:
            db.delete(ac)
        else:
            ac.quantity = new_quantity
        db.commit()
        AssemblyService._recalculate_totals(db, assembly_id)
        db.refresh(assembly)
        return assembly

    @staticmethod
    def check_build_completeness(db: Session, assembly_id: int) -> Dict[str, Any]:
        """
        Проверяет, является ли сборка полной.
        Возвращает: {
            "is_complete": bool,
            "missing_categories": list,
            "missing_names": list,
            "message": str
        }
        """
        assembly = AssemblyService.get_assembly(db, assembly_id)
        categories = {ac.component.category for ac in assembly.components_rel}
        
        # Обязательные категории
        required = {'cpu', 'motherboard', 'ram', 'storage', 'psu'}
        
        # Проверяем наличие видеочипа в процессоре (если нет видеокарты)
        cpu = None
        for ac in assembly.components_rel:
            if ac.component.category == 'cpu':
                cpu = ac.component
                break
        
        has_integrated_gpu = cpu and cpu.specs_json.get('integrated_graphics', False)
        has_discrete_gpu = 'gpu' in categories
        
        missing = []
        for req in required:
            if req not in categories:
                missing.append(req)
        
        # Проверка видеокарты: если нет ни дискретной, ни встроенной
        if not has_discrete_gpu and not has_integrated_gpu:
            missing.append('gpu')
        
        is_complete = len(missing) == 0
        
        category_names = {
            'cpu': 'процессор',
            'motherboard': 'материнская плата',
            'ram': 'оперативная память',
            'storage': 'накопитель',
            'psu': 'блок питания',
            'gpu': 'видеокарта'
        }
        
        missing_names = [category_names.get(m, m) for m in missing]
        
        if is_complete:
            message = "Сборка полная"
        else:
            message = f"Отсутствуют: {', '.join(missing_names)}"
        
        return {
            "is_complete": is_complete,
            "missing_categories": missing,
            "missing_names": missing_names,
            "message": message
        }