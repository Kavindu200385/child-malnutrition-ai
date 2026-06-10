from __future__ import annotations

import re
from dataclasses import dataclass
from email.utils import formataddr

from flask import current_app

from backend.utils.audit import log_audit


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass
class EmailResult:
    ok: bool
    message: str
    message_id: str | None = None


def _enabled(name: str) -> bool:
    return bool(current_app.config.get(name, False))


def _sender() -> str:
    sender_email = current_app.config.get("AWS_SES_SENDER_EMAIL")
    sender_name = current_app.config.get("AWS_SES_SENDER_NAME", "CMRAS")
    return formataddr((sender_name, sender_email)) if sender_email else ""


def _client():
    try:
        import boto3
    except ImportError as exc:
        raise RuntimeError("boto3 is not installed. Install backend requirements.") from exc

    access_key = current_app.config.get("AWS_SES_ACCESS_KEY_ID")
    secret_key = current_app.config.get("AWS_SES_SECRET_ACCESS_KEY")
    region = current_app.config.get("AWS_REGION", "ap-southeast-1")
    if not access_key or not secret_key:
        raise RuntimeError("AWS SES credentials are not configured.")

    return boto3.client(
        "ses",
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )


def _valid_email(email: str | None) -> bool:
    return bool(email and EMAIL_RE.match(email.strip()))


def send_email(to: str, subject: str, html_body: str, text_body: str | None = None, *, audit_context: dict | None = None) -> EmailResult:
    """
    Send an email via AWS SES. Never logs credentials or OTP values.
    """
    audit_context = audit_context or {}
    recipient = (to or "").strip()

    if not _enabled("EMAIL_ENABLED"):
        return EmailResult(False, "Email service is disabled.")
    if not _valid_email(recipient):
        return EmailResult(False, "Invalid recipient email address.")

    sender = _sender()
    if not sender:
        return EmailResult(False, "AWS SES sender email is not configured.")

    try:
        response = _client().send_email(
            Source=sender,
            Destination={"ToAddresses": [recipient]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Html": {"Data": html_body, "Charset": "UTF-8"},
                    "Text": {"Data": text_body or _strip_html(html_body), "Charset": "UTF-8"},
                },
            },
        )
        message_id = response.get("MessageId")
        log_audit(
            action_type="EMAIL_SENT",
            action_category="NOTIFICATIONS",
            entity_type="email",
            status="SUCCESS",
            description=f"Email sent: {subject}",
            metadata={
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
                "recipient": recipient,
                "error": exc.__class__.__name__,
                **audit_context,
            },
        )
        return EmailResult(False, str(exc))


def send_otp_email(user_email: str, otp_code: str, expiry_minutes: int) -> EmailResult:
    subject = "Your CMRAS login verification code"
    html = f"""
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      <h2>CMRAS Login Verification</h2>
      <p>Use this one-time verification code to complete your sign in:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:18px 0">{otp_code}</p>
      <p>This code expires in {expiry_minutes} minutes.</p>
      <p>If you did not request this login, contact your system administrator.</p>
    </div>
    """
    text = f"CMRAS login verification code: {otp_code}. This code expires in {expiry_minutes} minutes."
    return send_email(user_email, subject, html, text, audit_context={"email_type": "login_otp"})


def send_notification_email(user_email: str, title: str, message: str, priority: str, action_url: str | None = None) -> EmailResult:
    if not _enabled("EMAIL_NOTIFICATIONS_ENABLED"):
        return EmailResult(False, "Email notifications are disabled.")
    action_html = f'<p><a href="{action_url}">Open CMRAS</a></p>' if action_url else ""
    html = f"""
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      <h2>{_escape(title)}</h2>
      <p><strong>Priority:</strong> {_escape(priority)}</p>
      <p>{_escape(message)}</p>
      {action_html}
    </div>
    """
    return send_email(user_email, f"CMRAS notification: {title}", html, f"{title}\nPriority: {priority}\n{message}", audit_context={"email_type": "notification", "priority": priority})


def send_user_created_email(user_email: str, username: str, role: str, setup_link: str | None = None) -> EmailResult:
    action_html = f'<p><a href="{setup_link}">Open CMRAS</a></p>' if setup_link else ""
    html = f"""
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      <h2>Your CMRAS account has been created</h2>
      <p><strong>Username:</strong> {_escape(username)}</p>
      <p><strong>Role:</strong> {_escape(role)}</p>
      <p>Please sign in using the credentials provided by your administrator.</p>
      {action_html}
    </div>
    """
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
    html = f"""
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      <h2>Child registration confirmed in CMRAS</h2>
      <p>{greeting}</p>
      <p>{_escape(child_label)} has been registered in the Child Malnutrition Risk Assessment System.</p>
      <p><strong>Child ID:</strong> {_escape(child_identifier)}</p>
      <p>You may receive important health follow-up notifications from the care team.</p>
    </div>
    """
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


def _strip_html(value: str) -> str:
    return re.sub(r"<[^>]+>", "", value or "").strip()


def _escape(value: str | None) -> str:
    return (value or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
