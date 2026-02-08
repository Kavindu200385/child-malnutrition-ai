from __future__ import annotations

from datetime import datetime, timedelta

from backend.extensions import db
from backend.models import Child, Visit


def _generate_child_data_for_clinic(clinic_index: int, clinic_prefix: str, district: str, num_children: int = 15):
    """Generate unique child data for a clinic (shared by all users in that clinic)."""
    children = []
    for i in range(num_children):
        child_num = clinic_index * 100 + i + 1  # Unique child numbers per clinic
        gender = "male" if i % 2 == 0 else "female"
        
        # Generate realistic names
        first_names_male = ["Saman", "Dilshan", "Pasindu", "Nisal", "Tharindu", "Kavindu", "Malith", "Chamara", "Kasun", "Dilshan"]
        first_names_female = ["Kavindi", "Amaya", "Nethmi", "Sachini", "Tharushi", "Dilini", "Sanduni", "Kamani", "Nadeesha", "Chamari"]
        last_names = ["Perera", "Silva", "Fernando", "Jayawardena", "Wijesinghe", "Bandara", "Wickramasinghe", "Rajapakse", "Kumara", "Jayasuriya"]
        
        first_name = first_names_male[child_num % len(first_names_male)] if gender == "male" else first_names_female[child_num % len(first_names_female)]
        last_name = last_names[(child_num + i) % len(last_names)]
        name = f"{first_name} {last_name}"
        
        # Generate DOB (ages between 6 months to 5 years)
        age_months = 6 + (child_num * 3) % 54  # 6 to 60 months
        dob = datetime.now() - timedelta(days=age_months * 30)
        
        # Generate visits with different risk levels
        visits_data = []
        num_visits = 2 + (child_num % 3)  # 2-4 visits per child
        
        for visit_idx in range(num_visits):
            visit_age = age_months - (num_visits - visit_idx - 1) * 2
            visit_date = datetime.now() - timedelta(days=(age_months - visit_age) * 30)
            
            # Vary risk levels
            risk_selector = (child_num + visit_idx) % 10
            if risk_selector < 2:  # 20% SAM
                risk = "sam"
                z_wfa = -3.0 - (visit_idx * 0.1)
                z_hfa = -2.7 - (visit_idx * 0.1)
                z_wfh = -2.9 - (visit_idx * 0.1)
                weight = 8.5 + visit_idx * 0.2
                height = 75.0 + visit_idx * 0.5
            elif risk_selector < 5:  # 30% MAM
                risk = "mam"
                z_wfa = -2.2 - (visit_idx * 0.1)
                z_hfa = -2.0 - (visit_idx * 0.1)
                z_wfh = -2.1 - (visit_idx * 0.1)
                weight = 9.5 + visit_idx * 0.3
                height = 78.0 + visit_idx * 0.6
            else:  # 50% Normal
                risk = "normal"
                z_wfa = -0.5 + (visit_idx * 0.1)
                z_hfa = -0.3 + (visit_idx * 0.1)
                z_wfh = -0.4 + (visit_idx * 0.1)
                weight = 11.0 + visit_idx * 0.4
                height = 82.0 + visit_idx * 0.7
            
            visits_data.append({
                "date": visit_date.strftime("%Y-%m-%d"),
                "age_months": visit_age,
                "weight": round(weight, 1),
                "height": round(height, 1),
                "z_wfa": round(z_wfa, 2),
                "z_hfa": round(z_hfa, 2),
                "z_wfh": round(z_wfh, 2),
                "risk": risk,
            })
        
        # Generate addresses based on district
        addresses = {
            "Colombo": ["Galle Road", "Kandy Road", "Temple Road", "Station Road", "Lake Road"],
            "Gampaha": ["Main Street", "Hospital Road", "Station Road", "Temple Street", "Market Road"],
            "Kandy": ["Peradeniya Road", "Temple Street", "Lake Road", "Main Street", "Hospital Road"],
        }
        street_names = addresses.get(district, ["Main Street", "Hospital Road", "Temple Road"])
        street = street_names[child_num % len(street_names)]
        address = f"{10 + child_num}, {street}, {district}"
        
        children.append({
            "child_id": f"{clinic_prefix}{i+1:03d}",  # COL001, COL002, etc.
            "name": name,
            "dob": dob.strftime("%Y-%m-%d"),
            "gender": gender,
            "guardian_name": f"{last_name} {first_names_female[child_num % len(first_names_female)]}",
            "guardian_phone": f"077-{1000000 + child_num * 1000 + i}",
            "address": address,
            "visits": visits_data,
        })
    
    return children


def reset_demo_children_data() -> dict:
    """
    Delete all existing children + visits, then insert NEW clinic-based dummy dataset.
    Returns counts for verification.
    """
    from backend.models import User
    
    # Delete visits first (FK), then children.
    deleted_visits = Visit.query.delete()
    deleted_children = Child.query.delete()
    db.session.commit()

    # Use the same clinic-based seeding logic
    users = User.query.filter(User.role != "admin").all()
    
    # Clinic prefix mapping
    clinic_prefix_map = {
        "Colombo PHM Clinic": "COL",
        "Gampaha MOH Office": "GAM",
        "Kandy Health Center": "KAN",
    }

    risk_to_current = {"normal": "LOW", "mam": "HIGH", "sam": "CRITICAL"}
    inserted_visits = 0
    inserted_children = 0

    # Group users by clinic
    clinics_seeded = set()
    
    for user in users:
        if not user.clinic or user.clinic in clinics_seeded:
            continue
        
        clinics_seeded.add(user.clinic)
        clinic_prefix = clinic_prefix_map.get(user.clinic, "CH")
        district = user.district or "Unknown"
        
        # Get all users in this clinic to distribute visits
        clinic_users = [u for u in users if u.clinic == user.clinic]
        
        if not clinic_users:
            continue
        
        # Generate children for this clinic (shared by all users in the clinic)
        clinic_index = len(clinics_seeded) - 1
        clinic_children = _generate_child_data_for_clinic(clinic_index, clinic_prefix, district, num_children=15)

        for c in clinic_children:
            child = Child(
                child_id=c["child_id"],
                name=c["name"],
                gender=c["gender"],
                guardian_name=c["guardian_name"],
                guardian_phone=c["guardian_phone"],
                address=c["address"],
            )
            child.dob = datetime.fromisoformat(c["dob"]).date()
            db.session.add(child)
            db.session.flush()
            inserted_children += 1

            sex = "M" if c["gender"] == "male" else "F"
            # Distribute visits across all users in the clinic
            for visit_idx, v in enumerate(c["visits"]):
                # Round-robin assignment of visits to users in the clinic
                visit_user = clinic_users[visit_idx % len(clinic_users)]
                
                visit = Visit(
                    child_id_fk=child.id,
                    visit_date=datetime.fromisoformat(v["date"]),
                    age_months=int(v["age_months"]),
                    sex=sex,
                    weight_kg=float(v["weight"]),
                    height_cm=float(v["height"]),
                    z_wfa=float(v["z_wfa"]),
                    z_hfa=float(v["z_hfa"]),
                    z_wfh=float(v["z_wfh"]),
                    current_risk=risk_to_current.get(v["risk"], "LOW"),
                    created_by_user_id=visit_user.id,  # Assign visit to a user in the clinic
                )
                db.session.add(visit)
                inserted_visits += 1

    db.session.commit()

    return {
        "deleted_children": int(deleted_children),
        "deleted_visits": int(deleted_visits),
        "inserted_children": inserted_children,
        "inserted_visits": inserted_visits,
        "clinics_seeded": list(clinics_seeded),
    }


def seed_demo_children_if_empty() -> int:
    """
    Seed demo children + visits shared by clinic.
    All users in the same clinic (midwife, MOH doctor, nutritionist) see the same children.
    Runs only if there are no children in the DB.
    Returns: number of Visit rows inserted.
    """
    if Child.query.count() > 0:
        return 0

    from backend.models import User
    
    # Get all non-admin users grouped by clinic
    users = User.query.filter(User.role != "admin").all()
    
    if not users:
        print("WARNING: No non-admin users found. Cannot seed children.")
        return 0
    
    # Clinic prefix mapping
    clinic_prefix_map = {
        "Colombo PHM Clinic": "COL",
        "Gampaha MOH Office": "GAM",
        "Kandy Health Center": "KAN",
    }

    risk_to_current = {"normal": "LOW", "mam": "HIGH", "sam": "CRITICAL"}
    inserted_visits = 0

    # Group users by clinic
    clinics_seeded = set()
    
    for user in users:
        if not user.clinic or user.clinic in clinics_seeded:
            continue
        
        clinics_seeded.add(user.clinic)
        clinic_prefix = clinic_prefix_map.get(user.clinic, "CH")
        district = user.district or "Unknown"
        
        # Get all users in this clinic to distribute visits
        clinic_users = [u for u in users if u.clinic == user.clinic]
        
        if not clinic_users:
            continue
        
        # Generate children for this clinic (shared by all users in the clinic)
        clinic_index = len(clinics_seeded) - 1
        clinic_children = _generate_child_data_for_clinic(clinic_index, clinic_prefix, district, num_children=15)

        for c in clinic_children:
            child = Child(
                child_id=c["child_id"],
                name=c["name"],
                gender=c["gender"],
                guardian_name=c["guardian_name"],
                guardian_phone=c["guardian_phone"],
                address=c["address"],
            )
            child.dob = datetime.fromisoformat(c["dob"]).date()
            db.session.add(child)
            db.session.flush()

            sex = "M" if c["gender"] == "male" else "F"
            # Distribute visits across all users in the clinic
            for visit_idx, v in enumerate(c["visits"]):
                # Round-robin assignment of visits to users in the clinic
                visit_user = clinic_users[visit_idx % len(clinic_users)]
                
                visit = Visit(
                    child_id_fk=child.id,
                    visit_date=datetime.fromisoformat(v["date"]),
                    age_months=int(v["age_months"]),
                    sex=sex,
                    weight_kg=float(v["weight"]),
                    height_cm=float(v["height"]),
                    z_wfa=float(v["z_wfa"]),
                    z_hfa=float(v["z_hfa"]),
                    z_wfh=float(v["z_wfh"]),
                    current_risk=risk_to_current.get(v["risk"], "LOW"),
                    created_by_user_id=visit_user.id,  # Assign visit to a user in the clinic
                )
                db.session.add(visit)
                inserted_visits += 1

    db.session.commit()
    print(f"Seeded {len(clinics_seeded)} clinics with children. Total visits: {inserted_visits}")
    return inserted_visits
