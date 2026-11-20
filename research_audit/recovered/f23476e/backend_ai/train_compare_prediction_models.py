"""
Train and Compare Multiple ML Models for Child Malnutrition Risk Prediction

This script:
- Loads datasets for birth-to-2 and age-2-to-5 years
- Trains multiple models (Logistic Regression, Random Forest, SVM, XGBoost)
- Compares their performance
- Saves the best model for future predictions
"""

import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, f1_score

from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import SVC
from xgboost import XGBClassifier

import joblib
import os

# Get the base directory (backend folder)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_DIR = os.path.join(BASE_DIR, "dataset")
MODELS_DIR = os.path.join(BASE_DIR, "models")

# ============================================================================
# STEP 3 — Load and merge datasets
# ============================================================================
print("=" * 60)
print("STEP 3: Loading datasets...")
print("=" * 60)

df1 = pd.read_csv(os.path.join(DATASET_DIR, "birth_to_2_years_prediction_with_current.csv"))
df2 = pd.read_csv(os.path.join(DATASET_DIR, "age_2_to_5_years_prediction_with_current.csv"))

df = pd.concat([df1, df2], ignore_index=True)

print("Dataset shape:", df.shape)
print("\nFirst few rows:")
print(df.head())
print("\nColumn names:", df.columns.tolist())

# ============================================================================
# STEP 4 — Encode risk labels (VERY IMPORTANT)
# ============================================================================
print("\n" + "=" * 60)
print("STEP 4: Encoding risk labels...")
print("=" * 60)

# ML models cannot understand text
risk_map = {
    "Low": 0,
    "Moderate": 1,
    "High": 2,
    "Severe": 3
}

df["current_risk_enc"] = df["current_risk"].map(risk_map)
df["target"] = df["predicted_risk_next_2_months"].map(risk_map)

# Quick check
print("\nRisk encoding check:")
print(df[["current_risk", "current_risk_enc"]].head(10))
print("\nTarget distribution:")
print(df["target"].value_counts().sort_index())

# Check for any missing values after mapping
if df["current_risk_enc"].isna().any() or df["target"].isna().any():
    print("\nWARNING: Some risk values could not be mapped!")
    print("Missing in current_risk_enc:", df["current_risk_enc"].isna().sum())
    print("Missing in target:", df["target"].isna().sum())
    print("\nUnique values in current_risk:", df["current_risk"].unique())
    print("Unique values in predicted_risk_next_2_months:", df["predicted_risk_next_2_months"].unique())
    # Drop rows with missing values
    df = df.dropna(subset=["current_risk_enc", "target"])
    print(f"\nAfter dropping missing values, dataset shape: {df.shape}")

# ============================================================================
# STEP 5 — Feature engineering (this improves results)
# ============================================================================
print("\n" + "=" * 60)
print("STEP 5: Feature engineering...")
print("=" * 60)

df["min_z"] = df[["z_wfa", "z_hfa", "z_wfh"]].min(axis=1)
df["mean_z"] = df[["z_wfa", "z_hfa", "z_wfh"]].mean(axis=1)

print("Added features: min_z, mean_z")
print(f"min_z range: [{df['min_z'].min():.2f}, {df['min_z'].max():.2f}]")
print(f"mean_z range: [{df['mean_z'].min():.2f}, {df['mean_z'].max():.2f}]")

# ============================================================================
# STEP 6 — Select features & label
# ============================================================================
print("\n" + "=" * 60)
print("STEP 6: Selecting features...")
print("=" * 60)

features = [
    "age_months",
    "weight_kg",
    "height_cm",
    "z_wfa",
    "z_hfa",
    "z_wfh",
    "min_z",
    "mean_z",
    "current_risk_enc"
]

X = df[features]
y = df["target"]

print(f"Features: {features}")
print(f"Feature matrix shape: {X.shape}")
print(f"Target shape: {y.shape}")

# Check for any missing values in features
if X.isna().any().any():
    print("\nWARNING: Missing values found in features!")
    print(X.isna().sum())
    # Fill missing values with median
    X = X.fillna(X.median())
    print("Filled missing values with median.")

# ============================================================================
# STEP 7 — Train/Test split (NO DATA LEAKAGE)
# ============================================================================
print("\n" + "=" * 60)
print("STEP 7: Splitting data by child (no data leakage)...")
print("=" * 60)

# Very important: split by child, not by rows
children = df["child_id"].unique()

train_ids, test_ids = train_test_split(
    children,
    test_size=0.2,
    random_state=42
)

train_df = df[df["child_id"].isin(train_ids)]
test_df = df[df["child_id"].isin(test_ids)]

X_train = train_df[features]
y_train = train_df["target"]

X_test = test_df[features]
y_test = test_df["target"]

print(f"Total unique children: {len(children)}")
print(f"Train children: {len(train_ids)} ({len(train_ids)/len(children)*100:.1f}%)")
print(f"Test children: {len(test_ids)} ({len(test_ids)/len(children)*100:.1f}%)")
print(f"Train samples: {len(X_train)}")
print(f"Test samples: {len(X_test)}")

# ============================================================================
# STEP 8 — Define models to compare
# ============================================================================
print("\n" + "=" * 60)
print("STEP 8: Defining models...")
print("=" * 60)

models = {
    "Logistic Regression": LogisticRegression(
        max_iter=1000,
        multi_class="multinomial",
        random_state=42
    ),

    "Random Forest": RandomForestClassifier(
        n_estimators=300,
        max_depth=12,
        random_state=42,
        n_jobs=-1
    ),

    "SVM (RBF)": SVC(
        kernel="rbf",
        probability=True,
        random_state=42
    ),

    "XGBoost": XGBClassifier(
        objective="multi:softprob",
        num_class=4,
        n_estimators=300,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        eval_metric="mlogloss"
    )
}

print(f"Models to train: {list(models.keys())}")

# ============================================================================
# STEP 9 — Train & evaluate each model
# ============================================================================
print("\n" + "=" * 60)
print("STEP 9: Training and evaluating models...")
print("=" * 60)

results = []

for name, model in models.items():
    print("\n" + "-" * 60)
    print(f"Training: {name}")
    print("-" * 60)

    try:
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)

        report = classification_report(
            y_test, y_pred, output_dict=True, zero_division=0
        )

        f1_macro = f1_score(y_test, y_pred, average="macro", zero_division=0)

        # Get recall for High (2) and Severe (3) if they exist in the report
        high_recall = report.get("2", {}).get("recall", 0.0) if "2" in report else 0.0
        severe_recall = report.get("3", {}).get("recall", 0.0) if "3" in report else 0.0

        results.append({
            "Model": name,
            "F1_Macro": f1_macro,
            "High_Recall": high_recall,
            "Severe_Recall": severe_recall
        })

        print("\nClassification Report:")
        print(classification_report(y_test, y_pred, zero_division=0))
        print(f"\nF1 Macro Score: {f1_macro:.4f}")

    except Exception as e:
        print(f"ERROR: Error training {name}: {str(e)}")
        continue

# ============================================================================
# STEP 10 — Compare models (THIS DECIDES SUCCESS)
# ============================================================================
print("\n" + "=" * 60)
print("STEP 10: Model Comparison")
print("=" * 60)

results_df = pd.DataFrame(results)
results_df = results_df.sort_values(by="F1_Macro", ascending=False)

print("\n" + "=" * 60)
print("MODEL COMPARISON RESULTS")
print("=" * 60)
print(results_df.to_string(index=False))

# ============================================================================
# STEP 11 — Choose the SUCCESS model
# ============================================================================
print("\n" + "=" * 60)
print("STEP 11: Selecting best model...")
print("=" * 60)

# Rule: Highest F1_Macro + Good recall for High (2) and Severe (3)
# In healthcare: Recall > accuracy (missing severe cases is dangerous)

best_model_name = results_df.iloc[0]["Model"]
best_model = models[best_model_name]

print(f"\n[SUCCESS] Best Model: {best_model_name}")
print(f"   F1 Macro: {results_df.iloc[0]['F1_Macro']:.4f}")
print(f"   High Recall: {results_df.iloc[0]['High_Recall']:.4f}")
print(f"   Severe Recall: {results_df.iloc[0]['Severe_Recall']:.4f}")

# ============================================================================
# STEP 12 — Save the best model
# ============================================================================
print("\n" + "=" * 60)
print("STEP 12: Saving best model...")
print("=" * 60)

# Ensure models directory exists
os.makedirs(MODELS_DIR, exist_ok=True)

model_filename = os.path.join(MODELS_DIR, "prediction_model.joblib")
joblib.dump(best_model, model_filename)
print(f"[SUCCESS] Prediction model saved as: {model_filename}")

# Also save the risk mapping for later use
risk_mapping_filename = os.path.join(MODELS_DIR, "risk_mapping.joblib")
joblib.dump(risk_map, risk_mapping_filename)
print(f"[SUCCESS] Risk mapping saved as: {risk_mapping_filename}")

# Save feature list for later use
feature_list_filename = os.path.join(MODELS_DIR, "prediction_features.joblib")
joblib.dump(features, feature_list_filename)
print(f"[SUCCESS] Feature list saved as: {feature_list_filename}")

# ============================================================================
# STEP 13 — Test with one sample (confidence step)
# ============================================================================
print("\n" + "=" * 60)
print("STEP 13: Testing with sample...")
print("=" * 60)

if len(X_test) > 0:
    sample = X_test.iloc[[0]]
    pred = best_model.predict(sample)[0]
    pred_proba = best_model.predict_proba(sample)[0]

    reverse_map = {0: "Low", 1: "Moderate", 2: "High", 3: "Severe"}
    actual = y_test.iloc[0]
    
    print(f"\nSample prediction:")
    print(f"  Actual: {reverse_map[actual]}")
    print(f"  Predicted: {reverse_map[pred]}")
    print(f"  Confidence: {pred_proba[pred]*100:.2f}%")
    print(f"\n  All probabilities:")
    for i, prob in enumerate(pred_proba):
        print(f"    {reverse_map[i]}: {prob*100:.2f}%")

print("\n" + "=" * 60)
print("[SUCCESS] Training complete!")
print("=" * 60)
