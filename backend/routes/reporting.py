"""
Reporting Routes
RDHS, PDHS, and Ministry level reports with analytics
"""
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request
from sqlalchemy import or_

from backend.auth_utils_hierarchical import (
    admin_required,
    get_current_user,
    get_user_accessible_areas,
    ROLE_HEALTH_MINISTRY,
    ROLE_PDHS,
    ROLE_RDHS,
)
# Worker performance categories: admin = RDHS/PDHS (supervisory), field = MOH/Midwife/Nutritionist etc.
ADMIN_ROLES = (ROLE_RDHS, ROLE_PDHS)
FIELD_ROLES = ("moh", "amoh", "midwife", "nutritionist", "hospital")


def _risk_key(r):
    """Map risk level to NORMAL/MODERATE/HIGH/CRITICAL (MAM->MODERATE, SAM->CRITICAL)."""
    if r is None:
        return "NORMAL"
    v = (r.value if hasattr(r, "value") else r).upper()
    if v in ("SAM", "CRITICAL"):
        return "CRITICAL"
    if v in ("MAM", "MODERATE"):
        return "MODERATE"
    if v == "HIGH":
        return "HIGH"
    return "NORMAL"


def _risk_distribution_buckets(children):
    """Return {NORMAL, MODERATE, HIGH, CRITICAL} counts for a list of children."""
    buckets = {"NORMAL": 0, "MODERATE": 0, "HIGH": 0, "CRITICAL": 0}
    for c in children:
        k = _risk_key(c.current_risk_level or c.birth_risk_level)
        buckets[k] = buckets[k] + 1
    return buckets


def _parse_date_filter(start_date: str | None, end_date: str | None):
    start, end = None, None
    if start_date:
        try:
            start = datetime.fromisoformat(start_date).date()
        except Exception:
            start = None
    if end_date:
        try:
            end = datetime.fromisoformat(end_date).date()
        except Exception:
            end = None
    if start or end:
        return (start, end)
    return None


def _hospital_ids_for_district(rdhs_area: Area) -> list[int]:
    if not rdhs_area or not rdhs_area.district:
        return []
    rows = db.session.query(Hospital.id).filter(
        Hospital.is_active == True,
        Hospital.district == rdhs_area.district,
    ).all()
    return [r[0] for r in rows]


def _hospital_ids_for_province(pdhs_areas: list, district_areas: list) -> list[int]:
    districts = {a.district for a in district_areas if a.district}
    provinces = {a.province for a in pdhs_areas if a.province}
    if not districts and not provinces:
        return []
    conds = []
    if districts:
        conds.append(Hospital.district.in_(list(districts)))
    if provinces:
        conds.append(Hospital.province.in_(list(provinces)))
    rows = db.session.query(Hospital.id).filter(Hospital.is_active == True, or_(*conds)).all()
    return [r[0] for r in rows]


def _child_scope_for_district(rdhs_area: Area, child_area_ids: list[int]):
    """All active children belonging to an RDHS district (PHM/MOH/hospital)."""
    conditions = [Child.district_id == rdhs_area.id]
    if child_area_ids:
        conditions.extend([
            Child.phm_area_id.in_(child_area_ids),
            Child.moh_area_id.in_(child_area_ids),
            Child.current_assigned_area_id.in_(child_area_ids),
        ])
    hosp_ids = _hospital_ids_for_district(rdhs_area)
    if hosp_ids:
        conditions.append(Child.hospital_id.in_(hosp_ids))
    return or_(*conditions)


def _child_scope_for_province(
    province_ids: list[int],
    district_ids: list[int],
    all_child_area_ids: list[int],
    pdhs_areas: list,
    district_areas: list,
):
    conditions = []
    if province_ids:
        conditions.append(Child.province_id.in_(province_ids))
    if district_ids:
        conditions.append(Child.district_id.in_(district_ids))
    if all_child_area_ids:
        conditions.extend([
            Child.phm_area_id.in_(all_child_area_ids),
            Child.moh_area_id.in_(all_child_area_ids),
            Child.current_assigned_area_id.in_(all_child_area_ids),
        ])
    hosp_ids = _hospital_ids_for_province(pdhs_areas, district_areas)
    if hosp_ids:
        conditions.append(Child.hospital_id.in_(hosp_ids))
    if not conditions:
        return Child.id == -1  # no match
    return or_(*conditions)


def _query_children_in_scope(scope_filter):
    return db.session.query(Child).filter(
        scope_filter,
        Child.is_draft == False,
        Child.status == "ACTIVE",
    ).all()


def _count_clinic_activity(child_ids: list[int], date_filter, user_id: int | None = None) -> int:
    """Visits + measurements (midwife clinic data lives in measurements)."""
    if not child_ids:
        return 0
    visit_q = db.session.query(Visit).filter(Visit.child_id_fk.in_(child_ids))
    meas_q = db.session.query(Measurement).filter(Measurement.child_id.in_(child_ids))
    if user_id:
        visit_q = visit_q.filter(Visit.created_by_user_id == user_id)
        meas_q = meas_q.filter(Measurement.measured_by_user_id == user_id)
    if date_filter:
        start, end = date_filter
        if start:
            start_dt = datetime.combine(start, datetime.min.time())
            visit_q = visit_q.filter(Visit.visit_date >= start_dt)
            meas_q = meas_q.filter(Measurement.measurement_date >= start_dt)
        if end:
            end_dt = datetime.combine(end, datetime.max.time())
            visit_q = visit_q.filter(Visit.visit_date <= end_dt)
            meas_q = meas_q.filter(Measurement.measurement_date <= end_dt)
    return visit_q.count() + meas_q.count()


def _worker_assigned_area_ids(worker: User) -> set[int]:
    return {
        m.area_id
        for m in db.session.query(WorkerAreaMapping).filter(
            WorkerAreaMapping.user_id == worker.id,
            WorkerAreaMapping.is_active == True,
        ).all()
    }


def _children_for_worker(worker: User, scope_children: list[Child]) -> list[Child]:
    if worker.role == "nutritionist" and worker.hospital_id:
        ref_ids = {
            r.child_id
            for r in db.session.query(ChildReferral.child_id).filter(
                ChildReferral.hospital_id == worker.hospital_id,
            ).all()
        }
        return [c for c in scope_children if c.id in ref_ids]

    assigned_areas = _worker_assigned_area_ids(worker)
    matched = []
    for c in scope_children:
        if c.current_assigned_user_id == worker.id or c.registered_by_user_id == worker.id:
            matched.append(c)
            continue
        if worker.phm_area_id and c.phm_area_id == worker.phm_area_id:
            matched.append(c)
            continue
        if c.moh_area_id and c.moh_area_id in assigned_areas:
            matched.append(c)
            continue
        if c.phm_area_id and c.phm_area_id in assigned_areas:
            matched.append(c)
    return matched


from backend.extensions import db
from backend.models_hierarchical import (
    Child,
    Visit,
    Measurement,
    Area,
    Hospital,
    Report,
    ChildTransfer,
    User,
    WorkerAreaMapping,
)
from backend.utils.audit import log_audit

bp = Blueprint("reporting", __name__, url_prefix="/api/reports")


@bp.route("/district", methods=["GET"])
def district_report():
    """
    RDHS District Report
    District summary, worker performance, risk distribution
    """
    user = get_current_user()
    if user.role not in [ROLE_RDHS, ROLE_HEALTH_MINISTRY]:
        return jsonify({"status": "error", "message": "RDHS access required"}), 403
    
    area_id = request.args.get("area_id", type=int)
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    
    # Get accessible areas (RDHS level)
    accessible_areas = get_user_accessible_areas(user)
    rdhs_areas = [a for a in accessible_areas if a.level == "rdhs"]
    
    if not rdhs_areas:
        return jsonify({"status": "error", "message": "No RDHS areas assigned"}), 400
    
    # Use specified area or first accessible
    target_area = None
    if area_id:
        target_area = next((a for a in rdhs_areas if a.id == area_id), None)
    else:
        target_area = rdhs_areas[0]
    
    if not target_area:
        return jsonify({"status": "error", "message": "Area not found or no access"}), 404
    
    # Get all child areas under this RDHS
    child_area_ids = _get_child_area_ids(target_area.id)
    
    date_filter = _parse_date_filter(start_date, end_date)

    # All children in district; date range applies to clinic activity counts only.
    children = _query_children_in_scope(_child_scope_for_district(target_area, child_area_ids))

    total_children = len(children)
    risk_distribution = _risk_distribution_buckets(children)
    child_ids = [c.id for c in children]
    total_visits = _count_clinic_activity(child_ids, date_filter)

    worker_area_ids = list(child_area_ids) if child_area_ids else []
    if target_area.id not in worker_area_ids:
        worker_area_ids.append(target_area.id)
    workers = db.session.query(User).join(
        WorkerAreaMapping,
        User.id == WorkerAreaMapping.user_id,
    ).filter(
        WorkerAreaMapping.area_id.in_(worker_area_ids),
        WorkerAreaMapping.is_active == True,
        User.is_active == True,
    ).distinct().all()

    hosp_ids = _hospital_ids_for_district(target_area)
    if hosp_ids:
        hospital_staff = db.session.query(User).filter(
            User.hospital_id.in_(hosp_ids),
            User.is_active == True,
            User.role.in_(("hospital", "nutritionist")),
        ).all()
        seen_ids = {w.id for w in workers}
        for w in hospital_staff:
            if w.id not in seen_ids:
                workers.append(w)
                seen_ids.add(w.id)

    worker_stats = []
    for worker in workers:
        worker_children = _children_for_worker(worker, children)
        child_ids_w = [c.id for c in worker_children]
        visits_count = _count_clinic_activity(child_ids_w, date_filter, user_id=worker.id)
        role_cat = "admin" if (worker.role or "").lower() in ADMIN_ROLES else "field"
        worker_stats.append({
            "worker_id": worker.id,
            "worker_name": worker.name,
            "role": worker.role,
            "role_category": role_cat,
            "children_count": len(worker_children),
            "visits_count": visits_count,
        })
    worker_performance_admin = [w for w in worker_stats if w.get("role_category") == "admin"]
    worker_performance_field = [w for w in worker_stats if w.get("role_category") == "field"]
    
    # Transfer statistics (transfers to district or to MOH/PHM areas in this district)
    transfer_to_area_ids = list(child_area_ids) if child_area_ids else []
    if target_area.id not in transfer_to_area_ids:
        transfer_to_area_ids.append(target_area.id)
    transfers = db.session.query(ChildTransfer).filter(
        ChildTransfer.to_area_id.in_(transfer_to_area_ids),
        ChildTransfer.status == "COMPLETED"
    ).all()
    
    transfer_stats = {
        "total_transfers": len(transfers),
        "by_role": {}
    }
    for transfer in transfers:
        role = transfer.to_role
        transfer_stats["by_role"][role] = transfer_stats["by_role"].get(role, 0) + 1
    
    report_data = {
        "district": target_area.name,
        "district_id": target_area.id,
        "period": {
            "start_date": start_date,
            "end_date": end_date,
        },
        "summary": {
            "total_children": total_children,
            "total_visits": total_visits,
            "average_visits_per_child": round(total_visits / total_children, 2) if total_children > 0 else 0,
        },
        "risk_distribution": risk_distribution,
        "worker_performance": worker_stats,
        "worker_performance_admin": worker_performance_admin,
        "worker_performance_field": worker_performance_field,
        "transfer_statistics": transfer_stats,
    }
    
    return jsonify({
        "status": "success",
        "report_type": "district",
        "data": report_data,
    }), 200


@bp.route("/provincial", methods=["GET"])
def provincial_report():
    """
    PDHS Provincial Report
    Provincial summary, district comparison
    """
    user = get_current_user()
    if user.role not in [ROLE_PDHS, ROLE_HEALTH_MINISTRY]:
        return jsonify({"status": "error", "message": "PDHS access required"}), 403
    
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    
    # Get accessible areas (PDHS level)
    accessible_areas = get_user_accessible_areas(user)
    pdhs_areas = [a for a in accessible_areas if a.level == "pdhs"]
    
    if not pdhs_areas:
        return jsonify({"status": "error", "message": "No PDHS areas assigned"}), 400
    
    # Get all districts under PDHS areas
    all_districts = []
    for pdhs_area in pdhs_areas:
        districts = db.session.query(Area).filter(
            Area.parent_id == pdhs_area.id,
            Area.level == "rdhs",
            Area.is_active == True
        ).all()
        all_districts.extend(districts)
    
    date_filter = _parse_date_filter(start_date, end_date)

    district_comparison = []
    for district in all_districts:
        child_area_ids = _get_child_area_ids(district.id)
        children = _query_children_in_scope(_child_scope_for_district(district, child_area_ids))
        risk_dist = _risk_distribution_buckets(children)
        district_comparison.append({
            "district_id": district.id,
            "district_name": district.name,
            "total_children": len(children),
            "risk_distribution": risk_dist,
        })

    all_child_area_ids = []
    for district in all_districts:
        all_child_area_ids.extend(_get_child_area_ids(district.id))
    province_ids = [p.id for p in pdhs_areas]
    district_ids = [d.id for d in all_districts]
    provincial_cond = _child_scope_for_province(
        province_ids, district_ids, all_child_area_ids, pdhs_areas, all_districts
    )
    all_children = _query_children_in_scope(provincial_cond)
    provincial_summary = {
        "total_children": len(all_children),
        "total_districts": len(all_districts),
        "risk_distribution": _risk_distribution_buckets(all_children),
    }
    
    report_data = {
        "province": pdhs_areas[0].province if pdhs_areas else "Unknown",
        "period": {
            "start_date": start_date,
            "end_date": end_date,
        },
        "provincial_summary": provincial_summary,
        "district_comparison": district_comparison,
    }
    
    return jsonify({
        "status": "success",
        "report_type": "provincial",
        "data": report_data,
    }), 200


@bp.route("/national", methods=["GET"])
def national_report():
    """
    Health Ministry National Dashboard
    National summary, AI prediction analytics, province comparison
    """
    user = get_current_user()
    if user.role != ROLE_HEALTH_MINISTRY:
        return jsonify({"status": "error", "message": "Health Ministry access required"}), 403
    
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    date_filter = _parse_date_filter(start_date, end_date)

    all_children = db.session.query(Child).filter(
        Child.is_draft == False,
        Child.status == "ACTIVE",
    ).all()

    national_summary = {
        "total_children": len(all_children),
        "risk_distribution": _risk_distribution_buckets(all_children),
        "total_clinic_visits": _count_clinic_activity([c.id for c in all_children], date_filter),
    }
    
    # Province comparison
    provinces = db.session.query(Area).filter(
        Area.level == "pdhs",
        Area.is_active == True
    ).all()
    
    province_comparison = []
    for province in provinces:
        districts = db.session.query(Area).filter(
            Area.parent_id == province.id,
            Area.level == "rdhs",
            Area.is_active == True
        ).all()
        
        all_child_area_ids = []
        for district in districts:
            all_child_area_ids.extend(_get_child_area_ids(district.id))
        district_ids = [d.id for d in districts]
        scope = _child_scope_for_province([province.id], district_ids, all_child_area_ids, [province], districts)
        province_children = _query_children_in_scope(scope)

        province_comparison.append({
            "province_id": province.id,
            "province_name": province.name,
            "total_children": len(province_children),
            "risk_distribution": _risk_distribution_buckets(province_children),
        })

    recent_visits = db.session.query(Visit).filter(
        Visit.predicted_risk_next_2_months.isnot(None)
    ).order_by(Visit.visit_date.desc()).limit(1000).all()
    recent_meas = db.session.query(Measurement).filter(
        Measurement.predicted_risk_next_2_months.isnot(None)
    ).order_by(Measurement.measurement_date.desc()).limit(1000).all()

    pred_items = list(recent_visits) + list(recent_meas)
    conf_values = []
    for item in pred_items:
        conf = getattr(item, "model_confidence", None)
        if conf is not None:
            conf_values.append(float(conf))

    def _pred_bucket(val):
        if not val:
            return None
        v = str(val).strip().capitalize()
        if v in ("Low", "Moderate", "High", "Severe"):
            return v
        return None

    prediction_analytics = {
        "total_predictions": len(pred_items),
        "prediction_distribution": {
            "Low": sum(1 for x in pred_items if _pred_bucket(getattr(x, "predicted_risk_next_2_months", None)) == "Low"),
            "Moderate": sum(1 for x in pred_items if _pred_bucket(getattr(x, "predicted_risk_next_2_months", None)) == "Moderate"),
            "High": sum(1 for x in pred_items if _pred_bucket(getattr(x, "predicted_risk_next_2_months", None)) == "High"),
            "Severe": sum(1 for x in pred_items if _pred_bucket(getattr(x, "predicted_risk_next_2_months", None)) == "Severe"),
        },
        "average_confidence": round(sum(conf_values) / len(conf_values), 3) if conf_values else 0,
    }
    
    # Transfer statistics
    transfers = db.session.query(ChildTransfer).filter(
        ChildTransfer.status == "COMPLETED"
    ).all()
    
    transfer_analytics = {
        "total_transfers": len(transfers),
        "by_direction": {
            "midwife_to_moh": len([t for t in transfers if t.from_role == "midwife" and t.to_role in ["moh", "amoh"]]),
            "moh_to_nutritionist": len([t for t in transfers if t.from_role in ["moh", "amoh"] and t.to_role == "nutritionist"]),
            "nutritionist_to_moh": len([t for t in transfers if t.from_role == "nutritionist" and t.to_role in ["moh", "amoh"]]),
        },
    }
    
    report_data = {
        "period": {
            "start_date": start_date,
            "end_date": end_date,
        },
        "national_summary": national_summary,
        "province_comparison": province_comparison,
        "ai_prediction_analytics": prediction_analytics,
        "transfer_analytics": transfer_analytics,
    }
    
    return jsonify({
        "status": "success",
        "report_type": "national",
        "data": report_data,
    }), 200


@bp.route("/save", methods=["POST"])
@admin_required
def save_report():
    """
    Save generated report to database
    """
    user = get_current_user()
    data = request.get_json() or {}
    
    report_type = data.get("report_type")  # district, provincial, national
    title = data.get("title")
    report_data = data.get("data")
    area_id = data.get("area_id")
    start_date = data.get("start_date")
    end_date = data.get("end_date")
    
    if not report_type or not title or not report_data:
        return jsonify({"status": "error", "message": "report_type, title, and data are required"}), 400
    
    report = Report(
        report_type=report_type,
        title=title,
        description=data.get("description"),
        area_id=area_id,
        start_date=datetime.fromisoformat(start_date).date() if start_date else None,
        end_date=datetime.fromisoformat(end_date).date() if end_date else None,
        report_data=report_data,
        created_by_user_id=user.id,
    )
    
    db.session.add(report)
    db.session.flush()
    
    log_audit(
        action="CREATE",
        entity_type="report",
        entity_id=report.id,
        new_values=report.to_dict(),
        user_id=user.id,
        description=f"Saved {report_type} report: {title}",
    )
    
    db.session.commit()
    
    return jsonify({
        "status": "success",
        "report": report.to_dict(),
    }), 201


@bp.route("/<int:report_id>", methods=["GET"])
@admin_required
def get_report(report_id: int):
    """Get a single saved report by ID"""
    user = get_current_user()
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({"status": "error", "message": "Report not found"}), 404
    # Access check
    if user.role != ROLE_HEALTH_MINISTRY:
        accessible_areas = get_user_accessible_areas(user)
        accessible_area_ids = {a.id for a in accessible_areas}
        if report.area_id and report.area_id not in accessible_area_ids:
            return jsonify({"status": "error", "message": "No access to this report"}), 403
    return jsonify({"status": "success", "report": report.to_dict()}), 200


@bp.route("/<int:report_id>", methods=["DELETE"])
@admin_required
def delete_report(report_id: int):
    """Delete a saved report"""
    user = get_current_user()
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({"status": "error", "message": "Report not found"}), 404
    if user.role != ROLE_HEALTH_MINISTRY and report.created_by_user_id != user.id:
        return jsonify({"status": "error", "message": "Not allowed to delete this report"}), 403
    log_audit(
        action="DELETE",
        entity_type="report",
        entity_id=report.id,
        old_values={"title": report.title, "report_type": report.report_type},
        user_id=user.id,
        description=f"Deleted report: {report.title}",
    )
    db.session.delete(report)
    db.session.commit()
    return jsonify({"status": "success", "message": "Report deleted"}), 200


@bp.route("", methods=["GET"])
@admin_required
def list_reports():
    """List saved reports"""
    user = get_current_user()
    report_type = request.args.get("report_type")
    area_id = request.args.get("area_id", type=int)
    
    query = db.session.query(Report)
    
    if report_type:
        query = query.filter(Report.report_type == report_type)
    
    if area_id:
        query = query.filter(Report.area_id == area_id)
    
    # Filter by access
    if user.role != ROLE_HEALTH_MINISTRY:
        accessible_areas = get_user_accessible_areas(user)
        accessible_area_ids = [a.id for a in accessible_areas]
        if accessible_area_ids:
            query = query.filter(Report.area_id.in_(accessible_area_ids))
        else:
            return jsonify({"status": "success", "reports": [], "count": 0}), 200
    
    reports = query.order_by(Report.created_at.desc()).limit(100).all()
    
    return jsonify({
        "status": "success",
        "reports": [r.to_dict() for r in reports],
        "count": len(reports),
    }), 200


from backend.utils.risk_utils import is_sam as _risk_sam, is_mam as _risk_mam, is_normal as _risk_normal


@bp.route("/overview-stats", methods=["GET"])
def overview_stats():
    """
    Health Ministry only. Aggregated stats for admin dashboard overview:
    total_children, total_workers, total_clinics (PHM areas), risk counts,
    district_breakdown, monthly_trend (last 6 months), clinic_performance (MOH areas).
    """
    user = get_current_user()
    if not user or user.role != ROLE_HEALTH_MINISTRY:
        return jsonify({"status": "error", "message": "Health Ministry access required"}), 403

    # Active non-draft children
    children_query = db.session.query(Child).filter(
        Child.is_draft == False,
        Child.status == "ACTIVE"
    )
    all_children = children_query.all()

    total_children = len(all_children)
    sam_count = sum(1 for c in all_children if _risk_sam(c.current_risk_level))
    mam_count = sum(1 for c in all_children if _risk_mam(c.current_risk_level))
    normal_count = sum(1 for c in all_children if _risk_normal(c.current_risk_level))

    # Health workers: PDHS, RDHS, MOH, AMOH, MIDWIFE, NUTRITIONIST, HOSPITAL (exclude health_ministry)
    worker_roles = ("pdhs", "rdhs", "moh", "amoh", "midwife", "nutritionist", "hospital")
    total_workers = db.session.query(User).filter(
        User.role.in_(worker_roles),
        User.is_active == True,
    ).count()

    # Clinics = active PHM areas
    total_clinics = db.session.query(Area).filter(
        Area.level == "phm",
        Area.is_active == True
    ).count()

    # District breakdown (RDHS level)
    rdhs_areas = db.session.query(Area).filter(
        Area.level == "rdhs",
        Area.is_active == True
    ).all()
    district_breakdown = []
    for rdhs in rdhs_areas:
        child_area_ids = _get_child_area_ids(rdhs.id)
        district_children = _query_children_in_scope(_child_scope_for_district(rdhs, child_area_ids))
        total = len(district_children)
        if total == 0:
            continue
        sam = sum(1 for c in district_children if _risk_sam(c.current_risk_level))
        mam = sum(1 for c in district_children if _risk_mam(c.current_risk_level))
        normal = sum(1 for c in district_children if _risk_normal(c.current_risk_level))
        district_breakdown.append({
            "district": rdhs.name or rdhs.district or f"RDHS {rdhs.id}",
            "total": total,
            "sam": sam,
            "mam": mam,
            "normal": normal,
        })
    district_breakdown.sort(key=lambda x: -x["total"])

    # Last 6 calendar months trend (by created_at month)
    monthly_trend = []
    today = datetime.utcnow().date()
    for i in range(5, -1, -1):
        # month_start = first day of (today - i months)
        year = today.year
        month = today.month - i
        while month <= 0:
            month += 12
            year -= 1
        month_start = today.replace(year=year, month=month, day=1)
        if month == 12:
            month_end = month_start.replace(day=31)
        else:
            month_end = (month_start.replace(month=month + 1, day=1) - timedelta(days=1))
        if month_end > today:
            month_end = today
        period_children = [
            c for c in all_children
            if c.created_at and (month_start <= c.created_at.date() <= month_end)
        ]
        monthly_trend.append({
            "month": month_start.strftime("%b"),
            "children": len(period_children),
            "sam": sum(1 for c in period_children if _risk_sam(c.current_risk_level)),
            "mam": sum(1 for c in period_children if _risk_mam(c.current_risk_level)),
        })

    # Clinic performance: MOH areas with child counts
    moh_areas = db.session.query(Area).filter(
        Area.level == "moh",
        Area.is_active == True
    ).all()
    clinic_performance = []
    for moh in moh_areas:
        moh_child_area_ids = _get_child_area_ids(moh.id)
        moh_scope = or_(Child.moh_area_id == moh.id, Child.phm_area_id.in_(moh_child_area_ids)) if moh_child_area_ids else (Child.moh_area_id == moh.id)
        moh_children = _query_children_in_scope(moh_scope)
        total = len(moh_children)
        sam = sum(1 for c in moh_children if _risk_sam(c.current_risk_level))
        mam = sum(1 for c in moh_children if _risk_mam(c.current_risk_level))
        normal = sum(1 for c in moh_children if _risk_normal(c.current_risk_level))
        clinic_performance.append({
            "clinic_name": moh.name or f"MOH {moh.id}",
            "district": moh.district or moh.province or "—",
            "total": total,
            "sam": sam,
            "mam": mam,
            "normal": normal,
            "status": "Active",
        })
    clinic_performance.sort(key=lambda x: -x["total"])

    # Predicted risk from latest measurement per child (national)
    from sqlalchemy import func as sql_func, and_ as sql_and
    predicted_sam_count = 0
    predicted_mam_count = 0
    all_child_ids = [c.id for c in all_children]
    if all_child_ids:
        latest_subq = (
            db.session.query(
                Measurement.child_id,
                sql_func.max(Measurement.measurement_date).label("max_date"),
            )
            .filter(Measurement.child_id.in_(all_child_ids))
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
            "total_children": total_children,
            "total_workers": total_workers,
            "total_clinics": total_clinics,
            "sam_count": sam_count,
            "mam_count": mam_count,
            "normal_count": normal_count,
            "predicted_sam_count": predicted_sam_count,
            "predicted_mam_count": predicted_mam_count,
            "district_breakdown": district_breakdown,
            "monthly_trend": monthly_trend,
            "clinic_performance": clinic_performance,
        },
    }), 200


def _get_child_area_ids(area_id: int) -> list:
    """Recursively get all child area IDs (MOH and PHM areas under RDHS)"""
    area_ids = []
    children = db.session.query(Area).filter(
        Area.parent_id == area_id,
        Area.is_active == True
    ).all()
    
    for child in children:
        area_ids.append(child.id)
        # Recursively get grandchildren
        area_ids.extend(_get_child_area_ids(child.id))
    
    return area_ids
