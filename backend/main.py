import os
from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from sqlalchemy import func
from pydantic import BaseModel, EmailStr

from database import get_db
from models import Component, Assembly, User, Rating, AssemblyComponent, Order
from schemas import (
    ComponentResponse, ComponentCreate, AssemblyResponse, UserCreate, UserResponse,
    AssemblyCreate, AssemblyUpdate, AssemblyComponentAdd, RatingCreate,
    UserUpdateProfile, PasswordChange, OrderBase, OrderCreate, OrderResponse,
    OrderUpdate, UserAdminResponse, UserRoleUpdate
)
from auth import (
    authenticate_user, create_access_token, get_current_user, get_current_user_optional,
    get_password_hash, verify_password, ACCESS_TOKEN_EXPIRE_MINUTES
)
from services.assembly_service import AssemblyService
from services.compatibility_service import CompatibilityService
from services.rating_service import RatingService

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")

app = FastAPI(title="PC Configurator API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Статические файлы
if os.path.exists(os.path.join(FRONTEND_DIR, "css")):
    app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
if os.path.exists(os.path.join(FRONTEND_DIR, "js")):
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")
if os.path.exists(os.path.join(FRONTEND_DIR, "images")):
    app.mount("/images", StaticFiles(directory=os.path.join(FRONTEND_DIR, "images")), name="images")

# HTML страницы
@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/builder.html")
async def serve_builder():
    return FileResponse(os.path.join(FRONTEND_DIR, "builder.html"))

@app.get("/build.html")
async def serve_build():
    return FileResponse(os.path.join(FRONTEND_DIR, "build.html"))

@app.get("/profile.html")
async def serve_profile():
    return FileResponse(os.path.join(FRONTEND_DIR, "profile.html"))

@app.get("/my-assemblies.html")
async def serve_my_assemblies():
    return FileResponse(os.path.join(FRONTEND_DIR, "my-assemblies.html"))

@app.get("/admin.html")
async def serve_admin():
    return FileResponse(os.path.join(FRONTEND_DIR, "admin.html"))

# ---------- API ----------
@app.get("/api/components", response_model=List[ComponentResponse])
def get_components(
    category: str = Query(...),
    price_min: Optional[float] = Query(None, ge=0),
    price_max: Optional[float] = Query(None, ge=0),
    assembly_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    from services.compatibility_service import CompatibilityService
    
    # Базовый запрос по категории
    query = db.query(Component).filter(Component.category == category)
    
    # Фильтр по цене
    if price_min is not None:
        query = query.filter(Component.price >= price_min)
    if price_max is not None:
        query = query.filter(Component.price <= price_max)
    
    # Получаем компоненты
    components = query.all()
    
    # Приводим поле images к списку для каждого компонента
    for comp in components:
        if comp.images is None:
            comp.images = []
        elif not isinstance(comp.images, list):
            comp.images = [comp.images] if comp.images else []
    
    # Если передан assembly_id – проверяем совместимость
    if assembly_id:
        compatible_ids = CompatibilityService.get_compatible_component_ids(db, assembly_id, category)
        if compatible_ids is not None:
            result = []
            for comp in components:
                comp.is_compatible = comp.id in compatible_ids
                if not comp.is_compatible:
                    reason = CompatibilityService.get_incompatibility_reason(db, comp, assembly_id)
                    comp.incompatibility_reason = reason or "Несовместим с выбранными компонентами"
                result.append(comp)
            return result
    
    return components

@app.get("/api/components/{component_id}", response_model=ComponentResponse)
def get_component(component_id: int, db: Session = Depends(get_db)):
    component = db.query(Component).filter(Component.id == component_id).first()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    if component.images is None:
        component.images = []
    elif not isinstance(component.images, list):
        component.images = [component.images] if component.images else []
    return component

@app.get("/api/assemblies/public", response_model=List[AssemblyResponse])
def get_public_assemblies(limit: int = 10, db: Session = Depends(get_db)):
    return db.query(Assembly).filter(Assembly.is_public == True).order_by(Assembly.performance_score.desc().nullslast()).limit(limit).all()

# ---------- Аутентификация ----------
from schemas import UserCreate, UserResponse

@app.post("/api/auth/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(
        (User.username == user.username) | (User.email == user.email)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already registered")
    hashed = get_password_hash(user.password)
    new_user = User(username=user.username, email=user.email, hashed_password=hashed)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/api/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},  # <-- добавляем роль
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/users/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

# ---------- Профиль ----------
@app.put("/api/users/me")
def update_user_profile(update: UserUpdateProfile, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if update.username:
        existing = db.query(User).filter(User.username == update.username, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = update.username
    if update.email:
        existing = db.query(User).filter(User.email == update.email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        current_user.email = update.email
    if update.phone:
        current_user.phone = update.phone
    db.commit()
    db.refresh(current_user)
    return {"message": "Profile updated", "user": current_user}

@app.post("/api/users/change-password")
def change_password(data: PasswordChange, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not verify_password(data.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect old password")
    current_user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    return {"message": "Password changed"}

# ---------- Сборки ----------
@app.post("/api/assemblies", response_model=AssemblyResponse)
def create_assembly(data: AssemblyCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return AssemblyService.create_assembly(db, current_user.id, data)

@app.get("/api/assemblies/my", response_model=List[AssemblyResponse])
def get_my_assemblies(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Assembly).filter(Assembly.user_id == current_user.id).order_by(Assembly.created_at.desc()).all()

@app.get("/api/assemblies/{assembly_id}", response_model=AssemblyResponse)
def get_assembly(assembly_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_optional)):
    assembly = db.query(Assembly).filter(Assembly.id == assembly_id).first()
    if not assembly:
        raise HTTPException(status_code=404, detail="Assembly not found")
    if not assembly.is_public and (not current_user or current_user.id != assembly.user_id):
        if current_user and current_user.role in ["admin", "manager"]:
            pass
        else:
            raise HTTPException(status_code=403, detail="Not authorized")
    return assembly

@app.put("/api/assemblies/{assembly_id}", response_model=AssemblyResponse)
def update_assembly(assembly_id: int, data: AssemblyUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        if data.is_public == True:
            completeness = AssemblyService.check_build_completeness(db, assembly_id)
            if not completeness["is_complete"]:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Нельзя опубликовать сборку. {completeness['message']}"
                )
        return AssemblyService.update_assembly(db, assembly_id, data, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/api/assemblies/{assembly_id}/components", response_model=AssemblyResponse)
def add_component_to_assembly(
    assembly_id: int,
    item: AssemblyComponentAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    component = db.query(Component).filter(Component.id == item.component_id).first()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    
    can_add, message = CompatibilityService.check_unique_constraint(db, assembly_id, component.category, component.id)
    if not can_add:
        raise HTTPException(status_code=400, detail=message)
    
    unique_categories = CompatibilityService.get_unique_categories()
    
    if component.category in unique_categories:
        try:
            assembly = AssemblyService.replace_component(db, assembly_id, item.component_id, component.category, current_user.id)
            AssemblyService._recalculate_totals(db, assembly_id)
            return assembly
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        if component.category == "ram":
            can_add, reason = CompatibilityService.can_add_more_ram(db, assembly_id, component)
            if not can_add:
                raise HTTPException(status_code=400, detail=reason)
        if component.category == "storage":
            can_add, reason, _, _ = CompatibilityService.can_add_more_storage(db, assembly_id)
            if not can_add:
                raise HTTPException(status_code=400, detail=reason)
        
        assembly = db.query(Assembly).filter(Assembly.id == assembly_id).first()
        if assembly:
            for ac in assembly.components_rel:
                existing = ac.component
                compatible, reason = CompatibilityService.check_pair_compatibility(component, existing)
                if not compatible:
                    raise HTTPException(status_code=400, detail=reason)
        
        try:
            assembly = AssemblyService.add_component(db, assembly_id, item.component_id, item.quantity, current_user.id)
            return assembly
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/assemblies/{assembly_id}/components/{component_id}", response_model=AssemblyResponse)
def remove_component_from_assembly(
    assembly_id: int,
    component_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        assembly = AssemblyService.remove_component(db, assembly_id, component_id, current_user.id)
        AssemblyService._recalculate_totals(db, assembly_id)
        return assembly
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/api/assemblies/{assembly_id}/components", response_model=List[dict])
def get_assembly_components(
    assembly_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_optional)
):
    assembly = db.query(Assembly).filter(Assembly.id == assembly_id).first()
    if not assembly:
        raise HTTPException(status_code=404, detail="Assembly not found")
    
    if not assembly.is_public:
        if current_user is None:
            raise HTTPException(status_code=403, detail="Not authorized")
        if current_user.id != assembly.user_id and current_user.role not in ["admin", "manager"]:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    result = []
    for ac in assembly.components_rel:
        comp = ac.component
        # Приводим images к списку
        images = comp.images if comp.images is not None else []
        if not isinstance(images, list):
            images = [images] if images else []
        result.append({
            "id": comp.id,
            "category": comp.category,
            "manufacturer": comp.manufacturer,
            "model_name": comp.model_name,
            "price": comp.price,
            "image_url": comp.image_url,
            "images": images,
            "specs_json": comp.specs_json,
            "quantity": ac.quantity
        })
    return result

@app.delete("/api/assemblies/{assembly_id}")
def delete_assembly(assembly_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    assembly = db.query(Assembly).filter(Assembly.id == assembly_id, Assembly.user_id == current_user.id).first()
    if not assembly:
        raise HTTPException(status_code=404, detail="Assembly not found")
    db.delete(assembly)
    db.commit()
    return {"message": "Assembly deleted"}

@app.get("/api/assemblies/{assembly_id}/completeness")
def get_assembly_completeness(assembly_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_optional)):
    assembly = db.query(Assembly).filter(Assembly.id == assembly_id).first()
    if not assembly:
        raise HTTPException(status_code=404, detail="Assembly not found")
    if not assembly.is_public and (not current_user or current_user.id != assembly.user_id):
        if current_user and current_user.role in ["admin", "manager"]:
            pass
        else:
            raise HTTPException(status_code=403, detail="Not authorized")
    return AssemblyService.check_build_completeness(db, assembly_id)

# ---------- ЗАКАЗЫ ----------
@app.post("/api/orders", response_model=OrderResponse)
def create_order(
    order_data: OrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Создание заказа на основе сборки"""
    assembly = db.query(Assembly).filter(
        Assembly.id == order_data.assembly_id,
        Assembly.user_id == current_user.id
    ).first()
    if not assembly:
        raise HTTPException(status_code=404, detail="Assembly not found")
    
    completeness = AssemblyService.check_build_completeness(db, assembly.id)
    if not completeness["is_complete"]:
        raise HTTPException(status_code=400, detail=f"Cannot order incomplete build: {completeness['message']}")
    
    if current_user.phone != order_data.phone:
        current_user.phone = order_data.phone
        db.commit()
    
    new_order = Order(
        user_id=current_user.id,
        assembly_id=assembly.id,
        phone=order_data.phone,
        address=order_data.address,
        total_price=assembly.total_price,
        comment=order_data.comment,
        status="pending"
    )
    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    
    return {
        "id": new_order.id,
        "user_id": new_order.user_id,
        "assembly_id": new_order.assembly_id,
        "assembly_title": assembly.title,
        "phone": new_order.phone,
        "address": new_order.address,
        "total_price": new_order.total_price,
        "status": new_order.status,
        "comment": new_order.comment,
        "created_at": new_order.created_at,
        "updated_at": new_order.updated_at
    }

@app.get("/api/orders/my", response_model=List[OrderResponse])
def get_my_orders(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Получить заказы текущего пользователя"""
    orders = db.query(Order).filter(Order.user_id == current_user.id).order_by(Order.created_at.desc()).all()
    result = []
    for order in orders:
        assembly = db.query(Assembly).filter(Assembly.id == order.assembly_id).first()
        result.append({
            "id": order.id,
            "user_id": order.user_id,
            "assembly_id": order.assembly_id,
            "assembly_title": assembly.title if assembly else "Deleted build",
            "phone": order.phone,
            "address": order.address,
            "total_price": order.total_price,
            "status": order.status,
            "comment": order.comment,
            "created_at": order.created_at,
            "updated_at": order.updated_at
        })
    return result

@app.post("/api/assemblies/{assembly_id}/order")
def order_assembly(
    assembly_id: int,
    order_data: OrderBase,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assembly = db.query(Assembly).filter(Assembly.id == assembly_id, Assembly.user_id == current_user.id).first()
    if not assembly:
        raise HTTPException(status_code=404, detail="Assembly not found")
    
    completeness = AssemblyService.check_build_completeness(db, assembly_id)
    if not completeness["is_complete"]:
        raise HTTPException(
            status_code=400,
            detail=f"Нельзя оформить заказ. {completeness['message']}"
        )
    
    if current_user.phone != order_data.phone:
        current_user.phone = order_data.phone
        db.commit()
    
    new_order = Order(
        user_id=current_user.id,
        assembly_id=assembly_id,
        phone=order_data.phone,
        address=order_data.address,
        total_price=assembly.total_price,
        comment=order_data.comment,
        status="pending"
    )
    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    
    return {
        "message": "Заказ оформлен",
        "order_id": new_order.id,
        "assembly_id": assembly_id,
        "total_price": assembly.total_price
    }

# ---------- АДМИНСКИЕ ЭНДПОИНТЫ ----------
def check_admin_role(current_user: User):
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

def check_admin_only(current_user: User):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

@app.get("/api/admin/orders", response_model=List[OrderResponse])
def admin_get_orders(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить все заказы (только admin/manager)"""
    check_admin_role(current_user)
    
    query = db.query(Order)
    if status_filter:
        query = query.filter(Order.status == status_filter)
    orders = query.order_by(Order.created_at.desc()).offset(offset).limit(limit).all()
    
    result = []
    for order in orders:
        assembly = db.query(Assembly).filter(Assembly.id == order.assembly_id).first()
        result.append({
            "id": order.id,
            "user_id": order.user_id,
            "assembly_id": order.assembly_id,
            "assembly_title": assembly.title if assembly else "Deleted build",
            "phone": order.phone,
            "address": order.address,
            "total_price": order.total_price,
            "status": order.status,
            "comment": order.comment,
            "created_at": order.created_at,
            "updated_at": order.updated_at
        })
    return result

@app.put("/api/admin/orders/{order_id}")
def admin_update_order(
    order_id: int,
    update_data: OrderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Обновить статус заказа (только admin/manager)"""
    check_admin_role(current_user)
    
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if update_data.status:
        order.status = update_data.status
    if update_data.phone:
        order.phone = update_data.phone
    if update_data.address:
        order.address = update_data.address
    if update_data.comment:
        order.comment = update_data.comment
    
    order.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(order)
    
    return {"message": "Order updated", "order_id": order_id, "status": order.status}

@app.get("/api/admin/users", response_model=List[UserAdminResponse])
def admin_get_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить всех пользователей (только admin)"""
    check_admin_only(current_user)
    
    users = db.query(User).all()
    result = []
    for user in users:
        orders = db.query(Order).filter(Order.user_id == user.id).all()
        result.append({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "phone": user.phone,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "orders_count": len(orders),
            "total_spent": sum(o.total_price for o in orders)
        })
    return result

@app.put("/api/admin/users/{user_id}/role")
def admin_update_user_role(
    user_id: int,
    role_data: UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Изменить роль пользователя (только admin)"""
    check_admin_only(current_user)
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.role = role_data.role
    db.commit()
    
    return {"message": f"User {user.username} role updated to {role_data.role}"}

@app.get("/api/admin/statistics")
def admin_get_statistics(
    period: str = Query("week", regex="^(week|month|year)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить статистику (только admin/manager)"""
    check_admin_role(current_user)
    
    now = datetime.utcnow()
    
    if period == "week":
        start_date = now - timedelta(days=7)
        date_format = "%Y-%m-%d"
    elif period == "month":
        start_date = now - timedelta(days=30)
        date_format = "%Y-%m-%d"
    else:
        start_date = now - timedelta(days=365)
        date_format = "%Y-%m"
    
    all_orders = db.query(Order).filter(Order.created_at >= start_date).all()
    revenue_statuses = ["confirmed", "shipped", "delivered"]
    successful_orders = [o for o in all_orders if o.status in revenue_statuses]
    
    total_orders = db.query(Order).count()
    total_revenue = db.query(func.sum(Order.total_price)).filter(Order.status.in_(revenue_statuses)).scalar() or 0
    
    pending = db.query(Order).filter(Order.status == "pending").count()
    confirmed = db.query(Order).filter(Order.status == "confirmed").count()
    shipped = db.query(Order).filter(Order.status == "shipped").count()
    delivered = db.query(Order).filter(Order.status == "delivered").count()
    cancelled = db.query(Order).filter(Order.status == "cancelled").count()
    
    daily_stats = {}
    monthly_stats = {}
    for order in successful_orders:
        if period == "year":
            key = order.created_at.strftime("%Y-%m")
            monthly_stats[key] = monthly_stats.get(key, {"count": 0, "revenue": 0})
            monthly_stats[key]["count"] += 1
            monthly_stats[key]["revenue"] += order.total_price
        else:
            key = order.created_at.strftime(date_format)
            daily_stats[key] = daily_stats.get(key, {"count": 0, "revenue": 0})
            daily_stats[key]["count"] += 1
            daily_stats[key]["revenue"] += order.total_price
    
    assembly_stats = {}
    for order in successful_orders:
        assembly_stats[order.assembly_id] = assembly_stats.get(order.assembly_id, {"count": 0, "revenue": 0})
        assembly_stats[order.assembly_id]["count"] += 1
        assembly_stats[order.assembly_id]["revenue"] += order.total_price
    
    top_assemblies = []
    for aid, stats in sorted(assembly_stats.items(), key=lambda x: x[1]["count"], reverse=True)[:10]:
        assembly = db.query(Assembly).filter(Assembly.id == aid).first()
        top_assemblies.append({
            "assembly_id": aid,
            "title": assembly.title if assembly else "Deleted",
            "orders_count": stats["count"],
            "revenue": stats["revenue"]
        })
    
    avg_check = total_revenue / len(successful_orders) if successful_orders else 0
    
    top_orders = db.query(Order).filter(Order.status.in_(revenue_statuses)).order_by(Order.total_price.desc()).limit(3).all()
    top_orders_data = []
    for order in top_orders:
        assembly = db.query(Assembly).filter(Assembly.id == order.assembly_id).first()
        user = db.query(User).filter(User.id == order.user_id).first()
        top_orders_data.append({
            "order_id": order.id,
            "user": user.username if user else "Deleted",
            "total_price": order.total_price,
            "status": order.status,
            "created_at": order.created_at
        })
    
    status_distribution = {
        "pending": pending,
        "confirmed": confirmed,
        "shipped": shipped,
        "delivered": delivered,
        "cancelled": cancelled
    }
    
    unique_users = db.query(Order.user_id).filter(Order.created_at >= start_date).distinct().count()
    
    return {
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "pending_orders": pending,
        "confirmed_orders": confirmed,
        "shipped_orders": shipped,
        "delivered_orders": delivered,
        "cancelled_orders": cancelled,
        "avg_check": round(avg_check, 2),
        "unique_users": unique_users,
        "daily_stats": [{"date": k, "count": v["count"], "revenue": v["revenue"]} for k, v in daily_stats.items()],
        "monthly_stats": [{"month": k, "count": v["count"], "revenue": v["revenue"]} for k, v in monthly_stats.items()],
        "top_assemblies": top_assemblies,
        "top_orders": top_orders_data,
        "status_distribution": status_distribution
    }

@app.get("/api/admin/users/{user_id}/orders", response_model=List[OrderResponse])
def admin_get_user_orders(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить заказы конкретного пользователя (только admin)"""
    check_admin_only(current_user)
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    orders = db.query(Order).filter(Order.user_id == user_id).order_by(Order.created_at.desc()).all()
    result = []
    for order in orders:
        assembly = db.query(Assembly).filter(Assembly.id == order.assembly_id).first()
        result.append({
            "id": order.id,
            "user_id": order.user_id,
            "assembly_id": order.assembly_id,
            "assembly_title": assembly.title if assembly else "Deleted build",
            "phone": order.phone,
            "address": order.address,
            "total_price": order.total_price,
            "status": order.status,
            "comment": order.comment,
            "created_at": order.created_at,
            "updated_at": order.updated_at
        })
    return result

# ---------- УПРАВЛЕНИЕ КОМПОНЕНТАМИ (только admin) ----------
@app.post("/api/components", response_model=ComponentResponse)
def create_component(
    component_data: ComponentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Создать новый компонент (только admin)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    new_component = Component(
        category=component_data.category,
        manufacturer=component_data.manufacturer,
        model_name=component_data.model_name,
        price=component_data.price,
        image_url=component_data.image_url,
        images=component_data.images or [],
        specs_json=component_data.specs_json
    )
    db.add(new_component)
    db.commit()
    db.refresh(new_component)
    return new_component

@app.put("/api/components/{component_id}", response_model=ComponentResponse)
def update_component(
    component_id: int,
    component_data: ComponentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Обновить компонент (только admin)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    component = db.query(Component).filter(Component.id == component_id).first()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    
    component.category = component_data.category
    component.manufacturer = component_data.manufacturer
    component.model_name = component_data.model_name
    component.price = component_data.price
    component.image_url = component_data.image_url
    component.images = component_data.images or []
    component.specs_json = component_data.specs_json
    component.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(component)
    return component

@app.delete("/api/components/{component_id}")
def delete_component(
    component_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Удалить компонент (только admin)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    component = db.query(Component).filter(Component.id == component_id).first()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    
    db.delete(component)
    db.commit()
    return {"message": "Component deleted"}

# ---------- Рейтинг ----------
@app.post("/api/assemblies/{assembly_id}/rate")
def rate_assembly(assembly_id: int, rating: RatingCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if rating.score < 1 or rating.score > 5:
        raise HTTPException(status_code=400, detail="Score must be between 1 and 5")
    assembly = db.query(Assembly).filter(Assembly.id == assembly_id).first()
    if not assembly or not assembly.is_public:
        raise HTTPException(status_code=404, detail="Assembly not found or not public")
    existing = db.query(Rating).filter(Rating.user_id == current_user.id, Rating.assembly_id == assembly_id).first()
    if existing:
        existing.score = rating.score
    else:
        new_rating = Rating(user_id=current_user.id, assembly_id=assembly_id, score=rating.score)
        db.add(new_rating)
    db.commit()
    avg = db.query(func.avg(Rating.score)).filter(Rating.assembly_id == assembly_id).scalar()
    return {"message": "Rating saved", "avg_score": float(avg) if avg else None}

@app.get("/api/assemblies/{assembly_id}/bottlenecks")
def get_assembly_bottlenecks(assembly_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_optional)):
    assembly = db.query(Assembly).filter(Assembly.id == assembly_id).first()
    if not assembly:
        raise HTTPException(status_code=404, detail="Assembly not found")
    if not assembly.is_public and (not current_user or current_user.id != assembly.user_id):
        if current_user and current_user.role in ["admin", "manager"]:
            pass
        else:
            raise HTTPException(status_code=403, detail="Not authorized")
    return CompatibilityService.calculate_bottlenecks(db, assembly_id)

@app.get("/api/assemblies/{assembly_id}/constraints")
def get_assembly_constraints(assembly_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_optional)):
    assembly = db.query(Assembly).filter(Assembly.id == assembly_id).first()
    if not assembly:
        raise HTTPException(status_code=404, detail="Assembly not found")
    if not assembly.is_public and (not current_user or current_user.id != assembly.user_id):
        if current_user and current_user.role in ["admin", "manager"]:
            pass
        else:
            raise HTTPException(status_code=403, detail="Not authorized")
    return CompatibilityService.get_all_constraints(db, assembly_id)

@app.get("/api/assemblies/{assembly_id}/rating")
def get_assembly_rating(
    assembly_id: int,
    use_case: str = Query("gaming", regex="^(gaming|workstation|office|universal)$"),
    price_category: str = Query("mid", regex="^(budget|mid|high)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_optional)
):
    assembly = db.query(Assembly).filter(Assembly.id == assembly_id).first()
    if not assembly:
        raise HTTPException(status_code=404, detail="Assembly not found")
    if not assembly.is_public and (not current_user or current_user.id != assembly.user_id):
        if current_user and current_user.role in ["admin", "manager"]:
            pass
        else:
            raise HTTPException(status_code=403, detail="Not authorized")
    rating = RatingService.calculate_performance_score(db, assembly_id, use_case, price_category)
    if "score" in rating:
        assembly.performance_score = rating["score"]
        db.commit()
    return rating

# ---------- Мастер подбора (Wizard) ----------
class WizardRequest(BaseModel):
    use_case: str
    budget: int
    preferences: Optional[dict] = None

@app.get("/api/wizard/min-budget")
def get_min_budget(db: Session = Depends(get_db)):
    """Возвращает минимальную стоимость сборки из самых дешёвых компонентов"""
    
    min_cpu = db.query(Component).filter(Component.category == "cpu").order_by(Component.price).first()
    min_motherboard = db.query(Component).filter(Component.category == "motherboard").order_by(Component.price).first()
    min_ram = db.query(Component).filter(Component.category == "ram").order_by(Component.price).first()
    min_storage = db.query(Component).filter(Component.category == "storage").order_by(Component.price).first()
    min_psu = db.query(Component).filter(Component.category == "psu").order_by(Component.price).first()
    min_case = db.query(Component).filter(Component.category == "case").order_by(Component.price).first()
    min_cooler = db.query(Component).filter(Component.category == "cooler").order_by(Component.price).first()
    
    cpu_price = min_cpu.price if min_cpu else 5000
    motherboard_price = min_motherboard.price if min_motherboard else 5000
    ram_price = min_ram.price if min_ram else 3000
    storage_price = min_storage.price if min_storage else 4000
    psu_price = min_psu.price if min_psu else 3000
    case_price = min_case.price if min_case else 3000
    cooler_price = min_cooler.price if min_cooler else 2000
    
    min_total = cpu_price + motherboard_price + ram_price + storage_price + psu_price + case_price + cooler_price
    
    apu = db.query(Component).filter(
        Component.category == "cpu",
        Component.price < 15000
    ).all()
    for cpu in apu:
        if cpu.specs_json.get('integrated_graphics') == True and cpu.price < cpu_price:
            min_total = min_total - cpu_price + cpu.price
            cpu_price = cpu.price
            break
    
    return {
        "min_budget": min_total,
        "details": {
            "cpu": {"name": min_cpu.model_name if min_cpu else "N/A", "price": cpu_price},
            "motherboard": {"name": min_motherboard.model_name if min_motherboard else "N/A", "price": motherboard_price},
            "ram": {"name": min_ram.model_name if min_ram else "N/A", "price": ram_price},
            "storage": {"name": min_storage.model_name if min_storage else "N/A", "price": storage_price},
            "psu": {"name": min_psu.model_name if min_psu else "N/A", "price": psu_price},
            "case": {"name": min_case.model_name if min_case else "N/A", "price": case_price},
            "cooler": {"name": min_cooler.model_name if min_cooler else "N/A", "price": cooler_price}
        }
    }

@app.post("/api/wizard/recommend")
def wizard_recommend(req: WizardRequest, db: Session = Depends(get_db)):
    from sqlalchemy import cast, String, Integer, Float, func
    
    budget = req.budget
    use_case = req.use_case
    prefs = req.preferences or {}
    prioritize_performance = prefs.get("performance", True)
    
    min_budget_data = get_min_budget(db)
    MIN_TOTAL = min_budget_data["min_budget"]
    
    if budget < MIN_TOTAL:
        raise HTTPException(
            status_code=400,
            detail={
                "message": f"Бюджет ({budget} ₽) меньше минимальной стоимости сборки ({MIN_TOTAL} ₽)",
                "min_budget": MIN_TOTAL,
                "min_components": min_budget_data["details"]
            }
        )
    
    actual_budget = budget
    
    def get_price(cid):
        comp = db.query(Component).filter(Component.id == cid).first()
        return comp.price if comp else 0
    
    need_gpu = True
    if use_case == "office" or (actual_budget < 45000 and not prioritize_performance):
        need_gpu = False
    
    apu_id = None
    if not need_gpu:
        apu = db.query(Component).filter(Component.category == "cpu").all()
        for cpu in apu:
            if cpu.specs_json.get('integrated_graphics') == True and cpu.price < actual_budget * 0.3:
                apu_id = cpu.id
                break
    
    component_ids = []
    
    # ====== ПРОЦЕССОР ======
    if apu_id:
        component_ids.append(apu_id)
    else:
        if actual_budget > 120000:
            # Используем func.json_extract_path_text для извлечения числа из JSON
            cpu = db.query(Component).filter(
                Component.category == "cpu",
                Component.price < actual_budget * 0.2
            ).order_by(
                cast(func.json_extract_path_text(Component.specs_json, 'benchmark_score'), Float).desc()
            ).first()
        else:
            cpu = db.query(Component).filter(
                Component.category == "cpu",
                Component.price < actual_budget * 0.2
            ).order_by(Component.price.desc()).first()
        
        if not cpu:
            cpu = db.query(Component).filter(Component.category == "cpu").order_by(Component.price).first()
        component_ids.append(cpu.id)
    
    # ====== ВИДЕОКАРТА ======
    if need_gpu:
        gpu_budget = actual_budget * 0.35
        if actual_budget > 120000:
            gpu = db.query(Component).filter(
                Component.category == "gpu",
                Component.price < gpu_budget
            ).order_by(
                cast(func.json_extract_path_text(Component.specs_json, 'benchmark_score'), Float).desc()
            ).first()
        else:
            gpu = db.query(Component).filter(
                Component.category == "gpu",
                Component.price < gpu_budget * 0.8
            ).order_by(Component.price.desc()).first()
        
        if not gpu:
            gpu = db.query(Component).filter(Component.category == "gpu").order_by(Component.price).first()
        component_ids.append(gpu.id)
    
    # ====== МАТЕРИНСКАЯ ПЛАТА ======
    if actual_budget > 100000:
        motherboard = db.query(Component).filter(
            Component.category == "motherboard"
        ).order_by(Component.price.desc()).first()
    else:
        motherboard = db.query(Component).filter(
            Component.category == "motherboard",
            Component.price < actual_budget * 0.08
        ).order_by(Component.price.desc()).first()
    
    if not motherboard:
        motherboard = db.query(Component).filter(Component.category == "motherboard").order_by(Component.price).first()
    component_ids.append(motherboard.id)
    
    # ====== ОЗУ ======
    if actual_budget > 100000:
        ram = db.query(Component).filter(
            Component.category == "ram"
        ).order_by(
            cast(func.json_extract_path_text(Component.specs_json, 'speed'), Integer).desc()
        ).first()
    elif actual_budget > 60000:
        ram = db.query(Component).filter(
            Component.category == "ram",
            Component.price < actual_budget * 0.06
        ).order_by(
            cast(func.json_extract_path_text(Component.specs_json, 'speed'), Integer).desc()
        ).first()
    else:
        ram = db.query(Component).filter(
            Component.category == "ram",
            Component.price < actual_budget * 0.05
        ).order_by(Component.price.desc()).first()
    
    if not ram:
        ram = db.query(Component).filter(Component.category == "ram").order_by(Component.price).first()
    component_ids.append(ram.id)
    
    # ====== НАКОПИТЕЛЬ ======
    if actual_budget > 100000:
        storage = db.query(Component).filter(
            Component.category == "storage"
        ).order_by(
            cast(func.json_extract_path_text(Component.specs_json, 'read_speed'), Integer).desc()
        ).first()
    elif actual_budget > 60000:
        storage = db.query(Component).filter(
            Component.category == "storage",
            Component.price < actual_budget * 0.05
        ).order_by(
            cast(func.json_extract_path_text(Component.specs_json, 'read_speed'), Integer).desc()
        ).first()
    else:
        storage = db.query(Component).filter(
            Component.category == "storage",
            Component.price < actual_budget * 0.04
        ).order_by(Component.price.desc()).first()
    
    if not storage:
        storage = db.query(Component).filter(Component.category == "storage").order_by(Component.price).first()
    component_ids.append(storage.id)
    
    # ====== БЛОК ПИТАНИЯ ======
    if actual_budget > 100000:
        psu = db.query(Component).filter(
            Component.category == "psu"
        ).order_by(
            cast(func.json_extract_path_text(Component.specs_json, 'power_watts'), Integer).desc()
        ).first()
    else:
        psu = db.query(Component).filter(
            Component.category == "psu",
            Component.price < actual_budget * 0.04
        ).order_by(Component.price.desc()).first()
    
    if not psu:
        psu = db.query(Component).filter(Component.category == "psu").order_by(Component.price).first()
    component_ids.append(psu.id)
    
    # ====== КОРПУС ======
    if actual_budget > 80000:
        case = db.query(Component).filter(
            Component.category == "case"
        ).order_by(Component.price.desc()).first()
    else:
        case = db.query(Component).filter(
            Component.category == "case",
            Component.price < actual_budget * 0.035
        ).order_by(Component.price.desc()).first()
    
    if not case:
        case = db.query(Component).filter(Component.category == "case").order_by(Component.price).first()
    component_ids.append(case.id)
    
    # ====== ОХЛАЖДЕНИЕ ======
    if actual_budget > 80000:
        cooler = db.query(Component).filter(
            Component.category == "cooler"
        ).order_by(
            cast(func.json_extract_path_text(Component.specs_json, 'tdp_max'), Integer).desc()
        ).first()
    else:
        cooler = db.query(Component).filter(
            Component.category == "cooler",
            Component.price < actual_budget * 0.025
        ).order_by(Component.price.desc()).first()
    
    if not cooler:
        cooler = db.query(Component).filter(Component.category == "cooler").order_by(Component.price).first()
    component_ids.append(cooler.id)
    
    component_ids = list(dict.fromkeys([cid for cid in component_ids if cid is not None]))
    total_price = sum(get_price(cid) for cid in component_ids)
    
    if total_price > actual_budget:
        for i, cid in enumerate(component_ids):
            comp = db.query(Component).filter(Component.id == cid).first()
            if comp.category == "gpu" and need_gpu:
                cheaper = db.query(Component).filter(
                    Component.category == "gpu",
                    Component.price < comp.price * 0.7
                ).order_by(Component.price.desc()).first()
                if cheaper:
                    component_ids[i] = cheaper.id
                    total_price = sum(get_price(cid) for cid in component_ids)
                    if total_price <= actual_budget:
                        break
            elif comp.category == "cpu":
                cheaper = db.query(Component).filter(
                    Component.category == "cpu",
                    Component.price < comp.price * 0.7
                ).order_by(Component.price.desc()).first()
                if cheaper:
                    component_ids[i] = cheaper.id
                    total_price = sum(get_price(cid) for cid in component_ids)
                    if total_price <= actual_budget:
                        break
    
    if total_price > actual_budget and need_gpu:
        gpu_in_list = [cid for cid in component_ids if db.query(Component).filter(Component.id == cid, Component.category == "gpu").first()]
        for gid in gpu_in_list:
            component_ids.remove(gid)
            total_price -= get_price(gid)
    
    recommended_components = [{"component_id": cid, "quantity": 1} for cid in component_ids]
    
    if budget > 60000:
        for item in recommended_components:
            comp = db.query(Component).filter(Component.id == item["component_id"]).first()
            if comp and comp.category == "ram":
                ram_price = comp.price
                if total_price + ram_price <= actual_budget:
                    item["quantity"] = 2
                    total_price += ram_price
                break
        
        if budget > 70000:
            hdd = db.query(Component).filter(
                Component.category == "storage",
                func.json_extract_path_text(Component.specs_json, 'type') == 'HDD'
            ).first()
            if hdd:
                if total_price + hdd.price <= actual_budget:
                    recommended_components.append({"component_id": hdd.id, "quantity": 1})
                    total_price += hdd.price
    
    return {
        "components": recommended_components,
        "has_integrated_gpu": len([c for c in recommended_components if db.query(Component).filter(Component.id == c["component_id"], Component.category == "gpu").first()]) == 0,
        "estimated_price": total_price,
        "min_budget": MIN_TOTAL,
        "actual_budget": actual_budget
    }

# ---------- Обновление количества компонента в сборке ----------
@app.patch("/api/assemblies/{assembly_id}/components/{component_id}")
def update_component_quantity(
    assembly_id: int,
    component_id: int,
    quantity: int = Query(..., ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Изменить количество компонента (только для RAM/Storage)"""
    try:
        assembly = AssemblyService.update_component_quantity(db, assembly_id, component_id, quantity, current_user.id)
        return assembly
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))