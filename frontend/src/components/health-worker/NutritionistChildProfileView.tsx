import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, User, PlusCircle, AlertTriangle, Activity, Calendar, Phone, MapPin, TrendingUp,
} from 'lucide-react';
import { nutritionistAPI } from '../../services/api';
import { formatDate } from '../../utils/formatDate';
import { getRiskColor, getRiskLabel, type RiskLevel } from '../../types';
import { WHOGrowthCharts } from './WHOGrowthCharts';

interface NutritionistChildProfileViewProps {
  childId: string;
  onBack: () => void;
  onAddMeasurement: (childId: string) => void;
}

/** Map nutritionist API measurements to WHOGrowthCharts format */
function mapToChartMeasurements(
  measurements: any[],
  dob: string | null
): { id: string; date: string; ageMonths: number; weight: number; height: number; muac?: number; weightForAge?: number; heightForAge?: number; weightForHeight?: number; riskLevel: RiskLevel; notes?: string }[] {
  if (!measurements?.length) return [];
  const dobDate = dob ? new Date(dob) : null;
  return measurements.map((m) => {
    const dateStr = m.measurement_date || '';
    const visitDate = dateStr ? new Date(dateStr) : new Date();
    const ageMonths = dobDate ? Math.max(0, Math.floor((visitDate.getTime() - dobDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44))) : 0;
    const r = (m.risk_level || 'NORMAL').toUpperCase();
    const riskLevel: RiskLevel = r === 'SAM' ? 'sam' : r === 'MAM' ? 'mam' : 'normal';
    return {
      id: String(m.id),
      date: dateStr.slice(0, 10),
      ageMonths,
      weight: Number(m.weight_kg) || 0,
      height: Number(m.height_cm) || 0,
      muac: m.muac_cm != null ? Number(m.muac_cm) : undefined,
      weightForAge: m.z_score_wfa != null ? Number(m.z_score_wfa) : undefined,
      heightForAge: m.z_score_hfa != null ? Number(m.z_score_hfa) : undefined,
      weightForHeight: m.z_score_wfh != null ? Number(m.z_score_wfh) : undefined,
      riskLevel,
      notes: m.notes,
    };
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Create a birth measurement entry for charts */
function createBirthMeasurement(child: any): { id: string; date: string; ageMonths: number; weight: number; height: number; weightForAge?: number; heightForAge?: number; weightForHeight?: number; riskLevel: RiskLevel; notes?: string } | null {
  const dob = child.dob;
  if (!dob) return null;
  const hasBirth = (child.birth_weight_kg != null && Number(child.birth_weight_kg) > 0) ||
    (child.birth_height_cm != null && Number(child.birth_height_cm) > 0) || child.birth_risk_level;
  if (!hasBirth) return null;
  const birthRisk = (child.birth_risk_level || 'NORMAL').toUpperCase();
  const riskLevel: RiskLevel = birthRisk === 'SAM' ? 'sam' : birthRisk === 'MAM' ? 'mam' : 'normal';
  const weight = Number(child.birth_weight_kg) || 0;
  const height = Number(child.birth_height_cm) || 0;
  return {
    id: 'birth',
    date: dob.slice(0, 10),
    ageMonths: 0,
    weight,
    height,
    weightForAge: weight > 0 ? undefined : undefined,
    heightForAge: height > 0 ? undefined : undefined,
    weightForHeight: undefined,
    riskLevel,
    notes: 'Birth',
  };
}

export function NutritionistChildProfileView({ childId, onBack, onAddMeasurement }: NutritionistChildProfileViewProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [returning, setReturning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await nutritionistAPI.getChild(childId);
      if (res.data?.status === 'success') setData(res.data);
      else setError(res.data?.message || 'Failed to load');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load child');
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    load();
  }, [load]);

  // Live refresh so risk status and measurements update automatically
  useEffect(() => {
    const id = setInterval(() => {
      load();
    }, 30000);
    return () => clearInterval(id);
  }, [load]);

  const handleReturnToMoh = async () => {
    setReturning(true);
    try {
      await nutritionistAPI.returnToMoh(Number(childId));
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Return to MOH failed');
    } finally {
      setReturning(false);
    }
  };

  if (loading) return <div className="text-gray-600">Loading...</div>;
  if (error) {
    return (
      <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
        <p className="text-sm text-red-900">{error}</p>
        <button onClick={onBack} className="mt-3 text-slate-700 hover:underline">Go back</button>
      </div>
    );
  }
  if (!data?.child) return null;

  const child = data.child;
  const chartMeasurements = mapToChartMeasurements(data.measurements || [], child.dob);
  const birthMeas = createBirthMeasurement(child);
  const hasClinicMeasurements = chartMeasurements.length > 0;

  // When we only have birth data (no clinic measurements), show birth risk as current status.
  // Otherwise current_risk_level can be wrong (e.g. NORMAL) when birth was actually SAM.
  const birthRiskRaw = (child.birth_risk_level || '').toUpperCase();
  const birthRiskLevel: RiskLevel = birthRiskRaw === 'SAM' ? 'sam' : birthRiskRaw === 'MAM' ? 'mam' : 'normal';
  const currentRiskRaw = (child.current_risk_level || 'NORMAL').toUpperCase();
  const currentRiskFromDb: RiskLevel = currentRiskRaw === 'SAM' ? 'sam' : currentRiskRaw === 'MAM' ? 'mam' : 'normal';

  const riskLevel: RiskLevel = !hasClinicMeasurements && birthMeas ? birthRiskLevel : currentRiskFromDb;
  const isNormal = riskLevel === 'normal';
  const statusBasedOnBirthOnly = !hasClinicMeasurements && birthMeas;
  const allMeasurements = birthMeas ? [birthMeas, ...chartMeasurements] : chartMeasurements;
  const sortedForCharts = [...allMeasurements].sort((a, b) => a.ageMonths - b.ageMonths);
  const historySorted = [...allMeasurements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const latestMeasurement = chartMeasurements[0] ?? birthMeas;

  const ageDisplay = child.dob
    ? (() => {
      const totalMonths = Math.floor((Date.now() - new Date(child.dob).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
      const years = Math.floor(totalMonths / 12);
      const months = totalMonths % 12;
      if (totalMonths < 1) return `${Math.floor((Date.now() - new Date(child.dob).getTime()) / (1000 * 60 * 60 * 24))} days (0 months)`;
      if (years > 0) return `${years} yr ${months} mo (${totalMonths} months)`;
      return `${totalMonths} months`;
    })()
    : '—';

  const childGender: 'male' | 'female' = (child.gender || 'male').toString().toLowerCase() === 'female' ? 'female' : 'male';

  const btnDark: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '8px',
    padding: '10px 20px', fontSize: '14px', fontWeight: 600,
    color: '#fff', background: '#1e293b', border: 'none',
    borderRadius: '9999px', boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
    cursor: 'pointer', transition: 'background 0.2s',
  };
  const btnPrimary: React.CSSProperties = { ...btnDark, background: '#0369a1', boxShadow: '0 4px 12px rgba(3,105,161,0.3)' };
  const btnGreen: React.CSSProperties = { ...btnDark, background: '#059669', boxShadow: '0 4px 12px rgba(5,150,105,0.3)' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <button onClick={onBack} className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-gray-900">{child.name || child.child_id || child.child_unique_id}</h2>
          <p className="text-gray-600">Child ID: {child.child_unique_id || child.child_id || childId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onAddMeasurement(childId)} style={btnPrimary} onMouseEnter={e => (e.currentTarget.style.background = '#0284c7')} onMouseLeave={e => (e.currentTarget.style.background = '#0369a1')}>
            <PlusCircle className="w-5 h-5" />
            Add Measurement
          </button>
          {isNormal && (
            <button onClick={handleReturnToMoh} disabled={returning} style={{ ...btnGreen, opacity: returning ? 0.7 : 1 }} onMouseEnter={e => { if (!returning) e.currentTarget.style.background = '#047857'; }} onMouseLeave={e => (e.currentTarget.style.background = '#059669')}>
              <ArrowLeft className="w-5 h-5" />
              {returning ? 'Returning…' : 'Return to MOH'}
            </button>
          )}
        </div>
      </div>

      {/* Nutritional Status Overview */}
      <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-gray-200">
        <h3 className="text-base font-bold text-gray-900 mb-4">Nutritional Status Overview</h3>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-gray-500" />
            <span className="text-sm font-bold text-gray-900">Current Status</span>
          </div>
          <span className="inline-block px-4 py-3 rounded-lg text-base font-bold text-white shadow-sm" style={{ backgroundColor: getRiskColor(riskLevel) }}>
            {getRiskLabel(riskLevel)}
          </span>
          {latestMeasurement && (
            <p className="text-xs text-gray-600">
              {statusBasedOnBirthOnly ? 'Based on birth assessment' : `Based on measurements from ${formatDate(latestMeasurement.date)}`}
            </p>
          )}
        </div>
      </div>

      {/* Basic Information */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <p className="text-sm text-gray-600">Full Name</p>
              <p className="font-medium text-gray-900">{child.name || '—'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <p className="text-sm text-gray-600">Date of Birth / Age</p>
              <p className="font-medium text-gray-900">{child.dob ? `${formatDate(child.dob)} (${ageDisplay})` : '—'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Activity className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <p className="text-sm text-gray-600">Gender</p>
              <p className="font-medium text-gray-900">{child.gender === 'male' ? 'Male' : child.gender === 'female' ? 'Female' : child.gender || '—'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <p className="text-sm text-gray-600">Current Status</p>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-medium text-white mt-1" style={{ backgroundColor: getRiskColor(riskLevel) }}>{getRiskLabel(riskLevel)}</span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <p className="text-sm text-gray-600">Guardian Name</p>
              <p className="font-medium text-gray-900">{child.guardian_name || '—'}</p>
            </div>
          </div>
          {child.mother_name && (
            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-gray-400 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Mother Name</p>
                <p className="font-medium text-gray-900">{child.mother_name}</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <p className="text-sm text-gray-600">Guardian Phone</p>
              <p className="font-medium text-gray-900">{child.guardian_phone || '—'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 md:col-span-2">
            <MapPin className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <p className="text-sm text-gray-600">Address</p>
              <p className="font-medium text-gray-900">{child.address || '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Measurements at birth */}
      {(child.birth_weight_kg != null || child.birth_height_cm != null || child.birth_risk_level) && (
        <div className="bg-white rounded-lg shadow p-6 border-2 border-amber-200 bg-amber-50/30">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Measurements at birth</h3>
          <p className="text-sm text-gray-600 mb-4">Recorded at registration (DOB: {child.dob ? formatDate(child.dob) : '—'})</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-4 border border-amber-200">
              <p className="text-sm text-gray-600">Weight</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{child.birth_weight_kg != null ? `${child.birth_weight_kg} kg` : '—'}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-amber-200">
              <p className="text-sm text-gray-600">Length / height</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{child.birth_height_cm != null ? `${child.birth_height_cm} cm` : '—'}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-amber-200">
              <p className="text-sm text-gray-600">MUAC</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{child.birth_muac_cm != null ? `${child.birth_muac_cm} cm` : '—'}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-amber-200">
              <p className="text-sm text-gray-600">Birth risk</p>
              <p className="mt-1">
                {child.birth_risk_level ? (
                  <span className="inline-block px-3 py-1 rounded-full text-sm font-medium text-white" style={{ backgroundColor: getRiskColor((child.birth_risk_level === 'SAM' ? 'sam' : child.birth_risk_level === 'MAM' ? 'mam' : 'normal') as RiskLevel) }}>{child.birth_risk_level}</span>
                ) : <span className="text-gray-500">—</span>}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Latest Measurements */}
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
                <p className={`text-2xl font-bold mt-1 ${(latestMeasurement.weightForAge ?? 0) < -2 ? 'text-red-600' : 'text-green-600'}`}>{(latestMeasurement.weightForAge ?? 0).toFixed(2)}</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-600">Height-for-Age Z-score</p>
                <p className={`text-2xl font-bold mt-1 ${(latestMeasurement.heightForAge ?? 0) < -2 ? 'text-red-600' : 'text-green-600'}`}>{(latestMeasurement.heightForAge ?? 0).toFixed(2)}</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-600">Weight-for-Height Z-score</p>
                <p className={`text-2xl font-bold mt-1 ${(latestMeasurement.weightForHeight ?? 0) < -2 ? 'text-red-600' : 'text-green-600'}`}>{(latestMeasurement.weightForHeight ?? 0).toFixed(2)}</p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-gray-500 py-4">No measurements recorded yet. Use &quot;Add Measurement&quot; to record the first visit.</p>
        )}
      </div>

      {/* WHO Growth Charts */}
      {sortedForCharts.some(m => m.weight > 0 || m.height > 0) && (
        <WHOGrowthCharts measurements={sortedForCharts} childGender={childGender} />
      )}

      {/* Measurement History */}
      {(data.measurements?.length > 0 || birthMeas) && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Measurement History</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Date</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Weight</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Height</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">MUAC</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Risk</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historySorted.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 text-sm text-gray-900">{m.date}</td>
                    <td className="px-4 py-2 text-sm">{m.weight} kg</td>
                    <td className="px-4 py-2 text-sm">{m.height} cm</td>
                    <td className="px-4 py-2 text-sm">{m.muac ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs text-white ${m.riskLevel === 'sam' ? 'bg-red-500' : m.riskLevel === 'mam' ? 'bg-yellow-500' : 'bg-green-500'}`}>{getRiskLabel(m.riskLevel)}</span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">{m.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Referral history */}
      {data.referrals?.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Referral history</h3>
          <ul className="space-y-2">
            {data.referrals.map((r: any) => (
              <li key={r.id} className="text-sm text-gray-700 border-l-2 border-slate-300 pl-3">
                {r.created_at?.slice(0, 10)} — {r.referral_reason || 'Referred'} — Status: {r.status}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Nutritionist review log */}
      {data.review_logs?.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Nutritionist review log</h3>
          <ul className="space-y-2">
            {data.review_logs.map((log: any) => (
              <li key={log.id} className="flex items-center gap-2 text-sm text-gray-700 border-l-2 border-blue-200 pl-3">
                <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="font-medium">{log.reviewed_at?.slice(0, 16).replace('T', ' ')}</span>
                <span className="text-gray-500">— reviewed by</span>
                <span className="font-medium text-blue-700">{log.reviewed_by_name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risk alert when not normal */}
      {riskLevel !== 'normal' && (
        <div className={`rounded-lg p-6 border-2 ${riskLevel === 'sam' ? 'bg-red-50 border-red-300' : 'bg-yellow-50 border-yellow-300'}`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={`w-6 h-6 flex-shrink-0 mt-1 ${riskLevel === 'sam' ? 'text-red-600' : 'text-yellow-600'}`} />
            <div>
              <h3 className={`text-lg font-bold ${riskLevel === 'sam' ? 'text-red-900' : 'text-yellow-900'}`}>{getRiskLabel(riskLevel)}</h3>
              <p className={`mt-1 ${riskLevel === 'sam' ? 'text-red-800' : 'text-yellow-800'}`}>
                {riskLevel === 'sam' ? 'Immediate medical intervention and nutritional support required.' : 'Nutritional supplementation and regular monitoring recommended.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
