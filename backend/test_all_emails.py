"""
Standalone AWS SES email template smoke tests for CMRAS.

This sends the main email types used by the app without importing or running
the Flask application.
"""
from __future__ import annotations

import os
from email.utils import formataddr
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError


DEFAULT_RECIPIENT_EMAIL = "kavindu2003sandaruwan@gmail.com"


def load_env(env_path: Path) -> None:
    if not env_path.exists():
        raise FileNotFoundError(f".env file not found: {env_path}")

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ[key.strip()] = value.strip().strip('"').strip("'")


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def send_email(ses, sender: str, recipient: str, subject: str, text_body: str, html_body: str) -> str:
    response = ses.send_email(
        Source=sender,
        Destination={"ToAddresses": [recipient]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {
                "Text": {"Data": text_body, "Charset": "UTF-8"},
                "Html": {"Data": html_body, "Charset": "UTF-8"},
            },
        },
    )
    return response.get("MessageId", "")


def main() -> int:
    env_path = Path(__file__).resolve().parent / ".env"
    try:
        load_env(env_path)

        region = required_env("AWS_REGION")
        access_key = required_env("AWS_SES_ACCESS_KEY_ID")
        secret_key = required_env("AWS_SES_SECRET_ACCESS_KEY")
        sender_email = required_env("AWS_SES_SENDER_EMAIL")
        sender_name = os.environ.get("AWS_SES_SENDER_NAME", "CMRAS").strip() or "CMRAS"
        recipient = os.environ.get("SES_TEST_RECIPIENT_EMAIL", DEFAULT_RECIPIENT_EMAIL).strip()
        sender = formataddr((sender_name, sender_email))

        print(f"SES region: {region}")
        print(f"SES sender: {sender_email}")
        print(f"SES recipient: {recipient}")

        ses = boto3.client(
            "ses",
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )

        emails = [
            {
                "name": "Login OTP",
                "subject": "Your CMRAS login verification code",
                "text": "CMRAS login verification code: 123456. This code expires in 5 minutes.",
                "html": """
                    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
                      <h2>CMRAS Login Verification</h2>
                      <p>Use this one-time verification code to complete your sign in:</p>
                      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:18px 0">123456</p>
                      <p>This code expires in 5 minutes.</p>
                      <p>If you did not request this login, contact your system administrator.</p>
                    </div>
                """,
            },
            {
                "name": "Notification Alert",
                "subject": "CMRAS notification: High priority child follow-up",
                "text": "High priority child follow-up\nPriority: high\nA child record requires review in CMRAS.",
                "html": """
                    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
                      <h2>High priority child follow-up</h2>
                      <p><strong>Priority:</strong> high</p>
                      <p>A child record requires review in CMRAS.</p>
                      <p><a href="http://localhost:3001">Open CMRAS</a></p>
                    </div>
                """,
            },
            {
                "name": "New User Created",
                "subject": "Your CMRAS account has been created",
                "text": "Your CMRAS account has been created.\nUsername: test_user\nRole: midwife",
                "html": """
                    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
                      <h2>Your CMRAS account has been created</h2>
                      <p><strong>Username:</strong> test_user</p>
                      <p><strong>Role:</strong> midwife</p>
                      <p>Please sign in using the credentials provided by your administrator.</p>
                    </div>
                """,
            },
            {
                "name": "Child Registration Confirmation",
                "subject": "CMRAS child registration confirmation",
                "text": (
                    "Child registration confirmed in CMRAS.\n"
                    "Child: Test Child\n"
                    "Child ID: MCH-TEST-000001\n"
                    "You may receive important health follow-up notifications from the care team."
                ),
                "html": """
                    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
                      <h2>Child registration confirmed in CMRAS</h2>
                      <p>Dear parent/guardian,</p>
                      <p>Test Child has been registered in the Child Malnutrition Risk Assessment System.</p>
                      <p><strong>Child ID:</strong> MCH-TEST-000001</p>
                      <p>You may receive important health follow-up notifications from the care team.</p>
                    </div>
                """,
            },
        ]

        for email in emails:
            message_id = send_email(
                ses,
                sender=sender,
                recipient=recipient,
                subject=email["subject"],
                text_body=email["text"],
                html_body=email["html"],
            )
            print(f"{email['name']} email sent successfully. MessageId: {message_id}")

        return 0
    except ClientError as exc:
        error = exc.response.get("Error", {})
        print("Email test failed.")
        print(f"AWS error code: {error.get('Code', 'Unknown')}")
        print(f"AWS error message: {error.get('Message', str(exc))}")
        return 1
    except (BotoCoreError, FileNotFoundError, RuntimeError) as exc:
        print("Email test failed.")
        print(f"Error: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
