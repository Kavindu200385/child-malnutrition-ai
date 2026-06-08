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
    AuditLog,
    Measurement,
    Hospital,
    PdhsReport,
    RdhsPeriodReport,
    ReferralStatus,
    RiskLevel,
)
from backend.utils.audit import log_audit
from backend.services.notification_service import PRIORITY_NORMAL, notify_ministry

bp = Blueprint("pdhs", __name__, url_prefix="/api/pdhs")


def _district_ids_under_province(province_ids):
    """Helper: district (RDHS) IDs under given province IDs. Uses case-insensitive level check."""
    if not province_ids:
        return []
    from sqlalchemy import func
    rows = db.session.query(Area.id).filter(
        Area.parent_id.in_(province_ids),
        func.lower(Area.level) == "rdhs",
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


from backend.utils.risk_utils import is_sam as _risk_sam, is_mam as _risk_mam, is_normal as _risk_normal, display_risk_level as _display_risk_level


def _province_children(province_ids, child_area_ids):
    """
    Return list of all children in the province (same logic as dashboard).
    Includes: area-assigned, province_id/district_id assigned, and children referred to nutritionist
    (reviewed by a nutritionist assigned to any area in the province), including those with no area assigned.
    """
    from sqlalchemy import or_
    if not province_ids:
        return []
    district_ids = _district_ids_under_province(province_ids)
    worker_area_ids = list(set(child_area_ids) | set(province_ids) | set(district_ids))
    province_nutritionist_ids = [
        u[0] for u in db.session.query(WorkerAreaMapping.user_id).filter(
            WorkerAreaMapping.area_id.in_(worker_area_ids),
            WorkerAreaMapping.is_active == True,
        ).distinct().all()
    ]
    child_ids_with_province_nutritionist = []
    if province_nutritionist_ids:
        nutritionist_user_ids = [u.id for u in db.session.query(User).filter(
            User.id.in_(province_nutritionist_ids),
            User.role == "nutritionist",
            User.is_active == True,
        ).all()]
        if nutritionist_user_ids:
            child_ids_with_province_nutritionist = [
                r[0] for r in db.session.query(ChildReferral.child_id).filter(
                    ChildReferral.referred_to_role == "nutritionist",
                    ChildReferral.status == ReferralStatus.REVIEWED.value,
                    ChildReferral.reviewed_by_user_id.in_(nutritionist_user_ids),
                ).distinct().all()
            ]
    conditions = [
        Child.current_assigned_area_id.in_(child_area_ids),
        Child.province_id.in_(province_ids),
        Child.district_id.in_(district_ids),
    ]
    if child_ids_with_province_nutritionist:
        conditions.append(Child.id.in_(child_ids_with_province_nutritionist))
    return db.session.query(Child).filter(
        Child.is_draft == False,
        Child.status == "ACTIVE",
        or_(*conditions),
    ).all()


def _district_children_and_moh_single(district_id):
    """
    Return (district_children list, moh_areas list, district_area) for one district.
    Used to build full provincial report with per-district and per-MOH details.
    """
    from sqlalchemy import or_
    moh_areas = db.session.query(Area).filter(
        Area.parent_id == district_id,
        Area.level == "moh",
        Area.is_active == True,
    ).all()
    child_area_ids = [district_id] + [a.id for a in moh_areas]
    worker_area_ids = list(set(child_area_ids) | {district_id})
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
        Child.district_id == district_id,
    ]
    if child_ids_with_district_nutritionist:
        conditions.append(Child.id.in_(child_ids_with_district_nutritionist))
    district_children = db.session.query(Child).filter(
        Child.is_draft == False,
        Child.status == "ACTIVE",
        or_(*conditions),
    ).all()
    district_area = db.session.get(Area, district_id)
    return district_children, moh_areas, district_area


# =============================================================================
# DASHBOARD
# =============================================================================

@bp.route("/dashboard-summary", methods=["GET"])
@pdhs_required
def dashboard_summary():
    """
    Province-only dashboard: children, risk distribution, district comparison,
    MOH comparison, escalations, monthly trend, referral stats, district performance.
    Includes children referred to nutritionist (reviewed by province nutritionists), same as RDHS fix.
    """
    from sqlalchemy import or_
    user, ctx, err = _pdhs_context()
    if err:
        return err
    province_ids, child_area_ids = ctx

    district_areas = db.session.query(Area).filter(
        Area.parent_id.in_(province_ids),
        Area.level == "rdhs",
        Area.is_active == True,
    ).all()
    district_ids = [a.id for a in district_areas]

    # Include: area-assigned children, province/district assigned, and children with province nutritionist
    worker_area_ids = list(set(child_area_ids) | set(province_ids) | set(district_ids))
    province_nutritionist_ids = [
        u[0] for u in db.session.query(WorkerAreaMapping.user_id).filter(
            WorkerAreaMapping.area_id.in_(worker_area_ids),
            WorkerAreaMapping.is_active == True,
        ).distinct().all()
    ]
    child_ids_with_province_nutritionist = []
    if province_nutritionist_ids:
        nutritionist_user_ids = [u.id for u in db.session.query(User).filter(
            User.id.in_(province_nutritionist_ids),
            User.role == "nutritionist",
            User.is_active == True,
        ).all()]
        if nutritionist_user_ids:
            child_ids_with_province_nutritionist = [
                r[0] for r in db.session.query(ChildReferral.child_id).filter(
                    ChildReferral.referred_to_role == "nutritionist",
                    ChildReferral.status == ReferralStatus.REVIEWED.value,
                    ChildReferral.reviewed_by_user_id.in_(nutritionist_user_ids),
                ).distinct().all()
            ]
    conditions = [
        Child.current_assigned_area_id.in_(child_area_ids),
        Child.province_id.in_(province_ids),
        Child.district_id.in_(district_ids),
    ]
    if child_ids_with_province_nutritionist:
        conditions.append(Child.id.in_(child_ids_with_province_nutritionist))
    province_children = db.session.query(Child).filter(
        Child.is_draft == False,
        Child.status == "ACTIVE",
        or_(*conditions),
    ).all()

    def _dr(c):
        return _display_risk_level(c)
    total_children = len(province_children)
    sam_count = sum(1 for c in province_children if _risk_sam(_dr(c)))
    mam_count = sum(1 for c in province_children if _risk_mam(_dr(c)))
    normal_count = sum(1 for c in province_children if _risk_normal(_dr(c)))
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

    import calendar
    monthly_trend = []
    today = datetime.utcnow().date()
    for i in range(5, -1, -1):
        year, month = today.year, today.month - i
        while month <= 0:
            month += 12
            year -= 1
        month_start = today.replace(year=year, month=month, day=1)
        _, last_day = calendar.monthrange(year, month)
        month_end = month_start.replace(day=last_day)
        if month_end > today:
            month_end = today
        period_children = [
            c for c in province_children
            if c.created_at and (month_start <= c.created_at.date() <= month_end)
        ]
        monthly_trend.append({
            "month": month_start.strftime("%b %y"),
            "children": len(period_children),
            "normal": sum(1 for c in period_children if _risk_normal(_dr(c))),
            "mam": sum(1 for c in period_children if _risk_mam(_dr(c))),
            "sam": sum(1 for c in period_children if _risk_sam(_dr(c))),
        })

    district_performance = []
    for dist in district_areas:
        dist_children = [c for c in province_children if c.district_id == dist.id]
        district_performance.append({
            "district_id": dist.id,
            "district_name": dist.name or dist.district or f"District {dist.id}",
            "total": len(dist_children),
            "sam": sum(1 for c in dist_children if _risk_sam(_dr(c))),
            "mam": sum(1 for c in dist_children if _risk_mam(_dr(c))),
            "normal": sum(1 for c in dist_children if _risk_normal(_dr(c))),
        })
    district_performance.sort(key=lambda x: -x["total"])

    moh_performance = []
    for moh in moh_areas:
        moh_children = [c for c in province_children if c.moh_area_id == moh.id]
        moh_performance.append({
            "moh_id": moh.id,
            "moh_name": moh.name or f"MOH {moh.id}",
            "total": len(moh_children),
            "sam": sum(1 for c in moh_children if _risk_sam(_dr(c))),
            "mam": sum(1 for c in moh_children if _risk_mam(_dr(c))),
            "normal": sum(1 for c in moh_children if _risk_normal(_dr(c))),
        })
    moh_performance.sort(key=lambda x: -x["total"])

    province_child_ids = [c.id for c in province_children]
    referrals = db.session.query(ChildReferral).filter(
        ChildReferral.child_id.in_(province_child_ids),
        ChildReferral.referred_to_role == "nutritionist",
    ).all() if province_child_ids else []
    referral_stats = {"total_referrals": len(referrals)}

    province_areas = db.session.query(Area).filter(Area.id.in_(province_ids)).all()
    province_names = [a.name or a.province or f"Province {a.id}" for a in province_areas]

    # Predicted risk from latest measurement per child
    predicted_sam_count = 0
    predicted_mam_count = 0
    if province_child_ids:
        from sqlalchemy import func as sql_func, and_ as sql_and
        latest_subq = (
            db.session.query(
                Measurement.child_id,
                sql_func.max(Measurement.measurement_date).label("max_date"),
            )
            .filter(Measurement.child_id.in_(province_child_ids))
            .group_by(Measurement.child_id)
            .subquery()
        )
        preds = (
            db.session.query(Measurement.predicted_risk_next_2_months)
            .join(latest_subq, sql_and(
                Measurement.child_id == latest_subq.c.child_id,
                Measurement.measurement_date == latest_subq.c.max_date,
            ))
            .filter(Measurement.predicted_risk_next_2_months.isnot(None))
            .all()
        )
        for (p,) in preds:
            if p and p.strip() == "Severe":
                predicted_sam_count += 1
            elif p and p.strip() in ("High", "Moderate"):
                predicted_mam_count += 1

    return jsonify({
        "status": "success",
        "data": {
            "province_ids": province_ids,
            "province_names": province_names,
            "total_children": total_children,
            "normal_count": normal_count,
            "mam_count": mam_count,
            "sam_count": sam_count,
            "predicted_sam_count": predicted_sam_count,
            "predicted_mam_count": predicted_mam_count,
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

    is_nutritionist = target.role == 'nutritionist'
    if not is_nutritionist:
        if not any(aid in worker_area_ids for aid in target_area_ids):
            return jsonify({"status": "error", "message": "User not in your province"}), 403
    else:
        if target.hospital_id:
            hosp = db.session.get(Hospital, target.hospital_id)
            if not hosp:
                return jsonify({"status": "error", "message": "Nutritionist not in your province"}), 403
            if hosp.province:
                province_names = [a.name for a in db.session.query(Area).filter(Area.id.in_(province_ids)).all()]
                if hosp.province not in province_names:
                    return jsonify({"status": "error", "message": "Nutritionist not in your province"}), 403

    if is_nutritionist:
        children_referred = db.session.query(ChildReferral).filter(
            ChildReferral.reviewed_by_user_id == target.id,
            ChildReferral.status == ReferralStatus.REVIEWED.value,
        ).count()
        referred_ids = [r[0] for r in db.session.query(ChildReferral.child_id).filter(
            ChildReferral.reviewed_by_user_id == target.id,
            ChildReferral.status == ReferralStatus.REVIEWED.value,
        ).distinct().all()]
        cases_resolved = db.session.query(Child).filter(
            Child.id.in_(referred_ids),
            Child.current_risk_level == RiskLevel.NORMAL.value,
        ).count() if referred_ids else 0
        measurement_count = db.session.query(Measurement).filter(
            Measurement.measured_by_user_id == target.id
        ).count()
        child_reviews = db.session.query(AuditLog).filter(
            AuditLog.action == "NUTRITIONIST_REVIEW",
            AuditLog.user_id == target.id,
            AuditLog.entity_type == "child",
        ).count()
        performance = {
            "children_referred": children_referred,
            "measurements_taken": measurement_count,
            "cases_resolved": cases_resolved,
            "child_reviews": child_reviews,
        }
    else:
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
        performance = {
            "children_in_area": child_count,
            "measurements_taken": measurement_count,
            "escalations_made": escalation_count,
        }

    return jsonify({
        "status": "success",
        "user": target.to_dict(include_areas=True),
        "performance": performance,
        "role": target.role,
    }), 200


# =============================================================================
# AREAS (read + MOH create/update within province)
# =============================================================================

@bp.route("/areas", methods=["GET"])
@pdhs_required
def list_areas():
    """List all areas in province: PDHS, RDHS (districts), MOH, and PHM (midwife). Province-filtered."""
    user, ctx, err = _pdhs_context()
    if err:
        return err
    province_ids, child_area_ids = ctx

    level = request.args.get("level")
    parent_id = request.args.get("parent_id", type=int)

    # All area IDs in this province (province + all descendants: districts, MOH, PHM)
    all_area_ids = list(set(province_ids) | set(child_area_ids))

    query = db.session.query(Area).filter(Area.is_active == True)

    if parent_id is not None:
        if parent_id not in child_area_ids and parent_id not in province_ids:
            return jsonify({"status": "error", "message": "No access to this parent area"}), 403
        query = query.filter(Area.parent_id == parent_id)
    else:
        # Return all areas in province hierarchy so PDHS can see Midwife, MOH, and RDHS sections
        query = query.filter(Area.id.in_(all_area_ids))

    if level and level in ("rdhs", "moh", "phm", "pdhs", "ministry"):
        query = query.filter(Area.level == level)

    areas = query.order_by(Area.level, Area.name).all()
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

@bp.route("/rdhs-period-reports", methods=["GET"])
@pdhs_required
def rdhs_period_reports():
    """List RDHS period reports (daily/weekly/monthly) sent to PDHS from districts in this province.
    Query: period_type=daily|weekly|monthly (optional) to filter by period."""
    user, ctx, err = _pdhs_context()
    if err:
        return err
    province_ids, _ = ctx
    district_ids = list(_district_ids_under_province(province_ids))
    # Also include districts that have sent reports and belong to this province (in case hierarchy was updated)
    sent_district_ids = db.session.query(RdhsPeriodReport.district_id).filter(
        RdhsPeriodReport.sent_to_pdhs == True,
    ).distinct().all()
    for (did,) in sent_district_ids:
        if did in district_ids:
            continue
        area = db.session.get(Area, did)
        if area and area.parent_id in province_ids and (area.level or "").lower() == "rdhs" and area.is_active:
            district_ids.append(did)
    if not district_ids:
        return jsonify({"status": "success", "reports": [], "count": 0}), 200
    query = db.session.query(RdhsPeriodReport).filter(
        RdhsPeriodReport.district_id.in_(district_ids),
        RdhsPeriodReport.sent_to_pdhs == True,
    )
    period_type = (request.args.get("period_type") or "").strip().lower()
    if period_type in ("daily", "weekly", "monthly"):
        query = query.filter(RdhsPeriodReport.period_type == period_type)
    reports = query.order_by(RdhsPeriodReport.created_at.desc()).limit(100).all()
    return jsonify({
        "status": "success",
        "reports": [r.to_dict() for r in reports],
        "count": len(reports),
    }), 200


@bp.route("/rdhs-period-reports/<int:report_id>", methods=["DELETE"])
@pdhs_required
def delete_rdhs_period_report(report_id: int):
    """Delete an RDHS period report that was sent to this PDHS province."""
    user, ctx, err = _pdhs_context()
    if err:
        return err
    province_ids, _ = ctx
    district_ids = list(_district_ids_under_province(province_ids))
    report = db.session.get(RdhsPeriodReport, report_id)
    if not report:
        return jsonify({"status": "error", "message": "Report not found"}), 404
    if report.district_id not in district_ids:
        return jsonify({"status": "error", "message": "Report not in your province"}), 403
    db.session.delete(report)
    db.session.commit()
    return jsonify({"status": "success", "message": "Report deleted"}), 200


@bp.route("/reports/full", methods=["GET"])
@pdhs_required
def reports_full():
    """
    Get full provincial report for a month/year: all districts, each with MOH areas and child-level details.
    Query: month=1-12, year=YYYY. Used for Download/Print PDF.
    """
    import calendar
    from datetime import date as _date

    user, ctx, err = _pdhs_context()
    if err:
        return err
    province_ids, child_area_ids = ctx
    district_ids = _district_ids_under_province(province_ids)
    month = request.args.get("month", type=int)
    year = request.args.get("year", type=int)
    if month is None or year is None:
        return jsonify({"status": "error", "message": "month and year required"}), 400
    if not (1 <= month <= 12):
        return jsonify({"status": "error", "message": "month must be 1-12"}), 400

    start_date = _date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    end_date = _date(year, month, last_day)
    period_label = start_date.strftime("%B %Y")

    province_area = db.session.get(Area, province_ids[0]) if province_ids else None
    province_name = (province_area.name or province_area.district or f"Province {province_ids[0]}") if province_area else "Province"

    def _dr(c):
        return _display_risk_level(c)

    def _age_months(dob):
        if not dob:
            return None
        today = _date.today()
        return (today.year - dob.year) * 12 + (today.month - dob.month)

    def _last_visit_data(child):
        if not child.measurements:
            return {}
        m = child.measurements[0]
        return {
            "weight_kg": float(m.weight_kg) if m.weight_kg else None,
            "height_cm": float(m.height_cm) if m.height_cm else None,
            "muac_cm": float(m.muac_cm) if m.muac_cm else None,
            "visit_date": m.measurement_date.strftime("%Y-%m-%d") if m.measurement_date else None,
        }

    # All province children (same as dashboard – includes nutritionist-referred with no area)
    province_children_all = _province_children(province_ids, child_area_ids)

    districts_payload = []
    all_children_count = 0
    all_normal = all_mam = all_sam = 0
    all_escalations = 0
    district_child_ids_seen = set()

    for district_id in district_ids:
        district_children, moh_areas, district_area = _district_children_and_moh_single(district_id)
        district_child_ids_seen.update(c.id for c in district_children)
        moh_area_ids = [a.id for a in moh_areas]
        summary_escalations = db.session.query(ChildEscalation).filter(
            ChildEscalation.moh_id.in_(moh_area_ids)
        ).count() if moh_area_ids else 0
        summary = {
            "total_children": len(district_children),
            "normal": sum(1 for c in district_children if _risk_normal(_dr(c))),
            "mam": sum(1 for c in district_children if _risk_mam(_dr(c))),
            "sam": sum(1 for c in district_children if _risk_sam(_dr(c))),
            "total_escalations": summary_escalations,
        }
        all_children_count += summary["total_children"]
        all_normal += summary["normal"]
        all_mam += summary["mam"]
        all_sam += summary["sam"]
        all_escalations += summary["total_escalations"]

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

        district_name = (district_area.name or district_area.district or f"District {district_id}") if district_area else f"District {district_id}"
        districts_payload.append({
            "district_id": district_id,
            "district_name": district_name,
            "summary": summary,
            "moh_areas": moh_breakdown,
        })

    # Children in province but not in any district (e.g. referred to nutritionist, no area assigned)
    province_only_children = [c for c in province_children_all if c.id not in district_child_ids_seen]
    if province_only_children:
        all_children_count += len(province_only_children)
        all_normal += sum(1 for c in province_only_children if _risk_normal(_dr(c)))
        all_mam += sum(1 for c in province_only_children if _risk_mam(_dr(c)))
        all_sam += sum(1 for c in province_only_children if _risk_sam(_dr(c)))
        children_detail = []
        for c in province_only_children:
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
        districts_payload.append({
            "district_id": None,
            "district_name": "Referred to nutritionist (no area assigned)",
            "summary": {
                "total_children": len(province_only_children),
                "normal": sum(1 for c in province_only_children if _risk_normal(_dr(c))),
                "mam": sum(1 for c in province_only_children if _risk_mam(_dr(c))),
                "sam": sum(1 for c in province_only_children if _risk_sam(_dr(c))),
                "total_escalations": 0,
            },
            "moh_areas": [{
                "moh_id": None,
                "moh_name": "Referred to nutritionist",
                "total_children": len(province_only_children),
                "normal": sum(1 for c in province_only_children if _risk_normal(_dr(c))),
                "mam": sum(1 for c in province_only_children if _risk_mam(_dr(c))),
                "sam": sum(1 for c in province_only_children if _risk_sam(_dr(c))),
                "escalations": 0,
                "children": children_detail,
            }],
        })

    report_payload = {
        "period": "monthly",
        "period_label": period_label,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "province_name": province_name,
        "province_id": province_ids[0] if province_ids else None,
        "summary": {
            "total_children": all_children_count,
            "normal": all_normal,
            "mam": all_mam,
            "sam": all_sam,
            "total_escalations": all_escalations,
        },
        "districts": districts_payload,
    }
    return jsonify({"status": "success", "report": report_payload}), 200


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

    # Use same province children as dashboard (includes nutritionist-referred with no area assigned)
    province_children = _province_children(province_ids, child_area_ids)
    total_children = len(province_children)
    def _dr(c):
        return _display_risk_level(c)
    normal_count = sum(1 for c in province_children if _risk_normal(_dr(c)))
    mam_count = sum(1 for c in province_children if _risk_mam(_dr(c)))
    sam_count = sum(1 for c in province_children if _risk_sam(_dr(c)))
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
    notify_ministry(
        title="PDHS report submitted",
        message=f"PDHS monthly report for {report.month}/{report.report_year} was submitted to Health Ministry.",
        type="report_submitted",
        priority=PRIORITY_NORMAL,
        actor_user_id=user.id,
        related_report_id=report.id,
        metadata={"report_kind": "pdhs", "province_id": report.province_id},
    )
    db.session.commit()
    return jsonify({"status": "success", "report": report.to_dict()}), 200
