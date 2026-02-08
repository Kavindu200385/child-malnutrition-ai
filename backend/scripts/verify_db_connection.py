"""Script to verify database connection and show configuration."""

import sys
import os

# Add project root to Python path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Load .env file
from dotenv import load_dotenv
env_path = os.path.join(project_root, 'backend', '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)
    print(f"✅ Loaded .env from: {env_path}\n")
else:
    print(f"⚠️  .env file not found at {env_path}\n")

from backend.app import create_app
from backend.config import Config

def main() -> None:
    print("=== Database Configuration ===\n")
    
    # Show environment variables (without showing password)
    db_host = os.environ.get("DB_HOST")
    db_port = os.environ.get("DB_PORT", "3306")
    db_username = os.environ.get("DB_USERNAME")
    db_password = os.environ.get("DB_PASSWORD")
    db_name = os.environ.get("DB_NAME")
    database_url = os.environ.get("DATABASE_URL")
    
    print("Environment Variables:")
    print(f"  DB_HOST: {db_host or 'NOT SET'}")
    print(f"  DB_PORT: {db_port}")
    print(f"  DB_USERNAME: {db_username or 'NOT SET'}")
    print(f"  DB_PASSWORD: {'***' if db_password else 'NOT SET'}")
    print(f"  DB_NAME: {db_name or 'NOT SET'}")
    print(f"  DATABASE_URL: {'SET' if database_url else 'NOT SET'}")
    print()
    
    # Create app and show actual database URI
    app = create_app()
    db_uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
    
    print("Actual Database URI:")
    # Mask password in URI
    if '@' in db_uri:
        parts = db_uri.split('@')
        if len(parts) == 2:
            masked_uri = parts[0].split('://')[0] + '://' + parts[0].split('://')[1].split(':')[0] + ':***@' + parts[1]
            print(f"  {masked_uri}")
        else:
            print(f"  {db_uri}")
    else:
        print(f"  {db_uri}")
    print()
    
    # Test connection
    print("Testing Database Connection...")
    try:
        with app.app_context():
            from backend.extensions import db
            # Try to connect
            with db.engine.connect() as conn:
                print("✅ Database connection successful!")
                
                # Show database info
                if 'mysql' in db_uri.lower():
                    result = conn.execute(db.text("SELECT DATABASE()")).fetchone()
                    current_db = result[0] if result else "Unknown"
                    print(f"  Connected to MySQL database: {current_db}")
                elif 'sqlite' in db_uri.lower():
                    print(f"  Using SQLite database")
                    print(f"  ⚠️  WARNING: Data is being saved to SQLite, not MySQL!")
                    print(f"  SQLite file location: {db_uri.replace('sqlite:///', '')}")
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        print("\nTroubleshooting:")
        print("  1. Check if MySQL server is running")
        print("  2. Verify DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME in backend/.env")
        print("  3. Make sure the database 'cmras' exists in MySQL")
        print("  4. Check if PyMySQL is installed: pip install PyMySQL")


if __name__ == "__main__":
    main()
