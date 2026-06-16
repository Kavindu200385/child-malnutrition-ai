"""
Application-level encryption helpers for sensitive healthcare data.

Values are encrypted before database persistence and decrypted by SQLAlchemy
when authorized route handlers serialize model objects. Existing plaintext
values remain readable so deployments can migrate safely.
"""
from __future__ import annotations

import base64
import json
import os
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.types import TypeDecorator, Text


ENCRYPTED_PREFIX = "enc:v1:"


class EncryptionConfigurationError(RuntimeError):
    pass


def generate_data_encryption_key() -> str:
    return Fernet.generate_key().decode("utf-8")


def _normalise_key(raw_key: str | None) -> bytes | None:
    if not raw_key:
        return None
    key = raw_key.strip()
    if not key:
        return None
    try:
        Fernet(key.encode("utf-8"))
        return key.encode("utf-8")
    except Exception:
        # Allow a raw 32-byte secret by URL-safe base64-encoding it.
        raw = key.encode("utf-8")
        if len(raw) == 32:
            encoded = base64.urlsafe_b64encode(raw)
            Fernet(encoded)
            return encoded
        raise EncryptionConfigurationError(
            "DATA_ENCRYPTION_KEY must be a Fernet key. Generate one with "
            "`python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"`."
        )


def _fernet() -> Fernet | None:
    key = _normalise_key(os.environ.get("DATA_ENCRYPTION_KEY"))
    return Fernet(key) if key else None


def validate_encryption_key(required: bool = False) -> None:
    if required and not os.environ.get("DATA_ENCRYPTION_KEY"):
        raise EncryptionConfigurationError(
            "DATA_ENCRYPTION_KEY is required in production for healthcare data encryption."
        )
    _fernet()


def is_encrypted(value: Any) -> bool:
    return isinstance(value, str) and value.startswith(ENCRYPTED_PREFIX)


def encrypt_value(value: Any) -> Any:
    if value is None or value == "":
        return value
    if is_encrypted(value):
        return value
    f = _fernet()
    if f is None:
        # Development fallback preserves local usability; production is validated
        # at app startup and will fail safely if the key is missing.
        return value
    plaintext = str(value).encode("utf-8")
    return ENCRYPTED_PREFIX + f.encrypt(plaintext).decode("utf-8")


def decrypt_value(value: Any) -> Any:
    if value is None or value == "":
        return value
    if not is_encrypted(value):
        return value
    f = _fernet()
    if f is None:
        raise EncryptionConfigurationError("DATA_ENCRYPTION_KEY is required to decrypt sensitive data.")
    token = value[len(ENCRYPTED_PREFIX):].encode("utf-8")
    try:
        return f.decrypt(token).decode("utf-8")
    except InvalidToken as exc:
        raise EncryptionConfigurationError("Unable to decrypt sensitive data with DATA_ENCRYPTION_KEY.") from exc


def _json_default(value: Any) -> str:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


class EncryptedText(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect) -> Any:
        return encrypt_value(value)

    def process_result_value(self, value: Any, dialect) -> Any:
        return decrypt_value(value)


class EncryptedDecimal(TypeDecorator):
    impl = Text
    cache_ok = True

    def __init__(self, scale: int | None = None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.scale = scale

    def process_bind_param(self, value: Any, dialect) -> Any:
        return encrypt_value(value)

    def process_result_value(self, value: Any, dialect) -> Decimal | None:
        decrypted = decrypt_value(value)
        if decrypted is None or decrypted == "":
            return None
        return Decimal(str(decrypted))


class EncryptedFloat(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect) -> Any:
        return encrypt_value(value)

    def process_result_value(self, value: Any, dialect) -> float | None:
        decrypted = decrypt_value(value)
        if decrypted is None or decrypted == "":
            return None
        return float(decrypted)


class EncryptedDate(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect) -> Any:
        if isinstance(value, (date, datetime)):
            value = value.isoformat()
        return encrypt_value(value)

    def process_result_value(self, value: Any, dialect) -> date | None:
        decrypted = decrypt_value(value)
        if not decrypted:
            return None
        return date.fromisoformat(str(decrypted)[:10])


class EncryptedJSON(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect) -> Any:
        if value is None:
            return None
        if is_encrypted(value):
            return value
        return encrypt_value(json.dumps(value, default=_json_default, separators=(",", ":")))

    def process_result_value(self, value: Any, dialect) -> Any:
        decrypted = decrypt_value(value)
        if decrypted is None or decrypted == "":
            return None
        if not isinstance(decrypted, str):
            return decrypted
        try:
            return json.loads(decrypted)
        except json.JSONDecodeError:
            # Legacy malformed/plain value fallback.
            return decrypted
