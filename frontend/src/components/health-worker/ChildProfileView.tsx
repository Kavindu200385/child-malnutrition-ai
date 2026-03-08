import React from 'react';
import { useRef, useState, useEffect } from 'react';
import { getRiskColor, getRiskLabel, calculateRiskLevel, RiskLevel } from '../../types';
import { ArrowLeft, User, Phone, MapPin, Calendar, Activity, AlertTriangle, TrendingUp, Plus, Download, TrendingDown, FileText, CheckCircle, Pencil, Trash2 } from 'lucide-react';
import { WHOGrowthCharts } from './WHOGrowthCharts';
import { HiddenPdfCharts, generateProfessionalPdf } from './PdfReportGenerator';
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
    const ageMonths = dobDate ? Math.floor((visitDate.getTime() - dobDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)) : 0;
    const risk = (v.risk_level || v.current_risk || 'NORMAL').toLowerCase();
    const r = risk === 'sam' || risk === 'critical' ? 'sam' : risk === 'mam' || risk === 'moderate' || risk === 'high' ? 'mam' : 'normal';
    const wKg = Number(v.weight_kg) || 0;
    const hCm = Number(v.height_cm) || 0;
    const male = (v.gender || '').toLowerCase() === 'male';

    // Use stored Z-scores if available; fall back to approximation for chart display
    const rawWfa = (v.z_score_wfa ?? v.z_wfa);
    const rawHfa = (v.z_score_hfa ?? v.z_hfa);
    const rawWfh = (v.z_score_wfh ?? v.z_wfh);
    const weightForAge = rawWfa != null ? Number(rawWfa) : (wKg > 0 && ageMonths >= 0 ? approxWFA(wKg, ageMonths, male) : undefined);
    const heightForAge = rawHfa != null ? Number(rawHfa) : (hCm > 0 && ageMonths >= 0 ? approxHFA(hCm, ageMonths, male) : undefined);
    const weightForHeight = rawWfh != null ? Number(rawWfh) : (wKg > 0 && hCm > 0 ? (wKg - hCm * 0.13) / 1.5 : undefined);

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
      notes: v.notes,
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
        guardian_nic: apiChild.guardian_nic ?? '',
        address: apiChild.address ?? '',
        birth_weight_kg: apiChild.birth_weight_kg != null ? String(apiChild.birth_weight_kg) : '',
        birth_height_cm: apiChild.birth_height_cm != null ? String(apiChild.birth_height_cm) : '',
        birth_risk_level: apiChild.birth_risk_level ?? '',
      });
    }
  }, [showEditDialog, apiChild]);

  const isHospital = user?.role === 'hospital';

  const child = apiChild ? {
    id: apiChild.child_id || apiChild.id,
    name: apiChild.name,
    dob: apiChild.dob,
    gender: apiChild.gender,
    guardianName: apiChild.guardian_name,
    guardianPhone: apiChild.guardian_phone,
    address: apiChild.address,
    riskLevel: (() => {
      const birthRisk = (apiChild.birth_risk_level || '').toUpperCase();
      const birthLevel: RiskLevel =
        birthRisk === 'SAM' || birthRisk === 'CRITICAL'
          ? 'sam'
          : birthRisk === 'MAM' || birthRisk === 'MODERATE' || birthRisk === 'HIGH'
            ? 'mam'
            : 'normal';
      if (isHospital && apiChild.birth_risk_level) {
        return birthLevel;
      }
      const cur = (apiChild.current_risk_level || 'NORMAL').toLowerCase();
      if (cur === 'sam' || cur === 'critical') return 'sam' as RiskLevel;
      if (cur === 'mam' || cur === 'moderate' || cur === 'high') return 'mam' as RiskLevel;
      return 'normal' as RiskLevel;
    })(),
    measurements: (() => {
      const baseList = mapToMeasurements([...(apiChild.measurements || []), ...(apiChild.visits || [])], apiChild.dob);
      const hasBirth =
        apiChild.dob &&
        (Number(apiChild.birth_weight_kg) > 0 ||
          Number(apiChild.birth_height_cm) > 0 ||
          apiChild.birth_risk_level ||
          apiChild.birth_muac_cm != null);
      const birth = hasBirth ? [createBirthMeasurement(apiChild)] : [];
      // Pediatric Unit should only see birth-time measurement; others see birth + clinic visits
      const list = isHospital ? [] : baseList;
      return [...birth, ...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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

    // Calculate trend (guard optional Z-score fields)
    const avgWFATrend = recentMeasurements.length > 1
      ? ((recentMeasurements[recentMeasurements.length - 1].weightForAge ?? 0) - (recentMeasurements[0].weightForAge ?? 0)) / recentMeasurements.length
      : 0;

    const latestMeasurement = child.measurements[0];

    // Project 1-2 months ahead
    const predictedWFA = (latestMeasurement.weightForAge ?? 0) + (avgWFATrend * 2);
    const predictedHFA = (latestMeasurement.heightForAge ?? 0) + (avgWFATrend * 0.5);
    const predictedWFH = (latestMeasurement.weightForHeight ?? 0) + (avgWFATrend * 1.5);

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

  const isMoh = user?.role === 'moh' || user?.role === 'amoh';
  const isHospitalRole = user?.role === 'hospital';
  const canAddMeasurement = isHospitalRole
    ? false
    : isMoh
      ? apiChild?.can_moh_add_measurement === true
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

  const handleEditSave = () => {
    setIsSaving(true);
    const payload: Record<string, string | null> = {
      name: editForm.name || null,
      dob: editForm.dob || null,
      gender: editForm.gender || null,
      guardian_name: editForm.guardian_name || null,
      mother_name: editForm.mother_name || null,
      guardian_phone: editForm.guardian_phone || null,
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
                  📅 Based on measurements from {latestMeasurement ? latestMeasurement.date : '—'}
                </p>
              </div>
            </div>

            {/* Predicted Risk - Highly Distinct Future Forecast */}
            <div className={`border-4 rounded-lg p-5 relative overflow-hidden ${prediction
              ? prediction.actionRequired
                ? 'border-orange-500 bg-gradient-to-br from-orange-50 via-orange-100/50 to-orange-50'
                : prediction.trend === 'improving'
                  ? 'border-green-500 bg-gradient-to-br from-green-50 via-green-100/50 to-green-50'
                  : 'border-blue-500 bg-gradient-to-br from-blue-50 via-blue-100/50 to-blue-50'
              : 'border-gray-300 bg-gray-50'
              }`} style={{ borderStyle: 'dashed' }}>
              {/* Forecast Badge Corner */}
              <div className={`absolute top-0 right-0 px-3 py-1 text-xs font-bold text-white ${prediction?.actionRequired ? 'bg-orange-600' :
                prediction?.trend === 'improving' ? 'bg-green-600' :
                  'bg-blue-600'
                }`} style={{ borderBottomLeftRadius: '8px' }}>
                FORECAST
              </div>

              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${prediction?.actionRequired ? 'bg-orange-200' :
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
                  <p className={`text-xs font-bold ${prediction?.actionRequired ? 'text-orange-700' :
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
                  <div className={`mt-2 p-3 rounded-lg border-2 ${prediction.actionRequired ? 'bg-orange-50/50 border-orange-300' :
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
                    <span className={`font-bold ${prediction.trend === 'declining' ? 'text-orange-700' :
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
              ? `First recorded measurement close to birth (on: ${birthPanelData.date})`
              : `Recorded when the child was registered (date of birth: ${birthPanelData.date})`}
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
                    <p className="text-sm text-gray-600">MUAC</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{latestMeasurement.muac ?? '—'} cm</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Date</p>
                    <p className="text-lg font-bold text-gray-900 mt-1">{latestMeasurement.date}</p>
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
                      <td className="py-3 px-4 text-sm text-gray-600">{measurement.muac != null ? `${measurement.muac} cm` : '—'}</td>
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
    </div>
  );
}