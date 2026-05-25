"""
Seed sample children and fix area assignments for existing users (no demo_* accounts).

Run from project root:
  python backend/scripts/seed_all_roles_dummy_data.py

Uses usernames already in the database (Western, colombo, Hanwella, Midwife, etc.).
Does not change existing passwords.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from decimal import Decimal

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from dotenv import load_dotenv

env_path = os.path.join(project_root, "backend", ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)

from sqlalchemy import or_

from backend.app import create_app
from backend.extensions import db
from backend.models_hierarchical import (
    Area,
    Child,
    ChildReferral,
    ChildEscalation,
    EscalationStatus,
    EscalationRecordStatus,
    Hospital,
    Measurement,
    ReferralStatus,
    TransferStatus,
    User,
    UserRole,
    WorkerAreaMapping,
)
from backend.utils.hospital_helpers import calculate_birth_risk_level

# Existing accounts — username -> area level keys to map
EXISTING_WORKERS = {
    "Western": {"areas": ["pdhs"]},
    "colombo": {"areas": ["rdhs"]},
    "Hanwella": {"areas": ["moh"]},
    "Midwife": {"areas": ["phm"], "set_phm_area": True},
    "avissawella_N": {"areas": ["moh"], "hospital_code": "HOS001", "nutritionist_extra_areas": True},
    "Birth_Avissawella": {"areas": [], "hospital_code": "HOS001"},
}

CHILD_ID_PREFIX = "SAMPLE-"


def _find_area(level: str, **filters) -> Area | None:
    q = db.session.query(Area).filter(Area.level == level, Area.is_active == True)
    for key, val in filters.items():
        if val is not None:
            q = q.filter(getattr(Area, key) == val)
    return q.first()


def resolve_hierarchy() -> dict[str, Area]:
    """Use existing Western → Colombo → Hanwella → Kosgama areas."""
    pdhs = _find_area("pdhs", province="Western") or _find_area("pdhs", name="Western")
    rdhs = _find_area("rdhs", name="Colombo") or _find_area("rdhs", district="Colombo")
    moh = _find_area("moh", name="Hanwella")
    phm = _find_area("phm", name="Kosgama")
    if not all([pdhs, rdhs, moh, phm]):
        raise RuntimeError(
            "Missing area hierarchy. Ensure Western (pdhs), Colombo (rdhs), Hanwella (moh), Kosgama (phm) exist."
        )
    ministry = _find_area("ministry")
    return {"ministry": ministry, "pdhs": pdhs, "rdhs": rdhs, "moh": moh, "phm": phm}


def resolve_hospital() -> Hospital:
    hospital = Hospital.query.filter_by(hospital_code="HOS001").first()
    if not hospital:
        raise RuntimeError("Hospital HOS001 not found. Create it in Area/Hospital management first.")
    return hospital


def remove_demo_accounts():
    """Remove demo_* users and their seeded children."""
    demo_users = User.query.filter(User.username.like("demo_%")).all()
    if not demo_users:
        return 0

    demo_ids = [u.id for u in demo_users]
    child_ids = [
        c.id
        for c in Child.query.filter(
            or_(
                Child.child_unique_id.like("DEMO-%"),
                Child.registered_by_user_id.in_(demo_ids),
            )
        ).all()
    ]

    if child_ids:
        Measurement.query.filter(Measurement.child_id.in_(child_ids)).delete(synchronize_session=False)
        ChildReferral.query.filter(ChildReferral.child_id.in_(child_ids)).delete(synchronize_session=False)
        ChildEscalation.query.filter(ChildEscalation.child_id.in_(child_ids)).delete(synchronize_session=False)
        Child.query.filter(Child.id.in_(child_ids)).delete(synchronize_session=False)

    WorkerAreaMapping.query.filter(WorkerAreaMapping.user_id.in_(demo_ids)).delete(synchronize_session=False)
    for u in demo_users:
        if u.is_protected:
            continue
        db.session.delete(u)
    db.session.commit()
    return len(demo_users)


def configure_existing_users(hierarchy: dict[str, Area], hospital: Hospital) -> dict[str, User]:
    superadmin = User.query.filter_by(username="superadmin").first()
    created_by_id = superadmin.id if superadmin else None
    users: dict[str, User] = {}

    level_to_area = {
        "pdhs": hierarchy["pdhs"],
        "rdhs": hierarchy["rdhs"],
        "moh": hierarchy["moh"],
        "phm": hierarchy["phm"],
    }

    for username, cfg in EXISTING_WORKERS.items():
        user = User.query.filter_by(username=username).first()
        if not user:
            print(f"[WARN] User '{username}' not found — skipped")
            continue

        if cfg.get("hospital_code"):
            user.hospital_id = hospital.id

        if cfg.get("set_phm_area"):
            user.phm_area_id = hierarchy["phm"].id
            user.assignment_status = "ACTIVE"

        for key in cfg.get("areas", []):
            area = level_to_area.get(key)
            if not area:
                continue
            existing = WorkerAreaMapping.query.filter_by(user_id=user.id, area_id=area.id).first()
            if existing:
                existing.is_active = True
            else:
                db.session.add(
                    WorkerAreaMapping(
                        user_id=user.id,
                        area_id=area.id,
                        is_active=True,
                        created_by_id=created_by_id,
                    )
                )

        if cfg.get("nutritionist_extra_areas") and user.role == UserRole.NUTRITIONIST.value:
            for extra in (hierarchy["pdhs"], hierarchy["rdhs"]):
                existing = WorkerAreaMapping.query.filter_by(user_id=user.id, area_id=extra.id).first()
                if existing:
                    existing.is_active = True
                else:
                    db.session.add(
                        WorkerAreaMapping(
                            user_id=user.id,
                            area_id=extra.id,
                            is_active=True,
                            created_by_id=created_by_id,
                        )
                    )

        users[username] = user

    db.session.commit()
    return users


def _child_by_uid(uid: str) -> Child | None:
    return Child.query.filter(
        (Child.child_unique_id == uid) | (Child.child_id == uid)
    ).first()


def seed_hospital_children(
    hospital: Hospital,
    hospital_user: User,
    hierarchy: dict[str, Area],
) -> int:
    rdhs, pdhs = hierarchy["rdhs"], hierarchy["pdhs"]
    specs = [
        (f"{CHILD_ID_PREFIX}HOS-SAM-001", "Sample Baby SAM", 2.1, 46.0, "male"),
        (f"{CHILD_ID_PREFIX}HOS-MAM-001", "Sample Baby MAM", 2.4, 47.0, "female"),
        (f"{CHILD_ID_PREFIX}HOS-NORMAL-001", "Sample Baby Normal", 3.2, 50.0, "male"),
        (f"{CHILD_ID_PREFIX}HOS-NORMAL-002", "Sample Baby Normal Two", 3.0, 49.5, "female"),
    ]
    count = 0
    for uid, name, weight, height, gender in specs:
        child = _child_by_uid(uid)
        dob = (datetime.now() - timedelta(days=14)).date()
        birth_risk, _ = calculate_birth_risk_level(weight, height, None, 14)
        if not child:
            child = Child(
                child_unique_id=uid,
                child_id=uid,
                name=name,
                dob=dob,
                gender=gender,
                birth_weight_kg=Decimal(str(weight)),
                birth_height_cm=Decimal(str(height)),
                mother_name=f"Mother of {name}",
                guardian_name=f"Guardian of {name}",
                guardian_phone="0770000001",
                hospital_id=hospital.id,
                district_id=rdhs.id,
                province_id=pdhs.id,
                registered_by_user_id=hospital_user.id,
                registered_by_clinic=hospital.hospital_name,
                registration_date=datetime.now(),
                birth_risk_level=birth_risk,
                transfer_status=TransferStatus.NONE.value,
                is_transferred=False,
                current_assigned_role=UserRole.HOSPITAL.value,
                current_risk_level=birth_risk,
                status="ACTIVE",
                is_draft=False,
            )
            db.session.add(child)
            count += 1
        else:
            child.hospital_id = hospital.id
            child.district_id = rdhs.id
            child.province_id = pdhs.id
            child.registered_by_user_id = hospital_user.id
            child.birth_risk_level = birth_risk
            child.current_risk_level = birth_risk
            child.is_draft = False
            child.status = "ACTIVE"

        db.session.flush()

        sam_uid = f"{CHILD_ID_PREFIX}HOS-SAM-001"
        if uid == sam_uid and birth_risk == "SAM":
            child.transfer_status = TransferStatus.TRANSFERRED_TO_NUTRITIONIST.value
            child.is_transferred = True
            ref = ChildReferral.query.filter_by(child_id=child.id, hospital_id=hospital.id).first()
            if not ref:
                db.session.add(
                    ChildReferral(
                        child_id=child.id,
                        referred_by_user_id=hospital_user.id,
                        referred_to_role="nutritionist",
                        hospital_id=hospital.id,
                        status=ReferralStatus.PENDING.value,
                        referral_reason="SAM case — nutritionist follow-up",
                    )
                )

    db.session.commit()
    return count


def seed_phm_children(hierarchy: dict[str, Area], midwife: User) -> int:
    phm, moh, rdhs, pdhs = hierarchy["phm"], hierarchy["moh"], hierarchy["rdhs"], hierarchy["pdhs"]
    specs = [
        (f"{CHILD_ID_PREFIX}PHM-001", "Saman Perera", "male", 10.2, 78.0, "NORMAL"),
        (f"{CHILD_ID_PREFIX}PHM-002", "Kavindi Silva", "female", 8.5, 74.0, "MAM"),
        (f"{CHILD_ID_PREFIX}PHM-003", "Nisal Fernando", "male", 7.2, 72.0, "SAM"),
        (f"{CHILD_ID_PREFIX}PHM-004", "Amaya Jayasuriya", "female", 11.0, 82.0, "NORMAL"),
        (f"{CHILD_ID_PREFIX}PHM-005", "Pasindu Bandara", "male", 9.8, 80.0, "NORMAL"),
    ]
    count = 0
    for uid, name, gender, weight, height, risk in specs:
        child = _child_by_uid(uid)
        dob = (datetime.now() - timedelta(days=365)).date()
        if not child:
            child = Child(
                child_unique_id=uid,
                child_id=uid,
                name=name,
                dob=dob,
                gender=gender,
                guardian_name=f"Guardian of {name}",
                guardian_phone="0770000100",
                address="Kosgama, Colombo",
                phm_area_id=phm.id,
                moh_area_id=moh.id,
                district_id=rdhs.id,
                province_id=pdhs.id,
                assigned_date=datetime.now(),
                current_assigned_role=UserRole.MIDWIFE.value,
                current_assigned_area_id=phm.id,
                current_assigned_user_id=midwife.id,
                current_risk_level=risk,
                escalation_status="NONE",
                status="ACTIVE",
                is_draft=False,
                registration_date=datetime.now(),
            )
            db.session.add(child)
            count += 1
        else:
            child.phm_area_id = phm.id
            child.moh_area_id = moh.id
            child.district_id = rdhs.id
            child.province_id = pdhs.id
            child.current_assigned_user_id = midwife.id
            child.current_risk_level = risk
            child.is_draft = False
            child.status = "ACTIVE"

        db.session.flush()

        if not Measurement.query.filter_by(child_id=child.id).first():
            db.session.add(
                Measurement(
                    child_id=child.id,
                    measurement_date=datetime.now() - timedelta(days=7),
                    weight_kg=Decimal(str(weight)),
                    height_cm=Decimal(str(height)),
                    muac_cm=Decimal("12.5") if risk == "MAM" else (Decimal("11.0") if risk == "SAM" else Decimal("14.0")),
                    z_score_wfa=Decimal("-0.5") if risk == "NORMAL" else Decimal("-2.3"),
                    z_score_hfa=Decimal("-0.4") if risk == "NORMAL" else Decimal("-2.1"),
                    z_score_wfh=Decimal("-0.6") if risk == "NORMAL" else Decimal("-2.5"),
                    risk_level=risk,
                    model_confidence=Decimal("0.85"),
                    measured_by_user_id=midwife.id,
                    notes=f"Sample clinic visit — {risk}",
                )
            )

    db.session.commit()
    return count


def seed_transfer_demo_children(hierarchy: dict[str, Area], midwife: User) -> int:
    """
    Seed two demo children specifically for the transfer workflow:
      - SAMPLE-XFER-PHM-001: SAM child under midwife → ready for MOH to pull via "High-Risk Children"
      - SAMPLE-XFER-MOH-001: SAM child already under MOH care → ready for MOH to escalate to Nutritionist
    """
    phm, moh, rdhs, pdhs = hierarchy["phm"], hierarchy["moh"], hierarchy["rdhs"], hierarchy["pdhs"]
    moh_user = User.query.filter_by(username="Hanwella").first()
    count = 0

    # ── Child 1: under MIDWIFE, SAM — for PHM → MOH transfer demo ──────────
    uid1 = f"{CHILD_ID_PREFIX}XFER-PHM-001"
    child1 = _child_by_uid(uid1)
    dob1 = (datetime.now() - timedelta(days=14 * 30)).date()   # 14 months old
    if not child1:
        child1 = Child(
            child_unique_id=uid1,
            child_id=uid1,
            name="Kasun Wickramasinghe",
            dob=dob1,
            gender="male",
            guardian_name="Priya Wickramasinghe",
            guardian_phone="0771234567",
            address="45, Temple Road, Kosgama",
            phm_area_id=phm.id,
            moh_area_id=moh.id,
            district_id=rdhs.id,
            province_id=pdhs.id,
            assigned_date=datetime.now() - timedelta(days=30),
            current_assigned_role=UserRole.MIDWIFE.value,
            current_assigned_area_id=phm.id,
            current_assigned_user_id=midwife.id,
            current_risk_level="SAM",
            last_risk_update=datetime.now() - timedelta(days=3),
            escalation_status=EscalationStatus.NONE.value,
            status="ACTIVE",
            is_draft=False,
            registration_date=datetime.now() - timedelta(days=60),
        )
        db.session.add(child1)
        count += 1
    else:
        child1.current_assigned_role = UserRole.MIDWIFE.value
        child1.current_assigned_user_id = midwife.id
        child1.current_risk_level = "SAM"
        child1.escalation_status = EscalationStatus.NONE.value
        child1.status = "ACTIVE"
        child1.is_draft = False

    db.session.flush()

    # Measurements: NORMAL → MAM → SAM (showing deterioration)
    if not Measurement.query.filter_by(child_id=child1.id).first():
        for days_ago, weight, height, risk, z_wfa, z_hfa, muac, notes in [
            (45, Decimal("9.8"),  Decimal("79.0"), "NORMAL", Decimal("-0.8"),  Decimal("-0.6"),  Decimal("14.2"), "Routine visit — normal growth"),
            (21, Decimal("8.9"),  Decimal("78.5"), "MAM",    Decimal("-2.2"),  Decimal("-1.9"),  Decimal("12.4"), "Mild weight loss — monitor closely"),
            (3,  Decimal("7.8"),  Decimal("78.0"), "SAM",    Decimal("-3.1"),  Decimal("-2.8"),  Decimal("11.2"), "Significant wasting — SAM confirmed"),
        ]:
            db.session.add(Measurement(
                child_id=child1.id,
                measurement_date=datetime.now() - timedelta(days=days_ago),
                weight_kg=weight,
                height_cm=height,
                muac_cm=muac,
                z_score_wfa=z_wfa,
                z_score_hfa=z_hfa,
                z_score_wfh=Decimal("-2.5") if risk == "SAM" else Decimal("-2.0") if risk == "MAM" else Decimal("-0.5"),
                risk_level=risk,
                model_confidence=Decimal("0.91"),
                measured_by_user_id=midwife.id,
                notes=notes,
            ))

    # ── Child 2: already under MOH care, SAM — for MOH → Nutritionist demo ─
    uid2 = f"{CHILD_ID_PREFIX}XFER-MOH-001"
    child2 = _child_by_uid(uid2)
    dob2 = (datetime.now() - timedelta(days=18 * 30)).date()   # 18 months old
    moh_user_id = moh_user.id if moh_user else midwife.id
    if not child2:
        child2 = Child(
            child_unique_id=uid2,
            child_id=uid2,
            name="Nethmi Rajapakse",
            dob=dob2,
            gender="female",
            guardian_name="Chamari Rajapakse",
            guardian_phone="0779876543",
            address="12, Lake Road, Hanwella",
            phm_area_id=phm.id,
            moh_area_id=moh.id,
            district_id=rdhs.id,
            province_id=pdhs.id,
            assigned_date=datetime.now() - timedelta(days=14),
            current_assigned_role=UserRole.MOH.value,
            current_assigned_area_id=moh.id,
            current_assigned_user_id=moh_user_id,
            current_risk_level="SAM",
            last_risk_update=datetime.now() - timedelta(days=2),
            escalation_status=EscalationStatus.ESCALATED_TO_MOH.value,
            status="ACTIVE",
            is_draft=False,
            registration_date=datetime.now() - timedelta(days=90),
        )
        db.session.add(child2)
        count += 1
    else:
        child2.current_assigned_role = UserRole.MOH.value
        child2.current_assigned_user_id = moh_user_id
        child2.current_risk_level = "SAM"
        child2.escalation_status = EscalationStatus.ESCALATED_TO_MOH.value
        child2.status = "ACTIVE"
        child2.is_draft = False

    db.session.flush()

    # Measurements showing deterioration from midwife to MOH level
    if not Measurement.query.filter_by(child_id=child2.id).first():
        for days_ago, weight, height, risk, z_wfa, muac, notes, measured_by in [
            (60, Decimal("10.5"), Decimal("82.0"), "NORMAL", Decimal("-0.5"),  Decimal("14.5"), "Routine PHM visit — normal", midwife.id),
            (30, Decimal("9.1"),  Decimal("81.5"), "MAM",    Decimal("-2.3"),  Decimal("12.2"), "Weight loss noted — escalated to MOH", midwife.id),
            (14, Decimal("8.2"),  Decimal("81.0"), "SAM",    Decimal("-3.2"),  Decimal("11.0"), "MOH assessment — severe acute malnutrition", moh_user_id),
            (2,  Decimal("8.0"),  Decimal("81.0"), "SAM",    Decimal("-3.4"),  Decimal("10.8"), "MOH follow-up — condition not improving", moh_user_id),
        ]:
            db.session.add(Measurement(
                child_id=child2.id,
                measurement_date=datetime.now() - timedelta(days=days_ago),
                weight_kg=weight,
                height_cm=height,
                muac_cm=muac,
                z_score_wfa=z_wfa,
                z_score_hfa=Decimal("-2.1") if risk != "NORMAL" else Decimal("-0.3"),
                z_score_wfh=Decimal("-2.6") if risk == "SAM" else Decimal("-2.0") if risk == "MAM" else Decimal("-0.4"),
                risk_level=risk,
                model_confidence=Decimal("0.93"),
                measured_by_user_id=measured_by,
                notes=notes,
            ))

    # Escalation record: midwife → MOH (REVIEWED — MOH has already accepted this child)
    if not ChildEscalation.query.filter_by(child_id=child2.id).first():
        db.session.add(ChildEscalation(
            child_id=child2.id,
            escalated_by_user_id=midwife.id,
            from_role="midwife",
            to_role="moh",
            moh_id=moh.id,
            reason="Child deteriorated from MAM to SAM — requires MOH clinical review",
            previous_risk_level="MAM",
            new_risk_level="SAM",
            status=EscalationRecordStatus.REVIEWED.value,
            reviewed_by_user_id=moh_user_id,
            reviewed_at=datetime.now() - timedelta(days=12),
            review_notes="Confirmed SAM — MOH monitoring. Nutritionist referral pending if no improvement.",
        ))

    db.session.commit()
    print(f"[OK] Transfer demo children seeded: {count} new, IDs: {uid1}, {uid2}")
    return count


def print_summary(users: dict[str, User]):
    print("\n=== Existing users (passwords unchanged) ===\n")
    for username, user in sorted(users.items()):
        areas = WorkerAreaMapping.query.filter_by(user_id=user.id, is_active=True).all()
        area_names = []
        for m in areas:
            a = db.session.get(Area, m.area_id)
            if a:
                area_names.append(f"{a.level}:{a.name}")
        extra = []
        if user.hospital_id:
            h = db.session.get(Hospital, user.hospital_id)
            extra.append(f"hospital={h.hospital_code if h else user.hospital_id}")
        if user.phm_area_id:
            a = db.session.get(Area, user.phm_area_id)
            extra.append(f"phm_area={a.name if a else user.phm_area_id}")
        print(f"  {username:20}  role={user.role:18}  areas=[{', '.join(area_names)}]  {' '.join(extra)}")

    ministry = User.query.filter_by(role=UserRole.HEALTH_MINISTRY.value, is_active=True).count()
    worker_roles = ("pdhs", "rdhs", "moh", "amoh", "midwife", "nutritionist", "hospital")
    active_workers = User.query.filter(User.role.in_(worker_roles), User.is_active == True).count()
    children = Child.query.filter(Child.is_draft == False, Child.status == "ACTIVE").count()
    sample_children = Child.query.filter(Child.child_unique_id.like(f"{CHILD_ID_PREFIX}%")).count()

    print(f"\n  Health ministry accounts: {ministry}")
    print(f"  Active health workers (overview): {active_workers}")
    print(f"  Active children: {children}")
    print(f"  Sample children ({CHILD_ID_PREFIX}*): {sample_children}")
    print("\n  Ministry logins: superadmin, Admin\n")


def main():
    app = create_app()
    with app.app_context():
        print("Configuring dummy data for existing users...")
        removed = remove_demo_accounts()
        if removed:
            print(f"[OK] Removed {removed} demo_* user(s) and linked DEMO-* children")

        hierarchy = resolve_hierarchy()
        hospital = resolve_hospital()
        users = configure_existing_users(hierarchy, hospital)

        hospital_user = users.get("Birth_Avissawella")
        midwife_user = users.get("Midwife")
        if hospital_user:
            seed_hospital_children(hospital, hospital_user, hierarchy)
        else:
            print("[WARN] Birth_Avissawella not found — skipped hospital children")

        if midwife_user:
            seed_phm_children(hierarchy, midwife_user)
            seed_transfer_demo_children(hierarchy, midwife_user)
        else:
            print("[WARN] Midwife not found — skipped PHM children and transfer demo children")

        print("[OK] Sample data ready for existing accounts.")
        print_summary(users)


if __name__ == "__main__":
    main()
