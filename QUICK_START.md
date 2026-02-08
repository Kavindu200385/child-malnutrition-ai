# Quick Start Guide - Child Malnutrition AI

Welcome back! This guide will help you get started with your project.

## Project Overview

This is a machine learning system for analyzing child malnutrition risk using WHO growth standards. It includes:
- **Data Processing**: Cleans and prepares datasets for two age groups (0-2 years, 2-5 years)
- **Model Training**: Trains ML models to predict malnutrition categories
- **Risk Analysis**: Analyzes individual children and provides detailed risk assessments

## Setup Instructions

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Verify Project Structure

Your project should have:
- ✅ `Models/` - Contains trained models (already present)
- ✅ `Dataset/` - Contains cleaned datasets (already present)
- ✅ `Data/` - Stores child records (already present)

### 3. Check if Label Encoders Exist

The system needs label encoders for each model. Check if these files exist:
- `Models/label_encoder_birth_to_2.joblib`
- `Models/label_encoder_age_2_to_5.joblib`

If they're missing, you'll need to retrain the models (see step 4).

### 4. Retrain Models (if needed)

If label encoders are missing or you want to retrain:

```bash
# First, ensure you have the raw datasets in the root directory:
# - birth_to_2_years_10000 (1).csv
# - age_2_to_5_years_10000.csv

# Step 1: Process the data
python data_processing.py

# Step 2: Train models for each age group
# Edit model_training.py and change DATASET_PATH to:
#   "Dataset/birth_to_2_cleaned.csv" for 0-2 years
#   "Dataset/age_2_to_5_cleaned.csv" for 2-5 years
# Then run:
python model_training.py
```

### 5. Test the System

Run a quick test to verify everything works:

```bash
python test_system.py
```

Or use the risk analyzer directly in Python:

```python
from child_risk_analyzing import analyze_child, save_record, get_child_history

# Analyze a child
result = analyze_child(
    age=18,      # months
    sex="M",     # M or F
    weight=8.5,  # kg
    height=75    # cm
)

print(result['summary'])
```

## Project Files

- **`data_processing.py`**: Cleans raw datasets and prepares them for training
- **`model_training.py`**: Trains ML models (RandomForest, LogisticRegression, SVM, XGBoost)
- **`child_risk_analyzing.py`**: Main analysis engine - analyzes children and provides risk assessments
- **`Models/`**: Trained model files (.joblib)
- **`Dataset/`**: Cleaned training datasets
- **`Data/children_records.csv`**: Database of analyzed children

## Next Steps

1. ✅ Verify all dependencies are installed
2. ✅ Check if models and label encoders exist
3. ✅ Test the system with a sample child
4. 🔄 Consider adding a web interface or API
5. 🔄 Migrate from CSV to MySQL database (as noted in code comments)

## Troubleshooting

**Issue**: "Model file not found" error
- **Solution**: Run `model_training.py` to generate the models

**Issue**: "Label encoder not found" warning
- **Solution**: Retrain models - label encoders are saved during training

**Issue**: Import errors
- **Solution**: Run `pip install -r requirements.txt`

## Notes

- The system uses WHO LMS (Lambda-Mu-Sigma) parameters for Z-score calculations
- Two separate models are used: one for 0-24 months, one for 24-60 months
- Risk levels: CRITICAL, HIGH, MODERATE, LOW
- All child records are stored in `Data/children_records.csv` (consider migrating to MySQL)

