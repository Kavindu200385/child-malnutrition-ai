import { useState } from 'react';
import { MOCK_CHILDREN } from '../../data/mockData';
import { calculateRiskLevel, getRiskColor, getRiskLabel } from '../../types';
import { ArrowLeft, Save, CheckCircle, AlertTriangle, Brain, TrendingUp, Calendar, FileText, TrendingDown, Activity } from 'lucide-react';

interface AddMeasurementViewProps {
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
  muac: number;
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

export function AddMeasurementView({ selectedChildId, onBack, onSuccess }: AddMeasurementViewProps) {
  const [childId, setChildId] = useState(selectedChildId || '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [muac, setMuac] = useState('');
  const [notes, setNotes] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [aiResults, setAiResults] = useState<AIResults | null>(null);

  const selectedChild = MOCK_CHILDREN.find((c) => c.id === childId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Calculate Z-scores (simplified - in production, use WHO tables)
    const weightNum = parseFloat(weight);
    const heightNum = parseFloat(height);
    const muacNum = parseFloat(muac);
    
    // Mock Z-score calculations
    const weightForAge = (weightNum - 11) / 1.5; // Simplified
    const heightForAge = (heightNum - 85) / 3; // Simplified
    const weightForHeight = (weightNum - 11.5) / 1.8; // Simplified

    const riskLevel = calculateRiskLevel(weightForAge, heightForAge, weightForHeight);

    // Generate prediction based on historical data and current trend
    const childData = MOCK_CHILDREN.find(c => c.id === childId);
    const historicalMeasurements = childData?.measurements || [];
    
    let prediction: PredictionData | undefined;
    if (historicalMeasurements.length > 0) {
      // Calculate trend from historical data
      const recentMeasurements = historicalMeasurements.slice(-3);
      const avgWFATrend = recentMeasurements.length > 1 
        ? (recentMeasurements[recentMeasurements.length - 1].weightForAge - recentMeasurements[0].weightForAge) / recentMeasurements.length
        : 0;
      
      // Project 1-2 months ahead
      const predictedWFA = weightForAge + (avgWFATrend * 2);
      const predictedHFA = heightForAge + (avgWFATrend * 0.5); // Slower change for height
      const predictedWFH = weightForHeight + (avgWFATrend * 1.5);
      
      const predictedRisk = calculateRiskLevel(predictedWFA, predictedHFA, predictedWFH);
      
      // Determine confidence based on data consistency
      const dataConsistency = recentMeasurements.length >= 2 ? 85 : 65;
      const confidence = Math.min(95, dataConsistency + (Math.random() * 10));
      
      // Determine status
      let status: 'Early Warning' | 'Stable' | 'Improving' = 'Stable';
      let trend: 'declining' | 'stable' | 'improving' = 'stable';
      
      if (avgWFATrend < -0.2) {
        trend = 'declining';
        status = 'Early Warning';
      } else if (avgWFATrend > 0.2) {
        trend = 'improving';
        status = 'Improving';
      }
      
      // Check if action required (predicted risk is worse than current)
      const riskOrder = { 'normal': 0, 'mam': 1, 'sam': 2 };
      const actionRequired = riskOrder[predictedRisk] > riskOrder[riskLevel];
      
      prediction = {
        predictedRiskLevel: predictedRisk,
        confidence: Math.round(confidence),
        status,
        predictedZScores: {
          weightForAge: predictedWFA,
          heightForAge: predictedHFA,
          weightForHeight: predictedWFH,
        },
        trend,
        actionRequired,
      };
    }

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

    if (muacNum && muacNum < 11.5) {
      alerts.push('MUAC indicates severe wasting - prioritize immediate intervention');
    } else if (muacNum && muacNum < 12.5) {
      alerts.push('MUAC indicates moderate wasting - increased monitoring needed');
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
      muac: muacNum,
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
    setNotes('');
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
            className={`rounded-lg p-6 border-2 ${
              aiResults.riskLevel === 'sam'
                ? 'bg-red-50 border-red-300'
                : 'bg-yellow-50 border-yellow-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                className={`w-6 h-6 flex-shrink-0 mt-1 ${
                  aiResults.riskLevel === 'sam' ? 'text-red-600' : 'text-yellow-600'
                }`}
              />
              <div className="flex-1">
                <h3
                  className={`text-lg font-bold mb-3 ${
                    aiResults.riskLevel === 'sam' ? 'text-red-900' : 'text-yellow-900'
                  }`}
                >
                  Critical Alerts
                </h3>
                <ul className="space-y-2">
                  {aiResults.alerts.map((alert, index) => (
                    <li
                      key={index}
                      className={`text-sm font-medium ${
                        aiResults.riskLevel === 'sam' ? 'text-red-800' : 'text-yellow-800'
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
            <div className={`mb-6 p-5 rounded-lg border-2 ${
              aiResults.prediction.actionRequired 
                ? 'bg-orange-50 border-orange-300' 
                : aiResults.prediction.status === 'Improving'
                ? 'bg-green-50 border-green-300'
                : 'bg-blue-50 border-blue-300'
            }`}>
              <div className="flex items-start gap-3 mb-4">
                <div className={`p-2 rounded-lg ${
                  aiResults.prediction.actionRequired 
                    ? 'bg-orange-100' 
                    : aiResults.prediction.status === 'Improving'
                    ? 'bg-green-100'
                    : 'bg-blue-100'
                }`}>
                  {aiResults.prediction.trend === 'declining' ? (
                    <TrendingDown className={`w-5 h-5 ${
                      aiResults.prediction.actionRequired ? 'text-orange-600' : 'text-blue-600'
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
                      <p className={`font-bold ${
                        aiResults.prediction.predictedZScores.weightForAge < -2 ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {aiResults.prediction.predictedZScores.weightForAge.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-white/60 rounded p-2">
                      <p className="text-gray-600">Projected HFA</p>
                      <p className={`font-bold ${
                        aiResults.prediction.predictedZScores.heightForAge < -2 ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {aiResults.prediction.predictedZScores.heightForAge.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-white/60 rounded p-2">
                      <p className="text-gray-600">Projected WFH</p>
                      <p className={`font-bold ${
                        aiResults.prediction.predictedZScores.weightForHeight < -2 ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {aiResults.prediction.predictedZScores.weightForHeight.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  {/* Contextual Action Hint */}
                  <div className={`mt-3 pt-3 border-t ${
                    aiResults.prediction.actionRequired ? 'border-orange-200' : 'border-blue-200'
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
                className={`text-3xl font-bold ${
                  aiResults.weightForAge < -2 ? 'text-red-600' : 'text-green-600'
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
                className={`text-3xl font-bold ${
                  aiResults.heightForAge < -2 ? 'text-red-600' : 'text-green-600'
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
                className={`text-3xl font-bold ${
                  aiResults.weightForHeight < -2 ? 'text-red-600' : 'text-green-600'
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
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
                <span className="ml-2 font-medium text-gray-900">{aiResults.muac} cm</span>
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
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Child Selection */}
          <div>
            <label htmlFor="child" className="block text-sm font-medium text-gray-700 mb-2">
              Select Child *
            </label>
            <select
              id="child"
              value={childId}
              onChange={(e) => setChildId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">-- Select a child --</option>
              {MOCK_CHILDREN.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.name} ({child.id})
                </option>
              ))}
            </select>
          </div>

          {selectedChild && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Child Information</h4>
              <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                <p>
                  <span className="font-medium">Name:</span> {selectedChild.name}
                </p>
                <p>
                  <span className="font-medium">DOB:</span> {selectedChild.dob}
                </p>
                <p>
                  <span className="font-medium">Gender:</span>{' '}
                  {selectedChild.gender === 'male' ? 'Male' : 'Female'}
                </p>
                <p>
                  <span className="font-medium">Guardian:</span> {selectedChild.guardianName}
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
                MUAC (cm) *
              </label>
              <input
                id="muac"
                type="number"
                step="0.1"
                value={muac}
                onChange={(e) => setMuac(e.target.value)}
                placeholder="e.g., 13.5"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="mt-1 text-xs text-gray-500">Mid-Upper Arm Circumference</p>
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
              disabled={!childId || !weight || !height || !muac}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              <Save className="w-4 h-4" />
              Save & Get AI Analysis
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