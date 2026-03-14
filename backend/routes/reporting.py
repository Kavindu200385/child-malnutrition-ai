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
from backend.extensions import db
from backend.models_hierarchical import (
    Child,
    Visit,
    Area,
    Report,
    RiskLevel,
    ChildTransfer,
    User,
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
    
    # Date filters
    date_filter = None
    if start_date or end_date:
        if start_date:
            try:
                start = datetime.fromisoformat(start_date).date()
            except:
                start = None
        else:
            start = None
        
        if end_date:
            try:
                end = datetime.fromisoformat(end_date).date()
            except:
                end = None
        else:
            end = None
        
        if start or end:
            date_filter = (start, end)
    
    # Get children in district: by assigned area OR by district_id (e.g. nutritionist-referred, repair)
    if child_area_ids:
        district_cond = or_(Child.district_id == target_area.id, Child.current_assigned_area_id.in_(child_area_ids))
    else:
        district_cond = Child.district_id == target_area.id
    children_query = db.session.query(Child).filter(
        district_cond,
        Child.is_draft == False,
        Child.status == "ACTIVE"
    )
    
    if date_filter:
        start, end = date_filter
        if start:
            children_query = children_query.filter(Child.registration_date >= datetime.combine(start, datetime.min.time()))
        if end:
            children_query = children_query.filter(Child.registration_date <= datetime.combine(end, datetime.max.time()))
    
    children = children_query.all()
    
    # Calculate statistics
    total_children = len(children)
    risk_distribution = {
        "NORMAL": len([c for c in children if c.current_risk_level == RiskLevel.NORMAL]),
        "MODERATE": len([c for c in children if c.current_risk_level == RiskLevel.MODERATE]),
        "HIGH": len([c for c in children if c.current_risk_level == RiskLevel.HIGH]),
        "CRITICAL": len([c for c in children if c.current_risk_level == RiskLevel.CRITICAL]),
    }
    
    # Get visits in date range
    visits_query = db.session.query(Visit).filter(
        Visit.child_id_fk.in_([c.id for c in children])
    )
    if date_filter:
        start, end = date_filter
        if start:
            visits_query = visits_query.filter(Visit.visit_date >= datetime.combine(start, datetime.min.time()))
        if end:
            visits_query = visits_query.filter(Visit.visit_date <= datetime.combine(end, datetime.max.time()))
    
    total_visits = visits_query.count()
    
    # Worker performance (simplified - count children per worker)
    from backend.models_hierarchical import WorkerAreaMapping
    workers = db.session.query(User).join(
        WorkerAreaMapping,
        User.id == WorkerAreaMapping.user_id,
    ).filter(
        WorkerAreaMapping.area_id.in_(child_area_ids),
        WorkerAreaMapping.is_active == True,
        User.is_active == True,
    ).all()
    
    worker_stats = []
    for worker in workers:
        worker_children = [c for c in children if c.current_assigned_user_id == worker.id]
        worker_stats.append({
            "worker_id": worker.id,
            "worker_name": worker.name,
            "role": worker.role,
            "children_count": len(worker_children),
            "visits_count": db.session.query(Visit).filter(
                Visit.child_id_fk.in_([c.id for c in worker_children]),
                Visit.created_by_user_id == worker.id
            ).count() if worker_children else 0,
        })
    
    # Transfer statistics
    transfers = db.session.query(ChildTransfer).filter(
        ChildTransfer.to_area_id.in_(child_area_ids),
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
    
    # Date filters
    date_filter = None
    if start_date or end_date:
        if start_date:
            try:
                start = datetime.fromisoformat(start_date).date()
            except:
                start = None
        else:
            start = None
        
        if end_date:
            try:
                end = datetime.fromisoformat(end_date).date()
            except:
                end = None
        else:
            end = None
        
        if start or end:
            date_filter = (start, end)
    
    # District comparison: include children by district_id or by assigned area under district
    district_comparison = []
    for district in all_districts:
        child_area_ids = _get_child_area_ids(district.id)
        if child_area_ids:
            district_cond = or_(Child.district_id == district.id, Child.current_assigned_area_id.in_(child_area_ids))
        else:
            district_cond = Child.district_id == district.id
        children_query = db.session.query(Child).filter(
            district_cond,
            Child.is_draft == False,
            Child.status == "ACTIVE"
        )
        
        if date_filter:
            start, end = date_filter
            if start:
                children_query = children_query.filter(Child.registration_date >= datetime.combine(start, datetime.min.time()))
            if end:
                children_query = children_query.filter(Child.registration_date <= datetime.combine(end, datetime.max.time()))
        
        children = children_query.all()
        
        risk_dist = {
            "NORMAL": len([c for c in children if c.current_risk_level == RiskLevel.NORMAL]),
            "MODERATE": len([c for c in children if c.current_risk_level == RiskLevel.MODERATE]),
            "HIGH": len([c for c in children if c.current_risk_level == RiskLevel.HIGH]),
            "CRITICAL": len([c for c in children if c.current_risk_level == RiskLevel.CRITICAL]),
        }
        
        district_comparison.append({
            "district_id": district.id,
            "district_name": district.name,
            "total_children": len(children),
            "risk_distribution": risk_dist,
        })
    
    # Provincial totals: include children by province_id, district_id, or assigned area under province
    all_child_area_ids = []
    for district in all_districts:
        all_child_area_ids.extend(_get_child_area_ids(district.id))
    province_ids = [p.id for p in pdhs_areas]
    district_ids = [d.id for d in all_districts]
    if all_child_area_ids:
        provincial_cond = or_(
            Child.province_id.in_(province_ids),
            Child.district_id.in_(district_ids),
            Child.current_assigned_area_id.in_(all_child_area_ids),
        )
    else:
        provincial_cond = or_(Child.province_id.in_(province_ids), Child.district_id.in_(district_ids))
    children_query = db.session.query(Child).filter(
        provincial_cond,
        Child.is_draft == False,
        Child.status == "ACTIVE"
    )
    
    if date_filter:
        start, end = date_filter
        if start:
            children_query = children_query.filter(Child.registration_date >= datetime.combine(start, datetime.min.time()))
        if end:
            children_query = children_query.filter(Child.registration_date <= datetime.combine(end, datetime.max.time()))
    
    all_children = children_query.all()
    
    provincial_summary = {
        "total_children": len(all_children),
        "total_districts": len(all_districts),
        "risk_distribution": {
            "NORMAL": len([c for c in all_children if c.current_risk_level == RiskLevel.NORMAL]),
            "MODERATE": len([c for c in all_children if c.current_risk_level == RiskLevel.MODERATE]),
            "HIGH": len([c for c in all_children if c.current_risk_level == RiskLevel.HIGH]),
            "CRITICAL": len([c for c in all_children if c.current_risk_level == RiskLevel.CRITICAL]),
        },
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
    
    # Get all active children
    children_query = db.session.query(Child).filter(
        Child.is_draft == False,
        Child.status == "ACTIVE"
    )
    
    # Date filters
    if start_date:
        try:
            start = datetime.fromisoformat(start_date).date()
            children_query = children_query.filter(Child.registration_date >= datetime.combine(start, datetime.min.time()))
        except:
            pass
    
    if end_date:
        try:
            end = datetime.fromisoformat(end_date).date()
            children_query = children_query.filter(Child.registration_date <= datetime.combine(end, datetime.max.time()))
        except:
            pass
    
    all_children = children_query.all()
    
    # National summary
    national_summary = {
        "total_children": len(all_children),
        "risk_distribution": {
            "NORMAL": len([c for c in all_children if c.current_risk_level == RiskLevel.NORMAL]),
            "MODERATE": len([c for c in all_children if c.current_risk_level == RiskLevel.MODERATE]),
            "HIGH": len([c for c in all_children if c.current_risk_level == RiskLevel.HIGH]),
            "CRITICAL": len([c for c in all_children if c.current_risk_level == RiskLevel.CRITICAL]),
        },
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
        # Include children by province_id, district_id, or assigned area under province
        province_children = [
            c for c in all_children
            if c.province_id == province.id
            or (c.district_id and c.district_id in district_ids)
            or (c.current_assigned_area_id and c.current_assigned_area_id in all_child_area_ids)
        ]
        
        province_comparison.append({
            "province_id": province.id,
            "province_name": province.name,
            "total_children": len(province_children),
            "risk_distribution": {
                "NORMAL": len([c for c in province_children if c.current_risk_level == RiskLevel.NORMAL]),
                "MODERATE": len([c for c in province_children if c.current_risk_level == RiskLevel.MODERATE]),
                "HIGH": len([c for c in province_children if c.current_risk_level == RiskLevel.HIGH]),
                "CRITICAL": len([c for c in province_children if c.current_risk_level == RiskLevel.CRITICAL]),
            },
        })
    
    # AI Prediction Analytics
    # Get recent visits with predictions
    recent_visits = db.session.query(Visit).filter(
        Visit.predicted_risk_next_2_months.isnot(None)
    ).order_by(Visit.visit_date.desc()).limit(1000).all()
    
    prediction_analytics = {
        "total_predictions": len(recent_visits),
        "prediction_distribution": {
            "Low": len([v for v in recent_visits if v.predicted_risk_next_2_months == "Low"]),
            "Moderate": len([v for v in recent_visits if v.predicted_risk_next_2_months == "Moderate"]),
            "High": len([v for v in recent_visits if v.predicted_risk_next_2_months == "High"]),
            "Severe": len([v for v in recent_visits if v.predicted_risk_next_2_months == "Severe"]),
        },
        "average_confidence": round(
            sum([v.model_confidence for v in recent_visits if v.model_confidence]) / len([v for v in recent_visits if v.model_confidence]),
            3
        ) if recent_visits else 0,
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


def _risk_sam(r):
    """Count as SAM: SAM or CRITICAL"""
    v = (r or "").upper()
    return v in ("SAM", "CRITICAL")


def _risk_mam(r):
    """Count as MAM: MAM, MODERATE, HIGH"""
    v = (r or "").upper()
    return v in ("MAM", "MODERATE", "HIGH")


def _risk_normal(r):
    """Count as Normal: NORMAL"""
    return (r or "").upper() == "NORMAL"


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
    total_workers = db.session.query(User).filter(User.role.in_(worker_roles)).count()

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
        district_children = [
            c for c in all_children
            if (c.district_id == rdhs.id) or (c.current_assigned_area_id and c.current_assigned_area_id in child_area_ids)
        ]
        total = len(district_children)
        if total == 0 and len([c for c in all_children if c.district_id == rdhs.id]) == 0:
            # Optionally include districts with no children for full map
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
        moh_children = [c for c in all_children if c.moh_area_id == moh.id]
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

    return jsonify({
        "status": "success",
        "data": {
            "total_children": total_children,
            "total_workers": total_workers,
            "total_clinics": total_clinics,
            "sam_count": sam_count,
            "mam_count": mam_count,
            "normal_count": normal_count,
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
