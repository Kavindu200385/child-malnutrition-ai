"""
Migration script to add birth_registration JSON column to children table.
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
    
    # Check if column already exists
    inspector = inspect(engine)
    try:
        columns = [col['name'] for col in inspector.get_columns('children')]
        
        if 'birth_registration' in columns:
            print("[OK] Column already exists. No migration needed.")
            return
    except Exception as e:
        print(f"[WARNING] Could not inspect table: {e}")
        print("Proceeding to add column...")
    
    print("Adding birth_registration column to children table...")
    
    with engine.connect() as conn:
        trans = conn.begin()
        try:
            # Add column using raw SQL (works for both SQLite and MySQL)
            if 'sqlite' in db_uri.lower():
                # SQLite doesn't have native JSON, use TEXT
                conn.execute(text("""
                    ALTER TABLE children 
                    ADD COLUMN birth_registration TEXT
                """))
            else:
                # MySQL JSON column type (MySQL 5.7+)
                conn.execute(text("""
                    ALTER TABLE children 
                    ADD COLUMN birth_registration JSON NULL
                """))
            
            trans.commit()
            print("[SUCCESS] Column added successfully!")
            
        except Exception as e:
            trans.rollback()
            print(f"[ERROR] Failed to add column: {e}")
            raise

if __name__ == "__main__":
    main()
