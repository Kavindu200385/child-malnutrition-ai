"""
API tests for reporting endpoints:
  POST /api/midwife/clinic-report/submit
  GET  /api/midwife/clinic-reports
  GET/POST /api/moh/reports/monthly
"""
import pytest
from datetime import datetime


class TestClinicReports:
    """Midwife submits monthly clinic reports."""

    def test_submit_clinic_report_returns_success(self, client, api_midwife, api_areas):
        _, headers = api_midwife
        now = datetime.now()
        rv = client.post("/api/midwife/clinic-report/submit", json={
            "report_month": now.month,
            "report_year": now.year,
            "total_children_seen": 5,
            "normal_count": 3,
            "mam_count": 1,
            "sam_count": 1,
            "escalated_cases": 1,
        }, headers=headers)
        assert rv.status_code in (200, 201)

    def test_submit_returns_report_object(self, client, api_midwife):
        _, headers = api_midwife
        now = datetime.now()
        rv = client.post("/api/midwife/clinic-report/submit", json={
            "report_month": now.month,
            "report_year": now.year,
            "total_children_seen": 3,
            "normal_count": 3,
            "mam_count": 0,
            "sam_count": 0,
            "escalated_cases": 0,
        }, headers=headers)
        data = rv.get_json()
        assert data.get("status") == "success" or "report" in data

    def test_list_clinic_reports_returns_200(self, client, api_midwife):
        _, headers = api_midwife
        rv = client.get("/api/midwife/clinic-reports", headers=headers)
        assert rv.status_code == 200

    def test_unauthenticated_submit_returns_401(self, client):
        rv = client.post("/api/midwife/clinic-report/submit", json={
            "report_month": 1, "report_year": 2026,
        })
        assert rv.status_code == 401


class TestMohReports:
    """MOH monthly reports."""

    def test_list_moh_reports_returns_200(self, client, api_moh):
        _, _, headers = api_moh
        rv = client.get("/api/moh/reports/monthly", headers=headers)
        assert rv.status_code == 200

    def test_unauthenticated_returns_401(self, client):
        rv = client.get("/api/moh/reports/monthly")
        assert rv.status_code == 401

    def test_wrong_role_returns_403(self, client, api_midwife):
        _, headers = api_midwife
        rv = client.get("/api/moh/reports/monthly", headers=headers)
        assert rv.status_code == 403
