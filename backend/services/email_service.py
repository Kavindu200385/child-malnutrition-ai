from __future__ import annotations

import re
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from pathlib import Path

from flask import current_app

from backend.utils.audit import log_audit


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
LOGO_CID = "cmras-logo@cmras.local"
LOGO_PATH = Path(__file__).resolve().parents[2] / "frontend" / "public" / "logo-white-favicon-128.png"


@dataclass
class EmailResult:
    ok: bool
    message: str
    message_id: str | None = None


def _enabled(name: str) -> bool:
    return bool(current_app.config.get(name, False))


def _valid_email(email: str | None) -> bool:
    return bool(email and EMAIL_RE.match(email.strip()))


def _escape(value: str | None) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _strip_html(value: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", value or "", flags=re.IGNORECASE)
    text = re.sub(r"</(p|div|h1|h2|h3|li|tr)>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _sender_email() -> str:
    return (current_app.config.get("SMTP_SENDER_EMAIL") or current_app.config.get("SMTP_USERNAME") or "").strip()


def _sender_name() -> str:
    return (current_app.config.get("SMTP_SENDER_NAME") or "CMRAS").strip()


def _sender_header() -> str:
    sender_email = _sender_email()
    return formataddr((_sender_name(), sender_email)) if sender_email else ""


def _detail_row(label: str, value: str | None, *, last: bool = False) -> str:
    if not value:
        value = "-"
    border = "0" if last else "1px solid #e5e7eb"
    return f"""
      <tr>
        <td style="padding:11px 12px;border-bottom:{border};color:#64748b;font-size:13px;width:38%;vertical-align:top">{_escape(label)}</td>
        <td style="padding:11px 12px;border-bottom:{border};color:#0f172a;font-size:14px;font-weight:600;vertical-align:top">{_escape(value)}</td>
      </tr>
    """


def _button(label: str, url: str | None) -> str:
    if not url:
        return ""
    return f"""
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 6px">
        <tr>
          <td style="background:#2563eb;border-radius:10px">
            <a href="{_escape(url)}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px">
              {_escape(label)}
            </a>
          </td>
        </tr>
      </table>
    """


def _logo_img_html() -> str:
    if not LOGO_PATH.exists():
        return _logo_fallback_html()
    return (
        f'<img src="cid:{LOGO_CID}" alt="" width="56" height="56" '
        'style="display:block;width:56px;height:56px;border:0;outline:none;text-decoration:none">'
    )


def _logo_fallback_html() -> str:
    return (
        '<div style="width:56px;height:56px;line-height:56px;text-align:center;border-radius:14px;'
        'background:#ffffff;color:#2563eb;font-size:18px;font-weight:800">CM</div>'
    )


def _email_shell(title: str, subtitle: str, body: str, accent: str = "#2563eb") -> str:
    return f"""<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;width:100%">
    <center style="width:100%;background:#f3f6fb">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f3f6fb;margin:0;padding:28px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" align="center" style="width:640px;max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;margin:0 auto">
            <tr>
              <td style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:22px 28px">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;width:74px">
                      {_logo_img_html()}
                    </td>
                    <td style="vertical-align:middle">
                      <div style="color:#ffffff;font-size:24px;font-weight:800;line-height:1.15">CMRAS</div>
                      <div style="padding-top:5px;color:#dbeafe;font-size:13px;line-height:1.45;font-weight:600">
                        Child Malnutrition Risk Assessment System
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px">
                <div style="height:4px;width:56px;background:{accent};border-radius:999px;margin-bottom:18px"></div>
                <h1 style="margin:0 0 8px;color:#0f172a;font-size:24px;line-height:1.25">{_escape(title)}</h1>
                <p style="margin:0 0 22px;color:#64748b;font-size:15px;line-height:1.6">{_escape(subtitle)}</p>
                {body}
              </td>
            </tr>
            <tr>
              <td style="background:#f8fafc;padding:18px 28px;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;line-height:1.5">
                <strong style="color:#334155">CMRAS</strong><br>
                This is an automated message from the Child Malnutrition Risk Assessment System. Please do not reply to this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    </center>
  </body>
</html>"""


def _smtp_send(message: EmailMessage) -> str | None:
    host = (current_app.config.get("SMTP_HOST") or "").strip()
    port = int(current_app.config.get("SMTP_PORT") or 587)
    username = (current_app.config.get("SMTP_USERNAME") or "").strip()
    password = _smtp_password()
    use_tls = bool(current_app.config.get("SMTP_USE_TLS", True))

    if not host or not username or not password:
        raise RuntimeError("SMTP credentials are not configured.")

    with smtplib.SMTP(host, port, timeout=20) as smtp:
        smtp.ehlo()
        if use_tls:
            smtp.starttls()
            smtp.ehlo()
        smtp.login(username, password)
        response = smtp.send_message(message)

    if response:
        raise RuntimeError(f"SMTP rejected recipients: {response}")
    return message.get("Message-ID")


def _attach_logo(message: EmailMessage) -> None:
    if not LOGO_PATH.exists():
        return
    payload = message.get_payload()
    if not isinstance(payload, list) or not payload:
        return

    html_part = payload[-1]
    html_part.add_related(
        LOGO_PATH.read_bytes(),
        maintype="image",
        subtype="png",
        cid=f"<{LOGO_CID}>",
        disposition="inline",
    )
    related_payload = html_part.get_payload()
    if isinstance(related_payload, list) and related_payload:
        logo_part = related_payload[-1]
        logo_part["Content-Location"] = "cmras-logo.png"
        logo_part["X-Attachment-Id"] = LOGO_CID


def _smtp_password() -> str:
    password = str(current_app.config.get("SMTP_PASSWORD") or "")
    host = str(current_app.config.get("SMTP_HOST") or "").lower()
    if "gmail.com" in host:
        # Google app passwords are 16 ASCII characters. Copy/paste often brings
        # normal spaces or non-breaking spaces between the four-character groups.
        return re.sub(r"\s+", "", password)
    return password.strip()


def send_email(to: str, subject: str, html_body: str, text_body: str | None = None, *, audit_context: dict | None = None) -> EmailResult:
    """
    Send an email through the configured SMTP provider. Never logs credentials or OTP values.
    """
    audit_context = audit_context or {}
    recipient = (to or "").strip()

    if not _enabled("EMAIL_ENABLED"):
        return EmailResult(False, "Email service is disabled.")
    if current_app.config.get("EMAIL_PROVIDER", "smtp") != "smtp":
        return EmailResult(False, "Unsupported email provider. Set EMAIL_PROVIDER=smtp.")
    if not _valid_email(recipient):
        return EmailResult(False, "Invalid recipient email address.")

    sender_email = _sender_email()
    sender = _sender_header()
    if not sender_email or not sender:
        return EmailResult(False, "SMTP sender email is not configured.")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = recipient
    message["Message-ID"] = make_msgid(domain=(sender_email.split("@", 1)[1] if "@" in sender_email else None))
    message.set_content(text_body or _strip_html(html_body))
    message.add_alternative(html_body, subtype="html")
    _attach_logo(message)

    try:
        message_id = _smtp_send(message)
        log_audit(
            action_type="EMAIL_SENT",
            action_category="NOTIFICATIONS",
            entity_type="email",
            status="SUCCESS",
            description=f"Email sent: {subject}",
            metadata={
                "provider": "smtp",
                "recipient": recipient,
                "message_id": message_id,
                **audit_context,
            },
        )
        return EmailResult(True, "Email sent.", message_id=message_id)
    except Exception as exc:
        log_audit(
            action_type="EMAIL_FAILED",
            action_category="NOTIFICATIONS",
            entity_type="email",
            status="FAILED",
            description=f"Email failed: {subject}",
            metadata={
                "provider": "smtp",
                "recipient": recipient,
                "error": exc.__class__.__name__,
                **audit_context,
            },
        )
        return EmailResult(False, str(exc))


def send_otp_email(user_email: str, otp_code: str, expiry_minutes: int) -> EmailResult:
    subject = "Your CMRAS login verification code"
    html = _email_shell(
        "Login Verification",
        "Use this one-time verification code to complete your CMRAS sign in.",
        f"""
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:20px;text-align:center;margin:8px 0 20px">
          <div style="color:#1e40af;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Verification Code</div>
          <div style="font-size:34px;letter-spacing:8px;color:#0f172a;font-weight:800">{_escape(otp_code)}</div>
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:12px;border-collapse:separate;overflow:hidden;margin-bottom:18px">
          {_detail_row("Purpose", "Secure login verification")}
          {_detail_row("Expiry", f"{expiry_minutes} minutes", last=True)}
        </table>
        <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6">If you did not request this login, contact your system administrator.</p>
        """,
        accent="#2563eb",
    )
    text = f"CMRAS login verification code: {otp_code}. This code expires in {expiry_minutes} minutes."
    return send_email(user_email, subject, html, text, audit_context={"email_type": "login_otp"})


def send_notification_email(user_email: str, title: str, message: str, priority: str, action_url: str | None = None) -> EmailResult:
    if not _enabled("EMAIL_NOTIFICATIONS_ENABLED"):
        return EmailResult(False, "Email notifications are disabled.")

    priority_color = {
        "critical": "#dc2626",
        "high": "#ea580c",
        "medium": "#ca8a04",
        "low": "#16a34a",
    }.get((priority or "").lower(), "#2563eb")
    html = _email_shell(
        title,
        "A system notification has been created for your attention.",
        f"""
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:12px;border-collapse:separate;overflow:hidden;margin-bottom:18px">
          {_detail_row("Priority", priority)}
          {_detail_row("Message", message)}
          {_detail_row("Action", "Open CMRAS and review the related record", last=True)}
        </table>
        {_button("Open CMRAS", action_url)}
        """,
        accent=priority_color,
    )
    text = f"{title}\nPriority: {priority}\n{message}"
    return send_email(user_email, f"CMRAS notification: {title}", html, text, audit_context={"email_type": "notification", "priority": priority})


def send_user_created_email(user_email: str, username: str, role: str, setup_link: str | None = None) -> EmailResult:
    html = _email_shell(
        "CMRAS Account Created",
        "Your system account has been created by an administrator.",
        f"""
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:12px;border-collapse:separate;overflow:hidden;margin-bottom:18px">
          {_detail_row("Username", username)}
          {_detail_row("Role", role)}
          {_detail_row("System", "CMRAS")}
          {_detail_row("Next step", "Sign in using credentials provided by your administrator", last=True)}
        </table>
        <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.6">Your account is ready for authorized system access.</p>
        {_button("Open CMRAS", setup_link)}
        """,
        accent="#16a34a",
    )
    text = f"Your CMRAS account has been created.\nUsername: {username}\nRole: {role}"
    return send_email(user_email, "Your CMRAS account has been created", html, text, audit_context={"email_type": "user_created", "username": username, "role": role})


def send_child_registered_email(
    guardian_email: str,
    child_name: str | None,
    child_identifier: str | None,
    guardian_name: str | None = None,
) -> EmailResult:
    child_label = child_name or child_identifier or "your child"
    greeting = f"Dear {_escape(guardian_name)}," if guardian_name else "Dear parent/guardian,"
    html = _email_shell(
        "Child Registration Confirmed",
        "A child record has been registered in the Child Malnutrition Risk Assessment System.",
        f"""
        <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6">{greeting}</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:12px;border-collapse:separate;overflow:hidden;margin-bottom:18px">
          {_detail_row("Child", child_label)}
          {_detail_row("Child ID", child_identifier)}
          {_detail_row("Registration status", "Registered in CMRAS")}
          {_detail_row("Follow-up", "Health team may send nutrition monitoring updates", last=True)}
        </table>
        <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6">You may receive important health follow-up notifications from the care team.</p>
        """,
        accent="#0891b2",
    )
    text = (
        "Child registration confirmed in CMRAS.\n"
        f"Child: {child_label}\n"
        f"Child ID: {child_identifier or '-'}\n"
        "You may receive important health follow-up notifications from the care team."
    )
    return send_email(
        guardian_email,
        "CMRAS child registration confirmation",
        html,
        text,
        audit_context={"email_type": "child_registered", "child_identifier": child_identifier},
    )


def send_child_event_email(
    guardian_email: str | None,
    child_name: str | None,
    child_identifier: str | None,
    event_title: str,
    event_summary: str,
    guardian_name: str | None = None,
    details: dict[str, str | None] | None = None,
) -> EmailResult:
    """
    Send parent/guardian updates for important child-care workflow events.
    This is intentionally separate from staff in-app notifications.
    """
    child_label = child_name or child_identifier or "your child"
    greeting = f"Dear {_escape(guardian_name)}," if guardian_name else "Dear parent/guardian,"
    rows = [
        _detail_row("Child", child_label),
        _detail_row("Child ID", child_identifier),
        _detail_row("Update", event_title),
    ]
    for label, value in (details or {}).items():
        rows.append(_detail_row(label, value))
    rows.append(_detail_row("Message", event_summary, last=True))

    html = _email_shell(
        event_title,
        "A child health record update has been recorded in CMRAS.",
        f"""
        <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6">{greeting}</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:12px;border-collapse:separate;overflow:hidden;margin-bottom:18px">
          {''.join(rows)}
        </table>
        <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6">For clinical guidance or urgent questions, please contact your assigned health worker or clinic.</p>
        """,
        accent="#2563eb",
    )
    details_text = "\n".join(f"{label}: {value or '-'}" for label, value in (details or {}).items())
    text = (
        f"{event_title}\n"
        f"Child: {child_label}\n"
        f"Child ID: {child_identifier or '-'}\n"
        f"{details_text}\n"
        f"Message: {event_summary}"
    ).strip()
    return send_email(
        guardian_email or "",
        f"CMRAS update: {event_title}",
        html,
        text,
        audit_context={
            "email_type": "guardian_child_event",
            "child_identifier": child_identifier,
            "event_title": event_title,
        },
    )
