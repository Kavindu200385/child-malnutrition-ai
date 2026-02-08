"""
Example Usage - Child Malnutrition AI
This script demonstrates how to use the risk analysis system.
"""

from child_risk_analyzing import analyze_child, save_record, get_child_history, format_detailed_report

def example_basic_analysis():
    """Example 1: Basic child risk analysis"""
    print("=" * 80)
    print("EXAMPLE 1: Basic Child Risk Analysis")
    print("=" * 80)
    print()
    
    # Analyze a child
    result = analyze_child(
        age=18,      # months
        sex="M",     # M or F
        weight=8.5,  # kg
        height=75    # cm
    )
    
    # Print summary
    print("QUICK SUMMARY:")
    print(f"  Primary Concern: {result['summary']['primary_concern']}")
    print(f"  Risk Level: {result['summary']['severity']}")
    print(f"  Next Action: {result['summary']['next_action']}")
    print()
    
    # Print Z-scores
    print("Z-SCORES:")
    print(f"  Weight-for-Age: {result['z_scores']['WFA_Z']}")
    print(f"  Height-for-Age: {result['z_scores']['HFA_Z']}")
    print(f"  Weight-for-Height: {result['z_scores']['WFH_Z']}")
    print()
    
    return result

def example_detailed_report():
    """Example 2: Detailed risk report"""
    print("=" * 80)
    print("EXAMPLE 2: Detailed Risk Report")
    print("=" * 80)
    print()
    
    result = analyze_child(
        age=24,
        sex="F",
        weight=10.2,
        height=82
    )
    
    # Print formatted detailed report
    report = format_detailed_report(result)
    print(report)
    
    return result

def example_save_and_track():
    """Example 3: Save record and track child history"""
    print("=" * 80)
    print("EXAMPLE 3: Save Record and Track History")
    print("=" * 80)
    print()
    
    child_id = "CH001"
    
    # Analyze and save first record
    result1 = analyze_child(age=12, sex="M", weight=7.5, height=70)
    save_record(child_id, 12, "M", 7.5, 70, result1)
    print(f"Saved record for {child_id} at 12 months")
    
    # Analyze and save second record (same child, later age)
    result2 = analyze_child(age=18, sex="M", weight=8.5, height=75)
    save_record(child_id, 18, "M", 8.5, 75, result2)
    print(f"Saved record for {child_id} at 18 months")
    
    # Get child history
    history = get_child_history(child_id)
    print()
    print(f"History for {child_id}:")
    print(history[["Age_months", "Weight_kg", "Height_cm", "Risk_Level", "Final_Decision"]])
    print()
    
    return history

def example_multiple_children():
    """Example 4: Analyze multiple children"""
    print("=" * 80)
    print("EXAMPLE 4: Analyze Multiple Children")
    print("=" * 80)
    print()
    
    children = [
        {"id": "CH002", "age": 6, "sex": "F", "weight": 6.2, "height": 62},
        {"id": "CH003", "age": 30, "sex": "M", "weight": 12.5, "height": 88},
        {"id": "CH004", "age": 36, "sex": "F", "weight": 13.8, "height": 95},
    ]
    
    print("Analyzing multiple children...")
    print()
    
    for child in children:
        result = analyze_child(
            age=child["age"],
            sex=child["sex"],
            weight=child["weight"],
            height=child["height"]
        )
        
        print(f"Child {child['id']}:")
        print(f"  Age: {child['age']} months, {child['sex']}")
        print(f"  Risk Level: {result['summary']['severity']}")
        print(f"  Primary Concern: {result['summary']['primary_concern']}")
        print()
        
        # Optionally save records
        # save_record(child["id"], child["age"], child["sex"], 
        #             child["weight"], child["height"], result)

if __name__ == "__main__":
    print()
    print("CHILD MALNUTRITION AI - USAGE EXAMPLES")
    print()
    
    # Run examples
    example_basic_analysis()
    print()
    
    example_detailed_report()
    print()
    
    example_save_and_track()
    print()
    
    example_multiple_children()
    print()
    
    print("=" * 80)
    print("All examples completed!")
    print("=" * 80)

