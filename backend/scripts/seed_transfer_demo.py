"""
Seed two demo children for the PHM→MOH and MOH→Nutritionist transfer workflow.

Run from project root:
  python backend/scripts/seed_transfer_demo.py

Children created:
  SAMPLE-XFER-PHM-001  Kasun Wickramasinghe  (SAM, under midwife — MOH can pull via High-Risk Children)
  SAMPLE-XFER-MOH-001  Nethmi Rajapakse      (SAM, under MOH care — MOH can escalate to Nutritionist)
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from decimal import Decimal

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from backend.app import create_app
from backend.extensions import db
from backend.models_hierarchical import (
    Area,
    Child,
    ChildEscalation,
    EscalationStatus,
    EscalationRecordStatus,
    Measurement,
    User,
    UserRole,
)

CHILD_ID_PREFIX = "SAMPLE-"


def _find_first(level: str) -> "Area | None":
    return Area.query.filter_by(level=level, is_active=True).first()


def _by_uid(uid: str) -> "Child | None":
    return Child.query.filter(
        (Child.child_unique_id == uid) | (Child.child_id == uid)
    ).first()


def main() -> None:
    app = create_app()
    with app.app_context():
        phm = _find_first("phm")
        moh = _find_first("moh")
        rdhs = _find_first("rdhs")
        pdhs = _find_first("pdhs")

        if not all([phm, moh, rdhs, pdhs]):
            print("[ERROR] Missing area hierarchy — ensure PHM, MOH, RDHS, PDHS areas exist.")
            sys.exit(1)

        midwife = User.query.filter_by(role=UserRole.MIDWIFE.value, is_active=True).first()
        moh_user = User.query.filter(
            User.role.in_([UserRole.MOH.value, UserRole.AMOH.value]),
            User.is_active == True,
        ).first()

        if not midwife:
            print("[ERROR] No active midwife user found.")
            sys.exit(1)

        print(f"Using: phm={phm.name}, moh={moh.name}, midwife={midwife.username}, moh_user={moh_user.username if moh_user else 'none'}")

        moh_user_id = moh_user.id if moh_user else midwife.id

        # ── Child 1: SAM under MIDWIFE — for High-Risk Children → Transfer to MOH ──
        uid1 = f"{CHILD_ID_PREFIX}XFER-PHM-001"
        c1 = _by_uid(uid1)
        dob1 = (datetime.now() - timedelta(days=14 * 30)).date()
        if not c1:
            c1 = Child(
                child_unique_id=uid1,
                child_id=uid1,
                name="Kasun Wickramasinghe",
                dob=dob1,
                gender="male",
                guardian_name="Priya Wickramasinghe",
                guardian_phone="0771234567",
                address="45, Temple Road, " + phm.name,
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
            db.session.add(c1)
            print(f"[+] Created child: {uid1} — {c1.name}")
        else:
            c1.current_assigned_role = UserRole.MIDWIFE.value
            c1.current_assigned_user_id = midwife.id
            c1.current_risk_level = "SAM"
            c1.escalation_status = EscalationStatus.NONE.value
            c1.status = "ACTIVE"
            c1.is_draft = False
            print(f"[~] Updated existing child: {uid1}")

        db.session.flush()

        if not Measurement.query.filter_by(child_id=c1.id).first():
            for days_ago, wt, ht, risk, z_wfa, muac, notes in [
                (45, "9.8", "79.0", "NORMAL", "-0.8", "14.2", "Routine clinic visit — normal growth"),
                (21, "8.9", "78.5", "MAM",    "-2.2", "12.4", "Mild weight loss — monitor closely"),
                (3,  "7.8", "78.0", "SAM",    "-3.1", "11.2", "Significant wasting — SAM confirmed. Needs MOH review."),
            ]:
                db.session.add(Measurement(
                    child_id=c1.id,
                    measurement_date=datetime.now() - timedelta(days=days_ago),
                    weight_kg=Decimal(wt), height_cm=Decimal(ht), muac_cm=Decimal(muac),
                    z_score_wfa=Decimal(z_wfa),
                    z_score_hfa=Decimal("-2.0") if risk != "NORMAL" else Decimal("-0.4"),
                    z_score_wfh=Decimal("-2.6") if risk == "SAM" else Decimal("-2.0") if risk == "MAM" else Decimal("-0.5"),
                    risk_level=risk, model_confidence=Decimal("0.91"),
                    measured_by_user_id=midwife.id, notes=notes,
                ))
            print(f"    Measurements added for {uid1}")

        # ── Child 2: SAM under MOH care — for My Children → Escalate to Nutritionist ──
        uid2 = f"{CHILD_ID_PREFIX}XFER-MOH-001"
        c2 = _by_uid(uid2)
        dob2 = (datetime.now() - timedelta(days=18 * 30)).date()
        if not c2:
            c2 = Child(
                child_unique_id=uid2,
                child_id=uid2,
                name="Nethmi Rajapakse",
                dob=dob2,
                gender="female",
                guardian_name="Chamari Rajapakse",
                guardian_phone="0779876543",
                address="12, Lake Road, " + moh.name,
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
            db.session.add(c2)
            print(f"[+] Created child: {uid2} — {c2.name}")
        else:
            c2.current_assigned_role = UserRole.MOH.value
            c2.current_assigned_user_id = moh_user_id
            c2.current_risk_level = "SAM"
            c2.escalation_status = EscalationStatus.ESCALATED_TO_MOH.value
            c2.status = "ACTIVE"
            c2.is_draft = False
            print(f"[~] Updated existing child: {uid2}")

        db.session.flush()

        if not Measurement.query.filter_by(child_id=c2.id).first():
            for days_ago, wt, ht, risk, z_wfa, muac, notes, measured_by in [
                (60, "10.5", "82.0", "NORMAL", "-0.5", "14.5", "Routine PHM visit — normal growth", midwife.id),
                (30, "9.1",  "81.5", "MAM",    "-2.3", "12.2", "Weight loss noted — escalated to MOH", midwife.id),
                (14, "8.2",  "81.0", "SAM",    "-3.2", "11.0", "MOH assessment — severe acute malnutrition", moh_user_id),
                (2,  "8.0",  "81.0", "SAM",    "-3.4", "10.8", "MOH follow-up — no improvement, nutritionist needed", moh_user_id),
            ]:
                db.session.add(Measurement(
                    child_id=c2.id,
                    measurement_date=datetime.now() - timedelta(days=days_ago),
                    weight_kg=Decimal(wt), height_cm=Decimal(ht), muac_cm=Decimal(muac),
                    z_score_wfa=Decimal(z_wfa),
                    z_score_hfa=Decimal("-2.1") if risk != "NORMAL" else Decimal("-0.3"),
                    z_score_wfh=Decimal("-2.6") if risk == "SAM" else Decimal("-2.0") if risk == "MAM" else Decimal("-0.4"),
                    risk_level=risk, model_confidence=Decimal("0.93"),
                    measured_by_user_id=measured_by, notes=notes,
                ))
            print(f"    Measurements added for {uid2}")

        if not ChildEscalation.query.filter_by(child_id=c2.id).first():
            db.session.add(ChildEscalation(
                child_id=c2.id,
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
                review_notes="SAM confirmed — MOH monitoring. Escalate to Nutritionist if no improvement.",
            ))
            print(f"    Escalation history added for {uid2}")

        db.session.commit()

        print("\n=== Transfer demo children ready ===")
        print(f"  {uid1}  Kasun Wickramasinghe  SAM | role=midwife | PHM={phm.name}")
        print(f"    → Login as MOH ({moh_user.username if moh_user else '?'}) → High-Risk Children → Transfer to MOH")
        print(f"  {uid2}  Nethmi Rajapakse       SAM | role=moh    | MOH={moh.name}")
        print(f"    → Login as MOH ({moh_user.username if moh_user else '?'}) → My Children → Escalate to Nutritionist")


if __name__ == "__main__":
    main()
