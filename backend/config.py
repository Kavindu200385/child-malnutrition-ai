import os
import re
from datetime import timedelta

# Default SQLite fallback location (works without MySQL for local dev)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)
DEFAULT_SQLITE_PATH = os.path.join(DATA_DIR, "cmras.db")


def _parse_expires(value: str | None) -> timedelta:
    """
    Parse values like:
    - "1d" (days)
    - "12h" (hours)
    - "30m" (minutes)
    - "3600" (seconds)
    Defaults to 1 day if unset/invalid.
    """
    if not value:
        return timedelta(days=1)

    s = str(value).strip().lower()
    if s.isdigit():
        return timedelta(seconds=int(s))

    m = re.fullmatch(r"(\d+)\s*([dhm])", s)
    if not m:
        return timedelta(days=1)

    n = int(m.group(1))
    unit = m.group(2)
    if unit == "d":
        return timedelta(days=n)
    if unit == "h":
        return timedelta(hours=n)
    return timedelta(minutes=n)


def _build_mysql_uri_from_parts() -> str | None:
    host = os.environ.get("DB_HOST")
    port = os.environ.get("DB_PORT", "3306")
    user = os.environ.get("DB_USERNAME")
    password = os.environ.get("DB_PASSWORD", "")
    dbname = os.environ.get("DB_NAME")

    if not (host and user and dbname):
        return None

    # Note: for special characters in password, URL-encode if needed.
    return f"mysql+pymysql://{user}:{password}@{host}:{port}/{dbname}?charset=utf8mb4"


class Config:
    # Security
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")
    # Match your proposal env name
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", os.environ.get("JWT_SECRET", SECRET_KEY))
    JWT_ACCESS_TOKEN_EXPIRES = _parse_expires(os.environ.get("JWT_EXPIRES_IN"))

    # Database (MySQL recommended; fallback to SQLite for local dev)
    # Example MySQL URI:
    # mysql+pymysql://user:password@localhost:3306/cmras_db?charset=utf8mb4
    SQLALCHEMY_DATABASE_URI = (
        os.environ.get("DATABASE_URL")
        or _build_mysql_uri_from_parts()
        or f"sqlite:///{DEFAULT_SQLITE_PATH}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # CORS
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", os.environ.get("FRONTEND_URL", "*"))

    # Email / AWS SES
    EMAIL_ENABLED = os.environ.get("EMAIL_ENABLED", "false").lower() in ("1", "true", "yes")
    EMAIL_2FA_ENABLED = os.environ.get("EMAIL_2FA_ENABLED", "false").lower() in ("1", "true", "yes")
    EMAIL_NOTIFICATIONS_ENABLED = os.environ.get("EMAIL_NOTIFICATIONS_ENABLED", "false").lower() in ("1", "true", "yes")
    AWS_REGION = os.environ.get("AWS_REGION", "ap-southeast-1")
    AWS_SES_ACCESS_KEY_ID = os.environ.get("AWS_SES_ACCESS_KEY_ID")
    AWS_SES_SECRET_ACCESS_KEY = os.environ.get("AWS_SES_SECRET_ACCESS_KEY")
    AWS_SES_SENDER_EMAIL = os.environ.get("AWS_SES_SENDER_EMAIL")
    AWS_SES_SENDER_NAME = os.environ.get("AWS_SES_SENDER_NAME", "CMRAS")
    FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3001")
    BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:5001")
