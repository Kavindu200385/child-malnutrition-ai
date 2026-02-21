"""
Seed Script for Initial Area Hierarchy
Creates the 5-level hierarchy: Ministry → PDHS → RDHS → MOH → PHM
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
# Avoid importing models to prevent conflicts - use raw SQL instead

# Sri Lankan provinces and districts
PROVINCES = {
    "Western": ["Colombo", "Gampaha", "Kalutara"],
    "Central": ["Kandy", "Matale", "Nuwara Eliya"],
    "Southern": ["Galle", "Matara", "Hambantota"],
    "Northern": ["Jaffna", "Kilinochchi", "Mannar", "Mullaitivu", "Vavuniya"],
    "Eastern": ["Batticaloa", "Ampara", "Trincomalee"],
    "North Western": ["Kurunegala", "Puttalam"],
    "North Central": ["Anuradhapura", "Polonnaruwa"],
    "Uva": ["Badulla", "Moneragala"],
    "Sabaragamuwa": ["Ratnapura", "Kegalle"],
}

# Sample MOH areas per district (simplified - in reality there are many more)
MOH_AREAS_PER_DISTRICT = {
    "Colombo": ["Colombo MOH Area 1", "Colombo MOH Area 2", "Colombo MOH Area 3"],
    "Gampaha": ["Gampaha MOH Area 1", "Gampaha MOH Area 2"],
    "Kalutara": ["Kalutara MOH Area 1"],
    "Kandy": ["Kandy MOH Area 1", "Kandy MOH Area 2"],
    "Matale": ["Matale MOH Area 1"],
    "Nuwara Eliya": ["Nuwara Eliya MOH Area 1"],
    "Galle": ["Galle MOH Area 1", "Galle MOH Area 2"],
    "Matara": ["Matara MOH Area 1"],
    "Hambantota": ["Hambantota MOH Area 1"],
}

# Sample PHM areas per MOH area (simplified)
PHM_AREAS_PER_MOH = 3  # Each MOH area has 3 PHM areas


def create_area_hierarchy():
    """Create the complete 5-level area hierarchy"""
    db_uri = Config.SQLALCHEMY_DATABASE_URI
    print(f"Database URI: {db_uri}")
    
    engine = create_engine(db_uri)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        # Check if hierarchy already exists using raw SQL
        existing_ministry = session.execute(
            text("SELECT id FROM areas WHERE level = 'ministry' AND is_active = 1 LIMIT 1")
        ).fetchone()
        
        if existing_ministry:
            print("[INFO] Area hierarchy already exists.")
            print("[INFO] Skipping creation. Use --force flag or manually delete areas to recreate.")
            return
        
        # Count existing areas
        existing_count = session.execute(
            text("SELECT COUNT(*) FROM areas WHERE is_active = 1")
        ).scalar()
        if existing_count > 0:
            print(f"[INFO] Found {existing_count} existing active areas. Will add new areas to existing hierarchy.")
        
        print("\n=== Creating Area Hierarchy ===\n")
        
        # 1. Create Ministry (root) using raw SQL
        result = session.execute(
            text("""
                INSERT INTO areas (name, code, level, parent_id, province, district, description, is_active, created_at, updated_at)
                VALUES (:name, :code, :level, NULL, NULL, NULL, :description, 1, NOW(), NOW())
            """),
            {
                "name": "Ministry of Health, Sri Lanka",
                "code": "MINISTRY",
                "level": "ministry",
                "description": "National Health Ministry - Root of hierarchy",
            }
        )
        session.flush()
        ministry_id = session.execute(text("SELECT LAST_INSERT_ID()")).scalar()
        print(f"[SUCCESS] Created Ministry: Ministry of Health, Sri Lanka (ID: {ministry_id})")
        
        # 2. Create PDHS (Provinces) using raw SQL
        pdhs_areas = {}
        for province_name in PROVINCES.keys():
            session.execute(
                text("""
                    INSERT INTO areas (name, code, level, parent_id, province, district, description, is_active, created_at, updated_at)
                    VALUES (:name, :code, :level, :parent_id, :province, NULL, :description, 1, NOW(), NOW())
                """),
                {
                    "name": f"{province_name} Provincial Department of Health Services",
                    "code": f"PDHS_{province_name.upper().replace(' ', '_')}",
                    "level": "pdhs",
                    "parent_id": ministry_id,
                    "province": province_name,
                    "description": f"Provincial health services for {province_name} Province",
                }
            )
            session.flush()
            pdhs_id = session.execute(text("SELECT LAST_INSERT_ID()")).scalar()
            pdhs_areas[province_name] = {"id": pdhs_id, "name": f"{province_name} Provincial Department of Health Services"}
            print(f"[SUCCESS] Created PDHS: {pdhs_areas[province_name]['name']} (ID: {pdhs_id})")
        
        # 3. Create RDHS (Districts) using raw SQL
        rdhs_areas = {}
        for province_name, districts in PROVINCES.items():
            pdhs_id = pdhs_areas[province_name]["id"]
            for district_name in districts:
                session.execute(
                    text("""
                        INSERT INTO areas (name, code, level, parent_id, province, district, description, is_active, created_at, updated_at)
                        VALUES (:name, :code, :level, :parent_id, :province, :district, :description, 1, NOW(), NOW())
                    """),
                    {
                        "name": f"{district_name} Regional Department of Health Services",
                        "code": f"RDHS_{district_name.upper().replace(' ', '_')}",
                        "level": "rdhs",
                        "parent_id": pdhs_id,
                        "province": province_name,
                        "district": district_name,
                        "description": f"Regional health services for {district_name} District",
                    }
                )
                session.flush()
                rdhs_id = session.execute(text("SELECT LAST_INSERT_ID()")).scalar()
                rdhs_areas[district_name] = {"id": rdhs_id, "name": f"{district_name} Regional Department of Health Services"}
                print(f"[SUCCESS] Created RDHS: {rdhs_areas[district_name]['name']} (ID: {rdhs_id})")
        
        # 4. Create MOH Areas using raw SQL
        moh_areas = {}
        for district_name, rdhs_data in rdhs_areas.items():
            rdhs_id = rdhs_data["id"]
            # Get province from first PDHS that has this district
            province_name = None
            for prov, dists in PROVINCES.items():
                if district_name in dists:
                    province_name = prov
                    break
            
            moh_list = MOH_AREAS_PER_DISTRICT.get(district_name, [])
            if not moh_list:
                # Create default MOH area if not specified
                moh_list = [f"{district_name} MOH Area 1"]
            
            for moh_name in moh_list:
                session.execute(
                    text("""
                        INSERT INTO areas (name, code, level, parent_id, province, district, description, is_active, created_at, updated_at)
                        VALUES (:name, :code, :level, :parent_id, :province, :district, :description, 1, NOW(), NOW())
                    """),
                    {
                        "name": moh_name,
                        "code": f"MOH_{district_name.upper().replace(' ', '_')}_{moh_name.split()[-1]}",
                        "level": "moh",
                        "parent_id": rdhs_id,
                        "province": province_name,
                        "district": district_name,
                        "description": f"Medical Officer of Health area in {district_name}",
                    }
                )
                session.flush()
                moh_id = session.execute(text("SELECT LAST_INSERT_ID()")).scalar()
                moh_key = f"{district_name}_{moh_name}"
                moh_areas[moh_key] = {"id": moh_id, "name": moh_name}
                print(f"[SUCCESS] Created MOH: {moh_name} (ID: {moh_id})")
        
        # 5. Create PHM Areas (Midwife areas) using raw SQL
        phm_count = 0
        for moh_key, moh_data in moh_areas.items():
            moh_id = moh_data["id"]
            moh_name = moh_data["name"]
            # Get district and province from MOH area
            moh_info = session.execute(
                text("SELECT district, province FROM areas WHERE id = :id"),
                {"id": moh_id}
            ).fetchone()
            district = moh_info[0] if moh_info else None
            province = moh_info[1] if moh_info else None
            
            for i in range(1, PHM_AREAS_PER_MOH + 1):
                phm_code = f"PHM_{moh_key.replace(' ', '_').replace('-', '_')}_{i}"
                session.execute(
                    text("""
                        INSERT INTO areas (name, code, level, parent_id, province, district, description, is_active, created_at, updated_at)
                        VALUES (:name, :code, :level, :parent_id, :province, :district, :description, 1, NOW(), NOW())
                    """),
                    {
                        "name": f"{moh_name} - PHM Area {i}",
                        "code": phm_code,
                        "level": "phm",
                        "parent_id": moh_id,
                        "province": province,
                        "district": district,
                        "description": f"Public Health Midwife area {i} under {moh_name}",
                    }
                )
                session.flush()
                phm_count += 1
                if phm_count % 10 == 0:
                    print(f"[PROGRESS] Created {phm_count} PHM areas...")
        
        session.commit()
        
        print(f"\n=== Hierarchy Created Successfully ===\n")
        print(f"Summary:")
        print(f"  - Ministry: 1")
        print(f"  - PDHS (Provinces): {len(pdhs_areas)}")
        print(f"  - RDHS (Districts): {len(rdhs_areas)}")
        print(f"  - MOH Areas: {len(moh_areas)}")
        print(f"  - PHM Areas: {phm_count}")
        print(f"  - Total Areas: {1 + len(pdhs_areas) + len(rdhs_areas) + len(moh_areas) + phm_count}")
        
    except Exception as e:
        session.rollback()
        print(f"\n[ERROR] Failed to create hierarchy: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    create_area_hierarchy()
