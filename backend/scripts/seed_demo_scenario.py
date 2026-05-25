"""
Seed two demo children for the handover scenario:

  Child 1 — "Kasun Perera"  (assigned to MOH)
    • Came from PHM midwife because of MAM
    • MOH has already done one measurement → now SAM
    • Ready to be escalated to nutritionist
    • escalation_status = ESCALATED_TO_MOH (came from midwife)

  Child 2 — "Sithara Silva"  (assigned to midwife)
    • Currently at MAM risk level
    • Still under midwife / PHM area supervision

Also creates the minimal area hierarchy and user accounts needed
if they don't already exist.

Run from project root:
    python backend/scripts/seed_demo_scenario.py
"""
from __future__ import annotations

import os
import sys
from datetime import date, datetime, timedelta

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from dotenv import load_dotenv
env_path = os.path.join(project_root, "backend", ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)

from backend.app import create_app
from backend.extensions import db
from backend.models_hierarchical import (
    Area, AreaLevel, Child, ChildEscalation, EscalationRecordStatus,
    EscalationStatus, Measurement, RiskLevel, User, UserRole,
    WorkerAreaMapping,
)
from werkzeug.security import generate_password_hash


# ── helpers ──────────────────────────────────────────────────────────────────

def get_or_create_area(name: str, level: str, parent_id: int | None = None,
                        district: str | None = None, province: str | None = None) -> Area:
    area = db.session.query(Area).filter_by(name=name, level=level).first()
    if not area:
        area = Area(name=name, level=level, parent_id=parent_id,
                    district=district, province=province, is_active=True)
        db.session.add(area)
        db.session.flush()
        print(f"  [+] Area created: {name} ({level})")
    else:
        print(f"  [=] Area exists:  {name} ({level})")
    return area


def get_or_create_user(username: str, name: str, role: str,
                        password: str = "demo1234", **extra) -> User:
    user = db.session.query(User).filter_by(username=username).first()
    if not user:
        user = User(username=username, name=name, role=role,
                    password_hash=generate_password_hash(password),
                    is_active=True, **extra)
        db.session.add(user)
        db.session.flush()
        print(f"  [+] User created: {username} ({role})  password={password}")
    else:
        print(f"  [=] User exists:  {username} ({role})")
    return user


def ensure_mapping(user: User, area: Area) -> None:
    exists = db.session.query(WorkerAreaMapping).filter_by(
        user_id=user.id, area_id=area.id, is_active=True).first()
    if not exists:
        db.session.add(WorkerAreaMapping(user_id=user.id, area_id=area.id, is_active=True))
        db.session.flush()


def child_exists(uid: str) -> bool:
    return db.session.query(Child).filter_by(child_unique_id=uid).first() is not None


# ── main ─────────────────────────────────────────────────────────────────────

def run() -> None:
    app = create_app()
    with app.app_context():

        # ── 1. Area hierarchy ────────────────────────────────────────────────
        print("\n=== Areas ===")
        rdhs = get_or_create_area("Colombo District", "rdhs",
                                   district="Colombo", province="Western")
        moh_area = get_or_create_area("Hanwella MOH", "moh", parent_id=rdhs.id,
                                       district="Colombo")
        phm_area = get_or_create_area("Kosgama PHM", "phm", parent_id=moh_area.id,
                                       district="Colombo")

        # ── 2. Users ─────────────────────────────────────────────────────────
        print("\n=== Users ===")
        # MOH user — linked to MOH area via WorkerAreaMapping only (no moh_id on the user)
        moh_user = get_or_create_user(
            username="moh_hanwella",
            name="Dr. Nimal Perera",
            role=UserRole.MOH.value,
        )
        ensure_mapping(moh_user, moh_area)

        # Midwife user — phm_area_id links to area; moh_id links to the MOH user who manages them
        midwife_user = get_or_create_user(
            username="midwife_kosgama",
            name="Sunethra Bandara",
            role=UserRole.MIDWIFE.value,
            phm_area_id=phm_area.id,
            moh_id=moh_user.id,
        )
        ensure_mapping(midwife_user, phm_area)

        # ── 3. Child 1 – Under MOH, arrived from PHM (MAM → SAM) ─────────────
        print("\n=== Child 1: Kasun Perera (MOH, SAM — ready to escalate to Nutritionist) ===")
        if not child_exists("DEMO-MOH-001"):
            kasun = Child(
                child_unique_id="DEMO-MOH-001",
                name="Kasun Perera",
                dob=date(2022, 3, 15),
                gender="male",
                guardian_name="Priyantha Perera",
                guardian_phone="0771234567",
                address="45/B, Kosgama Road, Hanwella",
                birth_weight_kg=2.9,
                birth_height_cm=48.5,
                birth_risk_level="NORMAL",
                # Area chain
                phm_area_id=phm_area.id,
                moh_area_id=moh_area.id,
                district_id=rdhs.id,
                # Currently under MOH after midwife escalation
                current_assigned_role=UserRole.MOH.value,
                current_assigned_user_id=moh_user.id,
                current_assigned_area_id=moh_area.id,
                # Escalation: midwife sent this child to MOH
                escalation_status=EscalationStatus.ESCALATED_TO_MOH.value,
                current_risk_level=RiskLevel.SAM.value,
                assigned_date=datetime.now() - timedelta(days=12),
                registration_date=datetime.now() - timedelta(days=90),
            )
            db.session.add(kasun)
            db.session.flush()

            # Measurement 1 by midwife — MAM (triggered the escalation)
            m1_date = datetime.now() - timedelta(days=14)
            m1 = Measurement(
                child_id=kasun.id,
                measurement_date=m1_date,
                weight_kg=7.2,
                height_cm=82.0,
                muac_cm=11.8,
                z_score_wfa=-2.4,
                z_score_hfa=-1.8,
                z_score_wfh=-2.3,
                risk_level=RiskLevel.MAM.value,
                measured_by_user_id=midwife_user.id,
                notes="Weight gain has stalled. Referred to MOH for review.",
            )
            db.session.add(m1)

            # Measurement 2 by MOH — SAM (worsened under MOH care)
            m2_date = datetime.now() - timedelta(days=5)
            m2 = Measurement(
                child_id=kasun.id,
                measurement_date=m2_date,
                weight_kg=6.9,
                height_cm=82.0,
                muac_cm=11.0,
                z_score_wfa=-3.1,
                z_score_hfa=-1.9,
                z_score_wfh=-3.0,
                risk_level=RiskLevel.SAM.value,
                measured_by_user_id=moh_user.id,
                notes="Condition has worsened. MUAC below 11.5 cm. Recommending escalation to nutritionist.",
            )
            db.session.add(m2)

            # Escalation record: midwife → MOH
            esc = ChildEscalation(
                child_id=kasun.id,
                escalated_by_user_id=midwife_user.id,
                from_role="midwife",
                to_role="moh",
                moh_id=moh_area.id,
                reason="Child classified as MAM during clinic visit. Weight gain stalled over 2 months.",
                previous_risk_level=RiskLevel.NORMAL.value,
                new_risk_level=RiskLevel.MAM.value,
                status=EscalationRecordStatus.REVIEWED.value,
            )
            db.session.add(esc)
            db.session.flush()

            print(f"  [+] Kasun Perera created (id={kasun.id})")
            print(f"      uid={kasun.child_unique_id}  risk=SAM  assigned=MOH")
            print(f"      Measurements: midwife (MAM @ {m1_date.date()}),"
                  f" MOH (SAM @ {m2_date.date()})")
        else:
            print("  [=] Kasun Perera already exists (DEMO-MOH-001)")

        # ── 4. Child 2 – Under midwife, MAM ──────────────────────────────────
        print("\n=== Child 2: Sithara Silva (Midwife, MAM) ===")
        if not child_exists("DEMO-MID-001"):
            sithara = Child(
                child_unique_id="DEMO-MID-001",
                name="Sithara Silva",
                dob=date(2023, 7, 20),
                gender="female",
                guardian_name="Kamala Silva",
                guardian_phone="0779876543",
                address="12, Avissawella Road, Kosgama",
                birth_weight_kg=3.1,
                birth_height_cm=50.0,
                birth_risk_level="NORMAL",
                # Area chain
                phm_area_id=phm_area.id,
                moh_area_id=moh_area.id,
                district_id=rdhs.id,
                # Currently under midwife
                current_assigned_role=UserRole.MIDWIFE.value,
                current_assigned_user_id=midwife_user.id,
                current_assigned_area_id=phm_area.id,
                escalation_status=EscalationStatus.NONE.value,
                current_risk_level=RiskLevel.MAM.value,
                assigned_date=datetime.now() - timedelta(days=30),
                registration_date=datetime.now() - timedelta(days=60),
            )
            db.session.add(sithara)
            db.session.flush()

            # First measurement — Normal
            m_date1 = datetime.now() - timedelta(days=45)
            db.session.add(Measurement(
                child_id=sithara.id,
                measurement_date=m_date1,
                weight_kg=6.5,
                height_cm=70.0,
                muac_cm=13.2,
                z_score_wfa=-1.1,
                z_score_hfa=-0.8,
                z_score_wfh=-1.0,
                risk_level=RiskLevel.NORMAL.value,
                measured_by_user_id=midwife_user.id,
                notes="Normal. Growth tracking well.",
            ))

            # Second measurement — MAM (flagged)
            m_date2 = datetime.now() - timedelta(days=10)
            db.session.add(Measurement(
                child_id=sithara.id,
                measurement_date=m_date2,
                weight_kg=6.3,
                height_cm=70.5,
                muac_cm=12.0,
                z_score_wfa=-2.2,
                z_score_hfa=-0.9,
                z_score_wfh=-2.1,
                risk_level=RiskLevel.MAM.value,
                measured_by_user_id=midwife_user.id,
                notes="Weight dropped. MAM threshold crossed. Monitoring closely.",
            ))

            db.session.flush()
            print(f"  [+] Sithara Silva created (id={sithara.id})")
            print(f"      uid={sithara.child_unique_id}  risk=MAM  assigned=Midwife")
            print(f"      Measurements: Normal @ {m_date1.date()}, MAM @ {m_date2.date()}")
        else:
            print("  [=] Sithara Silva already exists (DEMO-MID-001)")

        db.session.commit()

        print("\n=== Summary ===")
        print("  MOH login:      username=moh_hanwella       password=demo1234")
        print("  Midwife login:  username=midwife_kosgama    password=demo1234")
        print()
        print("  Kasun Perera  (DEMO-MOH-001)  → SAM, under MOH — escalate to nutritionist")
        print("  Sithara Silva (DEMO-MID-001)  → MAM, under midwife — monitor / escalate to MOH")


if __name__ == "__main__":
    run()
