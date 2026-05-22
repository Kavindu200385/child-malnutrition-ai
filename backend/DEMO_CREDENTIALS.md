# Sample data seed (existing users only)

```bash
python backend/scripts/seed_all_roles_dummy_data.py
```

The script:
- Removes any `demo_*` users and `DEMO-*` children
- Keeps your current logins (`Western`, `colombo`, `Hanwella`, `Midwife`, `avissawella_N`, `Birth_Avissawella`, `superadmin`, `Admin`)
- Does **not** change passwords
- Adds/updates sample children with IDs like `SAMPLE-HOS-*` and `SAMPLE-PHM-*`

| Username | Role |
|----------|------|
| `superadmin` | health_ministry |
| `Admin` | health_ministry |
| `Western` | pdhs |
| `colombo` | rdhs |
| `Hanwella` | moh |
| `Midwife` | midwife (Kosgama PHM) |
| `avissawella_N` | nutritionist (HOS001) |
| `Birth_Avissawella` | hospital (HOS001) |

There is no separate AMOH account in the database; add one via User Management if needed.
