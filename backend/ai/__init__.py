"""
AI Module for Child Malnutrition Analysis
"""
from .child_risk_analyzing import analyze_child, save_record, get_child_history, format_detailed_report
from .prediction_next2months import get_next2months_predictor

__all__ = [
    "analyze_child",
    "save_record",
    "get_child_history",
    "format_detailed_report",
    "get_next2months_predictor",
]
