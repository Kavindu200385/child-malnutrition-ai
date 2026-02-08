"""
Child Malnutrition AI - Project Startup & Status Check
This script helps you verify your project setup and test the system.
"""

import os
import sys

def check_file_exists(filepath, description):
    """Check if a file exists and return status"""
    exists = os.path.exists(filepath)
    status = "[OK]" if exists else "[MISSING]"
    print(f"{status} {description}: {filepath}")
    return exists

def check_directory_exists(dirpath, description):
    """Check if a directory exists and return status"""
    exists = os.path.isdir(dirpath)
    status = "[OK]" if exists else "[MISSING]"
    print(f"{status} {description}: {dirpath}")
    return exists

def main():
    # Set UTF-8 encoding for Windows compatibility
    if sys.platform == 'win32':
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    
    print("=" * 80)
    print("CHILD MALNUTRITION AI - PROJECT STATUS CHECK")
    print("=" * 80)
    print()
    
    # Check Python version
    print("[INFO] SYSTEM INFORMATION:")
    print(f"   Python version: {sys.version.split()[0]}")
    print()
    
    # Check dependencies
    print("[DEPS] CHECKING DEPENDENCIES:")
    dependencies = {
        "pandas": "pandas",
        "numpy": "numpy",
        "scikit-learn": "sklearn",
        "joblib": "joblib",
        "xgboost": "xgboost"
    }
    
    missing_deps = []
    for package_name, import_name in dependencies.items():
        try:
            __import__(import_name)
            print(f"   [OK] {package_name}")
        except ImportError:
            print(f"   [MISSING] {package_name}")
            missing_deps.append(package_name)
    
    print()
    
    if missing_deps:
        print("[WARNING] Missing dependencies detected!")
        print(f"   Please run: pip install {' '.join(missing_deps)}")
        print("   Or install all: pip install -r requirements.txt")
        print()
    
    # Check project structure
    print("[STRUCTURE] CHECKING PROJECT STRUCTURE:")
    print()
    
    # Core files
    print("Core Python Files:")
    files_status = {
        "data_processing.py": "Data processing script",
        "model_training.py": "Model training script",
        "child_risk_analyzing.py": "Risk analysis engine",
        "requirements.txt": "Dependencies file"
    }
    
    all_files_ok = True
    for file, desc in files_status.items():
        if not check_file_exists(file, desc):
            all_files_ok = False
    
    print()
    
    # Models directory
    print("Models Directory:")
    models_ok = check_directory_exists("Models", "Models directory")
    
    if models_ok:
        model_files = {
            "Models/model_birth_to_2.joblib": "Model for 0-24 months",
            "Models/model_age_2_to_5.joblib": "Model for 24-60 months",
            "Models/label_encoder_birth_to_2.joblib": "Label encoder for 0-24 months",
            "Models/label_encoder_age_2_to_5.joblib": "Label encoder for 24-60 months"
        }
        
        for file, desc in model_files.items():
            check_file_exists(file, desc)
    
    print()
    
    # Dataset directory
    print("Dataset Directory:")
    dataset_ok = check_directory_exists("Dataset", "Dataset directory")
    
    if dataset_ok:
        dataset_files = {
            "Dataset/birth_to_2_cleaned.csv": "Cleaned dataset 0-24 months",
            "Dataset/age_2_to_5_cleaned.csv": "Cleaned dataset 24-60 months"
        }
        
        for file, desc in dataset_files.items():
            check_file_exists(file, desc)
    
    print()
    
    # Data directory
    print("Data Directory:")
    data_ok = check_directory_exists("Data", "Data directory")
    
    if data_ok:
        check_file_exists("Data/children_records.csv", "Child records database")
    
    print()
    
    # Test the system
    print("[TEST] TESTING SYSTEM:")
    print()
    
    if not missing_deps:
        try:
            from child_risk_analyzing import analyze_child
            
            print("   Testing risk analysis with sample data...")
            print("   Sample child: 18 months, Male, 8.5 kg, 75 cm")
            
            result = analyze_child(
                age=18,
                sex="M",
                weight=8.5,
                height=75
            )
            
            print("   [SUCCESS] System is working!")
            print()
            print("   [RESULT] Sample Analysis Result:")
            print(f"      Primary Concern: {result['summary']['primary_concern']}")
            print(f"      Risk Level: {result['summary']['severity']}")
            print(f"      Weight-for-Age Z-Score: {result['z_scores']['WFA_Z']}")
            print(f"      Height-for-Age Z-Score: {result['z_scores']['HFA_Z']}")
            print(f"      Weight-for-Height Z-Score: {result['z_scores']['WFH_Z']}")
            print()
            
        except Exception as e:
            print(f"   [ERROR] Error testing system: {e}")
            print()
            print("   This might be due to:")
            print("   - Missing model files")
            print("   - Missing label encoders")
            print("   - Other configuration issues")
            print()
    else:
        print("   [SKIP] Skipping system test (missing dependencies)")
        print()
    
    # Summary and recommendations
    print("=" * 80)
    print("[SUMMARY] SUMMARY & RECOMMENDATIONS:")
    print("=" * 80)
    print()
    
    recommendations = []
    
    if missing_deps:
        recommendations.append("1. Install missing dependencies: pip install -r requirements.txt")
    
    if not os.path.exists("Models/label_encoder_birth_to_2.joblib") or \
       not os.path.exists("Models/label_encoder_age_2_to_5.joblib"):
        recommendations.append("2. Label encoders are missing. You may need to retrain models:")
        recommendations.append("   - Edit model_training.py to set DATASET_PATH")
        recommendations.append("   - Run: python model_training.py (twice - once for each age group)")
    
    if not os.path.exists("Dataset/birth_to_2_cleaned.csv") or \
       not os.path.exists("Dataset/age_2_to_5_cleaned.csv"):
        recommendations.append("3. Cleaned datasets are missing. Run: python data_processing.py")
    
    if recommendations:
        print("[ACTION] ACTION ITEMS:")
        for rec in recommendations:
            print(f"   {rec}")
    else:
        print("[SUCCESS] Everything looks good! Your project is ready to use.")
        print()
        print("   Quick start:")
        print("   - Use child_risk_analyzing.py to analyze children")
        print("   - Check QUICK_START.md for detailed usage")
    
    print()
    print("=" * 80)

if __name__ == "__main__":
    main()

