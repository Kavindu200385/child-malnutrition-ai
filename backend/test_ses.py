"""
Standalone AWS SES connectivity test for CMRAS.

This script reads SES settings from backend/.env and sends one test email.
It does not import or modify the Flask application.
"""
from __future__ import annotations

import os
from email.utils import formataddr
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError


RECIPIENT_EMAIL = "kavindu2003sandaruwan@gmail.com"
SUBJECT = "CMRAS SES Test"
BODY = "AWS SES test email from localhost."


def load_env(env_path: Path) -> None:
    if not env_path.exists():
        raise FileNotFoundError(f".env file not found: {env_path}")

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ[key] = value


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def main() -> int:
    env_path = Path(__file__).resolve().parent / ".env"
    try:
        load_env(env_path)

        region = required_env("AWS_REGION")
        access_key = required_env("AWS_SES_ACCESS_KEY_ID")
        secret_key = required_env("AWS_SES_SECRET_ACCESS_KEY")
        sender_email = required_env("AWS_SES_SENDER_EMAIL")
        sender_name = os.environ.get("AWS_SES_SENDER_NAME", "CMRAS").strip() or "CMRAS"
        print(f"SES region: {region}")
        print(f"SES sender: {sender_email}")
        print(f"SES recipient: {RECIPIENT_EMAIL}")

        ses = boto3.client(
            "ses",
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )

        response = ses.send_email(
            Source=formataddr((sender_name, sender_email)),
            Destination={"ToAddresses": [RECIPIENT_EMAIL]},
            Message={
                "Subject": {"Data": SUBJECT, "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": BODY, "Charset": "UTF-8"},
                    "Html": {"Data": f"<p>{BODY}</p>", "Charset": "UTF-8"},
                },
            },
        )

        print("SES test email sent successfully.")
        print(f"MessageId: {response.get('MessageId')}")
        return 0
    except ClientError as exc:
        error = exc.response.get("Error", {})
        print("SES test email failed.")
        print(f"AWS error code: {error.get('Code', 'Unknown')}")
        print(f"AWS error message: {error.get('Message', str(exc))}")
        return 1
    except (BotoCoreError, FileNotFoundError, RuntimeError) as exc:
        print("SES test email failed.")
        print(f"Error: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
