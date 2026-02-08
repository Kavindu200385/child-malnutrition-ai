# CMRAS - Role-Based Access Control & Demo Credentials

## Role System Overview

The system now supports **4 roles** with different access levels:

### 1. **Admin** (Full System Access)
- **Access**: All features including:
  - Overview & Dashboard
  - User Management
  - System Analytics
  - Settings & Configuration
  - Report Generation
  - Child Monitoring (full CRUD)
  - Data Management Tools

### 2. **Midwife** (Child Monitoring)
- **Access**: Child monitoring features:
  - View children list
  - Create/Update child records
  - Add measurements
  - View growth charts
  - Generate health reports
  - Risk assessment & analysis

### 3. **MOH Doctor** (Child Monitoring)
- **Access**: Same as Midwife - Child monitoring features:
  - View children list
  - Create/Update child records
  - Add measurements
  - View growth charts
  - Generate health reports
  - Risk assessment & analysis

### 4. **Nutritionist** (Child Monitoring)
- **Access**: Same as Midwife and MOH Doctor - Child monitoring features:
  - View children list
  - Create/Update child records
  - Add measurements
  - View growth charts
  - Generate health reports
  - Risk assessment & analysis

---

## Demo Credentials

### Admin Users

| Username | Password | Name | Clinic | District |
|---------|----------|------|--------|----------|
| `admin` | `admin123` | System Administrator | - | - |
| `admin2` | `admin123` | Dr. Priyanka Wickramasinghe | National Health Office | Colombo |

### Midwife Users

| Username | Password | Name | Clinic | District |
|---------|----------|------|--------|----------|
| `midwife1` | `midwife123` | Kamani Perera | Colombo PHM Clinic | Colombo |
| `midwife2` | `midwife123` | Nadeesha Silva | Gampaha MOH Office | Gampaha |
| `midwife3` | `midwife123` | Sanduni Fernando | Kandy Health Center | Kandy |

### MOH Doctor Users

| Username | Password | Name | Clinic | District |
|---------|----------|------|--------|----------|
| `moh.doctor1` | `moh123` | Dr. Nimal Perera | Colombo PHM Clinic | Colombo |
| `moh.doctor2` | `moh123` | Dr. Kasun Fernando | Gampaha MOH Office | Gampaha |
| `moh.doctor3` | `moh123` | Dr. Malini Rajapakse | Kandy Health Center | Kandy |

### Nutritionist Users

| Username | Password | Name | Clinic | District |
|---------|----------|------|--------|----------|
| `nutritionist1` | `nutrition123` | Tharushi Jayasuriya | Colombo PHM Clinic | Colombo |
| `nutritionist2` | `nutrition123` | Dilini Perera | Gampaha MOH Office | Gampaha |
| `nutritionist3` | `nutrition123` | Chamari Silva | Kandy Health Center | Kandy |

---

## Quick Login Examples

### Admin Access
```
Username: admin
Password: admin123
```

### Midwife Access
```
Username: midwife1
Password: midwife123
```

### MOH Doctor Access
```
Username: moh.doctor1
Password: moh123
```

### Nutritionist Access
```
Username: nutritionist1
Password: nutrition123
```

---

## API Endpoint Access

### Admin-Only Endpoints
- `POST /api/admin/reset-dummy-data` - Reset dummy data
- `POST /api/admin/recompute-visits` - Recompute all visits
- `DELETE /api/children/<child_id>` - Delete child record

### Child Monitoring Endpoints (Admin, Midwife, MOH Doctor, Nutritionist)
- `GET /api/children` - List all children
- `POST /api/children` - Create new child
- `GET /api/children/<child_id>` - Get child details
- `PUT /api/children/<child_id>` - Update child
- `GET /api/children/<child_id>/visits` - Get child visits
- `POST /api/analysis/analyze` - Analyze child risk

---

## Notes

- All demo users are automatically created when the backend starts
- Passwords are hashed using Werkzeug's password hashing
- Roles are case-sensitive: `admin`, `midwife`, `moh_doctor`, `nutritionist`
- Old `health_worker` role has been removed and replaced with the new role system
