import React, { useState } from 'react';
import { Save, CheckCircle, AlertTriangle } from 'lucide-react';
import { RiskBadge } from './RiskBadge';

type Screen = 'login' | 'dashboard' | 'search' | 'profile' | 'add-measurement' | 'reports';

interface AddMeasurementProps {
  onNavigate: (screen: Screen) => void;
}

interface CalculatedResults {
  wfa: number;
  hfa: number;
  wfh: number;
  classification: 'Normal' | 'MAM' | 'SAM';
  underweight: boolean;
  stunting: boolean;
  wasting: boolean;
}

export function AddMeasurement({ onNavigate }: AddMeasurementProps) {
  const [childId, setChildId] = useState('');
  const [ageYears, setAgeYears] = useState('');
  const [ageMonths, setAgeMonths] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [results, setResults] = useState<CalculatedResults | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Validate inputs
  const validateInputs = (): boolean => {
    const newErrors: string[] = [];

    if (!childId.trim()) {
      newErrors.push('Child Health ID is required');
    }

    const years = parseInt(ageYears);
    const months = parseInt(ageMonths);
    
    if (isNaN(years) || years < 0 || years > 5) {
      newErrors.push('Age years must be between 0 and 5');
    }
    
    if (isNaN(months) || months < 0 || months > 11) {
      newErrors.push('Age months must be between 0 and 11');
    }

    const weightVal = parseFloat(weight);
    if (isNaN(weightVal) || weightVal <= 0 || weightVal > 30) {
      newErrors.push('Weight must be between 0 and 30 kg');
    }

    const heightVal = parseFloat(height);
    if (isNaN(heightVal) || heightVal <= 0 || heightVal > 150) {
      newErrors.push('Height must be between 0 and 150 cm');
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  // Simple Z-score calculation (mock - real app would use WHO tables)
  const calculateZScores = (weightVal: number, heightVal: number, ageInMonths: number): CalculatedResults => {
    // Mock calculation - in production, use WHO reference tables
    const expectedWeight = 3.5 + (ageInMonths * 0.4); // Simplified
    const expectedHeight = 50 + (ageInMonths * 1.5); // Simplified
    
    const wfa = (weightVal - expectedWeight) / 1.5;
    const hfa = (heightVal - expectedHeight) / 3.5;
    const wfh = (weightVal - (heightVal * 0.12)) / 1.2;

    const underweight = wfa < -2;
    const stunting = hfa < -2;
    const wasting = wfh < -2;

    let classification: 'Normal' | 'MAM' | 'SAM' = 'Normal';
    if (wfa < -3 || hfa < -3 || wfh < -3) {
      classification = 'SAM';
    } else if (wfa < -2 || hfa < -2 || wfh < -2) {
      classification = 'MAM';
    }

    return { wfa, hfa, wfh, classification, underweight, stunting, wasting };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateInputs()) {
      return;
    }

    const ageInMonths = parseInt(ageYears) * 12 + parseInt(ageMonths);
    const weightVal = parseFloat(weight);
    const heightVal = parseFloat(height);

    const calculatedResults = calculateZScores(weightVal, heightVal, ageInMonths);
    setResults(calculatedResults);
    setShowSuccess(true);

    // Hide success message after 3 seconds
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleReset = () => {
    setChildId('');
    setAgeYears('');
    setAgeMonths('');
    setWeight('');
    setHeight('');
    setResults(null);
    setShowSuccess(false);
    setErrors([]);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-gray-900 mb-2">Add New Clinic Measurement</h1>
        <p className="text-gray-600">Record new clinic visit and assessment</p>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-600" />
          <p className="text-green-800">Measurement recorded and assessment completed successfully!</p>
        </div>
      )}

      {/* Error Messages */}
      {errors.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-800 mb-2">Please correct the following errors:</p>
              <ul className="list-disc list-inside text-red-700 text-sm space-y-1">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form Section */}
        <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
          <h2 className="text-gray-900 mb-6">Measurement Details</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Child ID */}
            <div>
              <label htmlFor="childId" className="block text-gray-900 mb-2">
                Child Health ID <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                id="childId"
                value={childId}
                onChange={(e) => setChildId(e.target.value)}
                className="w-full px-4 py-4 text-lg border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., CH-2024-0234"
                required
              />
            </div>

            {/* Age */}
            <div>
              <label className="block text-gray-900 mb-2">
                Age <span className="text-red-600">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="number"
                    value={ageYears}
                    onChange={(e) => setAgeYears(e.target.value)}
                    className="w-full px-4 py-4 text-lg border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Years"
                    min="0"
                    max="5"
                    required
                  />
                  <p className="text-gray-500 text-sm mt-1">Years (0-5)</p>
                </div>
                <div>
                  <input
                    type="number"
                    value={ageMonths}
                    onChange={(e) => setAgeMonths(e.target.value)}
                    className="w-full px-4 py-4 text-lg border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Months"
                    min="0"
                    max="11"
                    required
                  />
                  <p className="text-gray-500 text-sm mt-1">Months (0-11)</p>
                </div>
              </div>
            </div>

            {/* Weight */}
            <div>
              <label htmlFor="weight" className="block text-gray-900 mb-2">
                Weight (kg) <span className="text-red-600">*</span>
              </label>
              <input
                type="number"
                id="weight"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full px-4 py-4 text-lg border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 12.5"
                step="0.1"
                min="0"
                required
              />
              <p className="text-gray-500 text-sm mt-1">Measure using calibrated digital scale</p>
            </div>

            {/* Height */}
            <div>
              <label htmlFor="height" className="block text-gray-900 mb-2">
                Height / Length (cm) <span className="text-red-600">*</span>
              </label>
              <input
                type="number"
                id="height"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="w-full px-4 py-4 text-lg border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 85.5"
                step="0.1"
                min="0"
                required
              />
              <p className="text-gray-500 text-sm mt-1">Use length board for children under 2 years</p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-4 rounded-xl hover:bg-blue-700 transition-colors border-2 border-blue-700"
              >
                <Save className="w-5 h-5" />
                Calculate & Save
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-8 py-4 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
            </div>
          </form>
        </div>

        {/* Results Section */}
        <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
          <h2 className="text-gray-900 mb-6">Assessment Results</h2>
          
          {!results ? (
            <div className="text-center py-16 text-gray-400">
              <AlertTriangle className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="mb-2">No assessment yet</p>
              <p className="text-sm">Fill in the form and click "Calculate & Save"</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Classification Badge */}
              <div className={`text-center py-6 rounded-xl border-2 ${
                results.classification === 'SAM'
                  ? 'bg-[#E74C3C]/5 border-[#E74C3C]'
                  : results.classification === 'MAM'
                  ? 'bg-[#F1C40F]/5 border-[#F1C40F]'
                  : 'bg-[#2ECC71]/5 border-[#2ECC71]'
              }`}>
                <p className="text-gray-600 mb-3">Risk Classification</p>
                <RiskBadge classification={results.classification} size="large" />
              </div>

              {/* Z-Scores */}
              <div className="space-y-3">
                <h3 className="text-gray-900">Z-Score Values</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-4 text-center border-2 border-gray-200">
                    <p className="text-gray-600 text-sm mb-1">WFA</p>
                    <p className={`text-lg ${results.wfa < -2 ? 'text-red-600' : 'text-gray-900'}`}>
                      {results.wfa.toFixed(1)}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center border-2 border-gray-200">
                    <p className="text-gray-600 text-sm mb-1">HFA</p>
                    <p className={`text-lg ${results.hfa < -2 ? 'text-red-600' : 'text-gray-900'}`}>
                      {results.hfa.toFixed(1)}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center border-2 border-gray-200">
                    <p className="text-gray-600 text-sm mb-1">WFH</p>
                    <p className={`text-lg ${results.wfh < -2 ? 'text-red-600' : 'text-gray-900'}`}>
                      {results.wfh.toFixed(1)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Status Indicators */}
              <div className="space-y-3">
                <h3 className="text-gray-900">Status Indicators</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                    <span className="text-gray-700">Underweight</span>
                    <span className={`px-3 py-1 rounded-lg ${results.underweight ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                      {results.underweight ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                    <span className="text-gray-700">Stunting</span>
                    <span className={`px-3 py-1 rounded-lg ${results.stunting ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                      {results.stunting ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                    <span className="text-gray-700">Wasting</span>
                    <span className={`px-3 py-1 rounded-lg ${results.wasting ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                      {results.wasting ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              <div className={`rounded-xl p-5 border-2 ${
                results.classification === 'SAM' 
                  ? 'bg-[#E74C3C]/10 border-[#E74C3C]'
                  : results.classification === 'MAM'
                  ? 'bg-[#F1C40F]/10 border-[#F1C40F]'
                  : 'bg-[#2ECC71]/10 border-[#2ECC71]'
              }`}>
                <h3 className="text-gray-900 mb-2">Action Required</h3>
                <p className="text-sm">
                  {results.classification === 'SAM' && (
                    <span className="text-gray-900">
                      <strong className="text-[#E74C3C]">IMMEDIATE REFERRAL:</strong> Refer to specialized nutrition treatment facility. Follow SAM management protocol immediately.
                    </span>
                  )}
                  {results.classification === 'MAM' && (
                    <span className="text-gray-900">
                      <strong className="text-[#F1C40F]">INTERVENTION REQUIRED:</strong> Provide nutritional counseling and supplementary feeding. Schedule follow-up in 2 weeks.
                    </span>
                  )}
                  {results.classification === 'Normal' && (
                    <span className="text-gray-900">
                      <strong className="text-[#2ECC71]">CONTINUE MONITORING:</strong> Normal nutritional status. Continue routine monitoring. Next visit in 1 month.
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}