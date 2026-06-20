export const STATUS_HELPER_TEXT =
  'Current nutritional status is calculated using WHO growth assessment rules. The 2-month predicted risk is an AI-based early warning and should not replace clinical judgment.';

function upperClean(value: unknown): string {
  return String(value || '').replace(/_/g, ' ').trim().toUpperCase();
}

function findLatestRecord(child: any): any | null {
  const items = [...(child?.measurements || []), ...(child?.visits || [])]
    .filter(Boolean)
    .sort((a, b) => {
      const aDate = new Date(a.measurement_date || a.visit_date || a.created_at || 0).getTime();
      const bDate = new Date(b.measurement_date || b.visit_date || b.created_at || 0).getTime();
      return bDate - aDate;
    });
  return items[0] || null;
}

export function getCurrentNutritionalStatusLabel(child: any, fallback = 'NOT AVAILABLE'): string {
  const raw =
    child?.current_nutritional_status ||
    child?.currentNutritionalStatus ||
    child?.latest_measurement?.current_nutritional_status ||
    child?.latest_visit?.current_nutritional_status ||
    child?.latestMeasurement?.currentNutritionalStatus ||
    child?.latestVisit?.currentNutritionalStatus;
  const label = upperClean(raw || fallback);
  if (!label) return 'NOT AVAILABLE';
  if (label === 'DECLINING') return 'NEEDS CLINICAL REVIEW';
  return label;
}

export function getFuturePredictedRiskLabel(child: any): string {
  const latest = findLatestRecord(child);
  const raw =
    child?.future_predicted_risk ||
    child?.futurePredictedRisk ||
    child?.predicted_risk_next_2_months ||
    child?.latest_predicted_risk_next_2_months ||
    child?.predictedRiskNext2Months ||
    child?.latestPredictedRiskNext2Months ||
    child?.latest_measurement?.future_predicted_risk ||
    child?.latest_measurement?.predicted_risk_next_2_months ||
    child?.latest_visit?.future_predicted_risk ||
    child?.latest_visit?.predicted_risk_next_2_months ||
    latest?.future_predicted_risk ||
    latest?.predicted_risk_next_2_months;
  const label = upperClean(raw);
  if (!label) return 'NOT AVAILABLE';
  if (label === 'NORMAL' || label === 'NO' || label === 'NONE') return 'NO RISK';
  if (label === 'LOW') return 'LOW RISK';
  if (label === 'MODERATE') return 'MODERATE RISK';
  if (label === 'HIGH') return 'HIGH RISK';
  if (label === 'SEVERE') return 'SEVERE RISK';
  return label;
}

export function getClinicalActionDisplay(child: any): { label: string; className: string } {
  const predicted = getFuturePredictedRiskLabel(child);
  const reviewReason = String(child?.clinical_review_reason || child?.clinicalReviewReason || '').toUpperCase();
  const required = child?.clinical_action_required ?? child?.clinicalActionRequired;
  if (predicted === 'NEEDS CLINICAL REVIEW' || reviewReason.includes('LOW MODEL CONFIDENCE')) {
    return { label: 'NEEDS CLINICAL REVIEW', className: 'border-orange-300 bg-orange-50 text-orange-700' };
  }
  if (required === true || required === 1) {
    return { label: 'YES', className: 'border-orange-300 bg-orange-50 text-orange-700' };
  }
  if (required === false || required === 0) {
    return { label: 'NO', className: 'border-green-200 bg-green-50 text-green-700' };
  }
  return { label: 'NOT AVAILABLE', className: 'border-gray-200 bg-gray-50 text-gray-600' };
}

export function getCurrentStatusToneClass(label: string): string {
  const value = upperClean(label);
  if (value.includes('NORMAL')) return 'border-green-200 bg-green-50 text-green-700';
  if (value.includes('SAM') || value.includes('SEVERE STUNTING') || value.includes('SEVERE RISK')) return 'border-red-200 bg-red-50 text-red-700';
  if (value.includes('HIGH RISK') || value.includes('DECLINING')) return 'border-orange-200 bg-orange-50 text-orange-700';
  if (value.includes('MAM') || value.includes('UNDERWEIGHT') || value.includes('STUNTING') || value.includes('MODERATE RISK')) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (value.includes('LOW RISK')) return 'border-sky-200 bg-sky-50 text-sky-700';
  if (value.includes('NEEDS CLINICAL REVIEW')) return 'border-orange-300 bg-orange-50 text-orange-700';
  return 'border-gray-200 bg-gray-50 text-gray-700';
}

export function getFutureRiskToneClass(label: string): string {
  return getCurrentStatusToneClass(label);
}

export function getStatusBreakdown(child: any): Array<{ label: string; value: string }> {
  const latest = findLatestRecord(child);
  const underweight = child?.underweight_status || latest?.underweight_status || 'Not Available';
  const stunting = child?.stunting_status || latest?.stunting_status || 'Not Available';
  const wasting = child?.wasting_status || latest?.wasting_status || 'Not Available';
  const muac = child?.muac_status || latest?.muac_status || 'Not Recorded';
  const edema = child?.edema_status || latest?.edema_status || 'Not Recorded';
  return [
    { label: 'Underweight Status', value: String(underweight).replace(/_/g, ' ') },
    { label: 'Stunting Status', value: String(stunting).replace(/_/g, ' ') },
    { label: 'Wasting Status', value: String(wasting).replace(/_/g, ' ') },
    { label: 'MUAC Status', value: String(muac).replace(/_/g, ' ') || 'Not Recorded' },
    { label: 'Edema Status', value: String(edema).replace(/_/g, ' ') || 'Not Recorded' },
  ];
}
