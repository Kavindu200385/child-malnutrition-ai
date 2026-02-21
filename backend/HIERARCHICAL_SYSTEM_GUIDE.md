# Hierarchical Area System - Implementation Guide

## Overview

This document describes the complete hierarchical area system with 5-level hierarchy, strict RBAC, and child transfer workflows.

## System Architecture

### 1. Area Hierarchy (5 Levels)

```
Health Ministry (Super Admin Level)
   └── Provincial PDHS
         └── District RDHS
               └── MOH Area
                     └── Public Health Midwife (PHM) Area
```

**Database Model**: `backend/models_hierarchical.py` - `Area` class
- Each area has exactly one parent (except Ministry)
- Foreign key relationships enforce hierarchy
- Soft delete (`is_active`) prevents data loss

### 2. Roles (7 Roles)

1. **HEALTH_MINISTRY** - Super Admin
   - Manage all areas
   - Manage all health workers
   - View all reports (national level)
   - Cannot add/edit/delete child
   - Cannot enter measurements

2. **PDHS** - Provincial Admin
   - Manage province-level workers
   - View province reports
   - Monitor district data
   - Cannot add child or measurements

3. **RDHS** - District Admin
   - District-level monitoring
   - View workers under district
   - Generate district reports
   - Send reports to PDHS
   - Cannot add child or measurements

4. **MOH / AMOH** - Medical Officer of Health
   - Same permissions
   - Manage children in their MOH area
   - Approve transfers into their area
   - View measurements
   - Transfer child to Nutritionist if risk worsens
   - Request area changes from Ministry

5. **MIDWIFE (PHM)**
   - Search child by Registration Number
   - Assign child to PHM area
   - Enter measurements
   - Monitor risk
   - Transfer child to MOH if risk worsens
   - Cannot delete child

6. **NUTRITIONIST** (Hospital Role)
   - View transferred high-risk children
   - Enter monitoring details
   - Update status
   - Transfer back to MOH when stable

7. **HOSPITAL**
   - Register newborn child
   - Generate child registration number
   - Cannot delete child
   - Cannot manage areas

### 3. Child Transfer Workflow

**Flow**: Hospital → Midwife → MOH → Nutritionist (and back)

**Statuses**: PENDING → APPROVED/REJECTED → COMPLETED

**Approval Process**:
- Receiving role must approve (MOH approves Midwife→MOH, Nutritionist approves MOH→Nutritionist)
- Health Ministry can approve any transfer
- Transfer updates child's `current_assigned_role`, `current_assigned_area_id`, and area mappings

### 4. Database Tables

**Core Tables**:
- `areas` - Hierarchical area structure
- `users` - Health workers with roles
- `worker_area_mapping` - Links workers to areas
- `children` - Child records with current assignment
- `visits` - Measurement history
- `child_transfers` - Transfer history and approval workflow
- `area_change_requests` - MOH requests for area reassignment
- `audit_logs` - System-wide audit trail
- `reports` - Generated reports (RDHS, PDHS, Ministry)

## Files Created/Updated

### Models
- ✅ `backend/models_hierarchical.py` - Complete hierarchical models
- ✅ Migration script: `backend/scripts/migrate_to_hierarchical_system.py` (RUN THIS FIRST)

### Authentication & Authorization
- ✅ `backend/auth_utils_hierarchical.py` - New RBAC system with area-based access control

### Routes
- ✅ `backend/routes/areas_hierarchical.py` - Area CRUD (Health Ministry only)
- ✅ `backend/routes/child_transfers.py` - Transfer request/approval workflow
- ⚠️ `backend/routes/children_crud.py` - NEEDS UPDATE for hierarchical access
- ⚠️ `backend/routes/worker_management.py` - NEEDS CREATION for worker assignment
- ⚠️ `backend/routes/reporting.py` - NEEDS CREATION for RDHS/PDHS/Ministry reports

### Utilities
- ✅ `backend/utils/audit.py` - Audit logging utility

## Integration Steps

### Step 1: Run Migration

```bash
cd backend
python scripts/migrate_to_hierarchical_system.py
```

This will:
- Create hierarchical `areas` table
- Add new fields to `children` table
- Create `worker_area_mapping`, `child_transfers`, `area_change_requests`, `audit_logs`, `reports` tables
- Update `users` and `visits` tables

### Step 2: Update app.py

Add new blueprints:

```python
from backend.routes.areas_hierarchical import bp as areas_hierarchical_bp
from backend.routes.child_transfers import bp as child_transfers_bp

app.register_blueprint(areas_hierarchical_bp)
app.register_blueprint(child_transfers_bp)
```

### Step 3: Update Models Import

In `backend/app.py` and route files, import from hierarchical models:

```python
# OLD
from backend.models import User, Child, Area

# NEW
from backend.models_hierarchical import User, Child, Area, ChildTransfer, WorkerAreaMapping
```

### Step 4: Update Auth Utils

Replace `backend/auth_utils.py` imports with:

```python
from backend.auth_utils_hierarchical import (
    role_required,
    health_ministry_required,
    admin_required,
    hospital_required,
    measurement_required,
    transfer_required,
    get_current_user,
    user_can_access_area,
    user_can_access_child,
)
```

### Step 5: Update Children CRUD

Update `backend/routes/children_crud.py` to:
- Use hierarchical auth utils
- Filter children by area hierarchy
- Include area-based access checks
- Update child assignment to use `current_assigned_area_id` and `current_assigned_role`

### Step 6: Create Worker Management Routes

Create `backend/routes/worker_management.py`:
- Health Ministry can create/update/delete workers
- Assign workers to areas via `worker_area_mapping`
- List workers by area/role

### Step 7: Create Reporting Routes

Create `backend/routes/reporting.py`:
- RDHS: District summary, worker performance, risk distribution
- PDHS: Provincial summary, district comparison
- Ministry: National dashboard, AI analytics, province charts

## API Endpoints

### Areas (Health Ministry Only)
- `GET /api/areas` - List areas (filter by level, parent_id)
- `GET /api/areas/<id>` - Get area details
- `POST /api/areas` - Create area
- `PUT /api/areas/<id>` - Update area
- `DELETE /api/areas/<id>` - Delete area (soft delete)
- `GET /api/areas/hierarchy` - Get full hierarchy tree

### Child Transfers
- `POST /api/children/<child_id>/transfer` - Request transfer
- `GET /api/children/transfers` - List transfers
- `POST /api/children/transfers/<id>/approve` - Approve transfer
- `POST /api/children/transfers/<id>/reject` - Reject transfer

### Children (Updated)
- `GET /api/children` - List children (filtered by area hierarchy)
- `POST /api/children` - Register child (Hospital only)
- `GET /api/children/<child_id>` - Get child (area access check)
- `PUT /api/children/<child_id>` - Update child (area access check)
- `POST /api/children/<child_id>/assign` - Assign to area (Midwife/MOH)

## Security & Constraints

1. **No Cross-Area Access**: Users can only access children in their assigned areas or child areas
2. **No Role Privilege Escalation**: Roles cannot perform actions outside their permissions
3. **Prevent Deletion if Linked**: Areas/users cannot be deleted if they have linked children/workers
4. **Audit Logging**: All changes are logged in `audit_logs` table
5. **Transfer Validation**: Only valid workflow transfers are allowed

## Next Steps

1. ✅ Database migration - DONE
2. ✅ Models created - DONE
3. ✅ Auth system updated - DONE
4. ✅ Area CRUD - DONE
5. ✅ Transfer system - DONE
6. ⚠️ Update children CRUD - IN PROGRESS
7. ⚠️ Create worker management - TODO
8. ⚠️ Create reporting system - TODO
9. ⚠️ Update frontend to use new APIs - TODO
10. ⚠️ Seed initial area hierarchy - TODO

## Testing Checklist

- [ ] Health Ministry can create area hierarchy
- [ ] Workers can be assigned to areas
- [ ] Hospital can register children
- [ ] Midwife can search and assign children
- [ ] Transfers follow correct workflow
- [ ] Area-based access control works
- [ ] Audit logs are created
- [ ] Reports can be generated

## Notes

- The old `backend/models.py` is kept for backward compatibility during migration
- Gradually migrate routes to use `models_hierarchical.py`
- Frontend will need updates to use new role names and area hierarchy
- Consider creating seed script for initial area hierarchy (Ministry → Provinces → Districts → MOH Areas → PHM Areas)
