# CMRAS — Role System Overview

> ⚠️ **SECURITY NOTE:** This file previously contained plaintext demo passwords and has been sanitized.
> Actual credentials are managed via the database and environment variables.
> Do NOT commit real passwords to this file or any tracked file.
> Demo/test account passwords must be set by an administrator after deployment.

---

## Role System Overview

The system supports **8 roles** with different access levels:

| Role | Description |
|---|---|
| `health_ministry` | National admin — full system access |
| `pdhs` | Province-level oversight (PDHS officer) |
| `rdhs` | District-level oversight (RDHS officer) |
| `moh` / `amoh` | MOH area supervisor — manages midwives, reviews escalations |
| `midwife` | PHM field worker — records measurements, escalates cases |
| `nutritionist` | Hospital specialist — accepts SAM referrals |
| `hospital` | Hospital staff — birth registration |

---

## Superadmin Account

The superadmin account (`health_ministry` role, `is_protected=True`) is seeded at startup.

**Username** and **password** are read from environment variables:
```
SUPERADMIN_USERNAME=superadmin    # default if not set: superadmin
SUPERADMIN_PASSWORD=<your-secure-password>   # REQUIRED — no default
```

Set these in `backend/.env` (never commit that file).

---

## Creating Demo Users

Use the admin dashboard (Health Ministry role) to create users for each role and assign them to areas.
Alternatively, run the seed scripts in `backend/scripts/` for local development.

---

## API Endpoints by Role

### Admin-Only
- `POST /api/admin/reset-dummy-data`
- `POST /api/admin/recompute-visits`
- `POST /api/admin/recompute-measurements`

### Child Monitoring (midwife, moh, amoh, nutritionist, health_ministry)
- `GET /api/children` — list children (role-scoped)
- `POST /api/children` — register child
- `POST /api/midwife/measurement/add` — add measurement (midwife)
- `POST /api/moh/measurement/add` — add measurement (MOH)
- `POST /api/analysis/analyze` — AI risk analysis
