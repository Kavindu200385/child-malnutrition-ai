"""
Simple SQLite database utilities for the Child Malnutrition AI backend.

This module:
- Chooses a database path from the DATABASE_PATH environment variable, or
  falls back to backend/data/cmras.db
- Creates the required tables on first run
- Seeds demo users for role-based login (admin, midwife, moh_doctor, nutritionist)
"""

import os
import sqlite3
from typing import Dict, Any

from werkzeug.security import generate_password_hash

# Base directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

# Database path (can be overridden via environment variable)
DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(DATA_DIR, "cmras.db"))


def get_connection() -> sqlite3.Connection:
    """Return a SQLite connection with row_factory set to Row."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_users_table(conn: sqlite3.Connection) -> None:
    """Create the users table if it does not exist."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            clinic TEXT,
            district TEXT
        )
        """
    )


def _seed_demo_users(conn: sqlite3.Connection) -> None:
    """Insert demo users if they are not already present."""
    demo_users = [
        # Admin users
        {
            "username": "admin",
            "password": "admin123",
            "name": "System Administrator",
            "role": "admin",
            "clinic": None,
            "district": None,
        },
        # Midwife users
        {
            "username": "midwife1",
            "password": "midwife123",
            "name": "Kamani Perera",
            "role": "midwife",
            "clinic": "Colombo PHM Clinic",
            "district": "Colombo",
        },
        # MOH Doctor users
        {
            "username": "moh.doctor1",
            "password": "moh123",
            "name": "Dr. Nimal Perera",
            "role": "moh_doctor",
            "clinic": "Colombo PHM Clinic",
            "district": "Colombo",
        },
        # Nutritionist users
        {
            "username": "nutritionist1",
            "password": "nutrition123",
            "name": "Tharushi Jayasuriya",
            "role": "nutritionist",
            "clinic": "Colombo PHM Clinic",
            "district": "Colombo",
        },
    ]

    cursor = conn.cursor()
    for user in demo_users:
        cursor.execute(
            """
            INSERT OR IGNORE INTO users
                (username, password_hash, name, role, clinic, district)
            VALUES
                (?, ?, ?, ?, ?, ?)
            """,
            (
                user["username"],
                generate_password_hash(user["password"]),
                user["name"],
                user["role"],
                user["clinic"],
                user["district"],
            ),
        )
    conn.commit()


def init_db() -> None:
    """Initialize the database and seed demo data if needed."""
    conn = get_connection()
    try:
        _ensure_users_table(conn)
        _seed_demo_users(conn)
    finally:
        conn.close()


def get_user_by_username(username: str) -> Dict[str, Any] | None:
    """Fetch a user row by username."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username, password_hash, name, role, clinic, district "
            "FROM users WHERE username = ?",
            (username,),
        )
        row = cursor.fetchone()
    finally:
        conn.close()

    if row is None:
        return None

    return dict(row)

