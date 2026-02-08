"""Script to check database state and verify clinic-based data seeding."""

import sys
import os

# Add project root to Python path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Load .env file before importing app
from dotenv import load_dotenv
env_path = os.path.join(project_root, 'backend', '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)

from backend.app import create_app
from backend.models import Child, Visit, User


def main() -> None:
    app = create_app()
    
    # Show which database is being used
    db_uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
    print(f"Database URI: {db_uri}")
    if 'sqlite' in db_uri.lower():
        print("⚠️  WARNING: Using SQLite database, not MySQL!")
        print("   Check your backend/.env file for DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME")
    elif 'mysql' in db_uri.lower():
        print("✅ Using MySQL database")
    print()
    
    with app.app_context():
        print("=== Database Status ===\n")
        
        # Check users
        print("Users:")
        users = User.query.all()
        print(f"  Total users: {len(users)}")
        for u in users:
            print(f"    - {u.username} ({u.role}) - Clinic: {u.clinic or 'None'} - District: {u.district or 'None'}")
        
        # Check children
        print(f"\nChildren:")
        print(f"  Total children: {Child.query.count()}")
        
        # Show children by clinic prefix
        clinics = {
            "Colombo PHM Clinic": "COL",
            "Gampaha MOH Office": "GAM",
            "Kandy Health Center": "KAN",
        }
        
        for clinic_name, prefix in clinics.items():
            children = Child.query.filter(Child.child_id.like(f"{prefix}%")).all()
            print(f"  {clinic_name} ({prefix}*): {len(children)} children")
            if children:
                for c in children[:3]:  # Show first 3
                    print(f"    - {c.child_id}: {c.name}")
                if len(children) > 3:
                    print(f"    ... and {len(children) - 3} more")
        
        # Check visits
        print(f"\nVisits:")
        print(f"  Total visits: {Visit.query.count()}")
        
        # Show visits by clinic
        for clinic_name, prefix in clinics.items():
            children_ids = [c.id for c in Child.query.filter(Child.child_id.like(f"{prefix}%")).all()]
            if children_ids:
                visit_count = Visit.query.filter(Visit.child_id_fk.in_(children_ids)).count()
                print(f"  {clinic_name}: {visit_count} visits")
        
        # Check if data needs seeding
        print(f"\n=== Seeding Status ===")
        if Child.query.count() == 0:
            print("  ❌ No children found. Run seeding!")
        else:
            print("  ✅ Children exist in database")
            
        # Check if clinic-based data exists
        has_clinic_data = False
        for prefix in clinics.values():
            if Child.query.filter(Child.child_id.like(f"{prefix}%")).count() > 0:
                has_clinic_data = True
                break
        
        if not has_clinic_data:
            print("  ⚠️  No clinic-based children found. Data might need reset.")


if __name__ == "__main__":
    main()
