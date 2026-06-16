import React, { useState, useEffect, useRef } from 'react';
import { calculateRiskLevel, getRiskColor, getRiskLabel } from '../../types';
import { ArrowLeft, Save, CheckCircle, AlertTriangle, Brain, TrendingUp, Calendar, FileText, TrendingDown, Activity } from 'lucide-react';
import { nutritionistAPI, midwifeAPI, mohAPI, childrenAPI } from '../../services/api';
import { validateMeasurementForm } from '../../utils/measurementValidation';

interface AddMeasurementViewProps {
  user?: { role?: string } | null;
  selectedChildId: string | null;
  onBack: () => void;
  onSuccess: (childId: string) => void;
}

interface PredictionData {
  predictedRiskLevel: 'normal' | 'mam' | 'sam';
  confidence: number;
  status: 'Early Warning' | 'Stable' | 'Improving';
  predictedZScores: {
    weightForAge: number;
    heightForAge: number;
    weightForHeight: number;
  };
  trend: 'declining' | 'stable' | 'improving';
  actionRequired: boolean;
}

interface AIResults {
  childName: string;
  childId: string;
  date: string;
  weight: number;
  height: number;
  muac: number | null;
  muacStatus?: string;
  edemaStatus?: string;
  weightForAge: number;
  heightForAge: number;
  weightForHeight: number;
  riskLevel: 'normal' | 'mam' | 'sam';
  recommendations: string[];
  nutritionalGuidance: string[];
  followUp: string;
  alerts: string[];
  prediction?: PredictionData;
}

export function AddMeasurementView({ user, selectedChildId, onBack, onSuccess }: AddMeasurementViewProps) {
  const isNutritionist = user?.role === 'nutritionist';
  const isMoh = user?.role === 'moh' || user?.role === 'amoh';
  const [childId, setChildId] = useState(selectedChildId || '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [muac, setMuac] = useState('');
  const [edema, setEdema] = useState('');
  const [measurementMethod, setMeasurementMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [aiResults, setAiResults] = useState<AIResults | null>(null);
  const [referredChildren, setReferredChildren] = useState<{ child: any }[]>([]);
  const [midwifeChildren, setMidwifeChildren] = useState<any[]>([]);
  const [nutLoading, setNutLoading] = useState(false);
  const [midwifeLoading, setMidwifeLoading] = useState(false);
  const [nutError, setNutError] = useState('');
  const [measurementWarnings, setMeasurementWarnings] = useState<string[]>([]);
  const [nutSuccess, setNutSuccess] = useState(false);

  // Searchable combobox state
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isNutritionist) {
      nutritionistAPI.referredChildren()
        .then((res) => { if (res.data?.status === 'success') setReferredChildren(res.data.children || []); })
        .catch(() => setReferredChildren([]));
    } else if (isMoh) {
      childrenAPI.list({})
        .then((res) => {
          if (res.data?.status === 'success' && res.data?.children) {
            const onlyEscalated = (res.data.children as any[]).filter((c: any) => c.can_moh_add_measurement === true);
            setMidwifeChildren(onlyEscalated);
          }
        })
        .catch(() => setMidwifeChildren([]));
    } else {
      midwifeAPI.listChildren({})
        .then((res) => { if (res.data?.status === 'success') setMidwifeChildren(res.data.children || []); })
        .catch(() => setMidwifeChildren([]));
    }
  }, [isNutritionist, isMoh]);

  const selectedChild = isNutritionist
    ? referredChildren.find((r) => String(r.child?.id) === childId)?.child
    : isMoh
      ? midwifeChildren.find((c) => String(c.id) === String(childId) || String(c.child_id || c.child_unique_id) === String(childId))
      : midwifeChildren.find((c) => String(c.child_id || c.id) === String(childId));

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Build flat child list for the combobox
  const allChildren: { id: string; name: string; childUniqueId: string; dob: string; gender: string; guardianName: string }[] = isNutritionist
    ? referredChildren.map((r) => ({
      id: String(r.child?.id ?? ''),
      name: r.child?.name || '',
      childUniqueId: String(r.child?.child_id || r.child?.child_unique_id || r.child?.id || ''),
      dob: r.child?.dob || '',
      gender: r.child?.gender || '',
      guardianName: r.child?.guardian_name || '',
    }))
    : midwifeChildren.map((c) => ({
      id: String(c.id ?? ''),
      name: c.name || '',
      childUniqueId: String(c.child_id || c.child_unique_id || c.id || ''),
      dob: c.dob || '',
      gender: c.gender || '',
      guardianName: c.guardian_name || '',
    }));

  const filteredChildren = searchQuery.trim()
    ? allChildren.filter((c) => {
      const q = searchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.childUniqueId.toLowerCase().includes(q) ||
        c.id.includes(q)
      );
    })
    : allChildren;

  const handleSelectChild = (c: typeof allChildren[0]) => {
    setChildId(c.id);
    setSearchQuery(`${c.name} — ${c.childUniqueId}`);
    setShowDropdown(false);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setChildId(''); // clear selection when user types again
    setShowDropdown(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateMeasurementForm({ childId, weight, height, muac, edema });
    setMeasurementWarnings(validation.warnings);
    if (validation.errors.length > 0) {
      setNutError(validation.errors[0]);
      return;
    }

    const weightNum = validation.values.weightKg as number;
    const heightNum = validation.values.heightCm as number;
    const muacNum = validation.values.muacCm;

    if (isNutritionist) {
      setNutError('');
      setNutLoading(true);
      try {
        await nutritionistAPI.addMeasurement({
          child_id: Number(childId),
          weight_kg: weightNum,
          height_cm: heightNum,
          muac_cm: muacNum,
          edema: edema || undefined,
          measurement_method: measurementMethod || undefined,
          measurement_date: date,
          specialist_notes: notes || undefined,
        });
        setNutSuccess(true);
        setTimeout(() => onSuccess(childId), 1500);
      } catch (err: any) {
        setNutError(err.response?.data?.message || 'Failed to save measurement');
      } finally {
        setNutLoading(false);
      }
      return;
    }

    setMidwifeLoading(true);
    setNutError('');
    const numericChildId = selectedChild?.id ?? childId;
    const apiCall = isMoh ? mohAPI.addMeasurement : midwifeAPI.addMeasurement;
    let apiRes: any = null;
    try {
      apiRes = await apiCall({
        child_id: Number(numericChildId),
        weight_kg: weightNum,
        height_cm: heightNum,
        muac_cm: muacNum,
        edema: edema || undefined,
        measurement_method: measurementMethod || undefined,
        measurement_date: date,
        notes: notes || undefined,
      });
    } catch (err: any) {
      setNutError(err.response?.data?.message || 'Failed to save measurement');
      setMidwifeLoading(false);
      return;
    }
    setMidwifeLoading(false);

    // Use actual AI result from server — client-side formulas use wrong baselines
    const serverRiskRaw = (apiRes?.data?.new_risk || 'NORMAL').toUpperCase();
    const riskLevel: 'normal' | 'mam' | 'sam' = serverRiskRaw === 'SAM' ? 'sam' : serverRiskRaw === 'MAM' ? 'mam' : 'normal';
    const serverMeas = apiRes?.data?.measurement;
    const weightForAge = serverMeas?.z_score_wfa ?? 0;
    const heightForAge = serverMeas?.z_score_hfa ?? 0;
    const weightForHeight = serverMeas?.z_score_wfh ?? 0;

    const rawFuture: string | undefined = serverMeas?.predicted_risk_next_2_months;
    const mapFutureRisk = (f: string): 'normal' | 'mam' | 'sam' => {
      const s = f.toLowerCase().replace(/_/g, '');
      if (s === 'severe') return 'sam';
      if (s === 'high' || s === 'moderate') return 'mam';
      return 'normal'; // Low, No_Risk
    };
    const prediction: PredictionData | undefined = rawFuture ? (() => {
      const predictedRiskLevel = mapFutureRisk(rawFuture);
      const confidence = serverMeas?.model_confidence != null
        ? Math.round(serverMeas.model_confidence * 100)
        : 0;
      const currentSev = riskLevel === 'sam' ? 3 : riskLevel === 'mam' ? 2 : 1;
      const futureSev = predictedRiskLevel === 'sam' ? 3 : predictedRiskLevel === 'mam' ? 2 : 1;
      const trend: 'declining' | 'stable' | 'improving' =
        futureSev > currentSev ? 'declining' : futureSev < currentSev ? 'improving' : 'stable';
      return {
        predictedRiskLevel,
        confidence,
        status: (trend === 'declining' ? 'Early Warning' : trend === 'improving' ? 'Improving' : 'Stable') as PredictionData['status'],
        predictedZScores: { weightForAge, heightForAge, weightForHeight },
        trend,
        actionRequired: predictedRiskLevel === 'mam' || predictedRiskLevel === 'sam',
      };
    })() : undefined;

    // Generate AI-powered recommendations
    const recommendations: string[] = [];
    const nutritionalGuidance: string[] = [];
    const alerts: string[] = [];
    let followUp = '';

    if (riskLevel === 'sam') {
      alerts.push('CRITICAL: Severe Acute Malnutrition detected');
      alerts.push('Immediate medical intervention required');
      recommendations.push('Refer to pediatrician immediately for comprehensive assessment');
      recommendations.push('Initiate therapeutic feeding program (RUTF - Ready-to-Use Therapeutic Food)');
      recommendations.push('Check for underlying medical conditions (infections, parasites, chronic diseases)');
      recommendations.push('Admit to malnutrition treatment facility if complications present');
      nutritionalGuidance.push('Provide 150-220 kcal/kg/day therapeutic feeding');
      nutritionalGuidance.push('High-energy milk-based formula (F-75/F-100) or RUTF sachets');
      nutritionalGuidance.push('Micronutrient supplementation (Vitamin A, Zinc, Iron, Folic acid)');
      nutritionalGuidance.push('Small frequent meals (6-8 times daily)');
      followUp = 'Weekly monitoring required until stabilized, then bi-weekly';
    } else if (riskLevel === 'mam') {
      alerts.push('WARNING: Moderate Acute Malnutrition detected');
      recommendations.push('Enroll in supplementary feeding program');
      recommendations.push('Provide nutritional counseling to caregiver on balanced diet');
      recommendations.push('Monitor for progression to SAM - weekly weight checks');
      recommendations.push('Assess feeding practices and food security at home');
      nutritionalGuidance.push('Provide energy-dense supplementary foods (Super Cereal, fortified blended foods)');
      nutritionalGuidance.push('Increase meal frequency to 5-6 times daily');
      nutritionalGuidance.push('Include protein-rich foods: eggs, fish, lentils, dairy');
      nutritionalGuidance.push('Add healthy fats: coconut oil, peanut butter to meals');
      nutritionalGuidance.push('Vitamin and mineral supplementation as needed');
      followUp = 'Bi-weekly monitoring recommended';
    } else {
      recommendations.push('Continue current feeding practices - child showing healthy growth');
      recommendations.push('Maintain balanced diet with variety of food groups');
      recommendations.push('Ensure adequate breastfeeding (if under 2 years) plus complementary foods');
      recommendations.push('Promote physical activity appropriate for age');
      nutritionalGuidance.push('Provide 3 main meals + 2-3 healthy snacks daily');
      nutritionalGuidance.push('Include fruits and vegetables in every meal');
      nutritionalGuidance.push('Ensure adequate protein intake from varied sources');
      nutritionalGuidance.push('Continue age-appropriate portion sizes');
      followUp = 'Routine monthly growth monitoring';
    }

    // Additional recommendations based on specific Z-scores
    if (heightForAge < -2) {
      recommendations.push('Stunting detected - assess for chronic malnutrition and repeated infections');
      nutritionalGuidance.push('Focus on nutrient-dense foods to support catch-up growth');
    }

    if (muacNum != null && muacNum < 11.5) {
      alerts.push('MUAC indicates severe wasting - prioritize immediate intervention');
    } else if (muacNum != null && muacNum < 12.5) {
      alerts.push('MUAC indicates moderate wasting - increased monitoring needed');
    }
    if (serverMeas?.clinical_action_required && serverMeas?.clinical_review_reason) {
      alerts.push(serverMeas.clinical_review_reason);
    }

    // Additional recommendations based on prediction
    if (prediction?.actionRequired) {
      alerts.push(`EARLY WARNING: Risk level may progress to ${getRiskLabel(prediction.predictedRiskLevel)} in 1-2 months`);
      recommendations.push('Increase monitoring frequency - weekly assessments recommended');
      recommendations.push('Early intervention may prevent progression to more severe malnutrition');
    }

    // Set AI results
    setAiResults({
      childName: selectedChild?.name || '',
      childId: childId,
      date: date,
      weight: weightNum,
      height: heightNum,
      muac: muacNum ?? null,
      muacStatus: serverMeas?.muac_status,
      edemaStatus: serverMeas?.edema_status,
      weightForAge,
      heightForAge,
      weightForHeight,
      riskLevel,
      recommendations,
      nutritionalGuidance,
      followUp,
      alerts,
      prediction,
    });

    setShowResults(true);
  };

  const handleViewProfile = () => {
    onSuccess(childId);
  };

  const handleAddAnother = () => {
    setShowResults(false);
    setWeight('');
    setHeight('');
    setMuac('');
    setEdema('');
    setMeasurementMethod('');
    setNotes('');
    setMeasurementWarnings([]);
    setAiResults(null);
  };

  if (showResults && aiResults) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Measurement Saved Successfully</h2>
                <p className="text-gray-600">AI-powered analysis and recommendations generated</p>
              </div>
            </div>
          </div>
        </div>

        {/* AI Analysis Header */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg shadow-lg p-6 border-2 border-purple-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">AI Nutritional Assessment</h3>
              <p className="text-sm text-gray-600">WHO-based automated analysis for {aiResults.childName}</p>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {aiResults.alerts.length > 0 && (
          <div
            className={`rounded-lg p-6 border-2 ${aiResults.riskLevel === 'sam'
              ? 'bg-red-50 border-red-300'
              : 'bg-yellow-50 border-yellow-300'
              }`}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                className={`w-6 h-6 flex-shrink-0 mt-1 ${aiResults.riskLevel === 'sam' ? 'text-red-600' : 'text-yellow-600'
                  }`}
              />
              <div className="flex-1">
                <h3
                  className={`text-lg font-bold mb-3 ${aiResults.riskLevel === 'sam' ? 'text-red-900' : 'text-yellow-900'
                    }`}
                >
                  Critical Alerts
                </h3>
                <ul className="space-y-2">
                  {aiResults.alerts.map((alert, index) => (
                    <li
                      key={index}
                      className={`text-sm font-medium ${aiResults.riskLevel === 'sam' ? 'text-red-800' : 'text-yellow-800'
                        }`}
                    >
                      • {alert}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Assessment Results */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Nutritional Status Assessment</h3>

          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Overall Classification:</span>
              <span
                className="px-4 py-2 rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: getRiskColor(aiResults.riskLevel) }}
              >
                {getRiskLabel(aiResults.riskLevel)}
              </span>
            </div>
          </div>

          {/* Early Prediction Section */}
          {aiResults.prediction && (
            <div className={`mb-6 p-5 rounded-lg border-2 ${aiResults.prediction.actionRequired
              ? 'bg-orange-50 border-orange-300'
              : aiResults.prediction.status === 'Improving'
                ? 'bg-green-50 border-green-300'
                : 'bg-blue-50 border-blue-300'
              }`}>
              <div className="flex items-start gap-3 mb-4">
                <div className={`p-2 rounded-lg ${aiResults.prediction.actionRequired
                  ? 'bg-orange-100'
                  : aiResults.prediction.status === 'Improving'
                    ? 'bg-green-100'
                    : 'bg-blue-100'
                  }`}>
                  {aiResults.prediction.trend === 'declining' ? (
                    <TrendingDown className={`w-5 h-5 ${aiResults.prediction.actionRequired ? 'text-orange-600' : 'text-blue-600'
                      }`} />
                  ) : aiResults.prediction.trend === 'improving' ? (
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  ) : (
                    <Activity className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-gray-900">Early Risk Prediction (Next 1-2 Months)</h4>
                    {aiResults.prediction.actionRequired && (
                      <span className="px-3 py-1 bg-orange-600 text-white text-xs font-bold rounded-full">
                        Early Warning
                      </span>
                    )}
                    {aiResults.prediction.status === 'Improving' && (
                      <span className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded-full">
                        Improving
                      </span>
                    )}
                    {aiResults.prediction.status === 'Stable' && !aiResults.prediction.actionRequired && (
                      <span className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">
                        Stable
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Predicted Risk Level:</p>
                      <span
                        className="inline-block px-3 py-1 rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: getRiskColor(aiResults.prediction.predictedRiskLevel) }}
                      >
                        {getRiskLabel(aiResults.prediction.predictedRiskLevel)}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Confidence:</p>
                      <p className="text-lg font-bold text-gray-900">{aiResults.prediction.confidence}%</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                    <div className="bg-white/60 rounded p-2">
                      <p className="text-gray-600">Projected WFA</p>
                      <p className={`font-bold ${aiResults.prediction.predictedZScores.weightForAge < -2 ? 'text-red-600' : 'text-gray-900'
                        }`}>
                        {aiResults.prediction.predictedZScores.weightForAge.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-white/60 rounded p-2">
                      <p className="text-gray-600">Projected HFA</p>
                      <p className={`font-bold ${aiResults.prediction.predictedZScores.heightForAge < -2 ? 'text-red-600' : 'text-gray-900'
                        }`}>
                        {aiResults.prediction.predictedZScores.heightForAge.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-white/60 rounded p-2">
                      <p className="text-gray-600">Projected WFH</p>
                      <p className={`font-bold ${aiResults.prediction.predictedZScores.weightForHeight < -2 ? 'text-red-600' : 'text-gray-900'
                        }`}>
                        {aiResults.prediction.predictedZScores.weightForHeight.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  {/* Contextual Action Hint */}
                  <div className={`mt-3 pt-3 border-t ${aiResults.prediction.actionRequired ? 'border-orange-200' : 'border-blue-200'
                    }`}>
                    <p className="text-xs font-medium text-gray-700">
                      {aiResults.prediction.actionRequired ? (
                        <>
                          <span className="font-bold text-orange-700">⚠ Action Recommended:</span> Early monitoring required before next clinic visit to prevent progression
                        </>
                      ) : aiResults.prediction.status === 'Improving' ? (
                        <>
                          <span className="font-bold text-green-700">✓ Positive Trend:</span> Continue current interventions and maintain scheduled follow-up
                        </>
                      ) : (
                        <>
                          <span className="font-bold text-blue-700">→ Status Stable:</span> Continue routine monitoring per standard schedule
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="border-2 border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Weight-for-Age Z-score</p>
              <p
                className={`text-3xl font-bold ${aiResults.weightForAge < -2 ? 'text-red-600' : 'text-green-600'
                  }`}
              >
                {aiResults.weightForAge.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {aiResults.weightForAge < -3
                  ? 'Severely underweight'
                  : aiResults.weightForAge < -2
                    ? 'Underweight'
                    : 'Normal weight for age'}
              </p>
            </div>

            <div className="border-2 border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Height-for-Age Z-score</p>
              <p
                className={`text-3xl font-bold ${aiResults.heightForAge < -2 ? 'text-red-600' : 'text-green-600'
                  }`}
              >
                {aiResults.heightForAge.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {aiResults.heightForAge < -3
                  ? 'Severely stunted'
                  : aiResults.heightForAge < -2
                    ? 'Stunted (chronic malnutrition)'
                    : 'Normal height for age'}
              </p>
            </div>

            <div className="border-2 border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Weight-for-Height Z-score</p>
              <p
                className={`text-3xl font-bold ${aiResults.weightForHeight < -2 ? 'text-red-600' : 'text-green-600'
                  }`}
              >
                {aiResults.weightForHeight.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {aiResults.weightForHeight < -3
                  ? 'Severe wasting (acute malnutrition)'
                  : aiResults.weightForHeight < -2
                    ? 'Moderate wasting'
                    : 'Normal weight for height'}
              </p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-2">Recorded Measurements</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <div>
                <span className="text-gray-600">Weight:</span>
                <span className="ml-2 font-medium text-gray-900">{aiResults.weight} kg</span>
              </div>
              <div>
                <span className="text-gray-600">Height:</span>
                <span className="ml-2 font-medium text-gray-900">{aiResults.height} cm</span>
              </div>
              <div>
                <span className="text-gray-600">MUAC:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {aiResults.muac != null ? `${aiResults.muac} cm` : aiResults.muacStatus || 'Not Recorded'}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Edema:</span>
                <span className="ml-2 font-medium text-gray-900">{aiResults.edemaStatus || 'Not Recorded'}</span>
              </div>
              <div>
                <span className="text-gray-600">Date:</span>
                <span className="ml-2 font-medium text-gray-900">{aiResults.date}</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI Recommendations */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-bold text-gray-900">AI-Generated Clinical Recommendations</h3>
          </div>
          <ul className="space-y-3">
            {aiResults.recommendations.map((rec, index) => (
              <li key={index} className="flex items-start gap-3">
                <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-purple-600">{index + 1}</span>
                </div>
                <p className="text-sm text-gray-700">{rec}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Nutritional Guidance */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-bold text-gray-900">Nutritional Guidance for Caregiver</h3>
          </div>
          <ul className="space-y-3">
            {aiResults.nutritionalGuidance.map((guidance, index) => (
              <li key={index} className="flex items-start gap-3">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-green-600">✓</span>
                </div>
                <p className="text-sm text-gray-700">{guidance}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Follow-up Schedule */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-bold text-gray-900">Follow-up Schedule</h3>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-900">{aiResults.followUp}</p>
            <p className="text-xs text-gray-600 mt-2">
              Next assessment recommended by: {new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleViewProfile}
            className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            View Child Profile & Growth Charts
          </button>
          <button
            onClick={handleAddAnother}
            className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            Add Another Measurement
          </button>
          <button
            onClick={onBack}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Back to Search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Add Measurement</h2>
          <p className="text-gray-600">Record new anthropometric measurements</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow p-6">
        {nutSuccess && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            Measurement recorded successfully. Redirecting...
          </div>
        )}
        {nutError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            {nutError}
          </div>
        )}
        {measurementWarnings.length > 0 && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            <div className="font-semibold mb-1">Clinical review warning</div>
            <ul className="space-y-1">
              {measurementWarnings.map((warning) => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Child Selection — searchable combobox (hidden when coming from a child profile) */}
          {!selectedChildId ? (
            <div>
              {isMoh && (
                <p className="text-sm text-gray-600 mb-2">Only children sent (escalated) by a midwife can be measured here.</p>
              )}
              <label htmlFor="child-search" className="block text-sm font-medium text-gray-700 mb-2">
                Select Child * &nbsp;<span className="text-xs text-gray-400 font-normal">(search by name or ID)</span>
              </label>
              <div ref={comboRef} className="relative">
                <input
                  id="child-search"
                  type="text"
                  autoComplete="off"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Type child name or ID number…"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {/* hidden real input that provides the value for form validation */}
                <input type="hidden" value={childId} required />

                {showDropdown && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                    {filteredChildren.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">No children found</div>
                    ) : (
                      filteredChildren.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); handleSelectChild(c); }}
                          className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between gap-4 border-b border-gray-100 last:border-0 ${c.id === childId ? 'bg-blue-50 font-semibold' : ''
                            }`}
                        >
                          <div>
                            <span className="text-sm text-gray-900 font-medium">{c.name || 'Unnamed'}</span>
                            <span className="ml-2 text-xs text-gray-500">{c.childUniqueId}</span>
                          </div>
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full shrink-0">ID #{c.id}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {childId && !selectedChild && (
                <p className="mt-1 text-xs text-amber-600">⚠ Please select a child from the list</p>
              )}
            </div>
          ) : (
            /* Child is pre-selected from profile — just keep a hidden input for form logic */
            <input type="hidden" value={childId} />
          )}

          {selectedChild && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Child Information</h4>
              <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                <p>
                  <span className="font-medium">Name:</span> {selectedChild.name || selectedChild.child_id || selectedChild.child_unique_id}
                </p>
                <p>
                  <span className="font-medium">DOB:</span> {selectedChild.dob ?? '—'}
                </p>
                <p>
                  <span className="font-medium">Gender:</span>{' '}
                  {selectedChild.gender === 'male' ? 'Male' : selectedChild.gender === 'female' ? 'Female' : '—'}
                </p>
                <p>
                  <span className="font-medium">Guardian:</span> {selectedChild.guardian_name ?? selectedChild.guardianName ?? '—'}
                </p>
              </div>
            </div>
          )}

          {/* Date */}
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
              Measurement Date *
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Anthropometric Measurements */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="weight" className="block text-sm font-medium text-gray-700 mb-2">
                Weight (kg) *
              </label>
              <input
                id="weight"
                type="number"
                step="0.1"
                min="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="e.g., 10.5"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="mt-1 text-xs text-gray-500">Measure to 0.1 kg accuracy</p>
            </div>

            <div>
              <label htmlFor="height" className="block text-sm font-medium text-gray-700 mb-2">
                Height/Length (cm) *
              </label>
              <input
                id="height"
                type="number"
                step="0.1"
                min="0"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="e.g., 85.5"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="mt-1 text-xs text-gray-500">Measure to 0.1 cm accuracy</p>
            </div>

            <div>
              <label htmlFor="muac" className="block text-sm font-medium text-gray-700 mb-2">
                MUAC (cm)
              </label>
              <input
                id="muac"
                type="number"
                step="0.1"
                min="0"
                value={muac}
                onChange={(e) => setMuac(e.target.value)}
                placeholder="e.g., 13.5"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">MUAC is optional and not required for routine ground-level assessment.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edema" className="block text-sm font-medium text-gray-700 mb-2">
                Edema
              </label>
              <select
                id="edema"
                value={edema}
                onChange={(e) => setEdema(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Not recorded</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">Optional. Select yes only if bilateral pitting edema is recorded.</p>
            </div>

            <div>
              <label htmlFor="measurement-method" className="block text-sm font-medium text-gray-700 mb-2">
                Measurement Method
              </label>
              <select
                id="measurement-method"
                value={measurementMethod}
                onChange={(e) => setMeasurementMethod(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Not specified</option>
                <option value="recumbent_length">Recumbent length</option>
                <option value="standing_height">Standing height</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">Optional height/length method for the recorded measurement.</p>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
              Clinical Notes
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Enter any relevant clinical observations, feeding patterns, or concerns..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Info Box */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Brain className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900 mb-2">AI-Powered Assessment</h4>
                <p className="text-sm text-gray-700 mb-2">
                  After saving, the system will automatically:
                </p>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>✓ Calculate WHO Z-scores for all growth indicators</li>
                  <li>✓ Classify nutritional status (Normal/MAM/SAM)</li>
                  <li>✓ Predict future risk trends (1-2 months ahead)</li>
                  <li>✓ Generate personalized clinical recommendations</li>
                  <li>✓ Provide nutritional guidance for caregivers</li>
                  <li>✓ Suggest appropriate follow-up schedule</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={nutLoading || midwifeLoading || !childId || !weight || !height}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              <Save className="w-4 h-4" />
              {(nutLoading || midwifeLoading) ? 'Saving...' : isNutritionist ? 'Save measurement' : 'Save & Get AI Analysis'}
            </button>
          </div>
        </form>
      </div>

      {/* Measurement Guidelines */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Measurement Guidelines</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Weight Measurement</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Remove heavy clothing and shoes</li>
              <li>• Use calibrated digital scale</li>
              <li>• Record to nearest 0.1 kg</li>
              <li>• Ensure child is calm and still</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Height/Length Measurement</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Length for children &lt; 24 months (lying down)</li>
              <li>• Height for children ≥ 24 months (standing)</li>
              <li>• Record to nearest 0.1 cm</li>
              <li>• Ensure proper positioning</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">MUAC Measurement</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Measure mid-point of upper arm</li>
              <li>• Use standard MUAC tape</li>
              <li>• Arm should be relaxed</li>
              <li>• Record to nearest 0.1 cm</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Quality Assurance</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Calibrate equipment regularly</li>
              <li>• Take repeat measurements if unsure</li>
              <li>• Record immediately</li>
              <li>• Note any measurement difficulties</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
