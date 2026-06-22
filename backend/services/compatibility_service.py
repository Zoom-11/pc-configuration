from typing import List, Dict, Any, Set, Tuple, Optional
from sqlalchemy.orm import Session
from models import Component
from services.assembly_service import AssemblyService


class CompatibilityService:

    @staticmethod
    def get_unique_categories() -> List[str]:
        """Возвращает список категорий, которые должны быть уникальными в сборке"""
        return ['cpu', 'gpu', 'motherboard', 'psu', 'cooler', 'case']

    @staticmethod
    def get_total_ram_count(db: Session, assembly_id: int) -> int:
        """Возвращает общее количество планок ОЗУ в сборке (сумма quantity по всем RAM)"""
        try:
            assembly = AssemblyService.get_assembly(db, assembly_id)
            total = 0
            for ac in assembly.components_rel:
                if ac.component.category == 'ram':
                    total += ac.quantity
            return total
        except ValueError:
            return 0

    @staticmethod
    def get_total_storage_count(db: Session, assembly_id: int) -> int:
        """Возвращает общее количество накопителей в сборке (сумма quantity по всем Storage)"""
        try:
            assembly = AssemblyService.get_assembly(db, assembly_id)
            total = 0
            for ac in assembly.components_rel:
                if ac.component.category == 'storage':
                    total += ac.quantity
            return total
        except ValueError:
            return 0

    @staticmethod
    def check_unique_constraint(db: Session, assembly_id: int, category: str, component_id: int) -> Tuple[bool, str]:
        """
        Проверяет, можно ли добавить компонент в уникальную категорию.
        Возвращает (можно, причина_замены_или_ошибки)
        """
        if category not in CompatibilityService.get_unique_categories():
            return True, ""
        
        try:
            assembly = AssemblyService.get_assembly(db, assembly_id)
            existing = None
            for ac in assembly.components_rel:
                if ac.component.category == category:
                    existing = ac.component
                    break
            
            if existing:
                if existing.id == component_id:
                    return False, "Этот компонент уже установлен"
                return True, f"Будет заменён: {existing.model_name} → новый компонент"
            return True, ""
        except ValueError:
            return True, ""

    @staticmethod
    def check_pair_compatibility(comp1: Component, comp2: Component) -> Tuple[bool, str]:
        """Проверяет совместимость двух компонентов. Возвращает (совместимы, причина_несовместимости)"""
        
        # 1. CPU <-> Motherboard (socket)
        if comp1.category == "cpu" and comp2.category == "motherboard":
            cpu_socket = comp1.specs_json.get("socket")
            mb_socket = comp2.specs_json.get("socket")
            if cpu_socket and mb_socket and cpu_socket != mb_socket:
                return False, f"Сокет процессора {cpu_socket} не подходит для материнской платы с сокетом {mb_socket}"
            return True, ""
        if comp2.category == "cpu" and comp1.category == "motherboard":
            return CompatibilityService.check_pair_compatibility(comp2, comp1)
        
        # 2. RAM <-> Motherboard (тип памяти)
        if comp1.category == "ram" and comp2.category == "motherboard":
            ram_type = comp1.specs_json.get("type")
            mb_ram_type = comp2.specs_json.get("ram_type")
            if ram_type and mb_ram_type and ram_type != mb_ram_type:
                return False, f"Тип памяти {ram_type} не поддерживается материнской платой (требуется {mb_ram_type})"
            # Проверка максимальной частоты
            ram_speed = comp1.specs_json.get("speed", 0)
            max_speed = comp2.specs_json.get("max_ram_speed", 0)
            if max_speed and ram_speed > max_speed:
                return False, f"ОЗУ {ram_speed}МГц быстрее максимально поддерживаемой материнской платой ({max_speed}МГц)"
            return True, ""
        if comp2.category == "ram" and comp1.category == "motherboard":
            return CompatibilityService.check_pair_compatibility(comp2, comp1)
        
        # 3. Cooler <-> CPU (сокет и TDP)
        if comp1.category == "cooler" and comp2.category == "cpu":
            cooler_sockets = comp1.specs_json.get("socket_support", [])
            cpu_socket = comp2.specs_json.get("socket")
            if cooler_sockets and cpu_socket and cpu_socket not in cooler_sockets:
                return False, f"Кулер не поддерживает сокет {cpu_socket}"
            cooler_tdp = comp1.specs_json.get("tdp_max", 0)
            cpu_tdp = comp2.specs_json.get("tdp", 0)
            if cooler_tdp and cpu_tdp and cooler_tdp < cpu_tdp:
                return False, f"Кулер рассчитан на TDP {cooler_tdp}Вт, а процессор потребляет {cpu_tdp}Вт"
            return True, ""
        if comp2.category == "cooler" and comp1.category == "cpu":
            return CompatibilityService.check_pair_compatibility(comp2, comp1)
        
        # 4. Case <-> Motherboard (форм-фактор)
        if comp1.category == "case" and comp2.category == "motherboard":
            case_form_factors = comp1.specs_json.get("supported_form_factors", ["ATX", "mATX", "ITX"])
            mb_form_factor = comp2.specs_json.get("form_factor", "ATX")
            if mb_form_factor not in case_form_factors:
                return False, f"Корпус не поддерживает форм-фактор материнской платы {mb_form_factor}"
            return True, ""
        if comp2.category == "case" and comp1.category == "motherboard":
            return CompatibilityService.check_pair_compatibility(comp2, comp1)
        
        # 5. Case <-> GPU (длина)
        if comp1.category == "case" and comp2.category == "gpu":
            case_max_gpu = comp1.specs_json.get("max_gpu_length", 350)
            gpu_length = comp2.specs_json.get("length", 300)
            if gpu_length > case_max_gpu:
                return False, f"Видеокарта длиной {gpu_length}мм не помещается в корпус (макс. {case_max_gpu}мм)"
            return True, ""
        if comp2.category == "case" and comp1.category == "gpu":
            return CompatibilityService.check_pair_compatibility(comp2, comp1)
        
        # 6. Case <-> Cooler (высота)
        if comp1.category == "case" and comp2.category == "cooler":
            case_max_cooler = comp1.specs_json.get("max_cpu_cooler_height", 160)
            cooler_height = comp2.specs_json.get("height", 150)
            if cooler_height > case_max_cooler:
                return False, f"Кулер высотой {cooler_height}мм не помещается в корпус (макс. {case_max_cooler}мм)"
            return True, ""
        if comp2.category == "case" and comp1.category == "cooler":
            return CompatibilityService.check_pair_compatibility(comp2, comp1)
        
        return True, ""

    @staticmethod
    def get_compatible_component_ids(db: Session, assembly_id: int, category: str) -> Optional[Set[int]]:
        """Возвращает ID компонентов, совместимых с текущей сборкой."""
        try:
            assembly = AssemblyService.get_assembly(db, assembly_id)
            current_components = {ac.component.category: ac.component for ac in assembly.components_rel}
        except ValueError:
            return None
        
        if not current_components:
            return None
        
        all_components = db.query(Component).filter(Component.category == category).all()
        compatible_ids = set()
        
        for comp in all_components:
            is_compatible = True
            for existing in current_components.values():
                compatible, _ = CompatibilityService.check_pair_compatibility(comp, existing)
                if not compatible:
                    is_compatible = False
                    break
            if is_compatible:
                compatible_ids.add(comp.id)
        
        return compatible_ids

    @staticmethod
    def get_incompatibility_reason(db: Session, component: Component, assembly_id: int) -> str:
        """Возвращает причину несовместимости компонента с текущей сборкой"""
        try:
            assembly = AssemblyService.get_assembly(db, assembly_id)
            for ac in assembly.components_rel:
                existing = ac.component
                compatible, reason = CompatibilityService.check_pair_compatibility(component, existing)
                if not compatible:
                    return reason
            return "Несовместим с выбранными компонентами"
        except:
            return "Несовместим с выбранными компонентами"

    @staticmethod
    def can_add_more_ram(db: Session, assembly_id: int, ram_component: Component) -> Tuple[bool, str]:
        """Проверяет, можно ли добавить ещё одну планку ОЗУ (максимум 4 всего)."""
        try:
            total_ram = CompatibilityService.get_total_ram_count(db, assembly_id)
            if total_ram >= 4:
                return False, "Максимальное количество планок ОЗУ в сборке: 4"
            
            assembly = AssemblyService.get_assembly(db, assembly_id)
            motherboard = None
            for ac in assembly.components_rel:
                if ac.component.category == "motherboard":
                    motherboard = ac.component
                    break
            
            if motherboard:
                max_slots = motherboard.specs_json.get("ram_slots", 4)
                if total_ram >= max_slots:
                    return False, f"Материнская плата имеет только {max_slots} слота(ов) для ОЗУ, все заняты"
            
            return True, ""
        except Exception:
            return True, ""

    @staticmethod
    def can_add_more_storage(db: Session, assembly_id: int) -> Tuple[bool, str, int, int]:
        """Проверяет, можно ли добавить ещё накопитель (максимум 4 всего)."""
        try:
            total_storage = CompatibilityService.get_total_storage_count(db, assembly_id)
            if total_storage >= 4:
                return False, f"Максимальное количество накопителей в сборке: 4", total_storage, 0
            
            return True, "", total_storage, 0
        except Exception:
            return True, "", 0, 0

    @staticmethod
    def calculate_total_power_consumption(components: Dict[str, Component]) -> int:
        """Суммирует TDP всех компонентов сборки."""
        total = 0
        for comp in components.values():
            total += comp.specs_json.get("tdp", 0)
        return total

    @staticmethod
    def check_psu_sufficient(psu: Component, components: Dict[str, Component]) -> Tuple[bool, str, int]:
        """Проверяет, достаточно ли мощности блока питания."""
        total_tdp = CompatibilityService.calculate_total_power_consumption(components)
        psu_wattage = psu.specs_json.get("power_watts", 0)
        recommended = int(total_tdp * 1.25)
        
        if psu_wattage < total_tdp:
            return False, f"Блок питания {psu_wattage}Вт не справится с нагрузкой {total_tdp}Вт. Рекомендуется минимум {recommended}Вт", recommended
        elif psu_wattage < recommended:
            return True, f"Блок питания {psu_wattage}Вт работает на пределе. Рекомендуется {recommended}Вт для запаса", recommended
        return True, f"Запас мощности достаточен ({psu_wattage - total_tdp}Вт в запасе)", recommended

    @staticmethod
    def get_all_constraints(db: Session, assembly_id: int) -> Dict[str, Any]:
        """Собирает все ошибки, предупреждения и ограничения сборки."""
        try:
            assembly = AssemblyService.get_assembly(db, assembly_id)
            components = {ac.component.category: ac.component for ac in assembly.components_rel}
        except ValueError:
            return {"errors": [], "warnings": [], "can_add_more_ram": True, "can_add_more_storage": True, "total_power": 0, "recommended_psu": 0}
        
        errors = []
        warnings = []
        
        # 1. Проверка совместимости всех пар
        cats = list(components.keys())
        for i in range(len(cats)):
            for j in range(i + 1, len(cats)):
                comp1 = components[cats[i]]
                comp2 = components[cats[j]]
                ok, reason = CompatibilityService.check_pair_compatibility(comp1, comp2)
                if not ok:
                    errors.append(reason)
        
        # 2. Блок питания
        if "psu" in components and (components.get("cpu") or components.get("gpu")):
            sufficient, msg, _ = CompatibilityService.check_psu_sufficient(components["psu"], components)
            if not sufficient:
                errors.append(msg)
            elif "пределе" in msg:
                warnings.append(msg)
        
        # 3. Охлаждение процессора
        if "cpu" in components and "cooler" in components:
            cpu_tdp = components["cpu"].specs_json.get("tdp", 0)
            cooler_tdp = components["cooler"].specs_json.get("tdp_max", 0)
            if cooler_tdp and cpu_tdp and cooler_tdp < cpu_tdp:
                errors.append(f"Кулер рассчитан на TDP {cooler_tdp}Вт, но процессор потребляет {cpu_tdp}Вт")
        
        # 4. Количество планок ОЗУ
        if "motherboard" in components:
            max_slots = components["motherboard"].specs_json.get("ram_slots", 4)
            ram_count = CompatibilityService.get_total_ram_count(db, assembly_id)
            if ram_count > max_slots:
                errors.append(f"Установлено {ram_count} планок ОЗУ, но материнская плата имеет только {max_slots} слотов")
        
        # 5. Количество накопителей
        if "motherboard" in components:
            mb = components["motherboard"]
            max_m2 = mb.specs_json.get("m2_slots", 2)
            max_sata = mb.specs_json.get("sata_ports", 4)
            # Подсчёт M.2 и SATA накопителей по типам
            m2_used = 0
            sata_used = 0
            for ac in assembly.components_rel:
                if ac.component.category == "storage":
                    if ac.component.specs_json.get("type") == "NVMe":
                        m2_used += ac.quantity
                    else:
                        sata_used += ac.quantity
            if m2_used > max_m2:
                errors.append(f"Установлено {m2_used} M.2 накопителей, но материнская плата имеет только {max_m2} слота")
            if sata_used > max_sata:
                errors.append(f"Установлено {sata_used} SATA накопителей, но материнская плата имеет только {max_sata} портов")
        
        # 6. Корпус и видеокарта
        if "case" in components and "gpu" in components:
            case = components["case"]
            gpu = components["gpu"]
            case_max_len = case.specs_json.get("max_gpu_length", 350)
            gpu_len = gpu.specs_json.get("length", 300)
            if gpu_len > case_max_len:
                errors.append(f"Видеокарта длиной {gpu_len}мм не помещается в корпус (макс. {case_max_len}мм)")
        
        # 7. Корпус и кулер
        if "case" in components and "cooler" in components:
            case_max_h = components["case"].specs_json.get("max_cpu_cooler_height", 160)
            cooler_h = components["cooler"].specs_json.get("height", 150)
            if cooler_h > case_max_h:
                errors.append(f"Кулер высотой {cooler_h}мм не помещается в корпус (макс. {case_max_h}мм)")
        
        # 8. Форм-фактор корпуса
        if "case" in components and "motherboard" in components:
            supported = components["case"].specs_json.get("supported_form_factors", ["ATX", "mATX", "ITX"])
            mb_ff = components["motherboard"].specs_json.get("form_factor", "ATX")
            if mb_ff not in supported:
                errors.append(f"Корпус не поддерживает форм-фактор материнской платы {mb_ff}")
        
        total_power = CompatibilityService.calculate_total_power_consumption(components)
        recommended_psu = int(total_power * 1.25)
        
        return {
            "errors": errors,
            "warnings": warnings,
            "can_add_more_ram": CompatibilityService.get_total_ram_count(db, assembly_id) < 4,
            "can_add_more_storage": CompatibilityService.get_total_storage_count(db, assembly_id) < 4,
            "total_power": total_power,
            "recommended_psu": recommended_psu
        }

    @staticmethod
    def calculate_bottlenecks(db: Session, assembly_id: int) -> Dict[str, Any]:
        """Рассчитывает узкие места (bottlenecks) в сборке."""
        try:
            assembly = AssemblyService.get_assembly(db, assembly_id)
            components = {ac.component.category: ac.component for ac in assembly.components_rel}
        except ValueError:
            return {"error": "Assembly not found", "score": 100, "issues": [], "warnings": []}
        
        bottlenecks = {"score": 100, "issues": [], "warnings": []}
        
        cpu = components.get("cpu")
        gpu = components.get("gpu")
        motherboard = components.get("motherboard")
        psu = components.get("psu")
        cooler = components.get("cooler")
        case = components.get("case")
        
        # 1. CPU-GPU баланс
        if cpu and gpu:
            cpu_score = cpu.specs_json.get("benchmark_score", 0)
            gpu_score = gpu.specs_json.get("benchmark_score", 0)
            if cpu_score and gpu_score:
                ratio = cpu_score / gpu_score
                if ratio < 0.7:
                    bottlenecks["score"] -= 30
                    bottlenecks["issues"].append({
                        "type": "cpu_bottleneck",
                        "message": f"⚠️ Процессор {cpu.model_name} может не раскрыть потенциал видеокарты {gpu.model_name}",
                        "recommendation": "Рассмотрите более мощный процессор"
                    })
                elif ratio > 1.3:
                    bottlenecks["score"] -= 20
                    bottlenecks["issues"].append({
                        "type": "gpu_bottleneck",
                        "message": f"⚠️ Видеокарта {gpu.model_name} слабовата для процессора {cpu.model_name}",
                        "recommendation": "Рассмотрите более мощную видеокарту"
                    })
        
        # 2. Объём ОЗУ (суммарный)
        total_ram_capacity = 0
        for ac in assembly.components_rel:
            if ac.component.category == 'ram':
                total_ram_capacity += ac.component.specs_json.get("capacity", 0) * ac.quantity
        if total_ram_capacity < 16:
            bottlenecks["score"] -= 15
            bottlenecks["issues"].append({
                "type": "ram_capacity",
                "message": f"⚠️ Оперативной памяти {total_ram_capacity}ГБ может не хватить для современных задач",
                "recommendation": "Рекомендуется 16ГБ и более"
            })
        elif total_ram_capacity < 32 and gpu and gpu.specs_json.get("benchmark_score", 0) > 20000:
            bottlenecks["warnings"].append(f"💡 Для мощной видеокарты рекомендуется 32ГБ ОЗУ (сейчас {total_ram_capacity}ГБ)")
        
        # 3. Скорость ОЗУ и поддержка материнской платой
        if ram_list := [ac.component for ac in assembly.components_rel if ac.component.category == 'ram']:
            if motherboard:
                min_speed = min(r.specs_json.get("speed", 0) for r in ram_list)
                max_speed = motherboard.specs_json.get("max_ram_speed", 0)
                if max_speed and min_speed > max_speed:
                    bottlenecks["score"] -= 10
                    bottlenecks["issues"].append({
                        "type": "ram_speed",
                        "message": f"⚠️ ОЗУ {min_speed}МГц быстрее, чем поддерживает материнская плата ({max_speed}МГц)",
                        "recommendation": "ОЗУ будет работать на пониженной частоте"
                    })
        
        # 4. Блок питания
        if psu and (cpu or gpu):
            psu_w = psu.specs_json.get("power_watts", 0)
            total_tdp = 0
            if cpu:
                total_tdp += cpu.specs_json.get("tdp", 0)
            if gpu:
                total_tdp += gpu.specs_json.get("tdp", 0)
            if total_tdp > 0:
                recommended = int(total_tdp * 1.25)
                if psu_w < total_tdp:
                    bottlenecks["score"] -= 40
                    bottlenecks["issues"].append({
                        "type": "psu_insufficient",
                        "message": f"⚠️ Блок питания {psu_w}Вт не справится с нагрузкой {total_tdp}Вт",
                        "recommendation": f"Рекомендуется БП мощностью от {recommended}Вт"
                    })
                elif psu_w < recommended:
                    bottlenecks["score"] -= 15
                    bottlenecks["warnings"].append(f"⚡ Блок питания {psu_w}Вт работает на пределе. Рекомендуется {recommended}Вт")
        
        # 5. Охлаждение процессора
        if cpu and cooler:
            cpu_tdp = cpu.specs_json.get("tdp", 0)
            cooler_tdp = cooler.specs_json.get("tdp_max", 0)
            if cooler_tdp and cpu_tdp and cooler_tdp < cpu_tdp:
                bottlenecks["score"] -= 25
                bottlenecks["issues"].append({
                    "type": "cooler_insufficient",
                    "message": f"⚠️ Кулер рассчитан на TDP {cooler_tdp}Вт, но процессор потребляет {cpu_tdp}Вт",
                    "recommendation": "Замените кулер на более мощный"
                })
        
        # 6. Корпус и видеокарта
        if case and gpu:
            case_max_len = case.specs_json.get("max_gpu_length", 350)
            gpu_len = gpu.specs_json.get("length", 300)
            if gpu_len > case_max_len:
                bottlenecks["score"] -= 30
                bottlenecks["issues"].append({
                    "type": "case_gpu_fit",
                    "message": f"⚠️ Видеокарта длиной {gpu_len}мм не помещается в корпус (макс. {case_max_len}мм)",
                    "recommendation": "Выберите корпус побольше или видеокарту покороче"
                })
        
        # 7. Корпус и кулер
        if case and cooler:
            case_max_h = case.specs_json.get("max_cpu_cooler_height", 160)
            cooler_h = cooler.specs_json.get("height", 150)
            if cooler_h > case_max_h:
                bottlenecks["score"] -= 20
                bottlenecks["issues"].append({
                    "type": "case_cooler_fit",
                    "message": f"⚠️ Кулер высотой {cooler_h}мм не помещается в корпус (макс. {case_max_h}мм)",
                    "recommendation": "Выберите корпус пошире или кулер пониже"
                })
        
        # 8. Форм-фактор
        if case and motherboard:
            supported = case.specs_json.get("supported_form_factors", ["ATX", "mATX", "ITX"])
            mb_ff = motherboard.specs_json.get("form_factor", "ATX")
            if mb_ff not in supported:
                bottlenecks["score"] -= 25
                bottlenecks["issues"].append({
                    "type": "case_motherboard_fit",
                    "message": f"⚠️ Корпус не поддерживает форм-фактор материнской платы {mb_ff}",
                    "recommendation": f"Поддерживаемые форм-факторы: {', '.join(supported)}"
                })
        
        bottlenecks["score"] = max(bottlenecks["score"], 0)
        return bottlenecks