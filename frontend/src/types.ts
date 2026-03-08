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
export function calculateRiskLevel(wfa: number, hfa: number, wfh: number): RiskLevel {
  // Use the most severe indicator
  const minZ = Math.min(wfa, hfa, wfh);

  if (minZ < -3) {
    return 'sam';
  } else if (minZ < -2) {
    return 'mam';
  } else {
    return 'normal';
  }
}
