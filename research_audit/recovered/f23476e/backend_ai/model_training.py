import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
import joblib
import os
import warnings
warnings.filterwarnings("ignore")

# -------------------------------------------------------------
# LOAD CLEAN DATASET
# -------------------------------------------------------------
# Get the base directory (backend folder)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_DIR = os.path.join(BASE_DIR, "dataset")

DATASET_PATH = os.path.join(DATASET_DIR, "age_2_to_5_cleaned.csv")   # <-- CHANGE to birth_to_2_cleaned.csv if needed

df = pd.read_csv(DATASET_PATH)
print("Loaded dataset:", DATASET_PATH, "Shape:", df.shape)

# -------------------------------------------------------------
# SELECT FEATURES & TARGET
# -------------------------------------------------------------
features = ["Age_months", "Sex_enc", "Weight_kg", "Length_cm", "WFA_Z", "HFA_Z", "WFH_Z"]

X = df[features]
y_str = df["Target"]  # Keep original string labels for display

# Encode target labels to numeric (required for model training)
label_encoder = LabelEncoder()
y = label_encoder.fit_transform(y_str)

print("\nTarget classes (original):", y_str.unique())
print("Target classes (encoded):", label_encoder.classes_)
print("Class balance:\n", pd.Series(y_str).value_counts(), "\n")

# -------------------------------------------------------------
# TRAIN/TEST SPLIT
# -------------------------------------------------------------
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42, stratify=y
)

# Get corresponding string labels for display
# train_test_split preserves DataFrame indices, use them to get matching y_str
train_indices = X_train.index.values
test_indices = X_test.index.values
y_train_str = y_str.iloc[train_indices].reset_index(drop=True)
y_test_str = y_str.iloc[test_indices].reset_index(drop=True)

# Reset indices for X dataframes for consistency
X_train = X_train.reset_index(drop=True)
X_test = X_test.reset_index(drop=True)
y_train = pd.Series(y_train).reset_index(drop=True) if not isinstance(y_train, np.ndarray) else pd.Series(y_train)
y_test = pd.Series(y_test).reset_index(drop=True) if not isinstance(y_test, np.ndarray) else pd.Series(y_test)

print("Train/test sizes:", X_train.shape, X_test.shape)

# -------------------------------------------------------------
# TRAIN RANDOM FOREST (MOST ACCURATE MODEL - 100% ACCURACY)
# -------------------------------------------------------------
scaler = StandardScaler()

# RandomForest achieved 100% accuracy in testing - using only this model
model = Pipeline([
    ("scaler", scaler),
    ("clf", RandomForestClassifier(
        n_estimators=250,
        random_state=42,
        class_weight="balanced"
    ))
])

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

print("\n=========== TRAINING RANDOM FOREST MODEL ===========")
print(">> Training RandomForest (Most Accurate Model)...")

# Cross-validation
cv_scores = cross_val_score(model, X_train, y_train, cv=skf, scoring="accuracy")
print(f"CV Accuracy: mean={cv_scores.mean():.4f}, std={cv_scores.std():.4f}")

# Train on full training set
model.fit(X_train, y_train)

# Evaluate
preds = model.predict(X_test)
# Convert predictions back to string labels for readability
preds_str = label_encoder.inverse_transform(preds)
acc = accuracy_score(y_test, preds)

print(f"Test Accuracy: {acc:.4f}")
print("Classification Report:\n", classification_report(y_test_str, preds_str, digits=4))
print("Confusion Matrix:\n", confusion_matrix(y_test_str, preds_str, labels=label_encoder.classes_))

best_model_name = "RandomForest"
best_model_object = model
best_accuracy = acc

# -------------------------------------------------------------
# SAVE BEST MODEL & LABEL ENCODER
# -------------------------------------------------------------
# Determine dataset type from path
if "birth_to_2" in DATASET_PATH or "0_2" in DATASET_PATH.lower():
    dataset_suffix = "birth_to_2"
elif "age_2_to_5" in DATASET_PATH or "2_to_5" in DATASET_PATH or "2_5" in DATASET_PATH:
    dataset_suffix = "age_2_to_5"
else:
    dataset_suffix = "unknown"

# Create models directory if it doesn't exist
MODELS_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)

# Save to models directory with consistent naming
best_model_file = os.path.join(MODELS_DIR, f"model_{dataset_suffix}.joblib")
label_encoder_file = os.path.join(MODELS_DIR, f"label_encoder_{dataset_suffix}.joblib")

joblib.dump(best_model_object, best_model_file)
joblib.dump(label_encoder, label_encoder_file)

print("\n=========== RESULTS ===========")
print("Model: RandomForest (Most Accurate)")
print("Accuracy:", best_accuracy)
print("Saved model to:", best_model_file)
print("Saved label encoder to:", label_encoder_file)

# Save test predictions for inspection (with string labels)
test_output = X_test.copy()
preds_best = best_model_object.predict(X_test)
preds_best_str = label_encoder.inverse_transform(preds_best)
test_output["y_true"] = y_test_str.values
test_output["y_true_encoded"] = y_test
test_output["y_pred"] = preds_best_str
test_output["y_pred_encoded"] = preds_best
test_output.to_csv("test_predictions.csv", index=False)
print("Saved test_predictions.csv")