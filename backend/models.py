from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, JSON, Text, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=True)
    role = Column(String(20), default="user")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    assemblies = relationship("Assembly", back_populates="owner")
    ratings = relationship("Rating", back_populates="user")
    orders = relationship("Order", back_populates="user")


class Component(Base):
    __tablename__ = "components"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(50), nullable=False, index=True)
    manufacturer = Column(String(100), nullable=False)
    model_name = Column(String(200), nullable=False)
    price = Column(Float, nullable=False, default=0.0)
    image_url = Column(String(500), nullable=True)
    images = Column(JSON, nullable=True, default=[])  # список URL-адресов дополнительных фото
    specs_json = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assembly_components = relationship("AssemblyComponent", back_populates="component")


class CompatibilityRule(Base):
    __tablename__ = "compatibility_rules"

    id = Column(Integer, primary_key=True, index=True)
    rule_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)
    condition = Column(JSON, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Assembly(Base):
    __tablename__ = "assemblies"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False, default="Моя сборка")
    description = Column(Text, nullable=True)
    total_price = Column(Float, default=0.0)
    total_tdp = Column(Integer, default=0)
    performance_score = Column(Float, nullable=True)
    is_public = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="assemblies")
    components_rel = relationship("AssemblyComponent", back_populates="assembly", cascade="all, delete-orphan")
    ratings = relationship("Rating", back_populates="assembly", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="assembly")


class AssemblyComponent(Base):
    __tablename__ = "assembly_components"

    assembly_id = Column(Integer, ForeignKey("assemblies.id", ondelete="CASCADE"), primary_key=True)
    component_id = Column(Integer, ForeignKey("components.id", ondelete="CASCADE"), primary_key=True)
    quantity = Column(Integer, nullable=False, default=1)

    assembly = relationship("Assembly", back_populates="components_rel")
    component = relationship("Component", back_populates="assembly_components")


class Rating(Base):
    __tablename__ = "ratings"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    assembly_id = Column(Integer, ForeignKey("assemblies.id", ondelete="CASCADE"), primary_key=True)
    score = Column(Integer, nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="ratings")
    assembly = relationship("Assembly", back_populates="ratings")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assembly_id = Column(Integer, ForeignKey("assemblies.id"), nullable=False)
    phone = Column(String(20), nullable=False)
    address = Column(Text, nullable=True)
    total_price = Column(Float, nullable=False)
    status = Column(String(20), default="pending")
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="orders")
    assembly = relationship("Assembly", back_populates="orders")