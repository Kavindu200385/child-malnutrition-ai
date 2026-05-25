/**
 * Unit tests for midwife-escalation-related frontend logic:
 *   1. canAddMeasurement derivation for each role
 *   2. mapToMeasurements measuredBy extraction
 *   3. childEscalated flag derivation
 *   4. localStorage tab persistence helpers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers extracted from ChildProfileView to keep tests fast (no React render)
// ---------------------------------------------------------------------------

type RiskLevel = 'normal' | 'mam' | 'sam';

function deriveCanAddMeasurement(
  userRole: string | undefined,
  apiChild: Record<string, any> | null,
): boolean {
  const isHospitalRole = userRole === 'hospital';
  const isMoh = userRole === 'moh' || userRole === 'amoh';
  const isNutritionist = userRole === 'nutritionist';
  const isMidwife = userRole === 'midwife';
  const childEscalated =
    !!apiChild?.escalation_status && apiChild.escalation_status !== 'NONE';

  if (isHospitalRole) return false;
  if (isMoh) return apiChild?.can_moh_add_measurement === true;
  if (isNutritionist) return apiChild?.can_nutritionist_add_measurement === true;
  if (isMidwife) return !childEscalated;
  return true;
}

function roleLabel(role: string): string {
  const r = (role || '').toLowerCase();
  if (r === 'moh' || r === 'amoh') return 'MOH';
  if (r === 'midwife') return 'Midwife';
  if (r === 'nutritionist') return 'Nutritionist';
  if (r === 'hospital') return 'Hospital';
  return role;
}

interface RawMeasurement {
  id?: number;
  measurement_date?: string;
  weight_kg?: number;
  height_cm?: number;
  muac_cm?: number | null;
  risk_level?: string;
  notes?: string;
  measured_by?: { name: string; role: string } | null;
}

function extractMeasuredBy(raw: RawMeasurement): string | null {
  const mb = raw.measured_by;
  if (!mb) return null;
  return `${mb.name || ''}${mb.role ? ` (${roleLabel(mb.role)})` : ''}`.trim() || null;
}

// ---------------------------------------------------------------------------
// 1. canAddMeasurement logic
// ---------------------------------------------------------------------------
describe('canAddMeasurement', () => {
  describe('hospital role', () => {
    it('is always false', () => {
      expect(deriveCanAddMeasurement('hospital', null)).toBe(false);
      expect(deriveCanAddMeasurement('hospital', { escalation_status: 'NONE' })).toBe(false);
    });
  });

  describe('MOH role', () => {
    it('is true when can_moh_add_measurement is explicitly true', () => {
      expect(deriveCanAddMeasurement('moh', { can_moh_add_measurement: true })).toBe(true);
    });

    it('is false when can_moh_add_measurement is false', () => {
      expect(deriveCanAddMeasurement('moh', { can_moh_add_measurement: false })).toBe(false);
    });

    it('is false when flag is absent', () => {
      expect(deriveCanAddMeasurement('moh', {})).toBe(false);
    });

    it('amoh follows the same rule', () => {
      expect(deriveCanAddMeasurement('amoh', { can_moh_add_measurement: true })).toBe(true);
      expect(deriveCanAddMeasurement('amoh', { can_moh_add_measurement: false })).toBe(false);
    });
  });

  describe('nutritionist role', () => {
    it('is true when can_nutritionist_add_measurement is true', () => {
      expect(deriveCanAddMeasurement('nutritionist', { can_nutritionist_add_measurement: true })).toBe(true);
    });

    it('is false when flag is false or absent', () => {
      expect(deriveCanAddMeasurement('nutritionist', { can_nutritionist_add_measurement: false })).toBe(false);
      expect(deriveCanAddMeasurement('nutritionist', {})).toBe(false);
    });
  });

  describe('midwife role', () => {
    it('is true when escalation_status is NONE', () => {
      expect(deriveCanAddMeasurement('midwife', { escalation_status: 'NONE' })).toBe(true);
    });

    it('is true when escalation_status is null/undefined', () => {
      expect(deriveCanAddMeasurement('midwife', { escalation_status: null })).toBe(true);
      expect(deriveCanAddMeasurement('midwife', {})).toBe(true);
    });

    it('is false when child is escalated to MOH', () => {
      expect(deriveCanAddMeasurement('midwife', { escalation_status: 'ESCALATED_TO_MOH' })).toBe(false);
    });

    it('is false when child is escalated to nutritionist', () => {
      expect(deriveCanAddMeasurement('midwife', { escalation_status: 'ESCALATED_TO_NUTRITIONIST' })).toBe(false);
    });
  });

  describe('other / unknown role', () => {
    it('defaults to true', () => {
      expect(deriveCanAddMeasurement('some_role', { escalation_status: 'NONE' })).toBe(true);
      expect(deriveCanAddMeasurement(undefined, null)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. measuredBy extraction from raw measurement data
// ---------------------------------------------------------------------------
describe('measuredBy extraction', () => {
  it('returns null when measured_by is absent', () => {
    expect(extractMeasuredBy({ weight_kg: 7 })).toBeNull();
  });

  it('returns null when measured_by is null', () => {
    expect(extractMeasuredBy({ measured_by: null })).toBeNull();
  });

  it('formats midwife correctly', () => {
    const result = extractMeasuredBy({ measured_by: { name: 'Alice', role: 'midwife' } });
    expect(result).toBe('Alice (Midwife)');
  });

  it('formats MOH correctly', () => {
    const result = extractMeasuredBy({ measured_by: { name: 'Dr. Silva', role: 'moh' } });
    expect(result).toBe('Dr. Silva (MOH)');
  });

  it('formats AMOH as MOH', () => {
    const result = extractMeasuredBy({ measured_by: { name: 'Dr. Perera', role: 'amoh' } });
    expect(result).toBe('Dr. Perera (MOH)');
  });

  it('formats nutritionist correctly', () => {
    const result = extractMeasuredBy({ measured_by: { name: 'Priya', role: 'nutritionist' } });
    expect(result).toBe('Priya (Nutritionist)');
  });

  it('formats hospital correctly', () => {
    const result = extractMeasuredBy({ measured_by: { name: 'City Hospital', role: 'hospital' } });
    expect(result).toBe('City Hospital (Hospital)');
  });

  it('falls back gracefully when name is empty', () => {
    const result = extractMeasuredBy({ measured_by: { name: '', role: 'moh' } });
    expect(result).toBe('(MOH)');
  });

  it('uses role label as fallback when name missing', () => {
    const result = extractMeasuredBy({ measured_by: { name: '', role: 'nutritionist' } });
    expect(result).toBe('(Nutritionist)');
  });
});

// ---------------------------------------------------------------------------
// 3. childEscalated flag
// ---------------------------------------------------------------------------
describe('childEscalated flag', () => {
  function isEscalated(status: string | null | undefined): boolean {
    return !!status && status !== 'NONE';
  }

  it('is false when status is NONE', () => {
    expect(isEscalated('NONE')).toBe(false);
  });

  it('is false when status is null', () => {
    expect(isEscalated(null)).toBe(false);
  });

  it('is false when status is undefined', () => {
    expect(isEscalated(undefined)).toBe(false);
  });

  it('is true when escalated to MOH', () => {
    expect(isEscalated('ESCALATED_TO_MOH')).toBe(true);
  });

  it('is true when escalated to nutritionist', () => {
    expect(isEscalated('ESCALATED_TO_NUTRITIONIST')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. localStorage tab persistence helpers
// ---------------------------------------------------------------------------
describe('tab localStorage persistence', () => {
  const AREA_WORKERS_KEY = 'moh_area_workers_tab';
  const MOH_ESCALATED_KEY = 'moh_escalated_tab';
  const REPORTS_KEY_PREFIX = 'admin_reports_tab_';

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('area workers tab is saved to localStorage', () => {
    localStorage.setItem(AREA_WORKERS_KEY, 'transfer');
    expect(localStorage.getItem(AREA_WORKERS_KEY)).toBe('transfer');
  });

  it('area workers tab restores from localStorage', () => {
    localStorage.setItem(AREA_WORKERS_KEY, 'transfer');
    const restored = localStorage.getItem(AREA_WORKERS_KEY) ?? 'workers';
    expect(restored).toBe('transfer');
  });

  it('area workers tab defaults to workers when storage is empty', () => {
    const restored = localStorage.getItem(AREA_WORKERS_KEY) ?? 'workers';
    expect(restored).toBe('workers');
  });

  it('moh escalated tab saves and restores correctly', () => {
    localStorage.setItem(MOH_ESCALATED_KEY, 'approved');
    expect(localStorage.getItem(MOH_ESCALATED_KEY)).toBe('approved');
  });

  it('moh escalated tab defaults to pending when storage empty', () => {
    const restored = localStorage.getItem(MOH_ESCALATED_KEY) ?? 'pending';
    expect(restored).toBe('pending');
  });

  it('reports dashboard tab is role-scoped', () => {
    localStorage.setItem(`${REPORTS_KEY_PREFIX}health_ministry`, 'saved');
    localStorage.setItem(`${REPORTS_KEY_PREFIX}rdhs`, 'generate');

    expect(localStorage.getItem(`${REPORTS_KEY_PREFIX}health_ministry`)).toBe('saved');
    expect(localStorage.getItem(`${REPORTS_KEY_PREFIX}rdhs`)).toBe('generate');
  });

  it('clearing storage resets tab to default', () => {
    localStorage.setItem(AREA_WORKERS_KEY, 'transfer');
    localStorage.clear();
    const restored = localStorage.getItem(AREA_WORKERS_KEY) ?? 'workers';
    expect(restored).toBe('workers');
  });
});

// ---------------------------------------------------------------------------
// 5. Health worker view persistence — context-only views excluded
// ---------------------------------------------------------------------------
describe('view persistence exclusions', () => {
  const CONTEXT_VIEWS = ['profile', 'add-child', 'assign-child'];
  const SAFE_VIEWS = ['dashboard', 'search', 'moh-escalated', 'nut-referred', 'reports'];

  function shouldRestoreView(stored: string): boolean {
    return !CONTEXT_VIEWS.includes(stored);
  }

  it('restores safe nav views', () => {
    SAFE_VIEWS.forEach((v) => {
      expect(shouldRestoreView(v)).toBe(true);
    });
  });

  it('does NOT restore context-dependent views', () => {
    CONTEXT_VIEWS.forEach((v) => {
      expect(shouldRestoreView(v)).toBe(false);
    });
  });
});
