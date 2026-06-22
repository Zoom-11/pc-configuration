from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, Dict, Any, List
from datetime import datetime

# Component
class ComponentBase(BaseModel):
    category: str
    manufacturer: str
    model_name: str
    price: float
    image_url: Optional[str] = None
    specs_json: Dict[str, Any]
    images: Optional[List[str]] = []

class ComponentCreate(ComponentBase):
    pass

class ComponentResponse(ComponentBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_compatible: bool = True
    incompatibility_reason: Optional[str] = None
    images: List[str] = []

    @field_validator('images', mode='before')
    @classmethod
    def ensure_images_list(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                import json
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except:
                pass
            return [v] if v else []
        return []

    class Config:
        from_attributes = True
        
# User
class UserCreate(BaseModel):
    username: str
    email: EmailStr  # <-- ОБЯЗАТЕЛЬНО EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    phone: Optional[str] = None
    role: str = "user"
    is_active: bool
    created_at: datetime
    class Config:
        from_attributes = True

class UserUpdateProfile(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

# Admin User schemas
class UserAdminResponse(UserResponse):
    orders_count: Optional[int] = None
    total_spent: Optional[float] = None

class UserRoleUpdate(BaseModel):
    role: str  # user, manager, admin

# Assembly
class AssemblyBase(BaseModel):
    title: str = "Моя сборка"
    description: Optional[str] = None

class AssemblyCreate(AssemblyBase):
    pass

class AssemblyUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None

class AssemblyComponentAdd(BaseModel):
    component_id: int
    quantity: int = 1

class AssemblyResponse(AssemblyBase):
    id: int
    user_id: int
    total_price: float
    total_tdp: int
    performance_score: Optional[float]
    is_public: bool
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

class AssemblyDetailResponse(AssemblyResponse):
    components: List[ComponentResponse] = []

# Rating
class RatingCreate(BaseModel):
    score: int  # 1-5

# Order schemas
class OrderBase(BaseModel):
    phone: str
    address: Optional[str] = None
    comment: Optional[str] = None

class OrderCreate(OrderBase):
    assembly_id: int

class OrderResponse(BaseModel):
    id: int
    user_id: int
    assembly_id: int
    assembly_title: Optional[str] = None
    phone: str
    address: Optional[str] = None
    total_price: float
    status: str
    comment: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

class OrderUpdate(BaseModel):
    status: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    comment: Optional[str] = None

# Statistics schemas
class OrderStatistics(BaseModel):
    total_orders: int
    total_revenue: float
    pending_orders: int
    confirmed_orders: int
    shipped_orders: int
    delivered_orders: int
    cancelled_orders: int
    daily_stats: List[dict] = []
    monthly_stats: List[dict] = []
    top_assemblies: List[dict] = []