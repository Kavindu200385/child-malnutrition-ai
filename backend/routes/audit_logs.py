import csv
import io
import json
import textwrap
import zipfile
from datetime import datetime, time
from functools import wraps
from xml.sax.saxutils import escape as xml_escape

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import asc, desc, func, or_

from backend.extensions import db
from backend.auth_utils_hierarchical import get_current_user
from backend.models_hierarchical import AuditLog, UserRole
from backend.utils.audit import log_audit

bp = Blueprint("audit_logs", __name__, url_prefix="/api/audit-logs")

AUDIT_VIEW_ROLES = {UserRole.SUPERADMIN.value, UserRole.ADMIN.value}
EXPORT_ROLES = {UserRole.SUPERADMIN.value}

ALLOWED_SORT_FIELDS = {
    "timestamp": AuditLog.timestamp,
    "username": AuditLog.username,
    "role": AuditLog.role,
    "action_type": AuditLog.action_type,
    "action_category": AuditLog.action_category,
    "status": AuditLog.status,
    "entity_type": AuditLog.entity_type,
}

DUMMY_AUDIT_PATTERNS = [
    "%dummy%",
    "%demo%",
    "%sample%",
    "%test%",
    "%audit_tmp%",
]


def audit_role_required(export: bool = False):
    def decorator(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            user = get_current_user()
            can_view = bool(
                user
                and (
                    user.role in AUDIT_VIEW_ROLES
                    or user.role == UserRole.HEALTH_MINISTRY.value
                )
            )
            can_export = bool(
                user
                and (
                    user.role in EXPORT_ROLES
                    or (user.role == UserRole.HEALTH_MINISTRY.value and user.is_protected)
                )
            )
            if not user or (export and not can_export) or (not export and not can_view):
                message = "Access denied. Only Superadmin can export audit logs." if export else "Access denied. Only Admin or Superadmin can view audit logs."
                return jsonify({"status": "error", "message": message}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def _parse_datetime(value: str | None, end_of_day: bool = False):
    if not value:
        return None
    raw = value.strip()
    try:
        if len(raw) == 10:
            parsed = datetime.fromisoformat(raw)
            return datetime.combine(parsed.date(), time.max if end_of_day else time.min)
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _base_audit_query(req_args):
    query = db.session.query(AuditLog)
    if str(req_args.get("include_history", "")).lower() not in {"1", "true", "yes"}:
        query = query.filter(AuditLog.timestamp >= datetime.combine(datetime.utcnow().date(), time.min))
    if str(req_args.get("include_dummy", "")).lower() in {"1", "true", "yes"}:
        return query

    query = query.filter(
        ~(
            (func.lower(func.coalesce(AuditLog.action_type, "")).in_(["", "unknown"]))
            & (func.lower(func.coalesce(AuditLog.action_category, "")).in_(["", "system", "unknown"]))
        )
    )

    for pattern in DUMMY_AUDIT_PATTERNS:
        query = query.filter(
            AuditLog.username.is_(None) | ~AuditLog.username.ilike(pattern)
        )
        query = query.filter(
            AuditLog.description.is_(None) | ~AuditLog.description.ilike(pattern)
        )
    return query


def apply_filters(query, req_args):
    start_date = _parse_datetime(req_args.get("start_date"))
    end_date = _parse_datetime(req_args.get("end_date"), end_of_day=True)
    role = req_args.get("role")
    action_type = req_args.get("action_type")
    action_category = req_args.get("action_category")
    status = req_args.get("status")
    user_id = req_args.get("user_id", type=int)
    username = req_args.get("username")
    entity_type = req_args.get("entity_type")
    entity_id = req_args.get("entity_id", type=int)
    search = req_args.get("search")

    if start_date:
        query = query.filter(AuditLog.timestamp >= start_date)
    if end_date:
        query = query.filter(AuditLog.timestamp <= end_date)
    if role:
        query = query.filter(AuditLog.role == role)
    if action_type:
        query = query.filter(AuditLog.action_type == action_type)
    if action_category:
        query = query.filter(AuditLog.action_category == action_category)
    if status:
        query = query.filter(AuditLog.status == status)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if username:
        query = query.filter(AuditLog.username.ilike(f"%{username}%"))
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                AuditLog.username.ilike(like),
                AuditLog.role.ilike(like),
                AuditLog.action_type.ilike(like),
                AuditLog.action_category.ilike(like),
                AuditLog.description.ilike(like),
                AuditLog.entity_type.ilike(like),
                AuditLog.status.ilike(like),
            )
        )

    return query


def _ordered_query(query, req_args):
    sort_by = req_args.get("sort_by", "timestamp")
    sort_dir = req_args.get("sort_dir", "desc").lower()
    sort_column = ALLOWED_SORT_FIELDS.get(sort_by, AuditLog.timestamp)
    return query.order_by(asc(sort_column) if sort_dir == "asc" else desc(sort_column))


def _safe_per_page(value: int) -> int:
    return min(max(value or 50, 1), 200)


def _rows(logs):
    for log in logs:
        yield [
            log.id,
            log.timestamp.isoformat(sep=" ") if log.timestamp else "",
            log.user_id or "",
            log.username or "System",
            log.role or "",
            log.action_type or "",
            log.action_category or "",
            log.description or "",
            log.entity_type or "",
            log.entity_id or "",
            log.ip_address or "",
            log.user_agent or "",
            log.status or "",
            json.dumps(log.metadata_json or {}, ensure_ascii=False),
        ]


def _count_by(logs, attr: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for log in logs:
        value = getattr(log, attr, None) or "N/A"
        counts[str(value)] = counts.get(str(value), 0) + 1
    return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))


EXPORT_HEADERS = [
    "Audit ID",
    "Timestamp",
    "User ID",
    "Username",
    "Role",
    "Action Type",
    "Action Category",
    "Description",
    "Affected Entity Type",
    "Affected Entity ID",
    "IP Address",
    "User Agent",
    "Status",
    "Additional Metadata JSON",
]


def _xlsx_cell(value, row_index: int, col_index: int, style: int | None = None) -> str:
    col_name = ""
    n = col_index
    while n:
        n, remainder = divmod(n - 1, 26)
        col_name = chr(65 + remainder) + col_name
    cell_ref = f"{col_name}{row_index}"
    style = style if style is not None else (1 if row_index == 1 else 2)
    return f'<c r="{cell_ref}" s="{style}" t="inlineStr"><is><t>{xml_escape(str(value))}</t></is></c>'


def _xlsx_sheet(rows, *, widths: str, frozen_header: bool = True, auto_filter: bool = True) -> str:
    sheet_rows = []
    for row_index, values in enumerate(rows, start=1):
        cells = "".join(_xlsx_cell(value, row_index, col_index) for col_index, value in enumerate(values, start=1))
        sheet_rows.append(f'<row r="{row_index}">{cells}</row>')

    worksheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + ('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' if frozen_header else "")
        + widths
        + f"<sheetData>{''.join(sheet_rows)}</sheetData></worksheet>"
    )
    if auto_filter and len(rows) > 1:
        last_col = chr(64 + min(len(rows[0]), 26))
        worksheet = worksheet.replace(
            "</worksheet>",
            f'<autoFilter ref="A1:{last_col}{len(rows)}"/></worksheet>',
        )
    return worksheet


def _xlsx_response(logs) -> Response:
    logs = list(logs)
    detail_rows = [EXPORT_HEADERS, *list(_rows(logs))]
    summary_rows = [
        ["CMRAS Audit Logs Export", ""],
        ["Generated UTC", datetime.utcnow().isoformat(sep=" ", timespec="seconds")],
        ["Total Records", len(logs)],
        ["", ""],
        ["Status Summary", "Count"],
        *[[label, count] for label, count in _count_by(logs, "status").items()],
        ["", ""],
        ["Action Category Summary", "Count"],
        *[[label, count] for label, count in _count_by(logs, "action_category").items()],
        ["", ""],
        ["Role Summary", "Count"],
        *[[label, count] for label, count in _count_by(logs, "role").items()],
    ]
    summary_widths = (
        '<cols><col min="1" max="1" width="34" customWidth="1"/>'
        '<col min="2" max="2" width="22" customWidth="1"/></cols>'
    )
    detail_widths = (
        '<cols>'
        '<col min="1" max="1" width="10" customWidth="1"/>'
        '<col min="2" max="2" width="22" customWidth="1"/>'
        '<col min="3" max="3" width="10" customWidth="1"/>'
        '<col min="4" max="4" width="22" customWidth="1"/>'
        '<col min="5" max="5" width="18" customWidth="1"/>'
        '<col min="6" max="7" width="24" customWidth="1"/>'
        '<col min="8" max="8" width="60" customWidth="1"/>'
        '<col min="9" max="10" width="18" customWidth="1"/>'
        '<col min="11" max="11" width="18" customWidth="1"/>'
        '<col min="12" max="12" width="55" customWidth="1"/>'
        '<col min="13" max="13" width="14" customWidth="1"/>'
        '<col min="14" max="14" width="70" customWidth="1"/>'
        '</cols>'
    )
    summary_sheet = _xlsx_sheet(summary_rows, widths=summary_widths, frozen_header=False, auto_filter=False)
    details_sheet = _xlsx_sheet(detail_rows, widths=detail_widths)
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets>'
        '<sheet name="Summary" sheetId="1" r:id="rId1"/>'
        '<sheet name="Detailed Logs" sheetId="2" r:id="rId2"/>'
        '</sheets></workbook>'
    )
    styles = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E3A5F"/><bgColor indexed="64"/></patternFill></fill></fills>'
        '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9E2F3"/></left><right style="thin"><color rgb="FFD9E2F3"/></right><top style="thin"><color rgb="FFD9E2F3"/></top><bottom style="thin"><color rgb="FFD9E2F3"/></bottom><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="3">'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>'
        '</cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        '</styleSheet>'
    )

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>')
        archive.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        archive.writestr("xl/styles.xml", styles)
        archive.writestr("xl/worksheets/sheet1.xml", summary_sheet)
        archive.writestr("xl/worksheets/sheet2.xml", details_sheet)

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=audit_logs.xlsx"},
    )


def _pdf_escape(value) -> str:
    return str(value).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _simple_pdf_response(logs) -> Response:
    lines = [
        "CMRAS SYSTEM AUDIT LOGS",
        f"Generated: {datetime.utcnow().isoformat(sep=' ', timespec='seconds')} UTC",
        f"Records: {len(logs)}",
        "",
    ]
    for row in _rows(logs):
        entries = [
            f"Audit ID: {row[0]}",
            f"Timestamp: {row[1]}",
            f"User ID: {row[2]}",
            f"Username: {row[3]}",
            f"Role: {row[4]}",
            f"Action Type: {row[5]}",
            f"Action Category: {row[6]}",
            f"Status: {row[12]}",
            f"Affected Entity: {row[8]}:{row[9]}",
            f"IP Address: {row[10]}",
            f"User Agent: {row[11]}",
            f"Description: {row[7]}",
            f"Additional Metadata JSON: {row[13]}",
        ]
        for entry in entries:
            lines.extend(textwrap.wrap(entry, width=118, subsequent_indent="    ") or [""])
        lines.append("-" * 118)

    max_lines = 72
    page_lines = [lines[index:index + max_lines] for index in range(0, len(lines), max_lines)] or [[]]

    content_objects: list[bytes] = []
    for page in page_lines:
        text_commands = ["BT", "/F1 8 Tf", "40 805 Td"]
        for line_index, line in enumerate(page):
            if line_index:
                text_commands.append("0 -10 Td")
            text_commands.append(f"({_pdf_escape(line)}) Tj")
        text_commands.append("ET")
        stream = "\n".join(text_commands).encode("latin-1", "replace")
        content_objects.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")

    page_count = len(page_lines)
    font_object_id = 3
    page_object_ids = [4 + (i * 2) for i in range(page_count)]
    content_object_ids = [5 + (i * 2) for i in range(page_count)]
    kids = " ".join(f"{obj_id} 0 R" for obj_id in page_object_ids)

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{kids}] /Count {page_count} >>".encode(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    for content_id, content in zip(content_object_ids, content_objects):
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 {font_object_id} 0 R >> >> /Contents {content_id} 0 R >>".encode()
        )
        objects.append(content)
    output = io.BytesIO()
    output.write(b"%PDF-1.4\n")
    offsets = [0]
    for number, body in enumerate(objects, start=1):
        offsets.append(output.tell())
        output.write(f"{number} 0 obj\n".encode())
        output.write(body)
        output.write(b"\nendobj\n")
    xref_offset = output.tell()
    output.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        output.write(f"{offset:010d} 00000 n \n".encode())
    output.write(f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode())
    return Response(
        output.getvalue(),
        mimetype="application/pdf",
        headers={"Content-Disposition": "attachment; filename=audit_logs.pdf"},
    )
@bp.route("", methods=["GET"])
@audit_role_required()
def get_audit_logs():
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = _safe_per_page(request.args.get("per_page", 50, type=int))
    query = _ordered_query(apply_filters(_base_audit_query(request.args), request.args), request.args)

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    return jsonify(
        {
            "status": "success",
            "logs": [log.to_dict() for log in pagination.items],
            "total": pagination.total,
            "pages": pagination.pages,
            "current_page": page,
            "per_page": per_page,
        }
    ), 200


@bp.route("/dashboard", methods=["GET"])
@audit_role_required()
def get_audit_dashboard():
    today = datetime.utcnow().date()
    today_filter = func.date(AuditLog.timestamp) == today

    total_today = _base_audit_query(request.args).filter(today_filter).count()
    failed_logins = _base_audit_query(request.args).filter(
        today_filter,
        AuditLog.action_category == "AUTHENTICATION",
        AuditLog.action_type.in_(["LOGIN", "LOGIN_FAILURE", "LOGIN_FAILED"]),
        AuditLog.status == "FAILED",
    ).count()
    user_changes = _base_audit_query(request.args).filter(
        today_filter,
        AuditLog.action_category == "USER_MANAGEMENT",
    ).count()
    predictions = _base_audit_query(request.args).filter(
        today_filter,
        AuditLog.action_category == "AI_ML",
    ).count()

    return jsonify(
        {
            "status": "success",
            "dashboard": {
                "total_events_today": total_today,
                "failed_logins_today": failed_logins,
                "user_changes_today": user_changes,
                "prediction_events_today": predictions,
            },
        }
    ), 200


@bp.route("/filters", methods=["GET"])
@audit_role_required()
def get_filter_options():
    def values(column):
        return [
            value
            for (value,) in _base_audit_query(request.args).with_entities(column).filter(column.isnot(None)).distinct().order_by(column).all()
            if value
        ]

    return jsonify(
        {
            "status": "success",
            "filters": {
                "roles": values(AuditLog.role),
                "action_types": values(AuditLog.action_type),
                "action_categories": values(AuditLog.action_category),
                "statuses": values(AuditLog.status),
                "entity_types": values(AuditLog.entity_type),
            },
        }
    ), 200


@bp.route("/export", methods=["GET"])
@audit_role_required(export=True)
def export_audit_logs():
    format_type = request.args.get("format", "csv").lower()
    query = _ordered_query(apply_filters(_base_audit_query(request.args), request.args), request.args)
    logs = query.limit(10000).all()
    user = get_current_user()
    log_audit(
        action_type="AUDIT_LOGS_EXPORTED",
        action_category="REPORTS",
        entity_type="audit_logs",
        user_id=user.id if user else None,
        status="SUCCESS",
        description=f"Audit logs exported as {format_type}.",
        metadata={"format": format_type, "row_count": len(logs), "filters": dict(request.args)},
    )

    if format_type == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(EXPORT_HEADERS)
        writer.writerows(_rows(logs))
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
        )

    if format_type in {"xlsx", "excel"}:
        return _xlsx_response(logs)

    if format_type == "pdf":
        try:
            from backend.utils.audit_pdf_exporter import generate_audit_logs_pdf
        except ImportError:
            return _simple_pdf_response(logs)

        pdf_output = generate_audit_logs_pdf(logs)
        return Response(
            pdf_output,
            mimetype="application/pdf",
            headers={"Content-Disposition": "attachment; filename=audit_logs.pdf"},
        )

    return jsonify({"status": "error", "message": "Unsupported export format. Use csv, xlsx, or pdf."}), 400
