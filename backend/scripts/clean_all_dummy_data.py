"""
Remove ALL dummy data from database
- Deletes all children
- Deletes all visits
- Deletes all users except superadmin
- Keeps only superadmin user
"""
import sys
import os

# Add project root to path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if os.path.dirname(__file__) not in sys.path:
    sys.path.insert(0, os.path.dirname(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from dotenv import load_dotenv
env_path = os.path.join(project_root, 'backend', '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)

from backend.config import Config
from backend.extensions import db
from backend.models import Child, Visit, User
from flask import Flask

def clean_all_dummy_data():
    """Remove all children, visits, and users except superadmin"""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    
    with app.app_context():
        # Delete all visits first (foreign key constraint)
        deleted_visits = Visit.query.delete()
        
        # Delete all children
        deleted_children = Child.query.delete()
        
        # Delete all users except superadmin
        deleted_users = User.query.filter(User.username != 'superadmin').delete()
        
        db.session.commit()
        
        print(f"[OK] Removed {deleted_visits} visits")
        print(f"[OK] Removed {deleted_children} children")
        print(f"[OK] Removed {deleted_users} users (superadmin kept)")
        print(f"\n[OK] Database cleaned. Only superadmin user remains.")
        print(f"   Superadmin credentials: superadmin / 200385")

if __name__ == "__main__":
    print("WARNING: This will delete ALL children, visits, and users (except superadmin)")
    print("   Press Ctrl+C to cancel, or wait 3 seconds to continue...")
    import time
    time.sleep(3)
    clean_all_dummy_data()
