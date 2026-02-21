"""
Migration script to add registered_by_clinic and assigned_to_clinic columns to children table.
This script works with both SQLite and MySQL.
"""
import sys
import os

# Add project root to path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Load .env file
from dotenv import load_dotenv
env_path = os.path.join(project_root, 'backend', '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)
    print(f"Loaded .env from: {env_path}")

# Import config and create engine directly (avoid app initialization that triggers seeding)
from backend.config import Config
from sqlalchemy import create_engine, text, inspect

def main():
    # Get database URI from config
    db_uri = Config.SQLALCHEMY_DATABASE_URI
    print(f"Database URI: {db_uri}")
    
    # Create engine directly
    engine = create_engine(db_uri)
    
    # Check if columns already exist
    inspector = inspect(engine)
    try:
        columns = [col['name'] for col in inspector.get_columns('children')]
        
        if 'registered_by_clinic' in columns and 'assigned_to_clinic' in columns:
            print("[OK] Columns already exist. No migration needed.")
            return
    except Exception as e:
        print(f"[WARNING] Could not inspect table: {e}")
        print("Proceeding to add columns...")
    
    print("Adding new columns to children table...")
    
    with engine.connect() as conn:
        trans = conn.begin()
        try:
            # Add columns using raw SQL (works for both SQLite and MySQL)
            if 'sqlite' in db_uri.lower():
                # SQLite syntax - must add one at a time
                conn.execute(text("""
                    ALTER TABLE children 
                    ADD COLUMN registered_by_clinic VARCHAR(120)
                """))
                conn.execute(text("""
                    ALTER TABLE children 
                    ADD COLUMN assigned_to_clinic VARCHAR(120)
                """))
            else:
                # MySQL syntax - can add both at once
                conn.execute(text("""
                    ALTER TABLE children 
                    ADD COLUMN registered_by_clinic VARCHAR(120) NULL,
                    ADD COLUMN assigned_to_clinic VARCHAR(120) NULL
                """))
            
            trans.commit()
            print("[SUCCESS] Columns added successfully!")
            
        except Exception as e:
            trans.rollback()
            print(f"[ERROR] Failed to add columns: {e}")
            raise

if __name__ == "__main__":
    main()
