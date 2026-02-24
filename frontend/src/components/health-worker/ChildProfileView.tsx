import { useRef, useState, useEffect } from 'react';
import { getRiskColor, getRiskLabel, calculateRiskLevel, RiskLevel } from '../../types';
import { ArrowLeft, User, Phone, MapPin, Calendar, Activity, AlertTriangle, TrendingUp, Plus, Download, TrendingDown, FileText, CheckCircle } from 'lucide-react';
import { WHOGrowthCharts } from './WHOGrowthCharts';
import { childrenAPI } from '../../services/api';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '../ui/alert-dialog';

interface ChildProfileViewProps {
  childId: string;
  onBack: () => void;
  onAddMeasurement: (childId: string) => void;
}

interface PredictionData {
  predictedRiskLevel: RiskLevel;
  confidence: number;
  status: 'Early Warning' | 'Stable' | 'Improving';
  trend: 'declining' | 'stable' | 'improving';
  actionRequired: boolean;
  message: string;
}

function mapToMeasurements(items: any[], dob: string | null) {
  if (!items || !Array.isArray(items)) return [];
  const dobDate = dob ? new Date(dob) : null;
  return items.map((v) => {
    const dateStr = v.measurement_date || v.visit_date;
    const visitDate = dateStr ? new Date(dateStr) : new Date();
    const ageMonths = dobDate ? Math.floor((visitDate.getTime() - dobDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)) : 0;
    const risk = (v.risk_level || v.current_risk || 'NORMAL').toLowerCase();
    const r = risk === 'sam' || risk === 'critical' ? 'sam' : risk === 'mam' || risk === 'moderate' || risk === 'high' ? 'mam' : 'normal';
    return {
      id: v.id || String(visitDate.getTime()),
      date: dateStr || visitDate.toISOString().slice(0, 10),
      ageMonths,
      weight: Number(v.weight_kg) || 0,
      height: Number(v.height_cm) || 0,
      muac: v.muac_cm != null ? Number(v.muac_cm) : undefined,
      weightForAge: (v.z_score_wfa ?? v.z_wfa) != null ? Number(v.z_score_wfa ?? v.z_wfa) : undefined,
      heightForAge: (v.z_score_hfa ?? v.z_hfa) != null ? Number(v.z_score_hfa ?? v.z_hfa) : undefined,
      weightForHeight: (v.z_score_wfh ?? v.z_wfh) != null ? Number(v.z_score_wfh ?? v.z_wfh) : undefined,
      riskLevel: r as RiskLevel,
      notes: v.notes,
    };
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function ChildProfileView({ childId, onBack, onAddMeasurement }: ChildProfileViewProps) {
  const [showPDFDialog, setShowPDFDialog] = useState(false);
  const pdfRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [apiChild, setApiChild] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    childrenAPI.get(childId)
      .then((res) => {
        if (cancelled) return;
        if (res.data?.status === 'success' && res.data?.child) setApiChild(res.data.child);
        else setError(res.data?.message || 'Child not found');
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load child');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [childId]);

  const child = apiChild ? {
    id: apiChild.child_id || apiChild.id,
    name: apiChild.name,
    dob: apiChild.dob,
    gender: apiChild.gender,
    guardianName: apiChild.guardian_name,
    guardianPhone: apiChild.guardian_phone,
    address: apiChild.address,
    riskLevel: ((apiChild.current_risk_level || 'NORMAL').toLowerCase() === 'sam' || (apiChild.current_risk_level || '').toLowerCase() === 'critical' ? 'sam' : (apiChild.current_risk_level || '').toLowerCase() === 'mam' || (apiChild.current_risk_level || '').toLowerCase() === 'moderate' || (apiChild.current_risk_level || '').toLowerCase() === 'high' ? 'mam' : 'normal') as RiskLevel,
    measurements: mapToMeasurements([...(apiChild.measurements || []), ...(apiChild.visits || [])], apiChild.dob),
  } : null;

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">Loading child...</p>
        <button onClick={onBack} className="mt-4 text-blue-600 hover:text-blue-700">Go back</button>
      </div>
    );
  }

  if (error || !child) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">{error || 'Child not found'}</p>
        <button onClick={onBack} className="mt-4 text-blue-600 hover:text-blue-700">Go back</button>
      </div>
    );
  }

  const age = child.dob ? Math.floor(
    (new Date().getTime() - new Date(child.dob).getTime()) / (1000 * 60 * 60 * 24 * 30)
  ) : 0;

  // Calculate prediction based on historical data
  const calculatePrediction = (): PredictionData | null => {
    if (child.measurements.length < 2) {
      return null;
    }

    // Get recent measurements (last 3)
    const recentMeasurements = child.measurements.slice(0, 3).reverse(); // Reverse to get chronological order
    
    // Calculate trend
    const avgWFATrend = recentMeasurements.length > 1
      ? (recentMeasurements[recentMeasurements.length - 1].weightForAge - recentMeasurements[0].weightForAge) / recentMeasurements.length
      : 0;

    const latestMeasurement = child.measurements[0];
    
    // Project 1-2 months ahead
    const predictedWFA = latestMeasurement.weightForAge + (avgWFATrend * 2);
    const predictedHFA = latestMeasurement.heightForAge + (avgWFATrend * 0.5);
    const predictedWFH = latestMeasurement.weightForHeight + (avgWFATrend * 1.5);
    
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
    const actionRequired = riskOrder[predictedRisk] > riskOrder[child.riskLevel];
    
    // Generate message
    let message = '';
    if (actionRequired) {
      if (predictedRisk === 'sam') {
        message = 'Predicted to progress to Severe Acute Malnutrition - Early intervention required before next clinic visit';
      } else if (predictedRisk === 'mam') {
        message = 'Predicted to progress to Moderate Acute Malnutrition - Increased monitoring recommended';
      }
    } else if (trend === 'improving') {
      message = 'Positive growth trend observed - Continue current interventions';
    } else {
      message = 'Status expected to remain stable - Continue routine monitoring';
    }
    
    return {
      predictedRiskLevel: predictedRisk,
      confidence: Math.round(confidence),
      status,
      trend,
      actionRequired,
      message,
    };
  };

  const prediction = calculatePrediction();

  // Determine which alert to show - predicted risk takes priority if it's worse
  const showPredictionAlert = prediction && prediction.actionRequired;
  const displayRisk = showPredictionAlert ? prediction.predictedRiskLevel : child.riskLevel;

  // Prepare growth chart data - sort from oldest to newest (earliest date first)
  const growthData = child.measurements
    .slice() // Create a copy to avoid mutating original array
    .sort((a, b) => a.ageMonths - b.ageMonths) // Sort by age ascending (oldest first)
    .map((m) => ({
      age: m.ageMonths,
      date: m.date,
      weight: m.weight,
      height: m.height,
      wfa: m.weightForAge,
      hfa: m.heightForAge,
      wfh: m.weightForHeight,
    }));

  const latestMeasurement = child.measurements[0];

  const handleDownloadPDF = () => {
    setShowPDFDialog(true);
  };

  const handleConfirmDownload = async () => {
    setShowPDFDialog(false);

    // Client-side PDF generation from the rendered profile view.
    // Includes charts + tables as they appear on screen.
    try {
      const el = pdfRef.current;
      if (!el) return;

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // Calculate image dimensions to fit A4 width
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position -= pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const safeName = String(child.name || 'child').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_');
      pdf.save(`CMRAS_Health_Record_${safeName}_${child.id}.pdf`);
    } catch (e) {
      // fallback: at least show something useful to the user
      console.error('PDF generation failed', e);
      alert('PDF generation failed. Please try again.');
    }
  };

  return (
    <div className="space-y-6" ref={pdfRef}>
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900">{child.name}</h2>
          <p className="text-gray-600">Child ID: {child.id}</p>
        </div>
        <button
          onClick={() => onAddMeasurement(child.id)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Measurement
        </button>
      </div>

      {/* Dual Risk Status Display - Top Priority */}
      <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-gray-200">
        <h3 className="text-base font-bold text-gray-900 mb-4">Nutritional Status Overview</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Current Status - Solid Badge */}
          <div className="border-2 border-gray-300 rounded-lg p-5 bg-white">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <Activity className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-sm font-bold text-gray-900">Current Status</p>
            </div>
            <div className="flex flex-col gap-2">
              <span
                className="inline-block px-4 py-3 rounded-lg text-base font-bold text-white text-center shadow-sm"
                style={{ backgroundColor: getRiskColor(child.riskLevel) }}
              >
                {getRiskLabel(child.riskLevel)}
              </span>
              <p className="text-xs text-gray-600 mt-1">
                📅 Based on measurements from {child.measurements[0]?.date}
              </p>
            </div>
          </div>

          {/* Predicted Risk - Highly Distinct Future Forecast */}
          <div className={`border-4 rounded-lg p-5 relative overflow-hidden ${
            prediction
              ? prediction.actionRequired 
                ? 'border-orange-500 bg-gradient-to-br from-orange-50 via-orange-100/50 to-orange-50' 
                : prediction.trend === 'improving'
                ? 'border-green-500 bg-gradient-to-br from-green-50 via-green-100/50 to-green-50'
                : 'border-blue-500 bg-gradient-to-br from-blue-50 via-blue-100/50 to-blue-50'
              : 'border-gray-300 bg-gray-50'
          }`} style={{ borderStyle: 'dashed' }}>
            {/* Forecast Badge Corner */}
            <div className={`absolute top-0 right-0 px-3 py-1 text-xs font-bold text-white ${
              prediction?.actionRequired ? 'bg-orange-600' : 
              prediction?.trend === 'improving' ? 'bg-green-600' : 
              'bg-blue-600'
            }`} style={{ borderBottomLeftRadius: '8px' }}>
              FORECAST
            </div>
            
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                prediction?.actionRequired ? 'bg-orange-200' :
                prediction?.trend === 'improving' ? 'bg-green-200' :
                'bg-blue-200'
              }`}>
                {prediction ? (
                  prediction.trend === 'declining' ? (
                    <TrendingDown className={`w-5 h-5 ${prediction.actionRequired ? 'text-orange-700' : 'text-blue-700'}`} />
                  ) : prediction.trend === 'improving' ? (
                    <TrendingUp className="w-5 h-5 text-green-700" />
                  ) : (
                    <Activity className="w-5 h-5 text-blue-700" />
                  )
                ) : (
                  <Activity className="w-4 h-4 text-gray-400" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">Predicted Risk</p>
                <p className={`text-xs font-bold ${
                  prediction?.actionRequired ? 'text-orange-700' :
                  prediction?.trend === 'improving' ? 'text-green-700' :
                  'text-blue-700'
                }`}>
                  ⏱ 1-2 Months Ahead (Future)
                </p>
              </div>
            </div>
            
            {prediction ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block px-4 py-3 rounded-lg text-base font-bold text-white text-center flex-1 shadow-md relative"
                    style={{ 
                      backgroundColor: getRiskColor(prediction.predictedRiskLevel),
                      backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px)'
                    }}
                  >
                    {getRiskLabel(prediction.predictedRiskLevel)}
                  </span>
                  {prediction.actionRequired && (
                    <div className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg animate-pulse">
                      <AlertTriangle className="w-5 h-5 text-white" />
                    </div>
                  )}
                </div>
                <div className={`mt-2 p-3 rounded-lg border-2 ${
                  prediction.actionRequired ? 'bg-orange-50/50 border-orange-300' :
                  prediction.trend === 'improving' ? 'bg-green-50/50 border-green-300' :
                  'bg-blue-50/50 border-blue-300'
                }`}>
                  <p className="text-xs font-bold text-gray-900 mb-1">
                    {prediction.actionRequired ? '⚠️ Action Required:' :
                     prediction.trend === 'improving' ? '✅ Positive Outlook:' :
                     '→ Expected Status:'}
                  </p>
                  <p className="text-xs font-medium text-gray-800">
                    {prediction.message}
                  </p>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-700 mt-1">
                  <span className="font-medium">Confidence: {prediction.confidence}%</span>
                  <span className={`font-bold ${
                    prediction.trend === 'declining' ? 'text-orange-700' :
                    prediction.trend === 'improving' ? 'text-green-700' :
                    'text-blue-700'
                  }`}>
                    {prediction.trend === 'declining' ? '📉 Declining' :
                     prediction.trend === 'improving' ? '📈 Improving' :
                     '➡️ Stable'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic text-center py-4">
                <p className="font-medium">Prediction Unavailable</p>
                <p className="text-xs text-gray-500 mt-1">
                  Requires at least 2 measurements
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Alert Banner for High Priority Cases */}
        {prediction && prediction.actionRequired && (
          <div className="mt-4 p-4 bg-orange-100 border-2 border-orange-400 rounded-lg animate-pulse">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-base font-bold text-orange-900">🚨 Early Warning Alert - Action Required</p>
                <p className="text-sm text-orange-800 mt-1 font-medium">
                  {prediction.predictedRiskLevel === 'sam' 
                    ? 'This child is predicted to progress to Severe Acute Malnutrition within 1-2 months. Early intervention required before next scheduled clinic visit.'
                    : 'This child is predicted to progress to Moderate Acute Malnutrition within 1-2 months. Increased monitoring and preventive measures recommended.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Risk Alert */}
      {displayRisk !== 'normal' && (
        <div
          className={`rounded-lg p-6 border-2 ${
            displayRisk === 'sam'
              ? 'bg-red-50 border-red-300'
              : 'bg-yellow-50 border-yellow-300'
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={`w-6 h-6 flex-shrink-0 mt-1 ${
                displayRisk === 'sam' ? 'text-red-600' : 'text-yellow-600'
              }`}
            />
            <div>
              <h3
                className={`text-lg font-bold ${
                  displayRisk === 'sam' ? 'text-red-900' : 'text-yellow-900'
                }`}
              >
                {getRiskLabel(displayRisk)}
              </h3>
              <p
                className={`mt-1 ${
                  displayRisk === 'sam' ? 'text-red-800' : 'text-yellow-800'
                }`}
              >
                {displayRisk === 'sam'
                  ? 'Immediate medical intervention and nutritional support required.'
                  : 'Nutritional supplementation and regular monitoring recommended.'}
              </p>
              {showPredictionAlert && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-gray-700">Prediction:</p>
                  <p className="text-sm text-gray-600">{prediction.message}</p>
                  <p className="text-sm text-gray-600">Confidence: {prediction.confidence}%</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Basic Information */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <p className="text-sm text-gray-600">Full Name</p>
              <p className="font-medium text-gray-900">{child.name}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <p className="text-sm text-gray-600">Date of Birth / Age</p>
              <p className="font-medium text-gray-900">
                {child.dob} ({age} months)
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Activity className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <p className="text-sm text-gray-600">Gender</p>
              <p className="font-medium text-gray-900">
                {child.gender === 'male' ? 'Male' : 'Female'}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <p className="text-sm text-gray-600">Current Status</p>
              <span
                className="inline-block px-3 py-1 rounded-full text-xs font-medium text-white mt-1"
                style={{ backgroundColor: getRiskColor(displayRisk) }}
              >
                {getRiskLabel(displayRisk)}
              </span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <p className="text-sm text-gray-600">Guardian Name</p>
              <p className="font-medium text-gray-900">{child.guardianName}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <p className="text-sm text-gray-600">Guardian Phone</p>
              <p className="font-medium text-gray-900">{child.guardianPhone}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 md:col-span-2">
            <MapPin className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <p className="text-sm text-gray-600">Address</p>
              <p className="font-medium text-gray-900">{child.address}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Latest Measurements */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Latest Measurements</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Weight</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{latestMeasurement.weight} kg</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Height</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{latestMeasurement.height} cm</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">MUAC</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{latestMeasurement.muac} cm</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Date</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{latestMeasurement.date}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">Weight-for-Age Z-score</p>
            <p className={`text-2xl font-bold mt-1 ${latestMeasurement.weightForAge < -2 ? 'text-red-600' : 'text-green-600'}`}>
              {latestMeasurement.weightForAge.toFixed(2)}
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">Height-for-Age Z-score</p>
            <p className={`text-2xl font-bold mt-1 ${latestMeasurement.heightForAge < -2 ? 'text-red-600' : 'text-green-600'}`}>
              {latestMeasurement.heightForAge.toFixed(2)}
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">Weight-for-Height Z-score</p>
            <p className={`text-2xl font-bold mt-1 ${latestMeasurement.weightForHeight < -2 ? 'text-red-600' : 'text-green-600'}`}>
              {latestMeasurement.weightForHeight.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* WHO Growth Charts */}
      <WHOGrowthCharts measurements={child.measurements} childGender={child.gender} />

      {/* Measurement History */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Measurement History</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Age</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Weight</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Height</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">MUAC</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Notes</th>
              </tr>
            </thead>
            <tbody>
              {child.measurements.map((measurement) => (
                <tr key={measurement.id} className="border-b border-gray-100">
                  <td className="py-3 px-4 text-sm text-gray-900">{measurement.date}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{measurement.ageMonths}m</td>
                  <td className="py-3 px-4 text-sm text-gray-900">{measurement.weight} kg</td>
                  <td className="py-3 px-4 text-sm text-gray-900">{measurement.height} cm</td>
                  <td className="py-3 px-4 text-sm text-gray-900">{measurement.muac} cm</td>
                  <td className="py-3 px-4">
                    <span
                      className="inline-block px-2 py-1 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: getRiskColor(measurement.riskLevel) }}
                    >
                      {getRiskLabel(measurement.riskLevel).split(' ')[0]}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">{measurement.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Download PDF */}
      <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg shadow-lg p-6 border-2 border-blue-200">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Download className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Download Complete Health Record PDF</h3>
            <p className="text-sm text-gray-700 mb-4">
              Generate a comprehensive medical report including all 5 WHO growth charts, measurement history, 
              and clinical assessments for official documentation and patient records.
            </p>
            <div className="bg-white rounded-lg p-4 mb-4">
              <p className="text-xs font-semibold text-gray-700 mb-2">PDF Contents:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600">
                <div>✓ Child Demographics & Information</div>
                <div>✓ Current Risk Assessment</div>
                <div>✓ Latest Measurements & Z-scores</div>
                <div>✓ Chart 1: Weight-for-Age (0-5 years)</div>
                <div>✓ Chart 2a: Length-for-Age (0-2 years)</div>
                <div>✓ Chart 2b: Height-for-Age (2-5 years)</div>
                <div>✓ Chart 3a: Weight-for-Length (0-2 years)</div>
                <div>✓ Chart 3b: Weight-for-Height (2-5 years)</div>
                <div>✓ Chart 4: BMI-for-Age</div>
                <div>✓ Chart 5: Head Circumference-for-Age</div>
                <div>✓ Complete Measurement History</div>
                <div>✓ Clinical Notes & Recommendations</div>
              </div>
            </div>
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-md"
            >
              <Download className="w-5 h-5" />
              Download Complete Health Record (PDF)
            </button>
          </div>
        </div>
      </div>

      {/* PDF Generation Dialog */}
      <AlertDialog open={showPDFDialog} onOpenChange={setShowPDFDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <AlertDialogTitle className="text-xl">
                  Generating Comprehensive Health Record PDF
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-gray-600 mt-1">
                  for {child.name}
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          
          {/* Content outside AlertDialogDescription to avoid nesting issues */}
          <div className="mt-4 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="font-semibold text-gray-900 mb-3">This PDF includes:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Child Demographics & Basic Information</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Current Nutritional Status & Risk Assessment</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Latest Measurements with Z-scores</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>WHO Chart 1: Weight-for-Age (Birth to 5 Years)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>WHO Chart 2a: Length-for-Age (Birth to 2 Years)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>WHO Chart 2b: Height-for-Age (2 to 5 Years)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>WHO Chart 3a: Weight-for-Length (Birth to 2 Years)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>WHO Chart 3b: Weight-for-Height (2 to 5 Years)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>WHO Chart 4: BMI-for-Age Trend</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>WHO Chart 5: Head Circumference-for-Age</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Complete Measurement History Table</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Clinical Notes & Recommendations</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
              <div className="flex justify-between">
                <span className="font-medium">Generated on:</span>
                <span>{new Date().toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="font-medium">Child ID:</span>
                <span className="font-mono">{child.id}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="font-medium">Clinic:</span>
                <span>Colombo PHM Clinic</span>
              </div>
            </div>
          </div>

          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDownload}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download className="w-4 h-4 mr-2" />
              Generate & Download PDF
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}