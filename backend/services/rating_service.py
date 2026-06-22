from sqlalchemy.orm import Session
from typing import Dict, Any, Optional, List
from models import Component
import math


class RatingService:
    
    # Веса для разных типов сборок
    WEIGHTS = {
        "gaming": {
            "cpu": 0.25,
            "gpu": 0.50,
            "ram": 0.12,
            "storage": 0.08,
            "psu": 0.05
        },
        "workstation": {
            "cpu": 0.45,
            "gpu": 0.25,
            "ram": 0.15,
            "storage": 0.10,
            "psu": 0.05
        },
        "office": {
            "cpu": 0.35,
            "gpu": 0.05,
            "ram": 0.30,
            "storage": 0.20,
            "psu": 0.10
        },
        "universal": {
            "cpu": 0.30,
            "gpu": 0.30,
            "ram": 0.20,
            "storage": 0.15,
            "psu": 0.05
        }
    }
    
    # Эталонные значения для ценовых категорий
    PRICE_REFERENCES = {
        "budget": {
            "cpu_benchmark": 15000,
            "gpu_benchmark": 15000,
            "ram_capacity": 16,
            "storage_speed": 3500
        },
        "mid": {
            "cpu_benchmark": 25000,
            "gpu_benchmark": 25000,
            "ram_capacity": 32,
            "storage_speed": 5000
        },
        "high": {
            "cpu_benchmark": 40000,
            "gpu_benchmark": 40000,
            "ram_capacity": 64,
            "storage_speed": 7000
        }
    }
    
    @staticmethod
    def calculate_performance_score(db: Session, assembly_id: int, use_case: str = "gaming", price_category: str = "mid") -> Dict[str, Any]:
        """Рассчитывает рейтинг сборки (0-100) на основе цели и ценовой категории."""
        from services.assembly_service import AssemblyService
        
        try:
            assembly = AssemblyService.get_assembly(db, assembly_id)
            # Группируем компоненты по категориям в списки
            components_by_category = {}
            for ac in assembly.components_rel:
                cat = ac.component.category
                if cat not in components_by_category:
                    components_by_category[cat] = []
                components_by_category[cat].append(ac.component)
        except ValueError:
            return {"error": "Assembly not found", "score": 0}
        
        weights = RatingService.WEIGHTS.get(use_case, RatingService.WEIGHTS["universal"])
        references = RatingService.PRICE_REFERENCES.get(price_category, RatingService.PRICE_REFERENCES["mid"])
        
        scores = {}
        
        # CPU (один)
        cpu_list = components_by_category.get("cpu", [])
        if cpu_list:
            cpu = cpu_list[0]
            scores["cpu"] = RatingService._score_cpu(cpu, use_case, references)
        else:
            scores["cpu"] = 0
        
        # GPU (один)
        gpu_list = components_by_category.get("gpu", [])
        if gpu_list:
            gpu = gpu_list[0]
            scores["gpu"] = RatingService._score_gpu(gpu, use_case, references)
        else:
            scores["gpu"] = 0
        
        # RAM (список)
        ram_list = components_by_category.get("ram", [])
        if ram_list:
            scores["ram"] = RatingService._score_ram_list(ram_list, use_case, references)
        else:
            scores["ram"] = 0
        
        # Storage (список)
        storage_list = components_by_category.get("storage", [])
        if storage_list:
            scores["storage"] = RatingService._score_storage_list(storage_list, use_case, references)
        else:
            scores["storage"] = 0
        
        # PSU (один)
        psu_list = components_by_category.get("psu", [])
        if psu_list:
            psu = psu_list[0]
            all_components = []
            for cat, comps in components_by_category.items():
                all_components.extend(comps)
            scores["psu"] = RatingService._score_psu(psu, all_components)
        else:
            scores["psu"] = 0
        
        total_score = 0
        for component, score in scores.items():
            total_score += score * weights.get(component, 0)
        
        total_score = min(100, max(0, total_score))
        
        recommendations = RatingService._generate_recommendations(scores, weights, use_case, price_category, components_by_category)
        
        return {
            "score": round(total_score, 1),
            "use_case": use_case,
            "price_category": price_category,
            "components_scores": scores,
            "recommendations": recommendations
        }
    
    @staticmethod
    def _score_cpu(cpu: Component, use_case: str, references: dict) -> float:
        benchmark = cpu.specs_json.get("benchmark_score", 0)
        price = cpu.price
        
        if references["cpu_benchmark"] > 0:
            benchmark_score = min(100, (benchmark / references["cpu_benchmark"]) * 100)
        else:
            benchmark_score = 50
        
        if use_case == "gaming":
            clock = cpu.specs_json.get("boost_clock", 3.0)
            clock_score = min(100, (clock / 6.0) * 100)
            return benchmark_score * 0.6 + clock_score * 0.4
        elif use_case == "workstation":
            cores = cpu.specs_json.get("cores", 4)
            cores_score = min(100, (cores / 24) * 100)
            return benchmark_score * 0.5 + cores_score * 0.5
        elif use_case == "office":
            price_score = max(0, 100 - (price / 20000) * 100)
            return benchmark_score * 0.3 + price_score * 0.7
        else:
            return benchmark_score
    
    @staticmethod
    def _score_gpu(gpu: Component, use_case: str, references: dict) -> float:
        benchmark = gpu.specs_json.get("benchmark_score", 0)
        if references["gpu_benchmark"] > 0:
            benchmark_score = min(100, (benchmark / references["gpu_benchmark"]) * 100)
        else:
            benchmark_score = 50
        
        if use_case == "gaming":
            return min(100, benchmark_score * 1.2)
        elif use_case == "workstation":
            vram = gpu.specs_json.get("memory_size", 4)
            vram_score = min(100, (vram / 24) * 100)
            return benchmark_score * 0.6 + vram_score * 0.4
        elif use_case == "office":
            return max(0, benchmark_score * 0.3)
        else:
            return benchmark_score
    
    @staticmethod
    def _score_ram_list(ram_list: List[Component], use_case: str, references: dict) -> float:
        """Оценка списка модулей ОЗУ (суммируем ёмкость, берём минимальную скорость)."""
        if not ram_list:
            return 0
        
        total_capacity = sum(r.specs_json.get("capacity", 0) for r in ram_list)
        speeds = [r.specs_json.get("speed", 2400) for r in ram_list]
        min_speed = min(speeds) if speeds else 2400
        
        if references["ram_capacity"] > 0:
            capacity_score = min(100, (total_capacity / references["ram_capacity"]) * 100)
        else:
            capacity_score = 50
        
        speed_score = min(100, (min_speed / 6000) * 100)
        
        if use_case == "gaming":
            return capacity_score * 0.4 + speed_score * 0.6
        elif use_case == "workstation":
            return capacity_score * 0.7 + speed_score * 0.3
        else:
            return capacity_score * 0.8 + speed_score * 0.2
    
    @staticmethod
    def _score_storage_list(storage_list: List[Component], use_case: str, references: dict) -> float:
        """Оценка списка накопителей (суммируем ёмкость, берём максимальную скорость)."""
        if not storage_list:
            return 0
        
        total_capacity = sum(s.specs_json.get("capacity", 0) for s in storage_list)
        speeds = [s.specs_json.get("read_speed", 500) for s in storage_list]
        max_speed = max(speeds) if speeds else 500
        
        capacity_score = min(100, (total_capacity / 4000) * 100)
        if references["storage_speed"] > 0:
            speed_score = min(100, (max_speed / references["storage_speed"]) * 100)
        else:
            speed_score = 50
        
        has_nvme = any(s.specs_json.get("type") == "NVMe" for s in storage_list)
        
        if use_case == "gaming":
            return capacity_score * 0.4 + speed_score * 0.6 + (20 if has_nvme else 0)
        else:
            return capacity_score * 0.7 + speed_score * 0.3
    
    @staticmethod
    def _score_psu(psu: Component, all_components: List[Component]) -> float:
        total_tdp = sum(comp.specs_json.get("tdp", 0) for comp in all_components)
        if total_tdp == 0:
            return 50
        
        psu_wattage = psu.specs_json.get("power_watts", 0)
        recommended = total_tdp * 1.25
        if recommended == 0:
            return 50
        
        ratio = psu_wattage / recommended
        if ratio < 0.9:
            return max(0, (ratio / 0.9) * 50)
        elif ratio > 1.5:
            return max(0, 100 - ((ratio - 1.5) / 1.5) * 50)
        else:
            return 100
    
    @staticmethod
    def _generate_recommendations(scores: dict, weights: dict, use_case: str, price_category: str, components_by_category: dict) -> list:
        recommendations = []
        
        category_names = {
            "cpu": "процессор",
            "gpu": "видеокарта",
            "ram": "оперативная память",
            "storage": "накопитель",
            "psu": "блок питания"
        }
        
        # Дополнительные проверки на основе агрегированных характеристик
        ram_list = components_by_category.get("ram", [])
        if ram_list:
            total_ram_capacity = sum(r.specs_json.get("capacity", 0) for r in ram_list)
            if total_ram_capacity < 16:
                recommendations.append({
                    "component": "ram",
                    "message": f"⚠️ Общий объём ОЗУ ({total_ram_capacity}ГБ) может быть недостаточен. Рекомендуется от 16ГБ.",
                    "current_score": scores.get("ram", 0)
                })
        
        storage_list = components_by_category.get("storage", [])
        if storage_list:
            total_storage_capacity = sum(s.specs_json.get("capacity", 0) for s in storage_list)
            if total_storage_capacity < 512:
                recommendations.append({
                    "component": "storage",
                    "message": f"⚠️ Общий объём накопителей ({total_storage_capacity}ГБ) может быть мал. Рекомендуется от 512ГБ.",
                    "current_score": scores.get("storage", 0)
                })
        
        for component, score in scores.items():
            if score < 50 and weights.get(component, 0) > 0.05:
                recommendations.append({
                    "component": category_names.get(component, component),
                    "message": f"Рекомендуется улучшить {category_names.get(component, component)}. Текущая оценка: {score:.0f}%.",
                    "current_score": score
                })
            elif score < 30 and weights.get(component, 0) > 0.03:
                recommendations.append({
                    "component": category_names.get(component, component),
                    "message": f"Критически низкая оценка {category_names.get(component, component)} ({score:.0f}%). Настоятельно рекомендуется замена.",
                    "current_score": score
                })
        
        return recommendations