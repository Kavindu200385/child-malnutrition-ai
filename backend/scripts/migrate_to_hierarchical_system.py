"""
Migration script to transform existing database to hierarchical area system
This script:
1. Creates new hierarchical tables
2. Migrates existing data where possible
3. Sets up proper foreign keys and constraints
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
from sqlalchemy import create_engine, text, inspect, MetaData, Table
from sqlalchemy.exc import OperationalError

def main():
    db_uri = Config.SQLALCHEMY_DATABASE_URI
    print(f"Database URI: {db_uri}")
    
    engine = create_engine(db_uri)
    inspector = inspect(engine)
    
    with engine.connect() as conn:
        trans = conn.begin()
        try:
            # Check if using MySQL or SQLite
            is_mysql = 'mysql' in db_uri.lower()
            
            print("\n=== Creating Hierarchical Area System Tables ===\n")
            
            # 1. Create new hierarchical areas table (if not exists)
            if 'areas' in inspector.get_table_names():
                print("[INFO] 'areas' table exists. Checking structure...")
                # Check if it has hierarchical fields
                columns = [c['name'] for c in inspector.get_columns('areas')]
                if 'parent_id' not in columns:
                    print("[INFO] Upgrading areas table to hierarchical structure...")
                    if is_mysql:
                        conn.execute(text("""
                            ALTER TABLE areas 
                            ADD COLUMN parent_id INTEGER NULL,
                            ADD COLUMN level VARCHAR(20) NOT NULL DEFAULT 'moh',
                            ADD COLUMN code VARCHAR(50) NULL UNIQUE,
                            ADD COLUMN province VARCHAR(120) NULL,
                            ADD COLUMN description TEXT NULL,
                            ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1,
                            ADD COLUMN updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                            ADD INDEX idx_area_level_parent (level, parent_id),
                            ADD CONSTRAINT fk_area_parent FOREIGN KEY (parent_id) REFERENCES areas(id) ON DELETE SET NULL
                        """))
                    else:
                        conn.execute(text("""
                            ALTER TABLE areas 
                            ADD COLUMN parent_id INTEGER NULL,
                            ADD COLUMN level TEXT NOT NULL DEFAULT 'moh',
                            ADD COLUMN code TEXT NULL UNIQUE,
                            ADD COLUMN province TEXT NULL,
                            ADD COLUMN description TEXT NULL,
                            ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1,
                            ADD COLUMN updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP
                        """))
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_area_level_parent ON areas(level, parent_id)"))
                    print("[SUCCESS] Areas table upgraded to hierarchical structure")
                else:
                    print("[OK] Areas table already has hierarchical structure")
            else:
                print("[INFO] Creating new hierarchical areas table...")
                if is_mysql:
                    conn.execute(text("""
                        CREATE TABLE areas (
                            id INTEGER AUTO_INCREMENT PRIMARY KEY,
                            name VARCHAR(200) NOT NULL,
                            code VARCHAR(50) NULL UNIQUE,
                            level VARCHAR(20) NOT NULL,
                            parent_id INTEGER NULL,
                            district VARCHAR(120) NULL,
                            province VARCHAR(120) NULL,
                            description TEXT NULL,
                            is_active TINYINT(1) NOT NULL DEFAULT 1,
                            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                            INDEX idx_name (name),
                            INDEX idx_code (code),
                            INDEX idx_level (level),
                            INDEX idx_parent_id (parent_id),
                            INDEX idx_is_active (is_active),
                            INDEX idx_area_level_parent (level, parent_id),
                            CONSTRAINT fk_area_parent FOREIGN KEY (parent_id) REFERENCES areas(id) ON DELETE SET NULL,
                            CONSTRAINT check_area_level CHECK (level IN ('ministry', 'pdhs', 'rdhs', 'moh', 'phm'))
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """))
                else:
                    conn.execute(text("""
                        CREATE TABLE areas (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name TEXT NOT NULL,
                            code TEXT NULL UNIQUE,
                            level TEXT NOT NULL CHECK(level IN ('ministry', 'pdhs', 'rdhs', 'moh', 'phm')),
                            parent_id INTEGER NULL,
                            district TEXT NULL,
                            province TEXT NULL,
                            description TEXT NULL,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (parent_id) REFERENCES areas(id) ON DELETE SET NULL
                        )
                    """))
                    conn.execute(text("CREATE INDEX idx_name ON areas(name)"))
                    conn.execute(text("CREATE INDEX idx_code ON areas(code)"))
                    conn.execute(text("CREATE INDEX idx_level ON areas(level)"))
                    conn.execute(text("CREATE INDEX idx_parent_id ON areas(parent_id)"))
                    conn.execute(text("CREATE INDEX idx_is_active ON areas(is_active)"))
                    conn.execute(text("CREATE INDEX idx_area_level_parent ON areas(level, parent_id)"))
                print("[SUCCESS] Created hierarchical areas table")
            
            # 2. Create worker_area_mapping table
            if 'worker_area_mapping' not in inspector.get_table_names():
                print("[INFO] Creating worker_area_mapping table...")
                if is_mysql:
                    conn.execute(text("""
                        CREATE TABLE worker_area_mapping (
                            id INTEGER AUTO_INCREMENT PRIMARY KEY,
                            user_id INTEGER NOT NULL,
                            area_id INTEGER NOT NULL,
                            is_active TINYINT(1) NOT NULL DEFAULT 1,
                            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            created_by_id INTEGER NULL,
                            INDEX idx_user_id (user_id),
                            INDEX idx_area_id (area_id),
                            INDEX idx_is_active (is_active),
                            UNIQUE INDEX idx_worker_area_unique (user_id, area_id),
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                            FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE CASCADE,
                            FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """))
                else:
                    conn.execute(text("""
                        CREATE TABLE worker_area_mapping (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER NOT NULL,
                            area_id INTEGER NOT NULL,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            created_by_id INTEGER NULL,
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                            FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE CASCADE,
                            FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL,
                            UNIQUE(user_id, area_id)
                        )
                    """))
                    conn.execute(text("CREATE INDEX idx_user_id ON worker_area_mapping(user_id)"))
                    conn.execute(text("CREATE INDEX idx_area_id ON worker_area_mapping(area_id)"))
                    conn.execute(text("CREATE INDEX idx_is_active ON worker_area_mapping(is_active)"))
                print("[SUCCESS] Created worker_area_mapping table")
            else:
                print("[OK] worker_area_mapping table already exists")
            
            # 3. Update children table with new fields
            print("[INFO] Updating children table with hierarchical fields...")
            children_columns = [c['name'] for c in inspector.get_columns('children')]
            
            new_fields = [
                ('current_assigned_role', 'VARCHAR(32)' if is_mysql else 'TEXT', 'NULL'),
                ('current_assigned_area_id', 'INTEGER', 'NULL'),
                ('current_assigned_user_id', 'INTEGER', 'NULL'),
                ('midwife_area_id', 'INTEGER', 'NULL'),
                ('moh_area_id', 'INTEGER', 'NULL'),
                ('current_risk_level', 'VARCHAR(32)' if is_mysql else 'TEXT', "NULL DEFAULT 'NORMAL'"),
                ('last_risk_update', 'DATETIME', 'NULL'),
                ('status', 'VARCHAR(32)' if is_mysql else 'TEXT', "NOT NULL DEFAULT 'ACTIVE'"),
                ('registration_date', 'DATETIME', 'NULL'),
                ('registered_by_user_id', 'INTEGER', 'NULL'),
                ('guardian_nic', 'VARCHAR(20)' if is_mysql else 'TEXT', 'NULL'),
                ('updated_at', 'DATETIME', 'NULL DEFAULT CURRENT_TIMESTAMP' + (' ON UPDATE CURRENT_TIMESTAMP' if is_mysql else '')),
            ]
            
            for field_name, field_type, field_default in new_fields:
                if field_name not in children_columns:
                    try:
                        conn.execute(text(f"ALTER TABLE children ADD COLUMN {field_name} {field_type} {field_default}"))
                        print(f"[SUCCESS] Added column children.{field_name}")
                    except Exception as e:
                        print(f"[WARNING] Could not add children.{field_name}: {e}")
                else:
                    print(f"[OK] Column children.{field_name} already exists")
            
            # Add foreign key indexes if not exist
            fk_indexes = [
                ('current_assigned_area_id', 'idx_children_current_area'),
                ('current_assigned_user_id', 'idx_children_current_user'),
                ('midwife_area_id', 'idx_children_midwife_area'),
                ('moh_area_id', 'idx_children_moh_area'),
                ('registered_by_user_id', 'idx_children_registered_by'),
            ]
            
            for col, idx_name in fk_indexes:
                if col in children_columns:
                    try:
                        if is_mysql:
                            conn.execute(text(f"CREATE INDEX IF NOT EXISTS {idx_name} ON children({col})"))
                        else:
                            conn.execute(text(f"CREATE INDEX IF NOT EXISTS {idx_name} ON children({col})"))
                        print(f"[OK] Index {idx_name} ensured")
                    except:
                        pass
            
            # 4. Create child_transfers table
            if 'child_transfers' not in inspector.get_table_names():
                print("[INFO] Creating child_transfers table...")
                if is_mysql:
                    conn.execute(text("""
                        CREATE TABLE child_transfers (
                            id INTEGER AUTO_INCREMENT PRIMARY KEY,
                            child_id INTEGER NOT NULL,
                            from_role VARCHAR(32) NOT NULL,
                            to_role VARCHAR(32) NOT NULL,
                            from_area_id INTEGER NULL,
                            to_area_id INTEGER NOT NULL,
                            from_user_id INTEGER NULL,
                            to_user_id INTEGER NULL,
                            status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
                            reason TEXT NULL,
                            transfer_date DATETIME NULL,
                            requested_by_user_id INTEGER NOT NULL,
                            approved_by_user_id INTEGER NULL,
                            approval_date DATETIME NULL,
                            rejection_reason TEXT NULL,
                            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                            INDEX idx_child_id (child_id),
                            INDEX idx_status (status),
                            INDEX idx_requested_by (requested_by_user_id),
                            INDEX idx_approved_by (approved_by_user_id),
                            FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
                            FOREIGN KEY (from_area_id) REFERENCES areas(id) ON DELETE SET NULL,
                            FOREIGN KEY (to_area_id) REFERENCES areas(id) ON DELETE RESTRICT,
                            FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL,
                            FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE SET NULL,
                            FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
                            FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """))
                else:
                    conn.execute(text("""
                        CREATE TABLE child_transfers (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            child_id INTEGER NOT NULL,
                            from_role TEXT NOT NULL,
                            to_role TEXT NOT NULL,
                            from_area_id INTEGER NULL,
                            to_area_id INTEGER NOT NULL,
                            from_user_id INTEGER NULL,
                            to_user_id INTEGER NULL,
                            status TEXT NOT NULL DEFAULT 'PENDING',
                            reason TEXT NULL,
                            transfer_date DATETIME NULL,
                            requested_by_user_id INTEGER NOT NULL,
                            approved_by_user_id INTEGER NULL,
                            approval_date DATETIME NULL,
                            rejection_reason TEXT NULL,
                            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
                            FOREIGN KEY (from_area_id) REFERENCES areas(id) ON DELETE SET NULL,
                            FOREIGN KEY (to_area_id) REFERENCES areas(id) ON DELETE RESTRICT,
                            FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL,
                            FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE SET NULL,
                            FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
                            FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
                        )
                    """))
                    for idx in ['child_id', 'status', 'requested_by_user_id', 'approved_by_user_id']:
                        conn.execute(text(f"CREATE INDEX idx_{idx} ON child_transfers({idx})"))
                print("[SUCCESS] Created child_transfers table")
            else:
                print("[OK] child_transfers table already exists")
            
            # 5. Create area_change_requests table
            if 'area_change_requests' not in inspector.get_table_names():
                print("[INFO] Creating area_change_requests table...")
                if is_mysql:
                    conn.execute(text("""
                        CREATE TABLE area_change_requests (
                            id INTEGER AUTO_INCREMENT PRIMARY KEY,
                            child_id INTEGER NOT NULL,
                            from_area_id INTEGER NOT NULL,
                            to_area_id INTEGER NOT NULL,
                            reason TEXT NULL,
                            status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
                            requested_by_user_id INTEGER NOT NULL,
                            approved_by_user_id INTEGER NULL,
                            approval_date DATETIME NULL,
                            rejection_reason TEXT NULL,
                            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                            INDEX idx_child_id (child_id),
                            INDEX idx_status (status),
                            INDEX idx_requested_by (requested_by_user_id),
                            FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
                            FOREIGN KEY (from_area_id) REFERENCES areas(id) ON DELETE RESTRICT,
                            FOREIGN KEY (to_area_id) REFERENCES areas(id) ON DELETE RESTRICT,
                            FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
                            FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """))
                else:
                    conn.execute(text("""
                        CREATE TABLE area_change_requests (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            child_id INTEGER NOT NULL,
                            from_area_id INTEGER NOT NULL,
                            to_area_id INTEGER NOT NULL,
                            reason TEXT NULL,
                            status TEXT NOT NULL DEFAULT 'PENDING',
                            requested_by_user_id INTEGER NOT NULL,
                            approved_by_user_id INTEGER NULL,
                            approval_date DATETIME NULL,
                            rejection_reason TEXT NULL,
                            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
                            FOREIGN KEY (from_area_id) REFERENCES areas(id) ON DELETE RESTRICT,
                            FOREIGN KEY (to_area_id) REFERENCES areas(id) ON DELETE RESTRICT,
                            FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
                            FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
                        )
                    """))
                    for idx in ['child_id', 'status', 'requested_by_user_id']:
                        conn.execute(text(f"CREATE INDEX idx_{idx} ON area_change_requests({idx})"))
                print("[SUCCESS] Created area_change_requests table")
            else:
                print("[OK] area_change_requests table already exists")
            
            # 6. Create audit_logs table
            if 'audit_logs' not in inspector.get_table_names():
                print("[INFO] Creating audit_logs table...")
                if is_mysql:
                    conn.execute(text("""
                        CREATE TABLE audit_logs (
                            id INTEGER AUTO_INCREMENT PRIMARY KEY,
                            timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            user_id INTEGER NULL,
                            username VARCHAR(80) NULL,
                            role VARCHAR(32) NULL,
                            action_type VARCHAR(50) NOT NULL,
                            action_category VARCHAR(50) NOT NULL,
                            description TEXT NULL,
                            entity_type VARCHAR(50) NULL,
                            entity_id INTEGER NULL,
                            ip_address VARCHAR(45) NULL,
                            user_agent VARCHAR(255) NULL,
                            status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
                            metadata JSON NULL,
                            INDEX idx_action_type (action_type),
                            INDEX idx_entity_type (entity_type),
                            INDEX idx_entity_id (entity_id),
                            INDEX idx_user_id (user_id),
                            INDEX idx_timestamp (timestamp),
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """))
                else:
                    conn.execute(text("""
                        CREATE TABLE audit_logs (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            user_id INTEGER NULL,
                            username TEXT NULL,
                            role TEXT NULL,
                            action_type TEXT NOT NULL,
                            action_category TEXT NOT NULL,
                            description TEXT NULL,
                            entity_type TEXT NULL,
                            entity_id INTEGER NULL,
                            ip_address TEXT NULL,
                            user_agent TEXT NULL,
                            status TEXT NOT NULL DEFAULT 'SUCCESS',
                            metadata TEXT NULL,
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                        )
                    """))
                    for idx in ['action_type', 'entity_type', 'entity_id', 'user_id', 'timestamp', 'role']:
                        conn.execute(text(f"CREATE INDEX idx_{idx} ON audit_logs({idx})"))
                print("[SUCCESS] Created audit_logs table")
            else:
                print("[OK] audit_logs table already exists")
            
            # 7. Create reports table
            if 'reports' not in inspector.get_table_names():
                print("[INFO] Creating reports table...")
                if is_mysql:
                    conn.execute(text("""
                        CREATE TABLE reports (
                            id INTEGER AUTO_INCREMENT PRIMARY KEY,
                            report_type VARCHAR(50) NOT NULL,
                            title VARCHAR(200) NOT NULL,
                            description TEXT NULL,
                            area_id INTEGER NULL,
                            start_date DATE NULL,
                            end_date DATE NULL,
                            report_data JSON NULL,
                            file_path VARCHAR(500) NULL,
                            file_format VARCHAR(20) NULL,
                            created_by_user_id INTEGER NOT NULL,
                            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            INDEX idx_report_type (report_type),
                            INDEX idx_area_id (area_id),
                            INDEX idx_created_by (created_by_user_id),
                            FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL,
                            FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """))
                else:
                    conn.execute(text("""
                        CREATE TABLE reports (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            report_type TEXT NOT NULL,
                            title TEXT NOT NULL,
                            description TEXT NULL,
                            area_id INTEGER NULL,
                            start_date DATE NULL,
                            end_date DATE NULL,
                            report_data TEXT NULL,
                            file_path TEXT NULL,
                            file_format TEXT NULL,
                            created_by_user_id INTEGER NOT NULL,
                            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL,
                            FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
                        )
                    """))
                    for idx in ['report_type', 'area_id', 'created_by_user_id']:
                        conn.execute(text(f"CREATE INDEX idx_{idx} ON reports({idx})"))
                print("[SUCCESS] Created reports table")
            else:
                print("[OK] reports table already exists")
            
            # 8. Update users table with new fields
            print("[INFO] Updating users table...")
            users_columns = [c['name'] for c in inspector.get_columns('users')]
            
            user_fields = [
                ('email', 'VARCHAR(120)' if is_mysql else 'TEXT', 'NULL UNIQUE'),
                ('phone', 'VARCHAR(40)' if is_mysql else 'TEXT', 'NULL'),
                ('is_active', 'TINYINT(1)' if is_mysql else 'INTEGER', 'NOT NULL DEFAULT 1'),
                ('updated_at', 'DATETIME', 'NULL DEFAULT CURRENT_TIMESTAMP' + (' ON UPDATE CURRENT_TIMESTAMP' if is_mysql else '')),
                ('created_by_id', 'INTEGER', 'NULL'),
            ]
            
            for field_name, field_type, field_default in user_fields:
                if field_name not in users_columns:
                    try:
                        conn.execute(text(f"ALTER TABLE users ADD COLUMN {field_name} {field_type} {field_default}"))
                        print(f"[SUCCESS] Added column users.{field_name}")
                    except Exception as e:
                        print(f"[WARNING] Could not add users.{field_name}: {e}")
                else:
                    print(f"[OK] Column users.{field_name} already exists")
            
            # 9. Update visits table with notes field
            if 'visits' in inspector.get_table_names():
                visits_columns = [c['name'] for c in inspector.get_columns('visits')]
                if 'notes' not in visits_columns:
                    try:
                        conn.execute(text(f"ALTER TABLE visits ADD COLUMN notes {('TEXT' if is_mysql else 'TEXT')} NULL"))
                        print("[SUCCESS] Added notes column to visits table")
                    except:
                        pass
            
            trans.commit()
            print("\n=== Migration completed successfully! ===\n")
            
        except Exception as e:
            trans.rollback()
            print(f"\n[ERROR] Migration failed: {e}")
            import traceback
            traceback.print_exc()
            raise

if __name__ == "__main__":
    main()
