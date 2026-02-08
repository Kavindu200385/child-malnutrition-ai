"""
Flask Backend Application for Child Malnutrition AI

Backend stack:
- Flask
- MySQL (via SQLAlchemy + PyMySQL)
- JWT auth (role-based)
- ML model inference (joblib)
"""

import os

from dotenv import load_dotenv, find_dotenv  # type: ignore
from flask import Flask
from flask_cors import CORS

from backend.config import Config
from backend.extensions import db, jwt, migrate
from backend.models import User
from backend.seed_data import seed_visits_from_children_records_csv_if_empty
from backend.demo_children_seed import seed_demo_children_if_empty


def seed_demo_users() -> None:
    """Seed demo users for all 4 roles: admin, midwife, moh_doctor, nutritionist."""
    demo_users = [
        # Admin users (full access)
        {
            "username": "admin",
            "password": "admin123",
            "name": "System Administrator",
            "role": "admin",
            "clinic": None,
            "district": None,
        },
        {
            "username": "admin2",
            "password": "admin123",
            "name": "Dr. Priyanka Wickramasinghe",
            "role": "admin",
            "clinic": "National Health Office",
            "district": "Colombo",
        },
        # Midwife users (child monitoring)
        {
            "username": "midwife1",
            "password": "midwife123",
            "name": "Kamani Perera",
            "role": "midwife",
            "clinic": "Colombo PHM Clinic",
            "district": "Colombo",
        },
        {
            "username": "midwife2",
            "password": "midwife123",
            "name": "Nadeesha Silva",
            "role": "midwife",
            "clinic": "Gampaha MOH Office",
            "district": "Gampaha",
        },
        {
            "username": "midwife3",
            "password": "midwife123",
            "name": "Sanduni Fernando",
            "role": "midwife",
            "clinic": "Kandy Health Center",
            "district": "Kandy",
        },
        # MOH Doctor users (child monitoring)
        {
            "username": "moh.doctor1",
            "password": "moh123",
            "name": "Dr. Nimal Perera",
            "role": "moh_doctor",
            "clinic": "Colombo PHM Clinic",
            "district": "Colombo",
        },
        {
            "username": "moh.doctor2",
            "password": "moh123",
            "name": "Dr. Kasun Fernando",
            "role": "moh_doctor",
            "clinic": "Gampaha MOH Office",
            "district": "Gampaha",
        },
        {
            "username": "moh.doctor3",
            "password": "moh123",
            "name": "Dr. Malini Rajapakse",
            "role": "moh_doctor",
            "clinic": "Kandy Health Center",
            "district": "Kandy",
        },
        # Nutritionist users (child monitoring)
        {
            "username": "nutritionist1",
            "password": "nutrition123",
            "name": "Tharushi Jayasuriya",
            "role": "nutritionist",
            "clinic": "Colombo PHM Clinic",
            "district": "Colombo",
        },
        {
            "username": "nutritionist2",
            "password": "nutrition123",
            "name": "Dilini Perera",
            "role": "nutritionist",
            "clinic": "Gampaha MOH Office",
            "district": "Gampaha",
        },
        {
            "username": "nutritionist3",
            "password": "nutrition123",
            "name": "Chamari Silva",
            "role": "nutritionist",
            "clinic": "Kandy Health Center",
            "district": "Kandy",
        },
    ]

    for u in demo_users:
        existing = User.query.filter_by(username=u["username"]).first()
        if existing:
            # Update existing user's role if it changed
            if existing.role != u["role"]:
                existing.role = u["role"]
                existing.name = u["name"]
                existing.clinic = u["clinic"]
                existing.district = u["district"]
            continue
        user = User(
            username=u["username"],
            name=u["name"],
            role=u["role"],
            clinic=u["clinic"],
            district=u["district"],
        )
        user.set_password(u["password"])
        db.session.add(user)

    db.session.commit()


def create_app() -> Flask:
    # Load env from:
    # - repo/root .env (if present)
    # - backend/.env (if present)
    load_dotenv(find_dotenv(usecwd=True))
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

    app = Flask(__name__)
    app.config.from_object(Config)

    # Extensions
    CORS(app, resources={r"/*": {"origins": app.config.get("CORS_ORIGINS", "*")}})
    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)

    # Blueprints
    from backend.routes.auth_jwt import bp as auth_bp
    from backend.routes.children_crud import bp as children_bp
    from backend.routes.analysis_jwt import bp as analysis_bp
    from backend.routes.admin_tools import bp as admin_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(children_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(admin_bp)

    @app.route("/health")
    def health():
        return {"status": "healthy"}, 200

    @app.route("/")
    def index():
        return {
            "status": "success",
            "message": "Child Malnutrition AI API is running",
            "version": "2.0.0",
        }

    # Create tables + seed demo users on startup
    with app.app_context():
        db.create_all()
        seed_demo_users()
        seed_demo_children_if_empty()
        seed_visits_from_children_records_csv_if_empty()

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5173"))
    node_env = os.environ.get("NODE_ENV", "development").lower()
    debug = node_env != "production"
    app.run(debug=debug, host="0.0.0.0", port=port)
