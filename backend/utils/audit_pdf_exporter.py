from __future__ import annotations

import io
import json
from datetime import datetime
from itertools import groupby

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _text(value) -> str:
    if value is None or value == "":
        return "-"
    return str(value)


def _metadata(value) -> str:
    if not value:
        return "-"
    try:
        return json.dumps(value, ensure_ascii=False, indent=2, default=str)
    except TypeError:
        return str(value)


def _timestamp(value) -> str:
    if not value:
        return "-"
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return str(value)


def _para(value, style):
    text = _text(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(text.replace("\n", "<br/>"), style)


def _count_by(logs, attr: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for log in logs:
        value = getattr(log, attr, None) or "N/A"
        counts[str(value)] = counts.get(str(value), 0) + 1
    return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))


def _summary_table(title: str, counts: dict[str, int], label_style, value_style):
    rows = [[_para(title, label_style), _para("Count", label_style)]]
    rows.extend([[_para(label, value_style), _para(count, value_style)] for label, count in counts.items()])
    table = Table(rows, colWidths=[60 * mm, 24 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E3A5F")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F8FAFC")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#64748B"))
    canvas.drawString(doc.leftMargin, 9 * mm, "CMRAS Audit Logs - Confidential")
    canvas.drawRightString(A4[0] - doc.rightMargin, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


def generate_audit_logs_pdf(logs) -> bytes:
    """
    Generate a detailed, readable audit log PDF.

    The PDF intentionally uses one structured block per audit event instead of a
    very wide table, so long descriptions, user agents, and metadata remain
    visible when opened or printed.
    """
    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=15 * mm,
        bottomMargin=16 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "AuditTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=20,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "AuditSubtitle",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#475569"),
        spaceAfter=10,
    )
    section_style = ParagraphStyle(
        "SectionTitle",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#1E3A5F"),
        spaceBefore=8,
        spaceAfter=6,
    )
    card_title_style = ParagraphStyle(
        "CardTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.white,
    )
    label_style = ParagraphStyle(
        "Label",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#334155"),
    )
    value_style = ParagraphStyle(
        "Value",
        parent=styles["Normal"],
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#0F172A"),
    )
    mono_style = ParagraphStyle(
        "MonoValue",
        parent=value_style,
        fontName="Courier",
        fontSize=6.5,
        leading=8.5,
        wordWrap="CJK",
    )

    logs = list(logs)
    story = [
        Paragraph("CMRAS System Audit Logs", title_style),
        Paragraph(
            f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC | "
            f"Records: {len(logs)} | Export includes all visible audit details.",
            subtitle_style,
        ),
    ]
    if logs:
        summary = Table(
            [[
                _summary_table("Status Summary", _count_by(logs, "status"), label_style, value_style),
                _summary_table("Action Category", _count_by(logs, "action_category"), label_style, value_style),
            ]],
            colWidths=[87 * mm, 87 * mm],
        )
        summary.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
        story.extend([summary, Spacer(1, 6 * mm)])

    if not logs:
        story.append(Paragraph("No audit logs matched the selected filters.", value_style))
    else:
        grouped_logs = sorted(logs, key=lambda item: (item.action_category or "N/A", item.timestamp or datetime.min), reverse=True)
        item_index = 0
        for category, category_logs in groupby(grouped_logs, key=lambda item: item.action_category or "N/A"):
            category_list = list(category_logs)
            story.append(Paragraph(f"{category} ({len(category_list)} events)", section_style))
            for log in category_list:
                item_index += 1
                header = Table(
                    [[_para(f"#{log.id}  {log.action_type or '-'}", card_title_style), _para(_timestamp(log.timestamp), card_title_style)]],
                    colWidths=[118 * mm, 56 * mm],
                )
                header.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#1E3A5F")),
                            ("BOX", (0, 0), (-1, -1), 0.25, colors.HexColor("#1E3A5F")),
                            ("LEFTPADDING", (0, 0), (-1, -1), 8),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                            ("TOPPADDING", (0, 0), (-1, -1), 6),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                        ]
                    )
                )

                details = [
                    ["User", f"{log.username or 'System'} (ID: {log.user_id or '-'})", "Role", log.role or "-"],
                    ["Category", log.action_category or "-", "Status", log.status or "-"],
                    ["Entity Type", log.entity_type or "-", "Entity ID", log.entity_id or "-"],
                    ["IP Address", log.ip_address or "-", "User Agent", log.user_agent or "-"],
                    ["Description", log.description or "-", "", ""],
                    ["Metadata JSON", _metadata(log.metadata_json), "", ""],
                ]
                rows = []
                for row in details:
                    if row[0] in {"Description", "Metadata JSON"}:
                        style = mono_style if row[0] == "Metadata JSON" else value_style
                        rows.append([_para(row[0], label_style), _para(row[1], style), "", ""])
                    else:
                        rows.append([
                            _para(row[0], label_style),
                            _para(row[1], value_style),
                            _para(row[2], label_style),
                            _para(row[3], value_style),
                        ])

                table = Table(rows, colWidths=[28 * mm, 61 * mm, 27 * mm, 58 * mm], repeatRows=0)
                table.setStyle(
                    TableStyle(
                        [
                            ("BOX", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5E1")),
                            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
                            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F8FAFC")),
                            ("BACKGROUND", (2, 0), (2, 3), colors.HexColor("#F8FAFC")),
                            ("SPAN", (1, 4), (3, 4)),
                            ("SPAN", (1, 5), (3, 5)),
                            ("LEFTPADDING", (0, 0), (-1, -1), 6),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                            ("TOPPADDING", (0, 0), (-1, -1), 5),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ]
                    )
                )

                story.extend([KeepTogether([header, table]), Spacer(1, 5 * mm)])
                if item_index % 4 == 0 and item_index != len(logs):
                    story.append(PageBreak())

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    output.seek(0)
    return output.getvalue()
