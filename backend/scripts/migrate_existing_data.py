"""
Migration Script for Existing Data
Migrates existing children and users to hierarchical system
"""
import sys
import os

# Add project root to path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from dotenv import load_dotenv
env_path = os.path.join(project_root, 'backend', '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)

from backend.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import sys
import os

# Import legacy models first
from backend.models import User as LegacyUser, Child as LegacyChild, db as legacy_db

# Now import hierarchical models (they will extend existing tables)
# We need to be careful about the Area model conflict
try:
    from backend.models_hierarchical import User, Child, Area, WorkerAreaMapping, RiskLevel
except Exception as e:
    print(f"[WARNING] Could not import hierarchical models: {e}")
    print("[INFO] Will use direct SQL for migration")
    User = None
    Child = None
    Area = None
    WorkerAreaMapping = None
    RiskLevel = None


def migrate_users():
    """Migrate existing users to hierarchical system"""
    db_uri = Config.SQLALCHEMY_DATABASE_URI
    engine = create_engine(db_uri)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        print("\n=== Migrating Users ===\n")
        
        # Get all legacy users using raw SQL to avoid model conflicts
        result = session.execute(text("SELECT * FROM users"))
        legacy_users_data = result.fetchall()
        columns = result.keys()
        
        # Convert to dict format
        legacy_users = []
        for row in legacy_users_data:
            user_dict = dict(zip(columns, row))
            legacy_users.append(user_dict)
        
        print(f"Found {len(legacy_users)} legacy users")
        
        migrated_count = 0
        for legacy_user_data in legacy_users:
            username = legacy_user_data['username']
            
            # Check if already migrated using raw SQL
            existing = session.execute(
                text("SELECT id FROM users WHERE username = :username"),
                {"username": username}
            ).fetchone()
            
            if existing:
                print(f"[SKIP] User {username} already exists in hierarchical system")
                continue
            
            # Map old roles to new roles
            role_mapping = {
                "admin": "health_ministry",  # Admin becomes Health Ministry
                "hospital": "hospital",
                "midwife": "midwife",
                "moh_doctor": "moh",  # MOH doctor becomes MOH
                "nutritionist": "nutritionist",
            }
            
            old_role = legacy_user_data.get('role', '')
            new_role = role_mapping.get(old_role, old_role)
            
            # Create new user using raw SQL to avoid model conflicts
            session.execute(
                text("""
                    INSERT INTO users (username, password_hash, name, role, clinic, district, is_active, created_at, updated_at)
                    VALUES (:username, :password_hash, :name, :role, :clinic, :district, :is_active, NOW(), NOW())
                """),
                {
                    "username": legacy_user_data['username'],
                    "password_hash": legacy_user_data['password_hash'],
                    "name": legacy_user_data['name'],
                    "role": new_role,
                    "clinic": legacy_user_data.get('clinic'),
                    "district": legacy_user_data.get('district'),
                    "is_active": True,
                }
            )
            session.flush()
            
            # Get the new user ID
            new_user_result = session.execute(
                text("SELECT id FROM users WHERE username = :username"),
                {"username": legacy_user_data['username']}
            ).fetchone()
            new_user_id = new_user_result[0] if new_user_result else None
            
            # Try to assign user to area based on clinic/district using raw SQL
            district = legacy_user_data.get('district')
            clinic = legacy_user_data.get('clinic')
            
            if district and new_user_id:
                # Find matching area using raw SQL
                if new_role == "midwife":
                    # Find PHM area in this district
                    phm_area = session.execute(
                        text("SELECT id, name FROM areas WHERE district = :district AND level = 'phm' AND is_active = 1 LIMIT 1"),
                        {"district": district}
                    ).fetchone()
                    if phm_area:
                        session.execute(
                            text("""
                                INSERT INTO worker_area_mapping (user_id, area_id, is_active, created_at)
                                VALUES (:user_id, :area_id, 1, NOW())
                                ON DUPLICATE KEY UPDATE is_active = 1
                            """),
                            {"user_id": new_user_id, "area_id": phm_area[0]}
                        )
                        print(f"[SUCCESS] Migrated user {username} ({new_role}) and assigned to {phm_area[1]}")
                    else:
                        print(f"[WARNING] No PHM area found for {username}")
                elif new_role in ["moh", "amoh"]:
                    # Find MOH area in this district
                    moh_area = session.execute(
                        text("SELECT id, name FROM areas WHERE district = :district AND level = 'moh' AND is_active = 1 LIMIT 1"),
                        {"district": district}
                    ).fetchone()
                    if moh_area:
                        session.execute(
                            text("""
                                INSERT INTO worker_area_mapping (user_id, area_id, is_active, created_at)
                                VALUES (:user_id, :area_id, 1, NOW())
                                ON DUPLICATE KEY UPDATE is_active = 1
                            """),
                            {"user_id": new_user_id, "area_id": moh_area[0]}
                        )
                        print(f"[SUCCESS] Migrated user {username} ({new_role}) and assigned to {moh_area[1]}")
                    else:
                        print(f"[WARNING] No MOH area found for {username}")
                else:
                    print(f"[SUCCESS] Migrated user {username} ({new_role}) - no area assignment needed")
            else:
                print(f"[SUCCESS] Migrated user {username} ({new_role})")
            
            migrated_count += 1
        
        session.commit()
        print(f"\n[SUCCESS] Migrated {migrated_count} users\n")
        
    except Exception as e:
        session.rollback()
        print(f"\n[ERROR] Failed to migrate users: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        session.close()


def migrate_children():
    """Migrate existing children to hierarchical system using raw SQL"""
    db_uri = Config.SQLALCHEMY_DATABASE_URI
    engine = create_engine(db_uri)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        print("\n=== Migrating Children ===\n")
        
        # Get all legacy children using raw SQL
        children_result = session.execute(text("SELECT * FROM children"))
        legacy_children_data = children_result.fetchall()
        children_columns = children_result.keys()
        
        # Convert to list of dicts
        legacy_children = [dict(zip(children_columns, row)) for row in legacy_children_data]
        print(f"Found {len(legacy_children)} legacy children")
        
        migrated_count = 0
        for legacy_child_data in legacy_children:
            child_id = legacy_child_data['child_id']
            
            # Check if already migrated
            existing = session.execute(
                text("SELECT id FROM children WHERE child_id = :child_id"),
                {"child_id": child_id}
            ).fetchone()
            
            if existing:
                print(f"[SKIP] Child {child_id} already exists in hierarchical system")
                continue
            
            # Find registered user
            registered_user_id = None
            if legacy_child_data.get('registered_by_clinic'):
                user_result = session.execute(
                    text("SELECT id FROM users WHERE clinic = :clinic LIMIT 1"),
                    {"clinic": legacy_child_data['registered_by_clinic']}
                ).fetchone()
                if user_result:
                    registered_user_id = user_result[0]
            
            # Get latest visit for risk level
            latest_visit = session.execute(
                text("SELECT current_risk FROM visits WHERE child_id_fk = :child_id ORDER BY visit_date DESC LIMIT 1"),
                {"child_id": legacy_child_data['id']}
            ).fetchone()
            
            risk_mapping = {
                "LOW": "NORMAL",
                "MODERATE": "MODERATE",
                "HIGH": "HIGH",
                "CRITICAL": "CRITICAL",
            }
            current_risk = "NORMAL"
            if latest_visit and latest_visit[0]:
                current_risk = risk_mapping.get(latest_visit[0].upper(), "NORMAL")
            
            # Update child record with new fields using raw SQL
            session.execute(
                text("""
                    UPDATE children SET
                        registered_by_user_id = :registered_by_user_id,
                        registration_date = :registration_date,
                        current_risk_level = :current_risk_level,
                        last_risk_update = :last_risk_update,
                        status = :status,
                        updated_at = NOW()
                    WHERE child_id = :child_id
                """),
                {
                    "child_id": child_id,
                    "registered_by_user_id": registered_user_id,
                    "registration_date": legacy_child_data.get('created_at'),
                    "current_risk_level": current_risk,
                    "last_risk_update": datetime.utcnow() if latest_visit else None,
                    "status": "ACTIVE" if not legacy_child_data.get('is_draft') else "DRAFT",
                }
            )
            
            # Try to assign to area if assigned_to_clinic exists
            if legacy_child_data.get('assigned_to_clinic'):
                # Find user with this clinic
                assigned_user = session.execute(
                    text("SELECT id, role FROM users WHERE clinic = :clinic LIMIT 1"),
                    {"clinic": legacy_child_data['assigned_to_clinic']}
                ).fetchone()
                
                if assigned_user:
                    user_id, user_role = assigned_user
                    # Get user's assigned area
                    user_area = session.execute(
                        text("SELECT area_id FROM worker_area_mapping WHERE user_id = :user_id AND is_active = 1 LIMIT 1"),
                        {"user_id": user_id}
                    ).fetchone()
                    
                    if user_area:
                        area_id = user_area[0]
                        session.execute(
                            text("""
                                UPDATE children SET
                                    current_assigned_role = :role,
                                    current_assigned_area_id = :area_id,
                                    current_assigned_user_id = :user_id,
                                    midwife_area_id = CASE WHEN :role = 'midwife' THEN :area_id ELSE midwife_area_id END,
                                    moh_area_id = CASE WHEN :role IN ('moh', 'amoh') THEN :area_id ELSE moh_area_id END
                                WHERE child_id = :child_id
                            """),
                            {
                                "child_id": child_id,
                                "role": user_role,
                                "area_id": area_id,
                                "user_id": user_id,
                            }
                        )
            
            migrated_count += 1
            if migrated_count % 10 == 0:
                print(f"[PROGRESS] Migrated {migrated_count} children...")
        
        session.commit()
        print(f"\n[SUCCESS] Migrated {migrated_count} children\n")
        
    except Exception as e:
        session.rollback()
        print(f"\n[ERROR] Failed to migrate children: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        session.close()


def main():
    """Run complete migration"""
    print("=" * 60)
    print("Existing Data Migration to Hierarchical System")
    print("=" * 60)
    
    # Skip interactive prompt for automated execution
    # Uncomment the following lines if you want interactive confirmation:
    # try:
    #     response = input("\nThis will migrate existing users and children. Continue? (yes/no): ")
    #     if response.lower() != 'yes':
    #         print("[CANCELLED] Exiting without changes.")
    #         return
    # except EOFError:
    #     print("[INFO] Running in non-interactive mode")
    
    print("\n[INFO] Starting migration...")
    migrate_users()
    migrate_children()
    
    print("\n" + "=" * 60)
    print("Migration Complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
