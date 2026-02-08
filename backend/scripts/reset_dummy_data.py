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
    print(f"Loaded .env from: {env_path}")
else:
    print(f"WARNING: .env file not found at {env_path}")

from backend.app import create_app
from backend.demo_children_seed import reset_demo_children_data
from backend.models import Child, Visit, User
from backend.config import Config


def main() -> None:
    app = create_app()
    
    # Show which database is being used
    db_uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
    print(f"\nDatabase URI: {db_uri}")
    if 'sqlite' in db_uri.lower():
        print("⚠️  WARNING: Using SQLite database, not MySQL!")
        print("   Make sure your .env file has DB_HOST, DB_USERNAME, DB_PASSWORD, and DB_NAME set.")
    elif 'mysql' in db_uri.lower():
        print("✅ Using MySQL database")
    print()
    
    with app.app_context():
        print("Resetting dummy data...")
        result = reset_demo_children_data()
        print("\nReset dummy data complete:")
        for k, v in result.items():
            print(f"  {k}: {v}")
        
        # Verify the data
        print("\nVerification:")
        print(f"  Total children in DB: {Child.query.count()}")
        print(f"  Total visits in DB: {Visit.query.count()}")
        
        # Show children by clinic
        clinics = {
            "Colombo PHM Clinic": "COL",
            "Gampaha MOH Office": "GAM",
            "Kandy Health Center": "KAN",
        }
        
        for clinic_name, prefix in clinics.items():
            count = Child.query.filter(Child.child_id.like(f"{prefix}%")).count()
            print(f"  {clinic_name} ({prefix}*): {count} children")
        
        # Show users by clinic
        print("\nUsers by clinic:")
        for clinic_name in clinics.keys():
            users = User.query.filter(User.clinic == clinic_name).all()
            if users:
                print(f"  {clinic_name}: {len(users)} users")
                for u in users:
                    print(f"    - {u.username} ({u.role})")


if __name__ == "__main__":
    main()

