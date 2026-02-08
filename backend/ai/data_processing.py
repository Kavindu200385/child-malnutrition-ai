import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder

# === USER: update paths if needed ===
PATH_BIRTH_2 = "birth_to_2_years_10000 (1).csv"
PATH_2_5 = "age_2_to_5_years_10000.csv"

# === Helper functions ===
def parse_year_month(age_str):
    """
    Convert 'Y:MM' (e.g. '2:03') into integer months (e.g. 27).
    If malformed, returns NaN.
    """
    try:
        if pd.isna(age_str):
            return np.nan
        parts = str(age_str).split(':')
        if len(parts) != 2:
            return np.nan
        years = int(parts[0])
        months = int(parts[1])
        return years * 12 + months
    except Exception:
        return np.nan

def map_final_decision_to_label(decision):
    """
    Map textual Final_Decision to a compact class label.
    Adjust or expand mapping as desired.
    """
    if pd.isna(decision):
        return "Unknown"
    d = str(decision).strip()
    # common outcomes from generation: SAM, MAM, Severe Stunting, Underweight, Normal, Severe Chronic (Stunted+Underweight)
    if d == "SAM":
        return "SAM"
    if d == "MAM":
        return "MAM"
    if "Severe" in d and "Stunt" in d:
        return "Severe_Stunting"
    if "Severe Chronic" in d:
        return "Severe_Chronic"
    if "Underweight" in d:
        return "Underweight"
    if d == "Normal":
        return "Normal"
    # fallback
    return d

# === Step 1: load datasets ===
print("Loading CSVs...")
df0_2 = pd.read_csv(PATH_BIRTH_2)
df2_5 = pd.read_csv(PATH_2_5)

print("Initial sizes:", len(df0_2), len(df2_5))

# === Step 2: preprocess Birth->2 dataset ===
print("\nProcessing birth->2 dataset...")
df_birth = df0_2.copy()

# Drop rows with missing critical measured fields
critical = ["Age_months", "Sex", "Weight_kg", "Length_cm", "WFA_Z", "HFA_Z", "WFH_Z", "Final_Decision"]
df_birth = df_birth.dropna(subset=critical)

# Ensure numeric types
num_cols = ["Age_months", "Weight_kg", "Length_cm", "WFA_Z", "HFA_Z", "WFH_Z"]
for c in num_cols:
    df_birth[c] = pd.to_numeric(df_birth[c], errors="coerce")
df_birth = df_birth.dropna(subset=num_cols)
df_birth["Age_months"] = df_birth["Age_months"].astype(int)

# Create target label column from Final_Decision
df_birth["Target"] = df_birth["Final_Decision"].apply(map_final_decision_to_label)

# Encode Sex -> binary
df_birth["Sex"] = df_birth["Sex"].astype(str).str.upper().map({"M":"M","F":"F"})
le_sex = LabelEncoder()
df_birth["Sex_enc"] = le_sex.fit_transform(df_birth["Sex"])

# Optional: sanity clip unrealistic values
df_birth = df_birth[(df_birth["Weight_kg"] > 0.5) & (df_birth["Length_cm"] > 30)]

# Keep the columns you'll use for modeling
model_cols_birth = ["Child_ID", "Age_months", "Sex_enc", "Weight_kg", "Length_cm", "WFA_Z", "HFA_Z", "WFH_Z", "Target"]
df_birth_out = df_birth[model_cols_birth].copy()

print("birth->2 shape after cleaning:", df_birth_out.shape)
print("Targets distribution:\n", df_birth_out["Target"].value_counts(normalize=True).round(3))

# Save cleaned CSV to Dataset directory
import os
os.makedirs("Dataset", exist_ok=True)
OUT_BIRTH = "Dataset/birth_to_2_cleaned.csv"
df_birth_out.to_csv(OUT_BIRTH, index=False)
print("Saved cleaned birth->2 CSV to", OUT_BIRTH)


# === Step 3: preprocess 2->5 dataset ===
print("\nProcessing 2->5 dataset...")
df_25 = df2_5.copy()

# Parse Age 'Year:Month' -> Age_months integer
if "Age_Year:Month" in df_25.columns:
    df_25["Age_months"] = df_25["Age_Year:Month"].apply(parse_year_month)
else:
    # fallback if column name different
    if "Age" in df_25.columns:
        df_25["Age_months"] = df_25["Age"].apply(parse_year_month)
    else:
        raise ValueError("2-5 dataset missing Age column (Age_Year:Month)")

# Drop rows missing critical fields
critical2 = ["Age_months", "Sex", "Weight_kg", "Length_cm", "WFA_Z", "HFA_Z", "WFH_Z", "Final_Decision"]
df_25 = df_25.dropna(subset=critical2)

for c in ["Age_months", "Weight_kg", "Length_cm", "WFA_Z", "HFA_Z", "WFH_Z"]:
    df_25[c] = pd.to_numeric(df_25[c], errors="coerce")
df_25 = df_25.dropna(subset=["Age_months"])
df_25["Age_months"] = df_25["Age_months"].astype(int)

df_25["Target"] = df_25["Final_Decision"].apply(map_final_decision_to_label)

# Sex encoding (use same encoder mapping if possible)
df_25["Sex"] = df_25["Sex"].astype(str).str.upper().map({"M":"M","F":"F"})
# If same encoder is desired cross-files, fit on combined sexes
le_sex_2 = LabelEncoder()
df_25["Sex_enc"] = le_sex_2.fit_transform(df_25["Sex"])

# Keep model columns, but ensure Age formatting requested persists
df_25["Age_Year:Month"] = df_25.get("Age_Year:Month", df_25.get("Age_YearMonth", None))
model_cols_25 = ["Child_ID", "Age_Year:Month", "Age_months", "Sex_enc", "Weight_kg", "Length_cm", "WFA_Z", "HFA_Z", "WFH_Z", "Target"]
df_25_out = df_25[model_cols_25].copy()

print("2->5 shape after cleaning:", df_25_out.shape)
print("Targets distribution:\n", df_25_out["Target"].value_counts(normalize=True).round(3))

OUT_25 = "Dataset/age_2_to_5_cleaned.csv"
df_25_out.to_csv(OUT_25, index=False)
print("Saved cleaned 2->5 CSV to", OUT_25)

# === Summary ===
print("\n--- DATA PROCESSING COMPLETE ---")
print("Files generated:", OUT_BIRTH, OUT_25)
print("Next: run model_training.py to train baseline classifiers using the cleaned CSVs.")
