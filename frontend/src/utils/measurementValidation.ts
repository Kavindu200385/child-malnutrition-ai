export interface MeasurementValidationInput {
  childId?: string | number | null;
  weight?: string;
  height?: string;
  muac?: string;
  edema?: string;
}

export interface MeasurementValidationResult {
  errors: string[];
  warnings: string[];
  values: {
    weightKg?: number;
    heightCm?: number;
    muacCm?: number;
  };
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  return Number(value);
}

export function validateMeasurementForm(input: MeasurementValidationInput): MeasurementValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const weightKg = parseOptionalNumber(input.weight);
  const heightCm = parseOptionalNumber(input.height);
  const muacCm = parseOptionalNumber(input.muac);

  if (!input.childId) {
    errors.push('Please select a child.');
  }

  if (weightKg == null || Number.isNaN(weightKg)) {
    errors.push('Weight is required for WHO Z-score calculation.');
  } else if (weightKg < 0) {
    errors.push('Weight cannot be negative.');
  } else if (weightKg === 0) {
    errors.push('Weight must be greater than 0.');
  } else if (weightKg < 1 || weightKg > 40) {
    warnings.push('Weight is outside the realistic range (1-40 kg). Clinical review will be flagged.');
  }

  if (heightCm == null || Number.isNaN(heightCm)) {
    errors.push('Height/length is required for WHO Z-score calculation.');
  } else if (heightCm < 0) {
    errors.push('Height/length cannot be negative.');
  } else if (heightCm === 0) {
    errors.push('Height/length must be greater than 0.');
  } else if (heightCm < 30 || heightCm > 130) {
    warnings.push('Height/length is outside the realistic range (30-130 cm). Clinical review will be flagged.');
  }

  if (input.muac && input.muac.trim() !== '') {
    if (muacCm == null || Number.isNaN(muacCm)) {
      errors.push('MUAC must be a valid number.');
    } else if (muacCm < 0) {
      errors.push('MUAC cannot be negative.');
    } else if (muacCm < 5 || muacCm > 30) {
      warnings.push('MUAC is outside the realistic range (5-30 cm). Clinical review will be flagged.');
    }
  }

  if (input.edema && !['yes', 'no', 'true', 'false'].includes(input.edema.toLowerCase())) {
    errors.push('Edema must be yes/no or true/false.');
  }

  return {
    errors,
    warnings,
    values: { weightKg, heightCm, muacCm },
  };
}
