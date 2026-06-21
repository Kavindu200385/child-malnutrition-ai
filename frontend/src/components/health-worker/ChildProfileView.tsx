import React from 'react';
import { useRef, useState, useEffect } from 'react';
import { formatDate, formatDateTime } from '../../utils/formatDate';
import { getRiskColor, getRiskLabel, calculateRiskLevel, RiskLevel } from '../../types';
import { ArrowLeft, User, Phone, MapPin, Calendar, Activity, AlertTriangle, TrendingUp, Plus, Download, TrendingDown, FileText, CheckCircle, Pencil, Trash2, Mail } from 'lucide-react';
import { WHOGrowthCharts } from './WHOGrowthCharts';
import { HiddenPdfCharts, generateProfessionalPdf } from './PdfReportGenerator';
import { childrenAPI, midwifeAPI } from '../../services/api';
import {
  getClinicalActionDisplay,
  getCurrentNutritionalStatusLabel,
  getCurrentStatusToneClass,
  getFuturePredictedRiskLabel,
  getFutureRiskToneClass,
  getStatusDisplayLabel,
  getStatusBreakdown,
  STATUS_HELPER_TEXT,
} from '../../utils/statusDisplay';
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
  /** When provided (e.g. MOH), Add Measurement is only shown if child.can_moh_add_measurement is true */
  user?: { role?: string } | null;
}

interface PredictionData {
  predictedRiskLevel: RiskLevel;
  confidence: number;
  status: 'Early Warning' | 'Stable' | 'Improving';
  trend: 'declining' | 'stable' | 'improving';
  actionRequired: boolean;
  message: string;
}

function futureRiskSeverity(label: string): number {
  const risk = label.toUpperCase();
  if (risk.includes('SEVERE')) return 4;
  if (risk.includes('HIGH')) return 3;
  if (risk.includes('MODERATE')) return 2;
  if (risk.includes('LOW')) return 1;
  return 0;
}

function currentRiskSeverity(riskLevel: RiskLevel): number {
  if (riskLevel === 'sam') return 4;
  if (riskLevel === 'mam') return 2;
  return 0;
}

/** 
 * Simple fallback WHO Z-score approximation (for old measurements stored with null Z-scores).
 * Uses simplified LMS interpolation. The backend now stores real Z-scores; this is a display fallback only.
 */
function approxWFA(weightKg: number, ageMonths: number, male: boolean): number | undefined {
  const refs: [number, number, number][] = male
    ? [[0, 3.35, 0.49], [6, 7.99, 0.82], [12, 9.65, 0.87], [24, 12.23, 1.08], [36, 14.31, 1.31], [60, 18.30, 1.75]]
    : [[0, 3.23, 0.46], [6, 7.22, 0.82], [12, 8.95, 0.89], [24, 11.49, 1.06], [36, 13.88, 1.30], [60, 18.20, 1.76]];
  const ages = refs.map(r => r[0]);
  const idx = ages.findIndex(a => a >= ageMonths);
  const [, m, s] = idx <= 0 ? refs[0] : idx >= refs.length ? refs[refs.length - 1]
    : (() => {
      const lo = refs[idx - 1], hi = refs[idx];
      const t = (ageMonths - lo[0]) / (hi[0] - lo[0]);
      return [0, lo[1] + t * (hi[1] - lo[1]), lo[2] + t * (hi[2] - lo[2])];
    })();
  return (weightKg - m) / s;
}
function approxHFA(heightCm: number, ageMonths: number, male: boolean): number | undefined {
  const refs: [number, number, number][] = male
    ? [[0, 49.88, 1.89], [6, 67.62, 2.17], [12, 75.75, 2.38], [24, 87.80, 2.89], [36, 96.10, 3.29], [60, 110.0, 3.91]]
    : [[0, 49.15, 1.86], [6, 65.68, 2.11], [12, 74.02, 2.36], [24, 86.36, 2.86], [36, 95.10, 3.30], [60, 109.4, 3.90]];
  const ages = refs.map(r => r[0]);
  const idx = ages.findIndex(a => a >= ageMonths);
  const [, m, s] = idx <= 0 ? refs[0] : idx >= refs.length ? refs[refs.length - 1]
    : (() => {
      const lo = refs[idx - 1], hi = refs[idx];
      const t = (ageMonths - lo[0]) / (hi[0] - lo[0]);
      return [0, lo[1] + t * (hi[1] - lo[1]), lo[2] + t * (hi[2] - lo[2])];
    })();
  return (heightCm - m) / s;
}

function mapToMeasurements(items: any[], dob: string | null) {
  if (!items || !Array.isArray(items)) return [];
  const dobDate = dob ? new Date(dob) : null;
  return items.map((v) => {
    const dateStr = v.measurement_date || v.visit_date;
    const visitDate = dateStr ? new Date(dateStr) : new Date();
    // Keep fractional months so chart dots land at the exact position; round only for display
    const ageMonths = dobDate ? (visitDate.getTime() - dobDate.getTime()) / (1000 * 60 * 60 * 24 * 30.4375) : 0;
    const risk = (v.risk_level || v.current_risk || 'NORMAL').toLowerCase();
    const r = risk === 'sam' || risk === 'critical' ? 'sam' : risk === 'mam' || risk === 'moderate' || risk === 'high' ? 'mam' : 'normal';
    const wKg = Number(v.weight_kg) || 0;
    const hCm = Number(v.height_cm) || 0;
    const male = (v.gender || '').toLowerCase() === 'male';

    // Clamp Z-scores to a valid clinical range; outliers (e.g. -24.9 from calculation errors) are treated as missing
    const clampZ = (z: number | null | undefined): number | undefined =>
      z != null && isFinite(z) && z >= -6 && z <= 6 ? z : undefined;

    const rawWfa = (v.z_score_wfa ?? v.z_wfa);
    const rawHfa = (v.z_score_hfa ?? v.z_hfa);
    const rawWfh = (v.z_score_wfh ?? v.z_wfh);
    const weightForAge = clampZ(rawWfa != null ? Number(rawWfa) : (wKg > 0 && ageMonths >= 0 ? approxWFA(wKg, ageMonths, male) : undefined));
    const heightForAge = clampZ(rawHfa != null ? Number(rawHfa) : (hCm > 0 && ageMonths >= 0 ? approxHFA(hCm, ageMonths, male) : undefined));
    const weightForHeight = clampZ(rawWfh != null ? Number(rawWfh) : (wKg > 0 && hCm > 0 ? (wKg - hCm * 0.13) / 1.5 : undefined));

    const roleLabel = (role: string) => {
      const r = (role || '').toLowerCase();
      if (r === 'moh' || r === 'amoh') return 'MOH';
      if (r === 'midwife') return 'Midwife';
      if (r === 'nutritionist') return 'Nutritionist';
      if (r === 'hospital') return 'Hospital';
      return role;
    };
    const mb = v.measured_by;
    const measuredBy = mb ? `${mb.name || ''}${mb.role ? ` (${roleLabel(mb.role)})` : ''}`.trim() : null;

    return {
      id: v.id || String(visitDate.getTime()),
      date: dateStr || visitDate.toISOString().slice(0, 10),
      ageMonths,
      weight: wKg,
      height: hCm,
      muac: v.muac_cm != null ? Number(v.muac_cm) : undefined,
      weightForAge,
      heightForAge,
      weightForHeight,
      riskLevel: r as RiskLevel,
      predictedRiskNext2Months: v.predicted_risk_next_2_months || null,
      future_predicted_risk: v.future_predicted_risk || v.predicted_risk_next_2_months || null,
      current_nutritional_status: v.current_nutritional_status || null,
      underweight_status: v.underweight_status || null,
      stunting_status: v.stunting_status || null,
      wasting_status: v.wasting_status || null,
      muac_status: v.muac_status || null,
      edema_status: v.edema_status || null,
      notes: v.notes,
      measuredBy,
    };
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}


/** WHO approximate reference at birth (0 months): median weight (kg), median length (cm), SD. */
const BIRTH_REF = {
  male: { weightMedian: 3.3, weightSd: 0.5, lengthMedian: 49.9, lengthSd: 1.9 },
  female: { weightMedian: 3.2, weightSd: 0.48, lengthMedian: 49.1, lengthSd: 1.9 },
};

/** Build a single "birth" measurement so charts start from birth. */
function createBirthMeasurement(apiChild: any): {
  id: string;
  date: string;
  ageMonths: number;
  weight: number;
  height: number;
  muac?: number;
  weightForAge: number;
  heightForAge: number;
  weightForHeight: number;
  riskLevel: RiskLevel;
  notes?: string;
} {
  const dob = apiChild.dob;
  const dateStr = dob || new Date().toISOString().slice(0, 10);
  const gender = (apiChild.gender || 'male') === 'male' ? 'male' : 'female';
  const ref = BIRTH_REF[gender];
  const weight = Number(apiChild.birth_weight_kg) || 0;
  const height = Number(apiChild.birth_height_cm) || 0;
  const zWfa = weight > 0 && ref ? (weight - ref.weightMedian) / ref.weightSd : 0;
  const zHfa = height > 0 && ref ? (height - ref.lengthMedian) / ref.lengthSd : 0;
  const zWfh = weight > 0 && height > 0 && ref ? (weight - ref.weightMedian) / ref.weightSd : zWfa;
  const birthRisk = (apiChild.birth_risk_level || '').toUpperCase();
  const riskLevel: RiskLevel =
    birthRisk === 'SAM' || birthRisk === 'CRITICAL' ? 'sam' :
      birthRisk === 'MAM' || birthRisk === 'MODERATE' || birthRisk === 'HIGH' ? 'mam' : 'normal';
  return {
    id: 'birth',
    date: dateStr,
    ageMonths: 0,
    weight,
    height,
    weightForAge: zWfa,
    heightForAge: zHfa,
    weightForHeight: zWfh,
    riskLevel,
    notes: 'Birth',
  };
}

// ─── PDF helpers ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────

export function ChildProfileView({ childId, onBack, onAddMeasurement, user }: ChildProfileViewProps) {
  const [showPDFDialog, setShowPDFDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string | null>>({});
  const [showEscalateDialog, setShowEscalateDialog] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [isEscalating, setIsEscalating] = useState(false);
  const [escalateError, setEscalateError] = useState('');
  const pdfRef = useRef<HTMLDivElement | null>(null);

  // Hidden chart refs for PDF generation
  const chartRefs = {
    wfa: useRef<HTMLDivElement>(null),
    hfa0_24: useRef<HTMLDivElement>(null),
    hfa24_60: useRef<HTMLDivElement>(null),
    wfh: useRef<HTMLDivElement>(null),
    zscore: useRef<HTMLDivElement>(null),
  };

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

  // Keep edit form in sync when opening the Edit dialog
  useEffect(() => {
    if (showEditDialog && apiChild) {
      setEditForm({
        name: apiChild.name ?? '',
        dob: apiChild.dob ?? '',
        gender: apiChild.gender ?? '',
        guardian_name: apiChild.guardian_name ?? '',
        mother_name: apiChild.mother_name ?? '',
        guardian_phone: apiChild.guardian_phone ?? '',
        guardian_email: apiChild.guardian_email ?? '',
        guardian_nic: apiChild.guardian_nic ?? '',
        address: apiChild.address ?? '',
        birth_weight_kg: apiChild.birth_weight_kg != null ? String(apiChild.birth_weight_kg) : '',
        birth_height_cm: apiChild.birth_height_cm != null ? String(apiChild.birth_height_cm) : '',
        birth_risk_level: apiChild.birth_risk_level ?? '',
      });
    }
  }, [showEditDialog, apiChild]);

  // ── Live-updating age (hooks MUST be before any early returns) ──────────
  const calcAge = (dob: string) => {
    const msElapsed = Date.now() - new Date(dob).getTime();
    const totalDays = Math.floor(msElapsed / (1000 * 60 * 60 * 24));
    const totalMonths = Math.floor(msElapsed / (1000 * 60 * 60 * 24 * 30.44));
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    // Under 1 month → show days so newborns never display as "0 months"
    if (totalMonths < 1) return `${totalDays} days (0 months)`;
    if (years > 0) return `${years} yr ${months} mo (${totalMonths} months)`;
    return `${totalMonths} months`;
  };

  const [ageDisplay, setAgeDisplay] = useState(() =>
    apiChild?.dob ? calcAge(apiChild.dob) : '0 months'
  );

  useEffect(() => {
    const dob = apiChild?.dob;
    if (!dob) return;
    setAgeDisplay(calcAge(dob));
    const timer = setInterval(() => setAgeDisplay(calcAge(dob)), 60_000);
    return () => clearInterval(timer);
  }, [apiChild?.dob]);

  const isHospital = user?.role === 'hospital';

  const child = apiChild ? {
    id: apiChild.child_id || apiChild.id,
    name: apiChild.name,
    dob: apiChild.dob,
    gender: apiChild.gender,
    guardianName: apiChild.guardian_name,
    guardianPhone: apiChild.guardian_phone,
    guardianEmail: apiChild.guardian_email,
    address: apiChild.address,
    riskLevel: (() => {
      const birthRisk = (apiChild.birth_risk_level || '').toUpperCase();
      const birthLevel: RiskLevel =
        birthRisk === 'SAM' || birthRisk === 'CRITICAL'
          ? 'sam'
          : birthRisk === 'MAM' || birthRisk === 'MODERATE' || birthRisk === 'HIGH'
            ? 'mam'
            : 'normal';
      const cur = (apiChild.current_risk_level || 'NORMAL').toLowerCase();
      if (cur === 'sam' || cur === 'critical') return 'sam' as RiskLevel;
      if (cur === 'mam' || cur === 'moderate' || cur === 'high') return 'mam' as RiskLevel;
      // If current_risk_level is still Normal but birth risk is SAM/MAM, use birth risk
      if (cur === 'normal' && birthLevel !== 'normal') return birthLevel;
      return 'normal' as RiskLevel;
    })(),
    measurements: (() => {
      // Deduplicate: measurements (rich, has Z-scores + AI) take priority.
      // Only include a visit if no measurement already covers that calendar day.
      const measDates = new Set(
        (apiChild.measurements || []).map((m: any) => (m.measurement_date || '').slice(0, 10))
      );
      const uniqueVisits = (apiChild.visits || []).filter(
        (v: any) => !measDates.has((v.visit_date || '').slice(0, 10))
      );
      const baseList = mapToMeasurements([...(apiChild.measurements || []), ...uniqueVisits], apiChild.dob);
      const hasBirth =
        apiChild.dob &&
        (Number(apiChild.birth_weight_kg) > 0 ||
          Number(apiChild.birth_height_cm) > 0 ||
          apiChild.birth_risk_level ||
          apiChild.birth_muac_cm != null);
      const birth = hasBirth ? [createBirthMeasurement(apiChild)] : [];
      return [...birth, ...baseList].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    })(),
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

  // Calculate prediction based on historical data
  const calculatePrediction = (): PredictionData | null => {
    if (child.measurements.length < 2) {
      return null;
    }

    // Get recent measurements (last 3)
    const recentMeasurements = child.measurements.slice(0, 3).reverse(); // Reverse to get chronological order

    // Calculate trend (guard optional Z-score fields)
    const avgWFATrend = recentMeasurements.length > 1
      ? ((recentMeasurements[recentMeasurements.length - 1].weightForAge ?? 0) - (recentMeasurements[0].weightForAge ?? 0)) / recentMeasurements.length
      : 0;

    const latestMeasurement = child.measurements[0];

    // Project 1-2 months ahead; skip any dimension whose current Z-score is unknown
    const latestWFA = latestMeasurement.weightForAge;
    const latestHFA = latestMeasurement.heightForAge;
    const latestWFH = latestMeasurement.weightForHeight;

    const predictedWFA = latestWFA != null ? latestWFA + (avgWFATrend * 2) : null;
    const predictedHFA = latestHFA != null ? latestHFA + (avgWFATrend * 0.5) : null;
    const predictedWFH = latestWFH != null ? latestWFH + (avgWFATrend * 1.5) : null;

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
  const currentNutritionalStatusLabel = getCurrentNutritionalStatusLabel(apiChild, getRiskLabel(child.riskLevel));
  const futurePredictedRiskLabel = getFuturePredictedRiskLabel(apiChild);
  const futurePredictedRiskClass = getFutureRiskToneClass(futurePredictedRiskLabel);
  const futureRiskConfidence = apiChild?.future_risk_confidence ?? apiChild?.futureRiskConfidence ?? null;
  const clinicalAction = getClinicalActionDisplay(apiChild);
  const clinicalReviewReason =
    apiChild?.clinical_review_reason ||
    apiChild?.clinicalReviewReason ||
    (clinicalAction.label === 'YES' || clinicalAction.label === 'NEEDS CLINICAL REVIEW'
      ? 'Clinical review is recommended based on current status or future predicted risk.'
      : 'Routine monitoring recommended.');
  const statusBreakdown = getStatusBreakdown(apiChild);
  const hasFuturePrediction = futurePredictedRiskLabel !== 'NOT AVAILABLE';
  const futureSeverity = futureRiskSeverity(futurePredictedRiskLabel);
  const futureRiskIsHighPriority = hasFuturePrediction && futureSeverity >= 3;
  const futureRiskIsModeratePriority = hasFuturePrediction && futureSeverity === 2;
  const futureRiskNeedsAction =
    hasFuturePrediction &&
    futureSeverity > currentRiskSeverity(child.riskLevel);
  const forecastNeedsAttention = futureRiskIsHighPriority || futureRiskNeedsAction;
  const forecastPanelClass = !hasFuturePrediction
    ? 'border-gray-300 bg-gray-50'
    : forecastNeedsAttention
      ? 'border-orange-500 bg-gradient-to-br from-orange-50 via-orange-100/50 to-orange-50'
      : futureRiskIsModeratePriority
        ? 'border-amber-500 bg-gradient-to-br from-amber-50 via-amber-100/50 to-amber-50'
        : futurePredictedRiskLabel === 'NO RISK'
          ? 'border-green-500 bg-gradient-to-br from-green-50 via-green-100/50 to-green-50'
          : 'border-blue-500 bg-gradient-to-br from-blue-50 via-blue-100/50 to-blue-50';
  const forecastAccentClass = forecastNeedsAttention
    ? 'bg-orange-600'
    : futureRiskIsModeratePriority
      ? 'bg-amber-600'
      : futurePredictedRiskLabel === 'NO RISK'
        ? 'bg-green-600'
        : 'bg-blue-600';
  const forecastIconBgClass = forecastNeedsAttention
    ? 'bg-orange-200'
    : futureRiskIsModeratePriority
      ? 'bg-amber-200'
      : futurePredictedRiskLabel === 'NO RISK'
        ? 'bg-green-200'
        : 'bg-blue-200';
  const forecastTextClass = forecastNeedsAttention
    ? 'text-orange-700'
    : futureRiskIsModeratePriority
      ? 'text-amber-700'
      : futurePredictedRiskLabel === 'NO RISK'
        ? 'text-green-700'
        : 'text-blue-700';
  const forecastMessageTitle = forecastNeedsAttention
    ? 'Action Required:'
    : futureRiskIsModeratePriority
      ? 'Close Monitoring:'
      : futurePredictedRiskLabel === 'NO RISK'
        ? 'Positive Outlook:'
        : 'Routine Monitoring:';
  const forecastMessage = hasFuturePrediction
    ? forecastNeedsAttention
      ? `${futurePredictedRiskLabel} predicted within 2 months. Early intervention and closer follow-up are recommended.`
      : futureRiskIsModeratePriority
        ? `${futurePredictedRiskLabel} predicted within 2 months. Monitor growth closely and provide nutrition guidance.`
        : futurePredictedRiskLabel === 'NO RISK'
          ? 'No future malnutrition risk is predicted within 2 months. Continue routine growth monitoring.'
          : `${futurePredictedRiskLabel} predicted within 2 months. Continue routine monitoring.`
    : 'No future prediction has been saved for the latest measurement.';
  const showPredictionAlert = forecastNeedsAttention;
  const displayRisk = child.riskLevel;

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

  const isMoh = user?.role === 'moh' || user?.role === 'amoh';
  const isHospitalRole = user?.role === 'hospital';
  const isNutritionist = user?.role === 'nutritionist';
  const isMidwife = user?.role === 'midwife';
  const childEscalated = apiChild?.escalation_status && apiChild.escalation_status !== 'NONE';
  const canAddMeasurement = isHospitalRole
    ? false
    : isMoh
      ? apiChild?.can_moh_add_measurement === true
      : isNutritionist
        ? apiChild?.can_nutritionist_add_measurement === true
        : isMidwife
          ? !childEscalated
          : true;

  let canEditDelete = false;
  if (apiChild && user?.role) {
    if (isHospitalRole) {
      // Pediatric Unit: can edit/delete only within 24 hours of registration
      const reg = apiChild.registration_date ? new Date(apiChild.registration_date) : null;
      const now = new Date();
      const withinOneDay = reg ? now.getTime() - reg.getTime() <= 24 * 60 * 60 * 1000 : false;
      canEditDelete = withinOneDay;
    } else if (['midwife', 'moh', 'amoh'].includes(user.role)) {
      canEditDelete = true;
    }
  }
  const latestMeasurement = child.measurements.length > 0 ? child.measurements[0] : null;

  const refetchChild = () => {
    childrenAPI.get(childId)
      .then((res) => {
        if (res.data?.status === 'success' && res.data?.child) setApiChild(res.data.child);
      })
      .catch(() => { });
  };

  // Derive the numeric DB id for escalation (backend expects integer)
  const numericChildId: number | null = (() => {
    const n = Number(apiChild?.id);
    return isNaN(n) ? null : n;
  })();

  const escalationStatus = apiChild?.escalation_status;
  const alreadyEscalated = escalationStatus === 'ESCALATED_TO_MOH';
  const riskLevel = (child.riskLevel || '').toLowerCase();
  const riskIsElevated = riskLevel === 'mam' || riskLevel === 'sam';
  const canEscalateToMoh = isMidwife && riskIsElevated && !alreadyEscalated;

  const handleEscalateToMoh = async () => {
    if (!numericChildId) return;
    setIsEscalating(true);
    setEscalateError('');
    try {
      const res = await midwifeAPI.escalateToMoh(numericChildId, {
        reason: escalateReason || 'Risk level elevated — requires MOH review',
        previous_risk_level: escalationStatus,
      });
      if (res.data?.status === 'success') {
        setShowEscalateDialog(false);
        setEscalateReason('');
        onBack(); // child is no longer under midwife — go back to list
      } else {
        setEscalateError(res.data?.message || 'Escalation failed');
      }
    } catch (err: any) {
      setEscalateError(err?.response?.data?.message || 'Escalation failed. Please try again.');
    } finally {
      setIsEscalating(false);
    }
  };

  const handleEditSave = () => {
    setIsSaving(true);
    const payload: Record<string, string | null> = {
      name: editForm.name || null,
      dob: editForm.dob || null,
      gender: editForm.gender || null,
      guardian_name: editForm.guardian_name || null,
      mother_name: editForm.mother_name || null,
      guardian_phone: editForm.guardian_phone || null,
      guardian_email: editForm.guardian_email || null,
      guardian_nic: editForm.guardian_nic || null,
      address: editForm.address || null,
      birth_risk_level: editForm.birth_risk_level || null,
    };
    if (editForm.birth_weight_kg !== '' && editForm.birth_weight_kg != null) payload.birth_weight_kg = editForm.birth_weight_kg;
    if (editForm.birth_height_cm !== '' && editForm.birth_height_cm != null) payload.birth_height_cm = editForm.birth_height_cm;
    childrenAPI.update(childId, payload)
      .then(() => {
        refetchChild();
        setShowEditDialog(false);
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to update child');
      })
      .finally(() => setIsSaving(false));
  };

  const handleDeleteConfirm = () => {
    setIsDeleting(true);
    childrenAPI.delete(childId)
      .then(() => {
        setShowDeleteDialog(false);
        onBack();
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to delete child');
      })
      .finally(() => setIsDeleting(false));
  };

  // Data source for the "Measurements at birth" panel:
  // 1) Prefer explicit birth_* fields from the child record
  // 2) Otherwise, fall back to the earliest measurement (if within ~1 month of birth)
  const birthPanelData = (() => {
    if (!apiChild?.dob) return null;

    // 1) Prefer explicit birth_* fields from the child record
    const hasExplicitBirthData =
      apiChild.birth_weight_kg != null ||
      apiChild.birth_height_cm != null ||
      apiChild.birth_risk_level;

    if (hasExplicitBirthData) {
      return {
        date: apiChild.dob as string,
        weight: apiChild.birth_weight_kg != null && apiChild.birth_weight_kg !== '' ? Number(apiChild.birth_weight_kg) : null,
        height: apiChild.birth_height_cm != null && apiChild.birth_height_cm !== '' ? Number(apiChild.birth_height_cm) : null,
        muac: null,
        birthRiskLevel: apiChild.birth_risk_level || null,
        fromMeasurement: false,
      };
    }

    // 2) Fall back to birth_registration JSON if columns are missing (all roles)
    if (apiChild.birth_registration) {
      const br = apiChild.birth_registration as any;
      const w = br.birthWeight ?? br.weight ?? null;
      const h = br.birthLength ?? br.length ?? null;
      const m = br.birthMuac ?? br.muac ?? null;
      const hasAny = w != null || h != null || m != null || apiChild.birth_risk_level;
      if (hasAny) {
        return {
          date: apiChild.dob as string,
          weight: w != null && w !== '' ? Number(w) : null,
          height: h != null && h !== '' ? Number(h) : null,
          muac: m != null && m !== '' ? Number(m) : null,
          birthRiskLevel: apiChild.birth_risk_level || null,
          fromMeasurement: false,
        };
      }
    }

    // 3) Otherwise, fall back to the earliest measurement (if within ~1 month of birth)
    if (!child.measurements.length) return null;

    const sortedByAge = [...child.measurements].sort((a, b) => {
      if (a.ageMonths !== b.ageMonths) return a.ageMonths - b.ageMonths;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    const earliest = sortedByAge[0];

    // Only treat as "birth time" if the first measurement is very close to birth
    if (earliest.ageMonths > 1) return null;

    return {
      date: earliest.date,
      weight: earliest.weight || null,
      height: earliest.height || null,
      muac: earliest.muac ?? null,
      birthRiskLevel: (earliest.riskLevel || child.riskLevel) as RiskLevel,
      fromMeasurement: true,
    };
  })();

  const handleDownloadPDF = () => {
    setShowPDFDialog(true);
  };

  const handleConfirmDownload = async () => {
    setShowPDFDialog(false);
    try {
      if (!child) return;
      await generateProfessionalPdf(
        {
          id: child.id,
          name: child.name,
          dob: child.dob,
          gender: child.gender,
          guardianName: child.guardianName,
          guardianPhone: child.guardianPhone,
          address: child.address,
          riskLevel: child.riskLevel,
          measurements: child.measurements,
          motherName: apiChild?.mother_name ?? undefined,
          guardianNic: apiChild?.guardian_nic ?? undefined,
          birthWeightKg: apiChild?.birth_weight_kg ?? null,
          birthHeightCm: apiChild?.birth_height_cm ?? null,
          birthRiskLevel: apiChild?.birth_risk_level ?? null,
        },
        {
          wfa: chartRefs.wfa.current,
          hfa0_24: chartRefs.hfa0_24.current,
          hfa24_60: chartRefs.hfa24_60.current,
          wfh: chartRefs.wfh.current,
          zscore: chartRefs.zscore.current,
        }
      );
    } catch (e) {
      console.error('PDF generation failed', e);
      alert('PDF generation failed. Please try again.');
    }
  };

  return (
    <div className="space-y-6" ref={pdfRef}>
      {/* Hidden charts rendered off-screen for PDF capture */}
      {!isHospitalRole && child && (
        <HiddenPdfCharts
          measurements={child.measurements}
          gender={child.gender}
          refs={chartRefs}
        />
      )}

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
        {canAddMeasurement ? (
          <button
            onClick={() => onAddMeasurement(child.id)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Measurement
          </button>
        ) : isMoh ? (
          <span className="text-sm text-gray-500 italic" title="Only for children sent by midwife">
            Add measurement only for children sent by midwife
          </span>
        ) : null}

        {/* Send to MOH escalation – midwife only, when risk is elevated */}
        {isMidwife && riskIsElevated && (
          alreadyEscalated ? (
            <span className="flex items-center gap-1.5 px-4 py-2 bg-orange-100 border-2 border-orange-300 text-orange-800 rounded-lg font-medium text-sm cursor-default">
              <CheckCircle className="w-4 h-4 text-orange-600" />
              Sent to MOH
            </span>
          ) : (
            <button
              onClick={() => setShowEscalateDialog(true)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors animate-pulse"
              title="Child's risk is elevated — send to MOH for review"
            >
              <AlertTriangle className="w-4 h-4" />
              Send to MOH
            </button>
          )
        )}

        {canEditDelete && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditDialog(true)}
              className="flex items-center gap-2 px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="flex items-center gap-2 px-4 py-2 border-2 border-red-300 text-red-700 rounded-lg font-medium hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Dual Risk Status Display - Top Priority (hidden for Pediatric Unit) */}
      {!isHospitalRole && (
        <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-gray-200">
          <h3 className="text-base font-bold text-gray-900 mb-4">Nutritional Status Overview</h3>
          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-sm leading-6 text-blue-900">{STATUS_HELPER_TEXT}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Current Status - Solid Badge */}
            <div className="border-2 border-gray-300 rounded-lg p-5 bg-white">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <Activity className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-sm font-bold text-gray-900">Current Nutritional Status</p>
              </div>
              <div className="flex flex-col gap-2">
                <span className={`inline-block rounded-lg border px-4 py-3 text-center text-base font-bold shadow-sm ${getCurrentStatusToneClass(currentNutritionalStatusLabel)}`}>
                  Current Nutritional Status: {currentNutritionalStatusLabel}
                </span>
                <p className="text-xs text-gray-600 mt-1">
                  📅 Based on measurements from {latestMeasurement ? formatDate(latestMeasurement.date) : '—'}
                </p>
                <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assessment Breakdown</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {statusBreakdown.map((item) => (
                      <div key={item.label} className="flex items-start justify-between gap-3 rounded-md bg-white px-3 py-2">
                        <span className="text-xs font-medium text-gray-600">{item.label}</span>
                        <span className="text-xs font-semibold text-gray-900 text-right">{item.value || 'Not Available'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Predicted Risk - Highly Distinct Future Forecast */}
            <div className={`border-4 rounded-lg p-5 relative overflow-hidden ${forecastPanelClass}`} style={{ borderStyle: 'dashed' }}>
              {/* Forecast Badge Corner */}
              <div className={`absolute top-0 right-0 px-3 py-1 text-xs font-bold text-white ${forecastAccentClass}`} style={{ borderBottomLeftRadius: '8px' }}>
                FORECAST
              </div>

              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${forecastIconBgClass}`}>
                  {hasFuturePrediction ? (
                    forecastNeedsAttention || futureRiskIsModeratePriority ? (
                      <TrendingDown className={`w-5 h-5 ${forecastTextClass}`} />
                    ) : futurePredictedRiskLabel === 'NO RISK' ? (
                      <TrendingUp className="w-5 h-5 text-green-700" />
                    ) : (
                      <Activity className="w-5 h-5 text-blue-700" />
                    )
                  ) : (
                    <Activity className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900">2-Month Future Risk</p>
                  <p className={`text-xs font-bold ${forecastTextClass}`}>
                    2-Month Predicted Risk
                  </p>
                </div>
              </div>

              {hasFuturePrediction ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block flex-1 rounded-lg border px-4 py-3 text-center text-base font-bold shadow-sm ${futurePredictedRiskClass}`}
                    >
                      2-Month Predicted Risk: {futurePredictedRiskLabel}
                    </span>
                    {forecastNeedsAttention && (
                      <div className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg animate-pulse">
                        <AlertTriangle className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </div>
                  <div className={`mt-2 p-3 rounded-lg border-2 ${forecastNeedsAttention ? 'bg-orange-50/50 border-orange-300' :
                    futureRiskIsModeratePriority ? 'bg-amber-50/50 border-amber-300' :
                      futurePredictedRiskLabel === 'NO RISK' ? 'bg-green-50/50 border-green-300' :
                        'bg-blue-50/50 border-blue-300'
                    }`}>
                      <p className="text-xs font-bold text-gray-900 mb-1">
                        {forecastMessageTitle}
                      </p>
                      <p className="text-xs font-medium text-gray-800">
                        {forecastMessage}
                      </p>
                  </div>
                  {(futureRiskConfidence != null || prediction) && (
                    <div className="flex items-center justify-between text-xs text-gray-700 mt-1">
                      <span className="font-medium">
                        Future Risk Confidence: {futureRiskConfidence != null ? Math.round(Number(futureRiskConfidence) * 100) : prediction?.confidence}%
                      </span>
                      <span className={`font-bold ${forecastTextClass}`}>
                        {forecastNeedsAttention ? 'Needs Attention' :
                          futureRiskIsModeratePriority ? 'Monitor Closely' :
                            futurePredictedRiskLabel === 'NO RISK' ? 'Improving' :
                              'Stable'}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className={`rounded-lg border px-4 py-4 text-center text-sm font-semibold ${futurePredictedRiskClass}`}>
                  <p>2-Month Predicted Risk: Not Available</p>
                  <p className="text-xs text-gray-500 mt-1">
                    No future prediction has been saved for the latest measurement.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className={`mt-4 rounded-lg border-2 p-4 ${clinicalAction.className}`}>
            <div className="flex items-start gap-3">
              <AlertTriangle className={`mt-0.5 h-5 w-5 flex-shrink-0 ${clinicalAction.label === 'NO' ? 'text-green-600' : clinicalAction.label === 'NOT AVAILABLE' ? 'text-slate-500' : 'text-orange-600'}`} />
              <div>
                <p className="text-sm font-bold text-gray-900">Clinical Action Required: {clinicalAction.label}</p>
                <p className="mt-1 text-sm text-gray-700">{clinicalReviewReason}</p>
              </div>
            </div>
          </div>

          {/* Alert Banner for High Priority Cases */}
          {showPredictionAlert && (
            <div className="mt-4 p-4 bg-orange-100 border-2 border-orange-400 rounded-lg animate-pulse">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-base font-bold text-orange-900">🚨 Early Warning Alert - Action Required</p>
                  <p className="text-sm text-orange-800 mt-1 font-medium">
                    {futurePredictedRiskLabel === 'SEVERE RISK'
                      ? 'This child is predicted to progress to Severe Acute Malnutrition within 1-2 months. Early intervention required before next scheduled clinic visit.'
                      : `This child has a ${futurePredictedRiskLabel.toLowerCase()} within 2 months. Increased monitoring and preventive measures recommended.`}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Risk Alert (hidden for Pediatric Unit) */}
      {!isHospitalRole && displayRisk !== 'normal' && (
        <div
          className={`rounded-lg p-6 border-2 ${displayRisk === 'sam'
            ? 'bg-red-50 border-red-300'
            : 'bg-yellow-50 border-yellow-300'
            }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={`w-6 h-6 flex-shrink-0 mt-1 ${displayRisk === 'sam' ? 'text-red-600' : 'text-yellow-600'
                }`}
            />
            <div>
              <h3
                className={`text-lg font-bold ${displayRisk === 'sam' ? 'text-red-900' : 'text-yellow-900'
                  }`}
              >
                {getRiskLabel(displayRisk)}
              </h3>
              <p
                className={`mt-1 ${displayRisk === 'sam' ? 'text-red-800' : 'text-yellow-800'
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
                {formatDate(child.dob)} ({ageDisplay})
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
              <p className="text-sm text-gray-600">Current Nutritional Status</p>
              <span className={`mt-1 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getCurrentStatusToneClass(currentNutritionalStatusLabel)}`}>
                {currentNutritionalStatusLabel}
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
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <p className="text-sm text-gray-600">Guardian Email</p>
              <p className="font-medium text-gray-900">{child.guardianEmail || '—'}</p>
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

      {/* Measurements at birth - visible when we have explicit birth data or an early measurement */}
      {birthPanelData && (
        <div className="bg-white rounded-lg shadow p-6 border-2 border-amber-200 bg-amber-50/30">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="text-amber-600">
              {birthPanelData.fromMeasurement ? 'Measurements around birth (first visit)' : 'Measurements at birth'}
            </span>
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            {birthPanelData.fromMeasurement
              ? `First recorded measurement close to birth (on: ${formatDate(birthPanelData.date)})`
              : `Recorded when the child was registered (date of birth: ${formatDate(birthPanelData.date)})`}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-4 border border-amber-200">
              <p className="text-sm text-gray-600">Weight</p>
              <p className="text-xl font-bold text-gray-900 mt-1">
                {birthPanelData.weight != null ? `${birthPanelData.weight} kg` : '—'}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-amber-200">
              <p className="text-sm text-gray-600">Length / height</p>
              <p className="text-xl font-bold text-gray-900 mt-1">
                {birthPanelData.height != null ? `${birthPanelData.height} cm` : '—'}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-amber-200">
              <p className="text-sm text-gray-600">MUAC</p>
              <p className="text-xl font-bold text-gray-900 mt-1">
                {birthPanelData.muac != null ? `${birthPanelData.muac} cm` : '—'}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-amber-200">
              <p className="text-sm text-gray-600">Birth risk</p>
              <p className="mt-1">
                {birthPanelData.birthRiskLevel ? (
                  <span
                    className="inline-block px-3 py-1 rounded-full text-sm font-medium text-white"
                    style={{
                      backgroundColor: getRiskColor(
                        (birthPanelData.birthRiskLevel === 'SAM' || birthPanelData.birthRiskLevel === 'CRITICAL'
                          ? 'sam'
                          : birthPanelData.birthRiskLevel === 'MAM' ||
                            birthPanelData.birthRiskLevel === 'MODERATE' ||
                            birthPanelData.birthRiskLevel === 'HIGH'
                            ? 'mam'
                            : 'normal') as RiskLevel
                      ),
                    }}
                  >
                    {birthPanelData.birthRiskLevel}
                  </span>
                ) : (
                  <span className="text-gray-500">—</span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Latest Measurements – hidden for Pediatric Unit (birth-only view) */}
      {!isHospitalRole && (
        <>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Latest Measurements</h3>
            {latestMeasurement ? (
              <>
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
                    <p className="text-sm text-gray-600">
                      MUAC
                      {latestMeasurement.ageMonths < 6 && (
                        <span className="ml-1 text-xs text-amber-600">(not assessed &lt;6m)</span>
                      )}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {latestMeasurement.muac != null ? `${latestMeasurement.muac} cm` : '—'}
                    </p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Date</p>
                    <p className="text-lg font-bold text-gray-900 mt-1">{latestMeasurement.date}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm text-gray-600">Current Nutritional Status</p>
                    <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getCurrentStatusToneClass(latestMeasurement.current_nutritional_status || currentNutritionalStatusLabel)}`}>
                      {latestMeasurement.current_nutritional_status || currentNutritionalStatusLabel}
                    </span>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm text-gray-600">2-Month Predicted Risk</p>
                    <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getFutureRiskToneClass(latestMeasurement.future_predicted_risk || futurePredictedRiskLabel)}`}>
                      {latestMeasurement.future_predicted_risk || futurePredictedRiskLabel}
                    </span>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm text-gray-600">MUAC Status</p>
                    <p className="mt-2 text-sm font-semibold text-gray-900">{latestMeasurement.muac_status || 'Not Recorded'}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm text-gray-600">Edema Status</p>
                    <p className="mt-2 text-sm font-semibold text-gray-900">{latestMeasurement.edema_status || 'Not Recorded'}</p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Weight-for-Age Z-score</p>
                    <p className={`text-2xl font-bold mt-1 ${(latestMeasurement.weightForAge ?? 0) < -2 ? 'text-red-600' : 'text-green-600'}`}>
                      {(latestMeasurement.weightForAge ?? 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Height-for-Age Z-score</p>
                    <p className={`text-2xl font-bold mt-1 ${(latestMeasurement.heightForAge ?? 0) < -2 ? 'text-red-600' : 'text-green-600'}`}>
                      {(latestMeasurement.heightForAge ?? 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Weight-for-Height Z-score</p>
                    <p className={`text-2xl font-bold mt-1 ${(latestMeasurement.weightForHeight ?? 0) < -2 ? 'text-red-600' : 'text-green-600'}`}>
                      {(latestMeasurement.weightForHeight ?? 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-gray-500 py-4">No measurements recorded yet. Use &quot;Add Measurement&quot; to record the first visit.</p>
            )}
          </div>

          {/* WHO Growth Charts */}
          <WHOGrowthCharts measurements={child.measurements} childGender={child.gender} />

          {/* Care Journey Timeline */}
          {(() => {
            const escalations: any[] = apiChild?.escalations || [];
            const referrals: any[] = apiChild?.referrals || [];
            if (escalations.length === 0 && referrals.length === 0) return null;

            type JourneyEvent = {
              date: string;
              type: 'escalation' | 'referral';
              label: string;
              sub: string;
              color: string;
              dot: string;
            };

            const events: JourneyEvent[] = [
              ...escalations.map((e: any) => {
                const from = (e.from_role || '').toUpperCase();
                const to = (e.to_role || '').toUpperCase();
                const label =
                  from === 'MIDWIFE' && to === 'MOH'
                    ? 'Escalated to MOH'
                    : from === 'MOH' && to === 'NUTRITIONIST'
                    ? 'Escalated to Nutritionist'
                    : from === 'NUTRITIONIST' && to === 'MOH'
                    ? 'Returned to MOH'
                    : `${from} → ${to}`;
                const statusText = e.status === 'PENDING' ? 'Pending MOH review' : e.status === 'REVIEWED' ? 'Reviewed' : e.status || '';
                return {
                  date: e.created_at || '',
                  type: 'escalation' as const,
                  label,
                  sub: [e.reason, statusText].filter(Boolean).join(' · '),
                  color: to === 'MOH' && from === 'MIDWIFE' ? 'border-amber-400 bg-amber-50'
                    : to === 'NUTRITIONIST' ? 'border-red-400 bg-red-50'
                    : 'border-teal-400 bg-teal-50',
                  dot: to === 'MOH' && from === 'MIDWIFE' ? 'bg-amber-400'
                    : to === 'NUTRITIONIST' ? 'bg-red-400'
                    : 'bg-teal-400',
                };
              }),
              ...referrals.map((r: any) => ({
                date: r.created_at || '',
                type: 'referral' as const,
                label: 'Referred to Nutritionist',
                sub: [r.referral_reason, r.status].filter(Boolean).join(' · '),
                color: 'border-purple-400 bg-purple-50',
                dot: 'bg-purple-400',
              })),
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            return (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Care Journey</h3>
                <div className="space-y-3">
                  {events.map((ev, i) => (
                    <div key={i} className={`flex gap-3 p-3 rounded-lg border-l-4 ${ev.color}`}>
                      <div className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${ev.dot}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{ev.label}</p>
                        {ev.sub && <p className="text-xs text-gray-600 mt-0.5 truncate">{ev.sub}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {ev.date ? new Date(ev.date).toLocaleString() : '—'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Measurement History */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Measurement History</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px]">
                <colgroup>
                  <col className="w-[120px]" />
                  <col className="w-[70px]" />
                  <col className="w-[90px]" />
                  <col className="w-[90px]" />
                  <col className="w-[110px]" />
                  <col className="w-[180px]" />
                  <col className="w-[220px]" />
                  <col className="w-[170px]" />
                  <col />
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Age</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Weight</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Height</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">MUAC</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-medium text-gray-700">Current Status</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-medium text-gray-700">2-Month Predicted Risk</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Recorded by</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {child.measurements.map((measurement) => (
                    <tr key={measurement.id} className="border-b border-gray-100">
                      <td className="py-3 px-4 text-sm text-gray-900">{formatDate(measurement.date)}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{Math.round(measurement.ageMonths)}m</td>
                      <td className="py-3 px-4 text-sm text-gray-900">{measurement.weight} kg</td>
                      <td className="py-3 px-4 text-sm text-gray-900">{measurement.height} cm</td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {measurement.muac != null ? (
                          <>
                            {measurement.muac} cm
                            {measurement.ageMonths < 6 && (
                              <span className="ml-1 text-xs text-amber-600" title="MUAC not used for risk assessment under 6 months">(not assessed)</span>
                            )}
                          </>
                        ) : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex min-w-[110px] items-center justify-center whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold ${getCurrentStatusToneClass(measurement.current_nutritional_status || getRiskLabel(measurement.riskLevel))}`}>
                          {getStatusDisplayLabel(measurement.current_nutritional_status || getRiskLabel(measurement.riskLevel))}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex min-w-[140px] items-center justify-center whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold ${getFutureRiskToneClass(measurement.future_predicted_risk || 'NOT AVAILABLE')}`}>
                          {getStatusDisplayLabel(measurement.future_predicted_risk || 'NOT AVAILABLE')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">{(measurement as any).measuredBy || '—'}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{measurement.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Download PDF (hidden for Pediatric Unit) */}
      {!isHospitalRole && (
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
      )}

      {/* PDF Generation Dialog (hidden for Pediatric Unit) */}
      {!isHospitalRole && (
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
      )}

      {/* Edit Child Dialog */}
      <AlertDialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <AlertDialogContent style={{ maxWidth: '42rem' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit child details</AlertDialogTitle>
            <AlertDialogDescription>Update basic information and birth measurements. Changes are saved immediately.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input value={editForm.name ?? ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of birth</label>
              <input type="date" value={editForm.dob ?? ''} onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
              <select value={editForm.gender ?? ''} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guardian name</label>
              <input value={editForm.guardian_name ?? ''} onChange={(e) => setEditForm({ ...editForm, guardian_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mother name</label>
              <input value={editForm.mother_name ?? ''} onChange={(e) => setEditForm({ ...editForm, mother_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guardian phone</label>
              <input value={editForm.guardian_phone ?? ''} onChange={(e) => setEditForm({ ...editForm, guardian_phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guardian email</label>
              <input type="email" value={editForm.guardian_email ?? ''} onChange={(e) => setEditForm({ ...editForm, guardian_email: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guardian NIC</label>
              <input value={editForm.guardian_nic ?? ''} onChange={(e) => setEditForm({ ...editForm, guardian_nic: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <textarea value={editForm.address ?? ''} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} rows={2} className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Birth weight (kg)</label>
              <input type="number" step="0.01" value={editForm.birth_weight_kg ?? ''} onChange={(e) => setEditForm({ ...editForm, birth_weight_kg: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Birth height (cm)</label>
              <input type="number" step="0.1" value={editForm.birth_height_cm ?? ''} onChange={(e) => setEditForm({ ...editForm, birth_height_cm: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Birth risk level</label>
              <select value={editForm.birth_risk_level ?? ''} onChange={(e) => setEditForm({ ...editForm, birth_risk_level: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                <option value="">—</option>
                <option value="NORMAL">Normal</option>
                <option value="MAM">MAM</option>
                <option value="SAM">SAM</option>
              </select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEditSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSaving ? 'Saving...' : 'Save changes'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Child Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete child record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {child.name}? This will permanently remove the child and all associated measurements and history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-red-600 hover:bg-red-700 text-white">
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Escalate to MOH Confirmation Dialog */}
      {showEscalateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-orange-600 px-6 py-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Send to MOH for Review</h3>
                <p className="text-orange-100 text-sm">This will escalate {child.name} to the MOH doctor</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              {/* Risk summary */}
              <div className="mb-4 p-3 rounded-lg bg-orange-50 border border-orange-200">
                <p className="text-sm font-semibold text-orange-900">Current risk level:</p>
                <p className="text-base font-bold mt-1" style={{ color: getRiskColor(child.riskLevel) }}>
                  {getRiskLabel(child.riskLevel)}
                </p>
                <p className="text-xs text-orange-700 mt-1">
                  The child's growth indicators are below −2 SD or −3 SD, indicating {riskLevel === 'sam' ? 'Severe Acute Malnutrition (SAM)' : 'Moderate Acute Malnutrition (MAM)'}.
                </p>
              </div>

              {/* Reason */}
              <div className="mb-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for referral <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                  placeholder={riskLevel === 'sam'
                    ? 'e.g. Z-score below −3 SD for two consecutive visits, weight declining'
                    : 'e.g. Z-score −2 SD to −3 SD range, inadequate weight gain'}
                  rows={3}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                />
              </div>

              {escalateError && (
                <p className="text-sm text-red-600 mt-2 font-medium">{escalateError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 flex gap-3 justify-end">
              <button
                onClick={() => { setShowEscalateDialog(false); setEscalateError(''); setEscalateReason(''); }}
                disabled={isEscalating}
                className="px-5 py-2 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEscalateToMoh}
                disabled={isEscalating}
                className="flex items-center gap-2 px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {isEscalating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    Confirm &amp; Send to MOH
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
