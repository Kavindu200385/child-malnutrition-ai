"""
Compatibility exports.

This project now uses the hierarchical schema in `backend.models_hierarchical`.
To prevent SQLAlchemy "Table already defined" errors, `backend.models` MUST NOT
declare its own models; it only re-exports the canonical ones.
"""

from backend.models_hierarchical import (  # noqa: F401
    Area,
    AreaChangeRequest,
    AreaChangeStatus,
    AreaLevel,
    AuditLog,
    Child,
    ChildTransfer,
    PdhsReport,
    RdhsReport,
    Report,
    RiskLevel,
    SystemMessage,
    SystemSetting,
    TransferStatus,
    User,
    UserRole,
    Visit,
    WorkerAreaMapping,
)

