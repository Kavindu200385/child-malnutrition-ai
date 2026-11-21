# Database migrations

Production schema changes are applied with Flask-Migrate, not during application
startup.  Initialise the migration environment once, create/stamp a baseline for
the existing schema, then apply revisions with `flask db upgrade`.

The `versions/20261121_add_hospital_district_area.py` revision is deliberately
additive: it adds a nullable canonical RDHS reference and does not infer location
data for existing hospitals.  Legacy hospitals must be assigned explicitly in the
administrative UI before their geography is changed.
