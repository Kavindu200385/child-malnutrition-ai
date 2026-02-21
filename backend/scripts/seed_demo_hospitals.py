"""
Seed demo hospitals for testing
"""
import sys
import os

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from dotenv import load_dotenv
env_path = os.path.join(project_root, 'backend', '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)

from backend.config import Config
from backend.extensions import db
from backend.models_hierarchical import Hospital, User
from flask import Flask

def seed_demo_hospitals():
    """Create demo hospitals"""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    
    with app.app_context():
        hospitals = [
            {
                "hospital_name": "Colombo General Hospital",
                "hospital_code": "CMBH",
                "district": "Colombo",
                "province": "Western",
                "address": "Colombo 07, Sri Lanka",
                "contact_phone": "0112345678",
            },
            {
                "hospital_name": "Gampaha District Hospital",
                "hospital_code": "GMPH",
                "district": "Gampaha",
                "province": "Western",
                "address": "Gampaha, Sri Lanka",
                "contact_phone": "0331234567",
            },
            {
                "hospital_name": "Kandy Teaching Hospital",
                "hospital_code": "KDTH",
                "district": "Kandy",
                "province": "Central",
                "address": "Kandy, Sri Lanka",
                "contact_phone": "0811234567",
            },
        ]
        
        created = 0
        for h_data in hospitals:
            existing = Hospital.query.filter_by(hospital_code=h_data["hospital_code"]).first()
            if existing:
                # Update existing
                existing.hospital_name = h_data["hospital_name"]
                existing.district = h_data["district"]
                existing.province = h_data["province"]
                existing.address = h_data["address"]
                existing.contact_phone = h_data["contact_phone"]
                continue
            
            hospital = Hospital(**h_data, is_active=True)
            db.session.add(hospital)
            created += 1
        
        db.session.commit()
        print(f"Created/updated {len(hospitals)} hospitals ({created} new)")

if __name__ == "__main__":
    seed_demo_hospitals()
