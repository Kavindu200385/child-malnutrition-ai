import { describe, expect, it } from 'vitest';
import { validateMeasurementForm } from '../utils/measurementValidation';
import {
  FUTURE_RISK_RESEARCH_ONLY_TEXT,
  FUTURE_RISK_UNAVAILABLE_TEXT,
  getFutureRiskPresentation,
  getStatusBreakdown,
} from '../utils/statusDisplay';

const validMeasurement = {
  childId: '123',
  weight: '10.5',
  height: '80.0',
  measurementDate: '2023-01-01',
  measurementMethod: 'recumbent_length',
};

describe('WHO measurement request contract', () => {
  it('accepts a complete measurement request', () => {
    expect(validateMeasurementForm(validMeasurement).errors).toEqual([]);
  });

  it('rejects a missing measurement date before an API request is made', () => {
    expect(validateMeasurementForm({ ...validMeasurement, measurementDate: '' }).errors)
      .toContain('Measurement date is required.');
  });

  it('rejects a missing measurement method before an API request is made', () => {
    expect(validateMeasurementForm({ ...validMeasurement, measurementMethod: '' }).errors)
      .toContain('Please select recumbent length or standing height.');
  });
});

describe('future-risk presentation safety', () => {
  it('shows an explicit unavailable state when no model output exists', () => {
    expect(getFutureRiskPresentation({})).toEqual({
      available: false,
      label: 'NOT AVAILABLE',
      message: FUTURE_RISK_UNAVAILABLE_TEXT,
    });
  });

  it('marks stored historical output as research-only rather than clinical prediction', () => {
    expect(getFutureRiskPresentation({ future_predicted_risk: 'HIGH' })).toEqual({
      available: true,
      label: 'HIGH RISK',
      message: FUTURE_RISK_RESEARCH_ONLY_TEXT,
    });
  });
});

describe('WHO screening-indicator display', () => {
  it('preserves independent underweight, stunting, and wasting values', () => {
    expect(getStatusBreakdown({
      underweight_status: 'UNDERWEIGHT',
      stunting_status: 'SEVERE STUNTING',
      wasting_status: 'WASTING',
    })).toEqual(expect.arrayContaining([
      { label: 'Underweight Status', value: 'UNDERWEIGHT' },
      { label: 'Stunting Status', value: 'SEVERE STUNTING' },
      { label: 'Wasting Status', value: 'WASTING' },
    ]));
  });
});
