/**
 * Type definitions and utility functions
 */

export type RiskLevel = 'normal' | 'mam' | 'sam';

export interface Measurement {
  id: string;
  date: string;
  ageMonths: number;
  weight: number;
  height: number;
  muac?: number;
  weightForAge?: number;
  heightForAge?: number;
  weightForHeight?: number;
  riskLevel: RiskLevel;
  notes?: string;
}

export interface Child {
  id: string;
  name: string;
  dob: string;
  gender: 'male' | 'female';
  guardianName: string;
  guardianPhone: string;
  address: string;
  riskLevel: RiskLevel;
  lastVisit: string;
  measurements: Measurement[];
}

/**
 * Display risk rule (matches backend _display_risk_level):
 * - If no clinic measurement yet (last_risk_update empty) and birth_risk_level exists → use birth.
 * - Otherwise use current_risk_level.
 * Use this everywhere we show child risk so list and profile show the same value.
 */
export function getDisplayRiskLevel(child: {
  last_risk_update?: string | null;
  current_risk_level?: string | null;
  birth_risk_level?: string | null;
  display_risk_level?: string | null;
}): string {
  if (child.display_risk_level) return (child.display_risk_level || 'NORMAL').toUpperCase();
  const birth = (child.birth_risk_level || '').toUpperCase();
  const current = (child.current_risk_level || '').toUpperCase();
  if (!child.last_risk_update && birth) return birth;
  if (current) return current;
  if (birth) return birth;
  return 'NORMAL';
}

/**
 * Same as getDisplayRiskLevel but returns RiskLevel for getRiskColor/getRiskLabel.
 */
export function getDisplayRiskLevelTyped(child: {
  last_risk_update?: string | null;
  current_risk_level?: string | null;
  birth_risk_level?: string | null;
  display_risk_level?: string | null;
}): RiskLevel {
  const r = getDisplayRiskLevel(child);
  if (r === 'SAM') return 'sam';
  if (r === 'MAM') return 'mam';
  return 'normal';
}

/**
 * Get color for risk level
 */
export function getRiskColor(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'sam':
      return '#E74C3C'; // Red
    case 'mam':
      return '#F1C40F'; // Yellow
    case 'normal':
      return '#2ECC71'; // Green
    default:
      return '#95A5A6'; // Gray
  }
}

/**
 * Get label for risk level
 */
export function getRiskLabel(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'sam':
      return 'SAM';
    case 'mam':
      return 'MAM';
    case 'normal':
      return 'Normal';
    default:
      return 'Unknown';
  }
}

/**
 * Get background color class for risk level
 */
export function getRiskBgColor(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'sam':
      return 'bg-red-100';
    case 'mam':
      return 'bg-yellow-100';
    case 'normal':
      return 'bg-green-100';
    default:
      return 'bg-gray-100';
  }
}

/**
 * Get text color class for risk level
 */
export function getRiskTextColor(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'sam':
      return 'text-red-700';
    case 'mam':
      return 'text-yellow-700';
    case 'normal':
      return 'text-green-700';
    default:
      return 'text-gray-700';
  }
}

/**
 * Calculate risk level based on Z-scores
 * This is a simplified version - in production, use the actual AI model
 */
export function calculateRiskLevel(wfa?: number | null, hfa?: number | null, wfh?: number | null): RiskLevel {
  const scores = [wfa, hfa, wfh].filter((z): z is number => z != null && isFinite(z));
  if (scores.length === 0) return 'normal';
  const minZ = Math.min(...scores);
  if (minZ < -3) return 'sam';
  if (minZ < -2) return 'mam';
  return 'normal';
}
