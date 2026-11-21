"""Add the canonical hospital RDHS reference without rewriting legacy data.

Revision ID: 20261121_add_hospital_district_area
Revises: baseline
"""

from alembic import op
import sqlalchemy as sa


revision = "20261121_add_hospital_district_area"
down_revision = "baseline"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("hospitals") as batch_op:
        batch_op.add_column(sa.Column("district_area_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_hospitals_district_area_id", ["district_area_id"])
        batch_op.create_foreign_key(
            "fk_hospitals_district_area_id_areas",
            "areas",
            ["district_area_id"],
            ["id"],
        )


def downgrade():
    with op.batch_alter_table("hospitals") as batch_op:
        batch_op.drop_constraint("fk_hospitals_district_area_id_areas", type_="foreignkey")
        batch_op.drop_index("ix_hospitals_district_area_id")
        batch_op.drop_column("district_area_id")
