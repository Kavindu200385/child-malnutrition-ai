"""
RDHS (District Admin) Role Routes
District-level oversight: dashboard, health workers, reports. Read-only child/measurement data.
All queries filtered by district (RDHS assigned areas). No clinical entry, no cross-district access.
"""
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request

from backend.auth_utils_hierarchical import (
    get_current_user,
    rdhs_required,
    get_rdhs_district_area_ids,
    get_rdhs_child_area_ids,
    ROLE_RDHS,
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
    RdhsReport,
    MohReport,
    RiskLevel,
)

bp = Blueprint("rdhs", __name__, url_prefix="/api/rdhs")


def _rdhs_context():
    """Return (user, (district_ids, child_area_ids)) or (None, None, error_response)."""
    user = get_current_user()
    if not user or user.role != ROLE_RDHS:
        return None, None, jsonify({"status": "error", "message": "RDHS access required"}), 403
    district_ids = get_rdhs_district_area_ids(user)
    if not district_ids:
        return None, None, jsonify({"status": "error", "message": "No RDHS district assigned"}), 403
    child_area_ids = get_rdhs_child_area_ids(district_ids)
    return user, (district_ids, child_area_ids), None


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
@rdhs_required
def dashboard_summary():
    """
    District-only dashboard: children, risk distribution, MOH areas, workers,
    escalations, monthly trend, risk by MOH, referral stats.
    """
    user, ctx, err = _rdhs_context()
    if err:
        return err
    district_ids, child_area_ids = ctx

    children_query = db.session.query(Child).filter(
        Child.is_draft == False,
        Child.status == "ACTIVE"
    )
    children_query = children_query.filter(
        (Child.current_assigned_area_id.in_(child_area_ids)) |
        (Child.district_id.in_(district_ids))
    )
    district_children = children_query.all()

    total_children = len(district_children)
    sam_count = sum(1 for c in district_children if _risk_sam(c.current_risk_level))
    mam_count = sum(1 for c in district_children if _risk_mam(c.current_risk_level))
    normal_count = sum(1 for c in district_children if _risk_normal(c.current_risk_level))

    moh_areas = db.session.query(Area).filter(
        Area.parent_id.in_(district_ids),
        Area.level == "moh",
        Area.is_active == True,
    ).all()
    moh_area_ids = [a.id for a in moh_areas]
    total_moh_areas = len(moh_areas)

    worker_area_ids = list(set(child_area_ids) | set(district_ids))
    worker_user_ids = db.session.query(WorkerAreaMapping.user_id).filter(
        WorkerAreaMapping.area_id.in_(worker_area_ids),
        WorkerAreaMapping.is_active == True,
    ).distinct().all()
    worker_user_ids = [w[0] for w in worker_user_ids]
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
            c for c in district_children
            if c.created_at and (month_start <= c.created_at.date() <= month_end)
        ]
        monthly_trend.append({
            "month": month_start.strftime("%b"),
            "children": len(period_children),
            "sam": sum(1 for c in period_children if _risk_sam(c.current_risk_level)),
            "mam": sum(1 for c in period_children if _risk_mam(c.current_risk_level)),
        })

    moh_performance = []
    for moh in moh_areas:
        moh_children = [c for c in district_children if c.moh_area_id == moh.id]
        moh_performance.append({
            "moh_id": moh.id,
            "moh_name": moh.name or f"MOH {moh.id}",
            "total": len(moh_children),
            "sam": sum(1 for c in moh_children if _risk_sam(c.current_risk_level)),
            "mam": sum(1 for c in moh_children if _risk_mam(c.current_risk_level)),
            "normal": sum(1 for c in moh_children if _risk_normal(c.current_risk_level)),
        })
    moh_performance.sort(key=lambda x: -x["total"])

    district_child_ids = [c.id for c in district_children]
    referrals = db.session.query(ChildReferral).filter(
        ChildReferral.child_id.in_(district_child_ids)
    ).all() if district_child_ids else []
    referral_stats = {
        "total_referrals": len(referrals),
    }

    rdhs_areas = db.session.query(Area).filter(Area.id.in_(district_ids)).all()
    district_names = [a.name or a.district or f"District {a.id}" for a in rdhs_areas]

    return jsonify({
        "status": "success",
        "data": {
            "district_ids": district_ids,
            "district_names": district_names,
            "total_children": total_children,
            "normal_count": normal_count,
            "mam_count": mam_count,
            "sam_count": sam_count,
            "risk_distribution": [
                {"name": "Normal", "value": normal_count, "color": "#2ECC71"},
                {"name": "MAM", "value": mam_count, "color": "#F1C40F"},
                {"name": "SAM", "value": sam_count, "color": "#E74C3C"},
            ],
            "total_moh_areas": total_moh_areas,
            "total_midwives": midwives,
            "total_nutritionists": nutritionists,
            "escalation_summary": escalation_summary,
            "monthly_trend": monthly_trend,
            "moh_performance": moh_performance,
            "referral_stats": referral_stats,
        },
    }), 200


# =============================================================================
# HEALTH WORKERS
# =============================================================================

@bp.route("/health-workers", methods=["GET"])
@rdhs_required
def health_workers():
    """List health workers in district."""
    user, ctx, err = _rdhs_context()
    if err:
        return err
    district_ids, child_area_ids = ctx
    worker_area_ids = list(set(child_area_ids) | set(district_ids))

    worker_ids = db.session.query(WorkerAreaMapping.user_id).filter(
        WorkerAreaMapping.area_id.in_(worker_area_ids),
        WorkerAreaMapping.is_active == True,
    ).distinct().all()
    worker_ids = [w[0] for w in worker_ids]
    if not worker_ids:
        return jsonify({"status": "success", "workers": [], "count": 0}), 200

    role_filter = request.args.get("role")
    query = db.session.query(User).filter(User.id.in_(worker_ids))
    if role_filter and role_filter in ("moh", "amoh", "midwife", "nutritionist", "hospital"):
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
@rdhs_required
def set_user_status(user_id: int):
    """Activate or deactivate a user in district."""
    user, ctx, err = _rdhs_context()
    if err:
        return err
    district_ids, child_area_ids = ctx
    worker_area_ids = list(set(child_area_ids) | set(district_ids))

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
        return jsonify({"status": "error", "message": "User not in your district"}), 403

    data = request.get_json() or {}
    is_active = data.get("is_active")
    if is_active is None:
        return jsonify({"status": "error", "message": "is_active required"}), 400

    target.is_active = bool(is_active)
    db.session.commit()
    return jsonify({
        "status": "success",
        "user": target.to_dict(include_areas=True),
        "message": "User status updated",
    }), 200


@bp.route("/user/performance/<int:user_id>", methods=["GET"])
@rdhs_required
def user_performance(user_id: int):
    """View performance stats for a district health worker."""
    user, ctx, err = _rdhs_context()
    if err:
        return err
    district_ids, child_area_ids = ctx
    worker_area_ids = list(set(child_area_ids) | set(district_ids))

    target = db.session.get(User, user_id)
    if not target:
        return jsonify({"status": "error", "message": "User not found"}), 404
    target_area_ids = db.session.query(WorkerAreaMapping.area_id).filter(
        WorkerAreaMapping.user_id == target.id,
        WorkerAreaMapping.is_active == True,
    ).distinct().all()
    target_area_ids = [a[0] for a in target_area_ids]
    if not any(aid in worker_area_ids for aid in target_area_ids):
        return jsonify({"status": "error", "message": "User not in your district"}), 403

    child_count = db.session.query(Child).filter(
        Child.current_assigned_area_id.in_(target_area_ids),
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
# REPORTS
# =============================================================================

@bp.route("/reports/monthly", methods=["GET", "POST"])
@rdhs_required
def reports_monthly():
    """GET: List district monthly reports. POST: Generate report for month/year."""
    user, ctx, err = _rdhs_context()
    if err:
        return err
    district_ids, child_area_ids = ctx

    if request.method == "GET":
        month = request.args.get("month", type=int)
        year = request.args.get("year", type=int)
        query = db.session.query(RdhsReport).filter(RdhsReport.district_id.in_(district_ids))
        if month is not None:
            query = query.filter(RdhsReport.month == month)
        if year is not None:
            query = query.filter(RdhsReport.report_year == year)
        reports = query.order_by(RdhsReport.report_year.desc(), RdhsReport.month.desc()).limit(24).all()
        return jsonify({
            "status": "success",
            "reports": [r.to_dict() for r in reports],
            "count": len(reports),
        }), 200

    # POST
    data = request.get_json() or {}
    month = data.get("month")
    year = data.get("year")
    if month is None or year is None:
        return jsonify({"status": "error", "message": "month and year required"}), 400
    month, year = int(month), int(year)
    if not (1 <= month <= 12):
        return jsonify({"status": "error", "message": "month must be 1-12"}), 400
    district_id = district_ids[0]
    existing = db.session.query(RdhsReport).filter(
        RdhsReport.district_id == district_id,
        RdhsReport.month == month,
        RdhsReport.report_year == year,
    ).first()
    if existing:
        return jsonify({"status": "success", "report": existing.to_dict(), "message": "Report already exists"}), 200
    all_district_children = db.session.query(Child).filter(
        Child.is_draft == False,
        Child.status == "ACTIVE",
        (Child.current_assigned_area_id.in_(child_area_ids)) | (Child.district_id == district_id),
    ).all()
    total_children = len(all_district_children)
    normal_count = sum(1 for c in all_district_children if _risk_normal(c.current_risk_level))
    mam_count = sum(1 for c in all_district_children if _risk_mam(c.current_risk_level))
    sam_count = sum(1 for c in all_district_children if _risk_sam(c.current_risk_level))
    moh_area_ids = [a.id for a in db.session.query(Area).filter(
        Area.parent_id == district_id,
        Area.level == "moh",
        Area.is_active == True,
    ).all()]
    total_escalations = db.session.query(ChildEscalation).filter(
        ChildEscalation.moh_id.in_(moh_area_ids)
    ).count() if moh_area_ids else 0
    report = RdhsReport(
        district_id=district_id,
        created_by_user_id=user.id,
        total_children=total_children,
        normal_count=normal_count,
        mam_count=mam_count,
        sam_count=sam_count,
        total_escalations=total_escalations,
        total_returns=0,
        month=month,
        report_year=year,
    )
    db.session.add(report)
    db.session.commit()
    return jsonify({"status": "success", "report": report.to_dict()}), 201


@bp.route("/send-report-to-pdhs/<int:report_id>", methods=["POST"])
@rdhs_required
def send_report_to_pdhs(report_id: int):
    """Mark RDHS report as sent to PDHS."""
    user, ctx, err = _rdhs_context()
    if err:
        return err
    district_ids, _ = ctx

    report = db.session.get(RdhsReport, report_id)
    if not report:
        return jsonify({"status": "error", "message": "Report not found"}), 404
    if report.district_id not in district_ids:
        return jsonify({"status": "error", "message": "Report not in your district"}), 403

    report.sent_to_pdhs = True
    report.sent_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"status": "success", "report": report.to_dict()}), 200


# =============================================================================
# MOH REPORTS RECEIVED FROM MOH AREAS
# =============================================================================

@bp.route("/moh-reports", methods=["GET"])
@rdhs_required
def moh_reports():
    """
    List MOH monthly reports that have been marked sent_to_rdhs
    for MOH areas inside this RDHS district.

    Returns list grouped by MOH area so the UI can show:
    - MOH area name
    - For each MOH: month/year, totals, risk distribution, escalations, sent_at.
    """
    user, ctx, err = _rdhs_context()
    if err:
        return err
    district_ids, _child_area_ids = ctx

    # MOH areas under this district
    moh_areas = db.session.query(Area).filter(
        Area.parent_id.in_(district_ids),
        Area.level == "moh",
        Area.is_active == True,
    ).all()
    if not moh_areas:
        return jsonify({"status": "success", "areas": [], "count": 0}), 200

    moh_area_ids = [a.id for a in moh_areas]
    year = request.args.get("year", type=int)
    query = db.session.query(MohReport).filter(
        MohReport.moh_area_id.in_(moh_area_ids),
        MohReport.sent_to_rdhs == True,
    )
    if year:
        query = query.filter(MohReport.report_year == year)

    reports = query.order_by(MohReport.report_year.desc(), MohReport.month.desc()).all()
    by_area: dict[int, dict] = {a.id: {"area": a, "reports": []} for a in moh_areas}
    for r in reports:
        rec = by_area.get(r.moh_area_id)
        if rec is not None:
            rec["reports"].append(r)

    payload = []
    for area_id, entry in by_area.items():
        if not entry["reports"]:
            continue
        a: Area = entry["area"]
        payload.append(
            {
                "moh_area_id": area_id,
                "moh_area_name": a.name or f"MOH {area_id}",
                "district_id": a.parent_id,
                "reports": [rep.to_dict() for rep in entry["reports"]],
            }
        )

    return jsonify({"status": "success", "areas": payload, "count": len(payload)}), 200
