import io
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

def generate_audit_logs_pdf(logs) -> bytes:
    """
    Generates a structured PDF for extracted audit logs utilizing ReportLab
    """
    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=landscape(A4), rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
    
    styles = getSampleStyleSheet()
    title = Paragraph("System Audit Logs", styles['Title'])
    
    # Constructing the table headers
    data = [["ID", "Timestamp", "User", "Role", "Action Type", "Category", "Status", "Entity"]]
    
    for log in logs:
        data.append([
            str(log.id),
            log.timestamp.strftime("%Y-%m-%d %H:%M") if log.timestamp else "",
            log.username or "System",
            log.role or "N/A",
            log.action_type or "",
            log.action_category or "",
            log.status or "",
            f"{log.entity_type or ''}:{log.entity_id or ''}"
        ])
        
    table = Table(data, colWidths=[40, 100, 100, 80, 100, 100, 70, 90])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
    ]))
    
    doc.build([title, Spacer(1, 20), table])
    return output.getvalue()