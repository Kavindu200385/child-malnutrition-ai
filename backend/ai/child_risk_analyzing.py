# child_risk_analyzing.py
# Full child risk analyzer + history manager + chart data generator
# Works with your frontend (search by child ID, display history, add new record)
# Author: Kavindu

import joblib
import pandas as pd
import numpy as np
import os
import math

# Load models and label encoders from models directory
# Get the base directory (backend folder)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, "models")
DATA_DIR = os.path.join(BASE_DIR, "data")

model_0_24_path = os.path.join(MODELS_DIR, "model_birth_to_2.joblib")
model_24_60_path = os.path.join(MODELS_DIR, "model_age_2_to_5.joblib")
label_encoder_0_24_path = os.path.join(MODELS_DIR, "label_encoder_birth_to_2.joblib")
label_encoder_24_60_path = os.path.join(MODELS_DIR, "label_encoder_age_2_to_5.joblib")

if not os.path.exists(model_0_24_path):
    raise FileNotFoundError(f"Model file not found: {model_0_24_path}. Please train the model first.")
if not os.path.exists(model_24_60_path):
    raise FileNotFoundError(f"Model file not found: {model_24_60_path}. Please train the model first.")

model_0_24 = joblib.load(model_0_24_path)
model_24_60 = joblib.load(model_24_60_path)

# Load label encoders if they exist
label_encoder_0_24 = None
label_encoder_24_60 = None
if os.path.exists(label_encoder_0_24_path):
    label_encoder_0_24 = joblib.load(label_encoder_0_24_path)
else:
    print(f"Warning: Label encoder not found at {label_encoder_0_24_path}. Predictions will use fallback mapping.")
if os.path.exists(label_encoder_24_60_path):
    label_encoder_24_60 = joblib.load(label_encoder_24_60_path)
else:
    print(f"Warning: Label encoder not found at {label_encoder_24_60_path}. Predictions will use fallback mapping.")

# ------------------------------------------------------------
# DATA STORAGE (CSV FOR NOW → Replace with MySQL later)
# ------------------------------------------------------------

# Create Data directory if it doesn't exist
os.makedirs(DATA_DIR, exist_ok=True)
DATA_FILE = os.path.join(DATA_DIR, "children_records.csv")

# Create file if not exists
if not os.path.exists(DATA_FILE):
    os.makedirs(os.path.dirname(DATA_FILE) if os.path.dirname(DATA_FILE) else ".", exist_ok=True)
    df_init = pd.DataFrame(columns=[
        "Child_ID", "Age_months", "Sex",
        "Weight_kg", "Height_cm",
        "WFA_Z", "HFA_Z", "WFH_Z",
        "Underweight", "Stunting", "Wasting",
        "Model_Prediction", "Final_Decision", 
        "Risk_Level", "Confidence"
    ])
    df_init.to_csv(DATA_FILE, index=False)

# ------------------------------------------------------------
# WHO LMS PARAMETERS
# ------------------------------------------------------------

WFA_BOYS = {
     0:(1,3.3464,0.14602), 1:(1,4.4709,0.13395), 2:(1,5.5675,0.12385), 3:(1,6.3762,0.11727),
     6:(1,7.9938,0.10315), 12:(1,9.648,0.09029), 24:(1,12.227,0.0887), 36:(1,14.31,0.09182),
     48:(1,16.31,0.09403), 60:(1,18.30,0.0956)
}

WFA_GIRLS = {
     0:(1,3.2322,0.14171), 1:(1,4.1873,0.13724), 2:(1,5.1282,0.13173), 3:(1,5.8458,0.1278),
     6:(1,7.2159,0.11315), 12:(1,8.947,0.09894), 24:(1,11.488,0.0926), 36:(1,13.88,0.0939),
     48:(1,16.10,0.0956), 60:(1,18.20,0.0969)
}

HFA_BOYS = {
    0:(1,49.8842,0.03795), 6:(1,67.6236,0.0321), 12:(1,75.7488,0.0314),
    24:(1,87.803,0.0329), 36:(1,96.1,0.0342), 48:(1,103.3,0.035), 60:(1,110.0,0.0355)
}

HFA_GIRLS = {
    0:(1,49.1477,0.0379), 6:(1,65.6795,0.0321), 12:(1,74.015,0.0319),
    24:(1,86.363,0.0331), 36:(1,95.1,0.0345), 48:(1,102.7,0.0353), 60:(1,109.4,0.0358)
}

# ------------------------------------------------------------
# LMS Z-SCORE FUNCTIONS
# ------------------------------------------------------------

def lms_zscore(value, L, M, S):
    if L == 0:
        return math.log(value/M) / S
    return ((value/M)**L - 1) / (L*S)

def interpolate_lms(age, table):
    ages = sorted(table.keys())
    if age in table:
        return table[age]
    lower = max(a for a in ages if a <= age)
    upper = min(a for a in ages if a >= age)
    if lower == upper:
        return table[lower]

    L1,M1,S1 = table[lower]
    L2,M2,S2 = table[upper]
    ratio = (age - lower) / (upper - lower)

    L = L1 + (L2-L1)*ratio
    M = M1 + (M2-M1)*ratio
    S = S1 + (S2-S1)*ratio
    return (L,M,S)

def compute_z_scores(age, sex, weight, height):
    sex = sex.upper()

    # Weight-for-age
    if sex == "M": L,M,S = interpolate_lms(age, WFA_BOYS)
    else:          L,M,S = interpolate_lms(age, WFA_GIRLS)
    wfa = lms_zscore(weight, L, M, S)

    # Height-for-age
    if sex == "M": L,M,S = interpolate_lms(age, HFA_BOYS)
    else:          L,M,S = interpolate_lms(age, HFA_GIRLS)
    hfa = lms_zscore(height, L, M, S)

    # Weight-for-height (approx)
    expected = M
    wfh = (weight - expected) / (expected * S)

    return round(wfa,3), round(hfa,3), round(wfh,3)

# ------------------------------------------------------------
# CLASSIFICATION (WHO)
# ------------------------------------------------------------

def classify_wasting(wfh):
    if wfh < -3:   return "SAM"
    if wfh < -2:   return "MAM"
    return "Normal"

def classify_stunting(hfa):
    if hfa < -3:   return "Severe Stunting"
    if hfa < -2:   return "Moderate Stunting"
    return "Normal"

def classify_underweight(wfa):
    if wfa < -3:   return "Severe Underweight"
    if wfa < -2:   return "Moderate Underweight"
    if wfa < -1:   return "Mild Underweight"
    return "Normal"

def final_decision(wasting, stunting, underweight):
    if wasting == "SAM": return "SAM"
    if wasting == "MAM": return "MAM"
    if "Severe" in stunting and "Severe" in underweight:
        return "Severe Chronic Malnutrition"
    if "Severe" in stunting:
        return "Severe Stunting"
    return underweight if "Underweight" in underweight else "Normal"

# ------------------------------------------------------------
# PREDICT NEW RECORD
# ------------------------------------------------------------

def calculate_risk_level(wfa, hfa, wfh, pred, final_decision):
    """Calculate overall risk level based on all indicators"""
    critical_count = sum([
        wfa < -3, hfa < -3, wfh < -3,
        "SAM" in str(final_decision),
        "Severe" in str(final_decision)
    ])
    
    high_count = sum([
        -3 <= wfa < -2, -3 <= hfa < -2, -3 <= wfh < -2,
        "MAM" in str(final_decision),
        "Moderate" in str(final_decision)
    ])
    
    moderate_count = sum([
        -2 <= wfa < -1, -2 <= hfa < -1, -2 <= wfh < -1
    ])
    
    if critical_count > 0:
        return "CRITICAL"
    elif high_count >= 2 or "SAM" in str(final_decision) or "MAM" in str(final_decision):
        return "HIGH"
    elif high_count > 0 or moderate_count >= 2:
        return "MODERATE"
    else:
        return "LOW"

def get_risk_explanation(z_score, indicator_type):
    """Get detailed explanation of what a Z-score means"""
    abs_z = abs(z_score)
    
    if indicator_type == "WFA":
        name = "Weight-for-Age"
        meaning = "underweight"
    elif indicator_type == "HFA":
        name = "Height-for-Age"
        meaning = "stunting"
    elif indicator_type == "WFH":
        name = "Weight-for-Height"
        meaning = "wasting"
    else:
        name = indicator_type
        meaning = "malnutrition"
    
    if abs_z >= 3:
        severity = "Severe"
        interpretation = f"Very concerning. The child is significantly {meaning} compared to WHO growth standards."
    elif abs_z >= 2:
        severity = "Moderate"
        interpretation = f"Concerning. The child shows signs of {meaning}."
    elif abs_z >= 1:
        severity = "Mild"
        interpretation = f"Below average. Monitor closely for potential {meaning}."
    else:
        severity = "Normal"
        interpretation = f"Within normal range for {name}."
    
    return {
        "indicator": name,
        "z_score": round(z_score, 3),
        "severity": severity,
        "interpretation": interpretation,
        "who_category": f"{severity} {meaning.replace('stunting', 'Stunted').replace('underweight', 'Underweight').replace('wasting', 'Wasted')}" if abs_z >= 2 else "Normal"
    }

def get_intervention_plan(risk_level, final_decision, wfa, hfa, wfh, age):
    """Generate detailed intervention plan based on risk assessment"""
    interventions = {
        "CRITICAL": {
            "priority": "IMMEDIATE",
            "urgency": "Emergency medical attention required",
            "actions": [
                "Refer to hospital or emergency pediatric care immediately",
                "Begin therapeutic feeding program under medical supervision",
                "Assess for complications (dehydration, infections, micronutrient deficiencies)",
                "Initiate Ready-to-Use Therapeutic Food (RUTF) if available",
                "Monitor vital signs and hydration status every 4-6 hours",
                "Consult nutritionist and pediatrician within 24 hours"
            ],
            "follow_up": "Within 48 hours, then weekly until stabilized",
            "nutritional_requirements": "Therapeutic feeding: 200-220 kcal/kg/day, high protein content",
            "warnings": [
                "Risk of death from severe acute malnutrition",
                "High risk of infections due to weakened immune system",
                "May require hospitalization for stabilization",
                "Potential for organ damage if not treated promptly"
            ]
        },
        "HIGH": {
            "priority": "HIGH",
            "urgency": "Medical consultation needed within 1-2 weeks",
            "actions": [
                "Schedule appointment with pediatrician and nutritionist",
                "Begin supplementary feeding program",
                "Assess dietary intake and feeding practices",
                "Screen for underlying medical conditions",
                "Provide nutritional counseling to caregivers",
                "Consider Ready-to-Use Supplementary Food (RUSF) if appropriate"
            ],
            "follow_up": "Within 2 weeks, then every 2-4 weeks",
            "nutritional_requirements": "High-energy, nutrient-dense foods: 150-180 kcal/kg/day",
            "warnings": [
                "Risk of progression to severe malnutrition",
                "Increased susceptibility to infections",
                "May affect cognitive development",
                "Requires close monitoring"
            ]
        },
        "MODERATE": {
            "priority": "MODERATE",
            "urgency": "Nutritional intervention recommended",
            "actions": [
                "Nutritional assessment and counseling",
                "Improve dietary diversity and meal frequency",
                "Address feeding practices and caregiving environment",
                "Monitor growth monthly",
                "Provide age-appropriate nutritional supplements if needed",
                "Educate caregivers on proper nutrition"
            ],
            "follow_up": "Monthly monitoring for 3 months",
            "nutritional_requirements": "Balanced diet with increased calories: 120-150 kcal/kg/day",
            "warnings": [
                "Risk of further deterioration if not addressed",
                "May impact growth and development",
                "Requires consistent monitoring"
            ]
        },
        "LOW": {
            "priority": "LOW",
            "urgency": "Routine monitoring",
            "actions": [
                "Continue age-appropriate feeding practices",
                "Maintain regular growth monitoring",
                "Ensure balanced diet and adequate nutrition",
                "Promote healthy eating habits",
                "Continue routine pediatric care"
            ],
            "follow_up": "Routine check-ups (every 3-6 months)",
            "nutritional_requirements": "Standard age-appropriate nutrition: 100-120 kcal/kg/day",
            "warnings": []
        }
    }
    
    plan = interventions.get(risk_level, interventions["LOW"])
    
    # Add specific recommendations based on indicators
    specific_recommendations = []
    if wfa < -2:
        specific_recommendations.append("Focus on calorie-dense foods to address underweight")
    if hfa < -2:
        specific_recommendations.append("Address stunting through improved nutrition and care environment")
    if wfh < -2:
        specific_recommendations.append("Immediate attention needed for wasting - may indicate recent illness or food insecurity")
    
    plan["specific_recommendations"] = specific_recommendations
    return plan

def analyze_child(age, sex, weight, height):
    wfa, hfa, wfh = compute_z_scores(age, sex, weight, height)

    wasting = classify_wasting(wfh)
    stunting = classify_stunting(hfa)
    underweight = classify_underweight(wfa)

    sex_enc = 1 if sex.upper()=="M" else 0

    model = model_0_24 if age <= 24 else model_24_60
    label_encoder = label_encoder_0_24 if age <= 24 else label_encoder_24_60
    
    # Create DataFrame with proper column names to avoid feature name warnings
    # Column order must match training: Age_months, Sex_enc, Weight_kg, Length_cm, WFA_Z, HFA_Z, WFH_Z
    X = pd.DataFrame([{
        "Age_months": age,
        "Sex_enc": sex_enc,
        "Weight_kg": weight,
        "Length_cm": height,
        "WFA_Z": wfa,
        "HFA_Z": hfa,
        "WFH_Z": wfh
    }])

    pred_encoded = model.predict(X)[0]
    
    # Get prediction probabilities for all classes
    proba = model.predict_proba(X)[0]
    conf = float(max(proba))
    
    # Decode prediction if label encoder is available
    if label_encoder is not None:
        try:
            pred = label_encoder.inverse_transform([pred_encoded])[0]
            # Get probability for predicted class
            class_probabilities = {}
            for i, class_name in enumerate(label_encoder.classes_):
                class_probabilities[class_name] = round(float(proba[i]), 3)
        except Exception as e:
            print(f"Warning: Could not decode prediction: {e}. Using encoded value.")
            pred = str(pred_encoded)
            class_probabilities = {f"Class_{i}": round(float(p), 3) for i, p in enumerate(proba)}
    else:
        pred_map = {0: "Normal", 1: "MAM", 2: "SAM", 3: "Severe_Stunting"}
        pred = pred_map.get(int(pred_encoded), str(pred_encoded))
        class_probabilities = {f"Class_{i}": round(float(p), 3) for i, p in enumerate(proba)}

    final = final_decision(wasting, stunting, underweight)
    risk_level = calculate_risk_level(wfa, hfa, wfh, pred, final)
    
    # Get detailed explanations for each indicator
    wfa_details = get_risk_explanation(wfa, "WFA")
    hfa_details = get_risk_explanation(hfa, "HFA")
    wfh_details = get_risk_explanation(wfh, "WFH")
    
    # Get intervention plan
    intervention_plan = get_intervention_plan(risk_level, final, wfa, hfa, wfh, age)
    
    # Build comprehensive result
    result = {
        # Basic measurements
        "basic_info": {
            "age_months": age,
            "sex": sex.upper(),
            "weight_kg": weight,
            "height_cm": height
        },
        
        # Z-scores
        "z_scores": {
            "WFA_Z": round(wfa, 3),
            "HFA_Z": round(hfa, 3),
            "WFH_Z": round(wfh, 3)
        },
        
        # Detailed indicator analysis
        "indicators": {
            "weight_for_age": wfa_details,
            "height_for_age": hfa_details,
            "weight_for_height": wfh_details
        },
        
        # Classifications
        "classifications": {
            "underweight": underweight,
            "stunting": stunting,
            "wasting": wasting,
            "model_prediction": pred,
            "final_decision": final
        },
        
        # Risk assessment
        "risk_assessment": {
            "overall_risk_level": risk_level,
            "risk_factors": [
                f"Weight-for-Age: {wfa_details['who_category']}" if abs(wfa) >= 2 else None,
                f"Height-for-Age: {hfa_details['who_category']}" if abs(hfa) >= 2 else None,
                f"Weight-for-Height: {wfh_details['who_category']}" if abs(wfh) >= 2 else None,
            ],
            "model_confidence": round(conf, 3),
            "class_probabilities": class_probabilities
        },
        
        # Intervention plan
        "intervention_plan": intervention_plan,
        
        # Growth status
        "growth_status": {
            "compared_to_peers": "Well below average" if min(wfa, hfa) < -2 else "Below average" if min(wfa, hfa) < -1 else "Average",
            "growth_velocity_concern": "Yes" if (wfa < -2 or hfa < -2) else "No",
            "nutritional_adequacy": "Inadequate" if min(wfa, hfa, wfh) < -2 else "Marginal" if min(wfa, hfa, wfh) < -1 else "Adequate"
        },
        
        # Summary for quick reference
        "summary": {
            "primary_concern": final,
            "severity": risk_level,
            "next_action": intervention_plan["priority"],
            "follow_up_timeline": intervention_plan["follow_up"]
        }
    }
    
    # Remove None values from risk factors
    result["risk_assessment"]["risk_factors"] = [rf for rf in result["risk_assessment"]["risk_factors"] if rf is not None]
    
    return result

# ------------------------------------------------------------
# SAVE NEW RECORD
# ------------------------------------------------------------

def save_record(child_id, age, sex, weight, height, result):
    if os.path.exists(DATA_FILE):
        df = pd.read_csv(DATA_FILE)
        # Add Risk_Level column if it doesn't exist (for backward compatibility)
        if "Risk_Level" not in df.columns:
            df["Risk_Level"] = None
    else:
        df = pd.DataFrame(columns=[
            "Child_ID", "Age_months", "Sex",
            "Weight_kg", "Height_cm",
            "WFA_Z", "HFA_Z", "WFH_Z",
            "Underweight", "Stunting", "Wasting",
            "Model_Prediction", "Final_Decision", 
            "Risk_Level", "Confidence"
        ])

    new_row = {
        "Child_ID": child_id,
        "Age_months": age,
        "Sex": sex,
        "Weight_kg": weight,
        "Height_cm": height,
        "WFA_Z": result["z_scores"]["WFA_Z"],
        "HFA_Z": result["z_scores"]["HFA_Z"],
        "WFH_Z": result["z_scores"]["WFH_Z"],
        "Underweight": result["classifications"]["underweight"],
        "Stunting": result["classifications"]["stunting"],
        "Wasting": result["classifications"]["wasting"],
        "Model_Prediction": result["classifications"]["model_prediction"],
        "Final_Decision": result["classifications"]["final_decision"],
        "Risk_Level": result["risk_assessment"]["overall_risk_level"],
        "Confidence": result["risk_assessment"]["model_confidence"]
    }

    # Use pd.concat with proper handling to avoid FutureWarning
    new_df = pd.DataFrame([new_row])
    df = pd.concat([df, new_df], ignore_index=True)
    df.to_csv(DATA_FILE, index=False)

# ------------------------------------------------------------
# FETCH CHILD HISTORY
# ------------------------------------------------------------

def get_child_history(child_id):
    df = pd.read_csv(DATA_FILE)
    return df[df["Child_ID"] == child_id].sort_values("Age_months")

# ------------------------------------------------------------
# CHART DATA FOR FRONTEND
# ------------------------------------------------------------

def get_chart_data(child_id):
    df = get_child_history(child_id)
    return {
        "age": df["Age_months"].tolist(),
        "WFA_Z": df["WFA_Z"].tolist(),
        "HFA_Z": df["HFA_Z"].tolist(),
        "WFH_Z": df["WFH_Z"].tolist(),
        "weight": df["Weight_kg"].tolist(),
        "height": df["Height_cm"].tolist()
    }

# ------------------------------------------------------------
# DETAILED RISK REPORT FORMATTER
# ------------------------------------------------------------

def format_detailed_report(result):
    """Format the detailed risk analysis result for display"""
    report = []
    report.append("=" * 80)
    report.append("COMPREHENSIVE CHILD MALNUTRITION RISK ASSESSMENT")
    report.append("=" * 80)
    
    # Basic Information
    report.append("\n📋 BASIC INFORMATION:")
    report.append(f"   Age: {result['basic_info']['age_months']} months")
    report.append(f"   Sex: {result['basic_info']['sex']}")
    report.append(f"   Weight: {result['basic_info']['weight_kg']} kg")
    report.append(f"   Height: {result['basic_info']['height_cm']} cm")
    
    # Z-Scores
    report.append("\n📊 Z-SCORE INDICATORS:")
    for indicator, details in result['indicators'].items():
        report.append(f"\n   {details['indicator']}:")
        report.append(f"      Z-Score: {details['z_score']}")
        report.append(f"      Severity: {details['severity']}")
        report.append(f"      WHO Category: {details['who_category']}")
        report.append(f"      Interpretation: {details['interpretation']}")
    
    # Classifications
    report.append("\n🏷️  CLASSIFICATIONS:")
    report.append(f"   Underweight: {result['classifications']['underweight']}")
    report.append(f"   Stunting: {result['classifications']['stunting']}")
    report.append(f"   Wasting: {result['classifications']['wasting']}")
    report.append(f"   Model Prediction: {result['classifications']['model_prediction']}")
    report.append(f"   Final Decision: {result['classifications']['final_decision']}")
    
    # Risk Assessment
    report.append("\n⚠️  RISK ASSESSMENT:")
    report.append(f"   Overall Risk Level: {result['risk_assessment']['overall_risk_level']}")
    report.append(f"   Model Confidence: {result['risk_assessment']['model_confidence']*100:.1f}%")
    if result['risk_assessment']['risk_factors']:
        report.append(f"   Risk Factors:")
        for factor in result['risk_assessment']['risk_factors']:
            report.append(f"      • {factor}")
    report.append(f"\n   Prediction Probabilities:")
    for class_name, prob in result['risk_assessment']['class_probabilities'].items():
        report.append(f"      • {class_name}: {prob*100:.1f}%")
    
    # Intervention Plan
    plan = result['intervention_plan']
    report.append(f"\n🚨 INTERVENTION PLAN:")
    report.append(f"   Priority Level: {plan['priority']}")
    report.append(f"   Urgency: {plan['urgency']}")
    report.append(f"\n   Required Actions:")
    for i, action in enumerate(plan['actions'], 1):
        report.append(f"      {i}. {action}")
    
    if plan.get('specific_recommendations'):
        report.append(f"\n   Specific Recommendations:")
        for rec in plan['specific_recommendations']:
            report.append(f"      • {rec}")
    
    report.append(f"\n   Follow-up: {plan['follow_up']}")
    report.append(f"   Nutritional Requirements: {plan['nutritional_requirements']}")
    
    if plan.get('warnings'):
        report.append(f"\n   ⚠️  Warnings:")
        for warning in plan['warnings']:
            report.append(f"      • {warning}")
    
    # Growth Status
    report.append(f"\n📈 GROWTH STATUS:")
    report.append(f"   Compared to Peers: {result['growth_status']['compared_to_peers']}")
    report.append(f"   Growth Velocity Concern: {result['growth_status']['growth_velocity_concern']}")
    report.append(f"   Nutritional Adequacy: {result['growth_status']['nutritional_adequacy']}")
    
    # Summary
    report.append(f"\n📌 QUICK SUMMARY:")
    summary = result['summary']
    report.append(f"   Primary Concern: {summary['primary_concern']}")
    report.append(f"   Severity: {summary['severity']}")
    report.append(f"   Next Action: {summary['next_action']}")
    report.append(f"   Follow-up Timeline: {summary['follow_up_timeline']}")
    
    report.append("\n" + "=" * 80)
    
    return "\n".join(report)
