"""
Assign PHM areas to midwife users
This script assigns midwife users to their PHM areas based on their worker area mappings
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
from backend.models_hierarchical import User, Area, WorkerAreaMapping, AreaLevel
from flask import Flask

def assign_phm_areas_to_midwives():
    """Assign PHM areas to midwife users from their worker area mappings"""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    
    with app.app_context():
        # Get all midwife users
        midwives = db.session.query(User).filter(
            User.role == "midwife",
            User.is_active == True
        ).all()
        
        if not midwives:
            print("No active midwife users found.")
            return
        
        assigned_count = 0
        for midwife in midwives:
            # Get PHM area from worker area mappings
            phm_mapping = db.session.query(WorkerAreaMapping).join(Area).filter(
                WorkerAreaMapping.user_id == midwife.id,
                WorkerAreaMapping.is_active == True,
                Area.level == AreaLevel.PHM.value,
                Area.is_active == True
            ).first()
            
            if phm_mapping:
                if midwife.phm_area_id != phm_mapping.area_id:
                    midwife.phm_area_id = phm_mapping.area_id
                    assigned_count += 1
                    print(f"✓ Assigned PHM area {phm_mapping.area.name} to {midwife.name} ({midwife.username})")
                else:
                    print(f"  {midwife.name} already has PHM area assigned")
            else:
                print(f"⚠ No PHM area mapping found for {midwife.name} ({midwife.username})")
        
        db.session.commit()
        print(f"\n✓ Assigned PHM areas to {assigned_count} midwife users")

if __name__ == "__main__":
    assign_phm_areas_to_midwives()
