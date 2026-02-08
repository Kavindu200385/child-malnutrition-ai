from __future__ import annotations

from datetime import datetime
from typing import Optional

from werkzeug.security import generate_password_hash, check_password_hash

from backend.extensions import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(32), nullable=False)  # 'admin' | 'midwife' | 'moh_doctor' | 'nutritionist'
    clinic = db.Column(db.String(120), nullable=True)
    district = db.Column(db.String(120), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "username": self.username,
            "name": self.name,
            "role": self.role,
            "clinic": self.clinic,
            "district": self.district,
        }


class Child(db.Model):
    __tablename__ = "children"

    id = db.Column(db.Integer, primary_key=True)
    child_id = db.Column(db.String(64), unique=True, nullable=False, index=True)
    name = db.Column(db.String(120), nullable=True)
    dob = db.Column(db.Date, nullable=True)
    gender = db.Column(db.String(16), nullable=True)  # 'male' | 'female'
    guardian_name = db.Column(db.String(120), nullable=True)
    guardian_phone = db.Column(db.String(40), nullable=True)
    address = db.Column(db.String(255), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    visits = db.relationship("Visit", backref="child", lazy=True, cascade="all, delete-orphan")

    def to_dict(self, include_visits: bool = False) -> dict:
        data = {
            "id": self.id,
            "child_id": self.child_id,
            "name": self.name,
            "dob": self.dob.isoformat() if self.dob else None,
            "gender": self.gender,
            "guardian_name": self.guardian_name,
            "guardian_phone": self.guardian_phone,
            "address": self.address,
            "created_at": self.created_at.isoformat(),
        }
        if include_visits:
            data["visits"] = [v.to_dict() for v in self.visits]
        return data


class Visit(db.Model):
    __tablename__ = "visits"

    id = db.Column(db.Integer, primary_key=True)
    child_id_fk = db.Column(db.Integer, db.ForeignKey("children.id"), nullable=False, index=True)
    visit_date = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    age_months = db.Column(db.Integer, nullable=False)
    sex = db.Column(db.String(2), nullable=False)  # 'M' | 'F'
    weight_kg = db.Column(db.Float, nullable=False)
    height_cm = db.Column(db.Float, nullable=False)

    # Z-scores
    z_wfa = db.Column(db.Float, nullable=True)
    z_hfa = db.Column(db.Float, nullable=True)
    z_wfh = db.Column(db.Float, nullable=True)

    # Outputs
    current_risk = db.Column(db.String(32), nullable=True)  # LOW/MODERATE/HIGH/CRITICAL (current)
    predicted_risk_next_2_months = db.Column(db.String(16), nullable=True)  # Low/Moderate/High/Severe
    model_confidence = db.Column(db.Float, nullable=True)

    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "visit_date": self.visit_date.isoformat(),
            "age_months": self.age_months,
            "sex": self.sex,
            "weight_kg": self.weight_kg,
            "height_cm": self.height_cm,
            "z_wfa": self.z_wfa,
            "z_hfa": self.z_hfa,
            "z_wfh": self.z_wfh,
            "current_risk": self.current_risk,
            "predicted_risk_next_2_months": self.predicted_risk_next_2_months,
            "model_confidence": self.model_confidence,
            "created_by_user_id": self.created_by_user_id,
        }

