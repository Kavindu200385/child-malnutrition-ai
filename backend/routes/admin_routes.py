"""
Admin (ADMIN_HEALTH_MINISTRY / health_ministry) Routes
National-level: dashboard summary, messaging, system settings.
User CRUD and Area CRUD remain in worker_management and areas_hierarchical (health_ministry only).
"""
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request

from backend.auth_utils_hierarchical import get_current_user, get_moh_and_rdhs_for_user, health_ministry_required, ROLE_HEALTH_MINISTRY
from backend.extensions import db
from backend.models_hierarchical import (
    Child,
    Area,
    User,
    ChildEscalation,
    ChildReferral,
    SystemMessage,
    SystemSetting,
    ReferralStatus,
    EscalationRecordStatus,
    PdhsReport,
)
from backend.utils.audit import log_audit

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def _risk_sam(r):
    v = (r or "").upper()
    return v in ("SAM", "CRITICAL")


def _risk_mam(r):
    v = (r or "").upper()
    return v in ("MAM", "MODERATE", "HIGH")


def _risk_normal(r):
    return (r or "").upper() == "NORMAL"


def _get_child_area_ids(area_id: int) -> list:
    """Recursively get all child area IDs under an area."""
    area_ids = []
    children = db.session.query(Area).filter(
        Area.parent_id == area_id,
        Area.is_active == True
    ).all()
    for child in children:
        area_ids.append(child.id)
        area_ids.extend(_get_child_area_ids(child.id))
    return area_ids


@bp.route("/dashboard-summary", methods=["GET"])
@health_ministry_required
def dashboard_summary():
    """
    National dashboard for Health Ministry.
    Total children, province comparison, district comparison, escalations, referral stats,
    national risk, monthly trend, health worker stats.
    """
    user = get_current_user()
    if not user or user.role != ROLE_HEALTH_MINISTRY:
        return jsonify({"status": "error", "message": "Health Ministry access required"}), 403

    children_query = db.session.query(Child).filter(
        Child.is_draft == False,
        Child.status == "ACTIVE"
    )
    all_children = children_query.all()

    total_children = len(all_children)
    sam_count = sum(1 for c in all_children if _risk_sam(c.current_risk_level))
    mam_count = sum(1 for c in all_children if _risk_mam(c.current_risk_level))
    normal_count = sum(1 for c in all_children if _risk_normal(c.current_risk_level))

    worker_roles = ("pdhs", "rdhs", "moh", "amoh", "midwife", "nutritionist", "hospital")
    admin_roles = ("pdhs", "rdhs")  # RDHS/PDHS do admin/supervisory roles
    field_roles = ("moh", "amoh", "midwife", "nutritionist", "hospital")  # Field workers
    total_workers = db.session.query(User).filter(User.role.in_(worker_roles), User.is_active == True).count()
    admin_workers_count = db.session.query(User).filter(User.role.in_(admin_roles), User.is_active == True).count()
    field_workers_count = db.session.query(User).filter(User.role.in_(field_roles), User.is_active == True).count()
    total_clinics = db.session.query(Area).filter(Area.level == "phm", Area.is_active == True).count()

    pdhs_areas = db.session.query(Area).filter(
        Area.level == "pdhs",
        Area.is_active == True
    ).all()
    province_breakdown = []
    for pdhs in pdhs_areas:
        child_area_ids = _get_child_area_ids(pdhs.id)
        district_ids_under_pdhs = [a.id for a in db.session.query(Area).filter(
            Area.parent_id == pdhs.id,
            Area.level == "rdhs",
            Area.is_active == True,
        ).all()]
        province_children = [
            c for c in all_children
            if c.province_id == pdhs.id
            or c.district_id in district_ids_under_pdhs
            or (c.current_assigned_area_id and c.current_assigned_area_id in child_area_ids)
        ]
        total = len(province_children)
        province_breakdown.append({
            "province": pdhs.name or pdhs.province or f"Province {pdhs.id}",
            "province_id": pdhs.id,
            "total": total,
            "sam": sum(1 for c in province_children if _risk_sam(c.current_risk_level)),
            "mam": sum(1 for c in province_children if _risk_mam(c.current_risk_level)),
            "normal": sum(1 for c in province_children if _risk_normal(c.current_risk_level)),
        })
    province_breakdown.sort(key=lambda x: -x["total"])

    rdhs_areas = db.session.query(Area).filter(
        Area.level == "rdhs",
        Area.is_active == True
    ).all()
    district_breakdown = []
    for rdhs in rdhs_areas:
        child_area_ids = _get_child_area_ids(rdhs.id)
        district_children = [c for c in all_children if (c.district_id == rdhs.id) or (c.current_assigned_area_id and c.current_assigned_area_id in child_area_ids)]
        total = len(district_children)
        district_breakdown.append({
            "district": rdhs.name or rdhs.district or f"RDHS {rdhs.id}",
            "district_id": rdhs.id,
            "total": total,
            "sam": sum(1 for c in district_children if _risk_sam(c.current_risk_level)),
            "mam": sum(1 for c in district_children if _risk_mam(c.current_risk_level)),
            "normal": sum(1 for c in district_children if _risk_normal(c.current_risk_level)),
        })
    district_breakdown.sort(key=lambda x: -x["total"])

    moh_area_ids = [a.id for a in db.session.query(Area).filter(Area.level == "moh", Area.is_active == True).all()]
    total_escalations = db.session.query(ChildEscalation).filter(ChildEscalation.moh_id.in_(moh_area_ids)).count() if moh_area_ids else 0
    escalation_summary = {
        "total": total_escalations,
        "pending": db.session.query(ChildEscalation).filter(ChildEscalation.status == "PENDING").count(),
        "reviewed": db.session.query(ChildEscalation).filter(ChildEscalation.status == "REVIEWED").count(),
    }
    referral_stats = {"total_referrals": db.session.query(ChildReferral).count()}

    monthly_trend = []
    today = datetime.utcnow().date()
    for i in range(5, -1, -1):
        year, month = today.year, today.month - i
        while month <= 0:
            month += 12
            year -= 1
        month_start = today.replace(year=year, month=month, day=1)
        month_end = (month_start.replace(month=month % 12 + 1, day=1) - timedelta(days=1)) if month < 12 else month_start.replace(day=31)
        if month_end > today:
            month_end = today
        period_children = [c for c in all_children if c.created_at and (month_start <= c.created_at.date() <= month_end)]
        monthly_trend.append({
            "month": month_start.strftime("%b"),
            "children": len(period_children),
            "sam": sum(1 for c in period_children if _risk_sam(c.current_risk_level)),
            "mam": sum(1 for c in period_children if _risk_mam(c.current_risk_level)),
        })

    return jsonify({
        "status": "success",
        "data": {
            "total_children": total_children,
            "normal_count": normal_count,
            "mam_count": mam_count,
            "sam_count": sam_count,
            "risk_distribution": [
                {"name": "Normal", "value": normal_count, "color": "#2ECC71"},
                {"name": "MAM", "value": mam_count, "color": "#F1C40F"},
                {"name": "SAM", "value": sam_count, "color": "#E74C3C"},
            ],
            "total_workers": total_workers,
            "admin_workers_count": admin_workers_count,
            "field_workers_count": field_workers_count,
            "total_clinics": total_clinics,
            "province_breakdown": province_breakdown,
            "district_breakdown": district_breakdown,
            "escalation_summary": escalation_summary,
            "referral_stats": referral_stats,
            "monthly_trend": monthly_trend,
        },
    }), 200


@bp.route("/send-message", methods=["POST"])
@health_ministry_required
def send_message():
    """
    Create a system message (broadcast or targeted).
    Body: title, message, target_role (optional), province_id (optional), district_id (optional).
    """
    user = get_current_user()
    if not user:
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    data = request.get_json() or {}
    title = data.get("title")
    message = data.get("message")
    if not title or not message:
        return jsonify({"status": "error", "message": "title and message are required"}), 400
    target_role = data.get("target_role")
    province_id = data.get("province_id")
    district_id = data.get("district_id")
    msg = SystemMessage(
        title=title,
        message=message,
        target_role=target_role,
        province_id=int(province_id) if province_id is not None else None,
        district_id=int(district_id) if district_id is not None else None,
        created_by_id=user.id,
    )
    db.session.add(msg)
    db.session.flush()
    log_audit(
        action="CREATE",
        entity_type="system_message",
        entity_id=msg.id,
        new_values=msg.to_dict(),
        user_id=user.id,
        description=f"Admin sent message: {title}",
    )
    db.session.commit()
    return jsonify({"status": "success", "message": msg.to_dict()}), 201


@bp.route("/settings", methods=["GET"])
@health_ministry_required
def get_settings():
    """List all system settings (key-value)."""
    settings = db.session.query(SystemSetting).order_by(SystemSetting.key).all()
    return jsonify({
        "status": "success",
        "settings": [s.to_dict() for s in settings],
        "count": len(settings),
    }), 200


@bp.route("/settings/update", methods=["PUT"])
@health_ministry_required
def update_settings():
    """
    Update system settings. Body: { "key": "value", ... } or { "settings": [ { "key": "...", "value": "..." } ] }.
    """
    user = get_current_user()
    if not user:
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    data = request.get_json() or {}
    updates = data.get("settings", data) if isinstance(data.get("settings"), list) else [{"key": k, "value": v} for k, v in data.items() if k != "settings"]
    if not updates and "key" in data and "value" in data:
        updates = [{"key": data["key"], "value": data["value"]}]
    updated = []
    for item in updates:
        key = item.get("key")
        value = item.get("value")
        if not key:
            continue
        setting = db.session.query(SystemSetting).filter(SystemSetting.key == key).first()
        if setting:
            setting.value = str(value) if value is not None else None
        else:
            setting = SystemSetting(key=key, value=str(value) if value is not None else None)
            db.session.add(setting)
        updated.append(setting.to_dict())
    db.session.flush()
    log_audit(
        action="UPDATE",
        entity_type="system_settings",
        entity_id=None,
        new_values={"updated": updated},
        user_id=user.id,
        description="Admin updated system settings",
    )
    db.session.commit()
    return jsonify({"status": "success", "settings": updated}), 200


@bp.route("/children-missing-district", methods=["GET"])
@health_ministry_required
def list_children_missing_district():
    """
    List children who are with the nutritionist (escalation status or reviewed referral)
    but have null district_id, so they do not appear in any RDHS list. Optional ?q= for name search.
    """
    user = get_current_user()
    if not user or user.role != ROLE_HEALTH_MINISTRY:
        return jsonify({"status": "error", "message": "Health Ministry access required"}), 403

    q = (request.args.get("q") or "").strip()
    query = db.session.query(Child).filter(
        Child.district_id.is_(None),
        Child.is_draft == False,
    )
    # With nutritionist: has at least one reviewed referral to nutritionist
    subq = (
        db.session.query(ChildReferral.child_id)
        .filter(
            ChildReferral.referred_to_role == "nutritionist",
            ChildReferral.status == ReferralStatus.REVIEWED.value,
        )
        .distinct()
    )
    query = query.filter(Child.id.in_(subq))
    if q:
        query = query.filter(
            (Child.name.ilike(f"%{q}%")) | (Child.child_unique_id.ilike(f"%{q}%")) | (Child.guardian_name.ilike(f"%{q}%"))
        )
    children = query.order_by(Child.name).limit(100).all()
    return jsonify({
        "status": "success",
        "children": [
            {"id": c.id, "name": c.name, "child_unique_id": c.child_unique_id, "guardian_name": c.guardian_name}
            for c in children
        ],
        "count": len(children),
    }), 200


@bp.route("/children/<int:child_id>/repair-district", methods=["POST"])
@health_ministry_required
def repair_child_district(child_id: int):
    """
    Repair district_id (and moh_area_id, province_id) for a child who is with the nutritionist
    but has null district_id so they do not appear in RDHS list. Uses the nutritionist who
    reviewed the referral to get their MOH/RDHS area and set the child's hierarchy.
    """
    user = get_current_user()
    if not user or user.role != ROLE_HEALTH_MINISTRY:
        return jsonify({"status": "error", "message": "Health Ministry access required"}), 403

    child = db.session.get(Child, child_id)
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404

    ref = (
        db.session.query(ChildReferral)
        .filter(
            ChildReferral.child_id == child_id,
            ChildReferral.referred_to_role == "nutritionist",
            ChildReferral.status == ReferralStatus.REVIEWED.value,
            ChildReferral.reviewed_by_user_id.isnot(None),
        )
        .order_by(ChildReferral.reviewed_at.desc())
        .first()
    )
    if not ref:
        return jsonify({
            "status": "error",
            "message": "No reviewed nutritionist referral found for this child. Cannot infer RDHS.",
            "child_id": child_id,
            "child_name": child.name,
        }), 400

    nutritionist_user = db.session.get(User, ref.reviewed_by_user_id)
    if not nutritionist_user:
        return jsonify({"status": "error", "message": "Reviewing nutritionist user not found"}), 400

    # Walk up from nutritionist's assigned areas (PHM -> MOH -> RDHS) so we get district even if assigned only to PHM
    moh_area, rdhs_area = get_moh_and_rdhs_for_user(nutritionist_user)
    if moh_area:
        child.moh_area_id = moh_area.id
    if not rdhs_area and moh_area and moh_area.parent:
        rdhs_area = moh_area.parent
    if not rdhs_area:
        return jsonify({
            "status": "error",
            "message": "Nutritionist has no MOH or RDHS area in their assignment hierarchy. Assign the nutritionist to a PHM/MOH/RDHS area first.",
        }), 400
    child.district_id = rdhs_area.id
    if rdhs_area.parent:
        child.province_id = rdhs_area.parent.id
    rdhs_name = rdhs_area.name or rdhs_area.district or f"RDHS {rdhs_area.id}"

    db.session.commit()
    district_area = db.session.get(Area, child.district_id) if child.district_id else None
    return jsonify({
        "status": "success",
        "message": "Child district hierarchy repaired. Child should now appear in RDHS list.",
        "child_id": child.id,
        "child_name": child.name,
        "child_unique_id": child.child_unique_id,
        "district_id": child.district_id,
        "rdhs_name": district_area.name or district_area.district if district_area else rdhs_name,
        "moh_area_id": child.moh_area_id,
        "province_id": child.province_id,
    }), 200


@bp.route("/pdhs-reports-sent-to-ministry", methods=["GET"])
@health_ministry_required
def list_pdhs_reports_sent_to_ministry():
    """
    List PDHS reports sent to Health Ministry (island-wide). Optional ?year= & ?month=.
    """
    user = get_current_user()
    if not user or user.role != ROLE_HEALTH_MINISTRY:
        return jsonify({"status": "error", "message": "Health Ministry access required"}), 403

    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    query = db.session.query(PdhsReport).filter(PdhsReport.sent_to_ministry == True)
    if year is not None:
        query = query.filter(PdhsReport.report_year == year)
    if month is not None:
        query = query.filter(PdhsReport.month == month)
    reports = query.order_by(PdhsReport.report_year.desc(), PdhsReport.month.desc(), PdhsReport.province_id).limit(500).all()

    return jsonify({
        "status": "success",
        "reports": [r.to_dict() for r in reports],
        "count": len(reports),
    }), 200


@bp.route("/escalations", methods=["GET"])
@health_ministry_required
def list_escalations():
    """
    List all escalations (Health Ministry only). Optional ?status=PENDING|REVIEWED.
    """
    user = get_current_user()
    if not user or user.role != ROLE_HEALTH_MINISTRY:
        return jsonify({"status": "error", "message": "Health Ministry access required"}), 403

    status_filter = request.args.get("status", "").strip().upper()
    query = db.session.query(ChildEscalation).order_by(ChildEscalation.created_at.desc())
    if status_filter in (EscalationRecordStatus.PENDING.value, EscalationRecordStatus.REVIEWED.value):
        query = query.filter(ChildEscalation.status == status_filter)
    limit = min(int(request.args.get("limit", 200)), 500)
    escalations = query.limit(limit).all()

    return jsonify({
        "status": "success",
        "escalations": [e.to_dict() for e in escalations],
        "count": len(escalations),
    }), 200


@bp.route("/referrals", methods=["GET"])
@health_ministry_required
def list_referrals():
    """
    List all referrals (Health Ministry only). Optional ?status=PENDING|REVIEWED|REJECTED.
    """
    user = get_current_user()
    if not user or user.role != ROLE_HEALTH_MINISTRY:
        return jsonify({"status": "error", "message": "Health Ministry access required"}), 403

    status_filter = request.args.get("status", "").strip().upper()
    query = db.session.query(ChildReferral).order_by(ChildReferral.created_at.desc())
    if status_filter and status_filter in (ReferralStatus.PENDING.value, ReferralStatus.REVIEWED.value, ReferralStatus.REJECTED.value):
        query = query.filter(ChildReferral.status == status_filter)
    limit = min(int(request.args.get("limit", 200)), 500)
    referrals = query.limit(limit).all()

    return jsonify({
        "status": "success",
        "referrals": [r.to_dict() for r in referrals],
        "count": len(referrals),
    }), 200
