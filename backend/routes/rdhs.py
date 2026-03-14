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
    ReferralStatus,
    Measurement,
    RdhsReport,
    RdhsPeriodReport,
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


def _display_risk_level(child: Child) -> str:
    """Same as list/profile: use birth risk when no clinic measurement yet, else current risk."""
    birth = (child.birth_risk_level or "").upper()
    current = (child.current_risk_level or "").upper()
    if not child.last_risk_update and birth:
        return birth
    return current or birth or "NORMAL"


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

    # Include: MOH/PHM-assigned children, children with district_id set, and children with district nutritionist
    worker_area_ids = list(set(child_area_ids) | set(district_ids))
    district_nutritionist_ids = [
        u[0] for u in db.session.query(WorkerAreaMapping.user_id).filter(
            WorkerAreaMapping.area_id.in_(worker_area_ids),
            WorkerAreaMapping.is_active == True,
        ).distinct().all()
    ]
    child_ids_with_district_nutritionist = []
    if district_nutritionist_ids:
        nutritionist_user_ids = [u.id for u in db.session.query(User).filter(
            User.id.in_(district_nutritionist_ids),
            User.role == "nutritionist",
            User.is_active == True,
        ).all()]
        if nutritionist_user_ids:
            child_ids_with_district_nutritionist = [
                r[0] for r in db.session.query(ChildReferral.child_id).filter(
                    ChildReferral.referred_to_role == "nutritionist",
                    ChildReferral.status == ReferralStatus.REVIEWED.value,
                    ChildReferral.reviewed_by_user_id.in_(nutritionist_user_ids),
                ).distinct().all()
            ]
    from sqlalchemy import or_
    conditions = [
        Child.current_assigned_area_id.in_(child_area_ids),
        Child.district_id.in_(district_ids),
    ]
    if child_ids_with_district_nutritionist:
        conditions.append(Child.id.in_(child_ids_with_district_nutritionist))
    children_query = db.session.query(Child).filter(
        Child.is_draft == False,
        Child.status == "ACTIVE",
        or_(*conditions),
    )
    district_children = children_query.all()

    total_children = len(district_children)
    # Use display risk (birth when no clinic measurement) so dashboard matches children list
    def _display_r(c):
        return _display_risk_level(c)
    sam_count = sum(1 for c in district_children if _risk_sam(_display_r(c)))
    mam_count = sum(1 for c in district_children if _risk_mam(_display_r(c)))
    normal_count = sum(1 for c in district_children if _risk_normal(_display_r(c)))

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
            "sam": sum(1 for c in period_children if _risk_sam(_display_r(c))),
            "mam": sum(1 for c in period_children if _risk_mam(_display_r(c))),
        })

    moh_performance = []
    for moh in moh_areas:
        moh_children = [c for c in district_children if c.moh_area_id == moh.id]
        moh_performance.append({
            "moh_id": moh.id,
            "moh_name": moh.name or f"MOH {moh.id}",
            "total": len(moh_children),
            "sam": sum(1 for c in moh_children if _risk_sam(_display_r(c))),
            "mam": sum(1 for c in moh_children if _risk_mam(_display_r(c))),
            "normal": sum(1 for c in moh_children if _risk_normal(_display_r(c))),
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

def _district_children_and_moh(user, district_ids, child_area_ids):
    """Return (district_children list, moh_areas list, rdhs_area) for report/dashboard."""
    from sqlalchemy import or_
    worker_area_ids = list(set(child_area_ids) | set(district_ids))
    district_nutritionist_ids = [
        u[0] for u in db.session.query(WorkerAreaMapping.user_id).filter(
            WorkerAreaMapping.area_id.in_(worker_area_ids),
            WorkerAreaMapping.is_active == True,
        ).distinct().all()
    ]
    child_ids_with_district_nutritionist = []
    if district_nutritionist_ids:
        nutritionist_user_ids = [u.id for u in db.session.query(User).filter(
            User.id.in_(district_nutritionist_ids),
            User.role == "nutritionist",
            User.is_active == True,
        ).all()]
        if nutritionist_user_ids:
            child_ids_with_district_nutritionist = [
                r[0] for r in db.session.query(ChildReferral.child_id).filter(
                    ChildReferral.referred_to_role == "nutritionist",
                    ChildReferral.status == ReferralStatus.REVIEWED.value,
                    ChildReferral.reviewed_by_user_id.in_(nutritionist_user_ids),
                ).distinct().all()
            ]
    conditions = [
        Child.current_assigned_area_id.in_(child_area_ids),
        Child.district_id.in_(district_ids),
    ]
    if child_ids_with_district_nutritionist:
        conditions.append(Child.id.in_(child_ids_with_district_nutritionist))
    district_children = db.session.query(Child).filter(
        Child.is_draft == False,
        Child.status == "ACTIVE",
        or_(*conditions),
    ).all()
    moh_areas = db.session.query(Area).filter(
        Area.parent_id.in_(district_ids),
        Area.level == "moh",
        Area.is_active == True,
    ).all()
    rdhs_area = db.session.get(Area, district_ids[0]) if district_ids else None
    return district_children, moh_areas, rdhs_area


def _build_full_report_payload(user, district_ids, child_area_ids, period, ref_date):
    """
    Build the full report payload (summary + moh_areas with children) for a given period and date.
    Returns (report_payload dict, start_date, end_date, period_label, district_name).
    """
    from datetime import date as _date
    import calendar

    if period == "daily":
        start_date = end_date = ref_date
        period_label = ref_date.strftime("%d %b %Y")
    elif period == "weekly":
        start_date = ref_date - timedelta(days=ref_date.weekday())
        end_date = start_date + timedelta(days=6)
        period_label = f"{start_date.strftime('%d %b')} – {end_date.strftime('%d %b %Y')}"
    else:
        start_date = ref_date.replace(day=1)
        last_day = calendar.monthrange(ref_date.year, ref_date.month)[1]
        end_date = ref_date.replace(day=last_day)
        period_label = ref_date.strftime("%B %Y")

    district_children, moh_areas, rdhs_area = _district_children_and_moh(user, district_ids, child_area_ids)
    def _dr(c):
        return _display_risk_level(c)

    summary = {
        "total_children": len(district_children),
        "normal": sum(1 for c in district_children if _risk_normal(_dr(c))),
        "mam": sum(1 for c in district_children if _risk_mam(_dr(c))),
        "sam": sum(1 for c in district_children if _risk_sam(_dr(c))),
        "total_escalations": 0,
    }
    moh_area_ids = [a.id for a in moh_areas]
    if moh_area_ids:
        summary["total_escalations"] = db.session.query(ChildEscalation).filter(
            ChildEscalation.moh_id.in_(moh_area_ids)
        ).count()

    def _age_months(dob):
        if not dob:
            return None
        today = _date.today()
        return (today.year - dob.year) * 12 + (today.month - dob.month)

    def _last_visit_data(child):
        if not child.visits:
            return {}
        v = child.visits[0]
        return {
            "weight_kg": float(v.weight_kg) if v.weight_kg else None,
            "height_cm": float(v.height_cm) if v.height_cm else None,
            "muac_cm": float(v.muac_cm) if v.muac_cm else None,
            "visit_date": v.visit_date.strftime("%Y-%m-%d") if v.visit_date else None,
        }

    moh_breakdown = []
    for moh in moh_areas:
        moh_children = [c for c in district_children if c.moh_area_id == moh.id]
        escalation_count = db.session.query(ChildEscalation).filter(ChildEscalation.moh_id == moh.id).count()
        children_detail = []
        for c in moh_children:
            risk = _dr(c)
            lv = _last_visit_data(c)
            children_detail.append({
                "id": c.id,
                "child_id": c.child_unique_id or c.child_id or str(c.id),
                "name": c.name or "—",
                "gender": c.gender or "—",
                "age_months": _age_months(c.dob),
                "risk_level": risk,
                "weight_kg": lv.get("weight_kg"),
                "height_cm": lv.get("height_cm"),
                "muac_cm": lv.get("muac_cm"),
                "last_visit_date": lv.get("visit_date"),
            })
        moh_breakdown.append({
            "moh_id": moh.id,
            "moh_name": moh.name or moh.district or f"MOH {moh.id}",
            "total_children": len(moh_children),
            "normal": sum(1 for c in moh_children if _risk_normal(_dr(c))),
            "mam": sum(1 for c in moh_children if _risk_mam(_dr(c))),
            "sam": sum(1 for c in moh_children if _risk_sam(_dr(c))),
            "escalations": escalation_count,
            "children": children_detail,
        })

    district_name = (rdhs_area.name or rdhs_area.district or f"District {rdhs_area.id}") if rdhs_area else "District"
    report_payload = {
        "period": period,
        "period_label": period_label,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "district_name": district_name,
        "district_id": district_ids[0] if district_ids else None,
        "summary": summary,
        "moh_areas": moh_breakdown,
    }
    return report_payload, start_date, end_date, period_label, district_name


@bp.route("/reports/full", methods=["GET"])
@rdhs_required
def reports_full():
    """
    Get full report data for download (daily, weekly, monthly).
    Query: period=daily|weekly|monthly, date=YYYY-MM-DD.
    Returns district summary + per-MOH breakdown (all details) for PDF/send to PDHS.
    """
    user, ctx, err = _rdhs_context()
    if err:
        return err
    district_ids, child_area_ids = ctx
    period = (request.args.get("period") or "monthly").strip().lower()
    date_str = request.args.get("date") or datetime.utcnow().strftime("%Y-%m-%d")
    try:
        ref_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"status": "error", "message": "date must be YYYY-MM-DD"}), 400
    if period not in ("daily", "weekly", "monthly"):
        return jsonify({"status": "error", "message": "period must be daily, weekly, or monthly"}), 400

    report_payload, _, _, _, _ = _build_full_report_payload(user, district_ids, child_area_ids, period, ref_date)
    return jsonify({"status": "success", "report": report_payload}), 200


@bp.route("/reports/send-period-to-pdhs", methods=["POST"])
@rdhs_required
def send_period_report_to_pdhs():
    """
    Generate the same full report (daily/weekly/monthly) and send it to PDHS.
    Body: { "period": "daily"|"weekly"|"monthly", "date": "YYYY-MM-DD" }.
    Creates an RdhsPeriodReport record and marks it sent so PDHS can view it.
    """
    user, ctx, err = _rdhs_context()
    if err:
        return err
    district_ids, child_area_ids = ctx
    data = request.get_json() or {}
    period = (data.get("period") or "monthly").strip().lower()
    date_str = data.get("date") or datetime.utcnow().strftime("%Y-%m-%d")
    try:
        ref_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"status": "error", "message": "date must be YYYY-MM-DD"}), 400
    if period not in ("daily", "weekly", "monthly"):
        return jsonify({"status": "error", "message": "period must be daily, weekly, or monthly"}), 400

    payload, start_date, end_date, period_label, district_name = _build_full_report_payload(
        user, district_ids, child_area_ids, period, ref_date
    )
    period_report = RdhsPeriodReport(
        district_id=district_ids[0],
        created_by_user_id=user.id,
        period_type=period,
        start_date=start_date,
        end_date=end_date,
        period_label=period_label,
        district_name=district_name,
        payload=payload,
        sent_to_pdhs=True,
        sent_at=datetime.utcnow(),
    )
    db.session.add(period_report)
    db.session.commit()
    return jsonify({
        "status": "success",
        "message": "Report sent to PDHS.",
        "report": period_report.to_dict(),
    }), 201


@bp.route("/sent-period-reports", methods=["GET"])
@rdhs_required
def sent_period_reports():
    """List period reports (daily/weekly/monthly) sent to PDHS by this district.
    Query: period=daily|weekly|monthly (optional) to filter by period type."""
    user, ctx, err = _rdhs_context()
    if err:
        return err
    district_ids, _ = ctx
    query = db.session.query(RdhsPeriodReport).filter(
        RdhsPeriodReport.district_id.in_(district_ids),
        RdhsPeriodReport.sent_to_pdhs == True,
    )
    period = (request.args.get("period") or "").strip().lower()
    if period in ("daily", "weekly", "monthly"):
        query = query.filter(RdhsPeriodReport.period_type == period)
    reports = query.order_by(RdhsPeriodReport.created_at.desc()).limit(100).all()
    return jsonify({
        "status": "success",
        "reports": [r.to_dict() for r in reports],
        "count": len(reports),
    }), 200


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
    # Same scope as dashboard: MOH/PHM-assigned, district_id set, or with district nutritionist
    worker_area_ids = list(set(child_area_ids) | set(district_ids))
    district_nutritionist_ids = [
        u[0] for u in db.session.query(WorkerAreaMapping.user_id).filter(
            WorkerAreaMapping.area_id.in_(worker_area_ids),
            WorkerAreaMapping.is_active == True,
        ).distinct().all()
    ]
    child_ids_with_district_nutritionist = []
    if district_nutritionist_ids:
        nutritionist_user_ids = [u.id for u in db.session.query(User).filter(
            User.id.in_(district_nutritionist_ids),
            User.role == "nutritionist",
            User.is_active == True,
        ).all()]
        if nutritionist_user_ids:
            child_ids_with_district_nutritionist = [
                r[0] for r in db.session.query(ChildReferral.child_id).filter(
                    ChildReferral.referred_to_role == "nutritionist",
                    ChildReferral.status == ReferralStatus.REVIEWED.value,
                    ChildReferral.reviewed_by_user_id.in_(nutritionist_user_ids),
                ).distinct().all()
            ]
    from sqlalchemy import or_
    report_conditions = [
        Child.current_assigned_area_id.in_(child_area_ids),
        Child.district_id == district_id,
    ]
    if child_ids_with_district_nutritionist:
        report_conditions.append(Child.id.in_(child_ids_with_district_nutritionist))
    all_district_children = db.session.query(Child).filter(
        Child.is_draft == False,
        Child.status == "ACTIVE",
        or_(*report_conditions),
    ).all()
    total_children = len(all_district_children)
    # Use display risk (birth when no clinic measurement) so report matches dashboard and list
    def _dr(c):
        return _display_risk_level(c)
    normal_count = sum(1 for c in all_district_children if _risk_normal(_dr(c)))
    mam_count = sum(1 for c in all_district_children if _risk_mam(_dr(c)))
    sam_count = sum(1 for c in all_district_children if _risk_sam(_dr(c)))
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
    """Mark RDHS monthly report as sent to PDHS and create RdhsPeriodReport so PDHS can see it."""
    user, ctx, err = _rdhs_context()
    if err:
        return err
    district_ids, child_area_ids = ctx

    report = db.session.get(RdhsReport, report_id)
    if not report:
        return jsonify({"status": "error", "message": "Report not found"}), 404
    if report.district_id not in district_ids:
        return jsonify({"status": "error", "message": "Report not in your district"}), 403

    report.sent_to_pdhs = True
    report.sent_at = datetime.utcnow()

    # Create RdhsPeriodReport for this month so PDHS "RDHS reports from districts" shows it
    from datetime import date as _date
    ref_date = _date(report.report_year, report.month, 1)
    payload, start_date, end_date, period_label, district_name = _build_full_report_payload(
        user, [report.district_id], child_area_ids, "monthly", ref_date
    )
    period_report = RdhsPeriodReport(
        district_id=report.district_id,
        created_by_user_id=user.id,
        period_type="monthly",
        start_date=start_date,
        end_date=end_date,
        period_label=period_label,
        district_name=district_name,
        payload=payload,
        sent_to_pdhs=True,
        sent_at=datetime.utcnow(),
    )
    db.session.add(period_report)
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
