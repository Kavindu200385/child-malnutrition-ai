"""
PDHS (Province Admin) Role Routes
Province-level oversight: dashboard, health workers, areas (MOH within province), reports.
Read-only child/measurement data. All queries filtered by province. No clinical entry, no cross-province access.
"""
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request

from backend.auth_utils_hierarchical import (
    get_current_user,
    pdhs_required,
    get_pdhs_province_area_ids,
    get_pdhs_child_area_ids,
    ROLE_PDHS,
)
from backend.extensions import db
from backend.models_hierarchical import (
    User,
    Child,
    Area,
    WorkerAreaMapping,
    ChildEscalation,
    ChildReferral,
    Measurement,
    PdhsReport,
    RiskLevel,
)
from backend.utils.audit import log_audit

bp = Blueprint("pdhs", __name__, url_prefix="/api/pdhs")


def _district_ids_under_province(province_ids):
    """Helper: district (RDHS) IDs under given province IDs."""
    if not province_ids:
        return []
    rows = db.session.query(Area.id).filter(
        Area.parent_id.in_(province_ids),
        Area.level == "rdhs",
        Area.is_active == True,
    ).all()
    return [r[0] for r in rows]


def _pdhs_context():
    """Return (user, (province_ids, child_area_ids)) or (None, None, error_response)."""
    user = get_current_user()
    if not user or user.role != ROLE_PDHS:
        return None, None, jsonify({"status": "error", "message": "PDHS access required"}), 403
    province_ids = get_pdhs_province_area_ids(user)
    if not province_ids:
        return None, None, jsonify({"status": "error", "message": "No PDHS province assigned"}), 403
    child_area_ids = get_pdhs_child_area_ids(province_ids)
    return user, (province_ids, child_area_ids), None


def _risk_sam(r):
    v = (r or "").upper()
    return v in ("SAM", "CRITICAL")


def _risk_mam(r):
    v = (r or "").upper()
    return v in ("MAM", "MODERATE", "HIGH")


def _risk_normal(r):
    return (r or "").upper() == "NORMAL"


# =============================================================================
# DASHBOARD
# =============================================================================

@bp.route("/dashboard-summary", methods=["GET"])
@pdhs_required
def dashboard_summary():
    """
    Province-only dashboard: children, risk distribution, district comparison,
    MOH comparison, escalations, monthly trend, referral stats, district performance.
    """
    user, ctx, err = _pdhs_context()
    if err:
        return err
    province_ids, child_area_ids = ctx

    children_query = db.session.query(Child).filter(
        Child.is_draft == False,
        Child.status == "ACTIVE"
    )
    children_query = children_query.filter(
        (Child.current_assigned_area_id.in_(child_area_ids)) |
        (Child.province_id.in_(province_ids)) |
        (Child.district_id.in_(child_area_ids))
    )
    province_children = children_query.all()

    total_children = len(province_children)
    sam_count = sum(1 for c in province_children if _risk_sam(c.current_risk_level))
    mam_count = sum(1 for c in province_children if _risk_mam(c.current_risk_level))
    normal_count = sum(1 for c in province_children if _risk_normal(c.current_risk_level))

    district_areas = db.session.query(Area).filter(
        Area.parent_id.in_(province_ids),
        Area.level == "rdhs",
        Area.is_active == True,
    ).all()
    district_ids = [a.id for a in district_areas]
    total_districts = len(district_areas)

    moh_areas = db.session.query(Area).filter(
        Area.parent_id.in_(district_ids),
        Area.level == "moh",
        Area.is_active == True,
    ).all()
    moh_area_ids = [a.id for a in moh_areas]
    total_moh_areas = len(moh_areas)

    worker_area_ids = list(set(child_area_ids) | set(province_ids) | set(district_ids))
    worker_user_ids = db.session.query(WorkerAreaMapping.user_id).filter(
        WorkerAreaMapping.area_id.in_(worker_area_ids),
        WorkerAreaMapping.is_active == True,
    ).distinct().all()
    worker_user_ids = [w[0] for w in worker_user_ids]
    total_rdhs = db.session.query(User).filter(
        User.id.in_(worker_user_ids),
        User.role == "rdhs",
        User.is_active == True,
    ).count()
    total_moh_users = db.session.query(User).filter(
        User.id.in_(worker_user_ids),
        User.role.in_(["moh", "amoh"]),
        User.is_active == True,
    ).count()
    midwives = db.session.query(User).filter(
        User.id.in_(worker_user_ids),
        User.role == "midwife",
        User.is_active == True,
    ).count()
    nutritionists = db.session.query(User).filter(
        User.id.in_(worker_user_ids),
        User.role == "nutritionist",
        User.is_active == True,
    ).count()

    escalation_query = db.session.query(ChildEscalation).filter(
        ChildEscalation.moh_id.in_(moh_area_ids)
    )
    total_escalations = escalation_query.count()
    escalation_summary = {
        "total": total_escalations,
        "pending": escalation_query.filter(ChildEscalation.status == "PENDING").count(),
        "reviewed": escalation_query.filter(ChildEscalation.status == "REVIEWED").count(),
    }

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
        period_children = [
            c for c in province_children
            if c.created_at and (month_start <= c.created_at.date() <= month_end)
        ]
        monthly_trend.append({
            "month": month_start.strftime("%b"),
            "children": len(period_children),
            "sam": sum(1 for c in period_children if _risk_sam(c.current_risk_level)),
            "mam": sum(1 for c in period_children if _risk_mam(c.current_risk_level)),
        })

    district_performance = []
    for dist in district_areas:
        dist_children = [c for c in province_children if c.district_id == dist.id]
        district_performance.append({
            "district_id": dist.id,
            "district_name": dist.name or dist.district or f"District {dist.id}",
            "total": len(dist_children),
            "sam": sum(1 for c in dist_children if _risk_sam(c.current_risk_level)),
            "mam": sum(1 for c in dist_children if _risk_mam(c.current_risk_level)),
            "normal": sum(1 for c in dist_children if _risk_normal(c.current_risk_level)),
        })
    district_performance.sort(key=lambda x: -x["total"])

    moh_performance = []
    for moh in moh_areas:
        moh_children = [c for c in province_children if c.moh_area_id == moh.id]
        moh_performance.append({
            "moh_id": moh.id,
            "moh_name": moh.name or f"MOH {moh.id}",
            "total": len(moh_children),
            "sam": sum(1 for c in moh_children if _risk_sam(c.current_risk_level)),
            "mam": sum(1 for c in moh_children if _risk_mam(c.current_risk_level)),
            "normal": sum(1 for c in moh_children if _risk_normal(c.current_risk_level)),
        })
    moh_performance.sort(key=lambda x: -x["total"])

    province_child_ids = [c.id for c in province_children]
    referrals = db.session.query(ChildReferral).filter(
        ChildReferral.child_id.in_(province_child_ids)
    ).all() if province_child_ids else []
    referral_stats = {"total_referrals": len(referrals)}

    province_areas = db.session.query(Area).filter(Area.id.in_(province_ids)).all()
    province_names = [a.name or a.province or f"Province {a.id}" for a in province_areas]

    return jsonify({
        "status": "success",
        "data": {
            "province_ids": province_ids,
            "province_names": province_names,
            "total_children": total_children,
            "normal_count": normal_count,
            "mam_count": mam_count,
            "sam_count": sam_count,
            "risk_distribution": [
                {"name": "Normal", "value": normal_count, "color": "#2ECC71"},
                {"name": "MAM", "value": mam_count, "color": "#F1C40F"},
                {"name": "SAM", "value": sam_count, "color": "#E74C3C"},
            ],
            "total_districts": total_districts,
            "total_moh_areas": total_moh_areas,
            "total_rdhs": total_rdhs,
            "total_moh_users": total_moh_users,
            "total_midwives": midwives,
            "total_nutritionists": nutritionists,
            "escalation_summary": escalation_summary,
            "monthly_trend": monthly_trend,
            "district_performance": district_performance,
            "moh_performance": moh_performance,
            "referral_stats": referral_stats,
        },
    }), 200


# =============================================================================
# HEALTH WORKERS
# =============================================================================

@bp.route("/health-workers", methods=["GET"])
@pdhs_required
def health_workers():
    """List health workers in province (RDHS, MOH, Midwives, Nutritionists)."""
    user, ctx, err = _pdhs_context()
    if err:
        return err
    province_ids, child_area_ids = ctx
    district_ids = _district_ids_under_province(province_ids)
    worker_area_ids = list(set(child_area_ids) | set(province_ids) | set(district_ids))

    worker_ids = db.session.query(WorkerAreaMapping.user_id).filter(
        WorkerAreaMapping.area_id.in_(worker_area_ids),
        WorkerAreaMapping.is_active == True,
    ).distinct().all()
    worker_ids = [w[0] for w in worker_ids]
    if not worker_ids:
        return jsonify({"status": "success", "workers": [], "count": 0}), 200

    role_filter = request.args.get("role")
    query = db.session.query(User).filter(User.id.in_(worker_ids))
    if role_filter and role_filter in ("rdhs", "moh", "amoh", "midwife", "nutritionist", "hospital"):
        query = query.filter(User.role == role_filter)
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"
    if not include_inactive:
        query = query.filter(User.is_active == True)

    workers = query.order_by(User.name).all()
    return jsonify({
        "status": "success",
        "workers": [w.to_dict(include_areas=True) for w in workers],
        "count": len(workers),
    }), 200


@bp.route("/user/status/<int:user_id>", methods=["PUT"])
@pdhs_required
def set_user_status(user_id: int):
    """Activate or deactivate a user in province (cannot change Health Ministry)."""
    user, ctx, err = _pdhs_context()
    if err:
        return err
    province_ids, child_area_ids = ctx
    district_ids = _district_ids_under_province(province_ids)
    worker_area_ids = list(set(child_area_ids) | set(province_ids) | set(district_ids))

    target = db.session.get(User, user_id)
    if not target:
        return jsonify({"status": "error", "message": "User not found"}), 404
    if target.role == "health_ministry":
        return jsonify({"status": "error", "message": "Cannot change status of Health Ministry user"}), 403

    target_area_ids = db.session.query(WorkerAreaMapping.area_id).filter(
        WorkerAreaMapping.user_id == target.id,
        WorkerAreaMapping.is_active == True,
    ).distinct().all()
    target_area_ids = [a[0] for a in target_area_ids]
    if not any(aid in worker_area_ids for aid in target_area_ids):
        return jsonify({"status": "error", "message": "User not in your province"}), 403

    data = request.get_json() or {}
    is_active = data.get("is_active")
    if is_active is None:
        return jsonify({"status": "error", "message": "is_active required"}), 400

    target.is_active = bool(is_active)
    log_audit(
        action="UPDATE",
        entity_type="user",
        entity_id=target.id,
        new_values={"is_active": target.is_active},
        user_id=user.id,
        description=f"PDHS set user {target.name} is_active={target.is_active}",
    )
    db.session.commit()
    return jsonify({
        "status": "success",
        "user": target.to_dict(include_areas=True),
        "message": "User status updated",
    }), 200


@bp.route("/user/performance/<int:user_id>", methods=["GET"])
@pdhs_required
def user_performance(user_id: int):
    """View performance stats for a province health worker."""
    user, ctx, err = _pdhs_context()
    if err:
        return err
    province_ids, child_area_ids = ctx
    district_ids = _district_ids_under_province(province_ids)
    worker_area_ids = list(set(child_area_ids) | set(province_ids) | set(district_ids))

    target = db.session.get(User, user_id)
    if not target:
        return jsonify({"status": "error", "message": "User not found"}), 404
    target_area_ids = db.session.query(WorkerAreaMapping.area_id).filter(
        WorkerAreaMapping.user_id == target.id,
        WorkerAreaMapping.is_active == True,
    ).distinct().all()
    target_area_ids = [a[0] for a in target_area_ids]
    if not any(aid in worker_area_ids for aid in target_area_ids):
        return jsonify({"status": "error", "message": "User not in your province"}), 403

    child_count = db.session.query(Child).filter(
        (Child.current_assigned_area_id.in_(target_area_ids)) |
        (Child.district_id.in_(target_area_ids)),
        Child.is_draft == False,
        Child.status == "ACTIVE",
    ).count()
    measurement_count = db.session.query(Measurement).filter(
        Measurement.measured_by_user_id == target.id
    ).count()
    escalation_count = db.session.query(ChildEscalation).filter(
        ChildEscalation.escalated_by_user_id == target.id
    ).count()

    return jsonify({
        "status": "success",
        "user": target.to_dict(include_areas=True),
        "performance": {
            "children_in_area": child_count,
            "measurements_taken": measurement_count,
            "escalations_made": escalation_count,
        },
    }), 200


# =============================================================================
# AREAS (read + MOH create/update within province)
# =============================================================================

@bp.route("/areas", methods=["GET"])
@pdhs_required
def list_areas():
    """List areas in province (districts and MOH). Province-filtered."""
    user, ctx, err = _pdhs_context()
    if err:
        return err
    province_ids, child_area_ids = ctx

    level = request.args.get("level")
    parent_id = request.args.get("parent_id", type=int)

    query = db.session.query(Area).filter(Area.is_active == True)

    if parent_id is not None:
        if parent_id not in child_area_ids and parent_id not in province_ids:
            return jsonify({"status": "error", "message": "No access to this parent area"}), 403
        query = query.filter(Area.parent_id == parent_id)
    else:
        query = query.filter(
            (Area.id.in_(province_ids)) |
            (Area.parent_id.in_(province_ids))
        )

    if level and level in ("rdhs", "moh", "phm"):
        query = query.filter(Area.level == level)

    areas = query.order_by(Area.name).all()
    return jsonify({
        "status": "success",
        "areas": [a.to_dict(include_children=False) for a in areas],
        "count": len(areas),
    }), 200


@bp.route("/moh/create", methods=["POST"])
@pdhs_required
def create_moh():
    """Create MOH area under a district in province."""
    user, ctx, err = _pdhs_context()
    if err:
        return err
    province_ids, child_area_ids = ctx

    data = request.get_json() or {}
    name = data.get("name")
    parent_id = data.get("parent_id")
    district = data.get("district")
    province = data.get("province")
    description = data.get("description")

    if not name or not parent_id:
        return jsonify({"status": "error", "message": "name and parent_id (district) are required"}), 400

    parent = db.session.get(Area, parent_id)
    if not parent:
        return jsonify({"status": "error", "message": "Parent area not found"}), 404
    if parent.level != "rdhs":
        return jsonify({"status": "error", "message": "Parent must be a district (RDHS)"}), 400
    if parent.parent_id not in province_ids:
        return jsonify({"status": "error", "message": "District not in your province"}), 403

    code = data.get("code")
    if not code:
        from backend.routes.areas_hierarchical import _generate_area_code
        try:
            code = _generate_area_code("moh")
        except ValueError as e:
            return jsonify({"status": "error", "message": str(e)}), 400

    area = Area(
        name=name,
        code=code,
        level="moh",
        parent_id=parent_id,
        district=district or parent.district,
        province=province or (parent.province if parent else None),
        description=description,
        is_active=True,
    )
    db.session.add(area)
    db.session.flush()
    log_audit(
        action="CREATE",
        entity_type="area",
        entity_id=area.id,
        new_values=area.to_dict(),
        user_id=user.id,
        description=f"PDHS created MOH area: {name}",
    )
    db.session.commit()
    return jsonify({"status": "success", "area": area.to_dict()}), 201


@bp.route("/moh/update/<int:area_id>", methods=["PUT"])
@pdhs_required
def update_moh(area_id: int):
    """Update MOH area details. Only MOH areas within province."""
    user, ctx, err = _pdhs_context()
    if err:
        return err
    province_ids, child_area_ids = ctx

    area = db.session.get(Area, area_id)
    if not area:
        return jsonify({"status": "error", "message": "Area not found"}), 404
    if area.level != "moh":
        return jsonify({"status": "error", "message": "Only MOH areas can be updated here"}), 400
    district_ids_list = _district_ids_under_province(province_ids)
    if area.parent_id not in district_ids_list:
        return jsonify({"status": "error", "message": "Area not in your province"}), 403

    data = request.get_json() or {}
    old_values = area.to_dict()
    if "name" in data and data["name"]:
        area.name = data["name"]
    if "description" in data:
        area.description = data["description"]
    if "district" in data:
        area.district = data["district"]
    if "province" in data:
        area.province = data["province"]

    db.session.flush()
    log_audit(
        action="UPDATE",
        entity_type="area",
        entity_id=area.id,
        old_values=old_values,
        new_values=area.to_dict(),
        user_id=user.id,
        description=f"PDHS updated MOH area: {area.name}",
    )
    db.session.commit()
    return jsonify({"status": "success", "area": area.to_dict()}), 200


# =============================================================================
# REPORTS
# =============================================================================

@bp.route("/reports/monthly", methods=["GET", "POST"])
@pdhs_required
def reports_monthly():
    """GET: List provincial monthly reports. POST: Generate report for month/year."""
    user, ctx, err = _pdhs_context()
    if err:
        return err
    province_ids, child_area_ids = ctx
    district_ids = _district_ids_under_province(province_ids)

    if request.method == "GET":
        month = request.args.get("month", type=int)
        year = request.args.get("year", type=int)
        query = db.session.query(PdhsReport).filter(PdhsReport.province_id.in_(province_ids))
        if month is not None:
            query = query.filter(PdhsReport.month == month)
        if year is not None:
            query = query.filter(PdhsReport.report_year == year)
        reports = query.order_by(PdhsReport.report_year.desc(), PdhsReport.month.desc()).limit(24).all()
        return jsonify({
            "status": "success",
            "reports": [r.to_dict() for r in reports],
            "count": len(reports),
        }), 200

    data = request.get_json() or {}
    month = data.get("month")
    year = data.get("year")
    if month is None or year is None:
        return jsonify({"status": "error", "message": "month and year required"}), 400
    month, year = int(month), int(year)
    if not (1 <= month <= 12):
        return jsonify({"status": "error", "message": "month must be 1-12"}), 400
    province_id = province_ids[0]
    existing = db.session.query(PdhsReport).filter(
        PdhsReport.province_id == province_id,
        PdhsReport.month == month,
        PdhsReport.report_year == year,
    ).first()
    if existing:
        return jsonify({"status": "success", "report": existing.to_dict(), "message": "Report already exists"}), 200

    province_children = db.session.query(Child).filter(
        Child.is_draft == False,
        Child.status == "ACTIVE",
        (Child.current_assigned_area_id.in_(child_area_ids)) |
        (Child.province_id == province_id) |
        (Child.district_id.in_(child_area_ids)),
    ).all()
    total_children = len(province_children)
    normal_count = sum(1 for c in province_children if _risk_normal(c.current_risk_level))
    mam_count = sum(1 for c in province_children if _risk_mam(c.current_risk_level))
    sam_count = sum(1 for c in province_children if _risk_sam(c.current_risk_level))
    moh_area_ids = [a.id for a in db.session.query(Area).filter(
        Area.parent_id.in_(district_ids),
        Area.level == "moh",
        Area.is_active == True,
    ).all()]
    total_escalations = db.session.query(ChildEscalation).filter(
        ChildEscalation.moh_id.in_(moh_area_ids)
    ).count() if moh_area_ids else 0

    report = PdhsReport(
        province_id=province_id,
        created_by_user_id=user.id,
        total_children=total_children,
        normal_count=normal_count,
        mam_count=mam_count,
        sam_count=sam_count,
        escalations=total_escalations,
        month=month,
        report_year=year,
    )
    db.session.add(report)
    db.session.commit()
    return jsonify({"status": "success", "report": report.to_dict()}), 201


@bp.route("/send-report-to-ministry/<int:report_id>", methods=["POST"])
@pdhs_required
def send_report_to_ministry(report_id: int):
    """Mark PDHS report as sent to Health Ministry."""
    user, ctx, err = _pdhs_context()
    if err:
        return err
    province_ids, _ = ctx

    report = db.session.get(PdhsReport, report_id)
    if not report:
        return jsonify({"status": "error", "message": "Report not found"}), 404
    if report.province_id not in province_ids:
        return jsonify({"status": "error", "message": "Report not in your province"}), 403

    report.sent_to_ministry = True
    report.sent_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"status": "success", "report": report.to_dict()}), 200
