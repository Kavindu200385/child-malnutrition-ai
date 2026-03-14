/**
 * NutritionistTransferRequestsView
 * Shows pending transfer requests from the Pediatric Unit (Hospital) to the Nutritionist.
 * Nutritionist can Accept or Reject each request.
 * "View Child" expands an inline summary panel with full child details.
 */
import React, { useState, useEffect } from 'react';
import {
  AlertTriangle, CheckCircle, XCircle, User, Clock,
  ArrowRight, RefreshCw, ChevronDown, ChevronUp,
  Calendar, Activity, Weight, Ruler, Phone, MapPin,
} from 'lucide-react';
import { nutritionistAPI } from '../../services/api';
import { childrenAPI } from '../../services/api';
import { formatDate } from '../../utils/formatDate';
import { getDisplayRiskLevel } from '../../types';

interface TransferRequestItem {
  referral_id: number;
  child: any;
  referral: any;
  current_risk_level: string;
  birth_risk_level: string;
  escalation_status: string;
  last_measurement_date: string | null;
  referred_by: any;
  transfer_reason: string | null;
  transferred_at: string | null;
}

interface Props {
  onViewChild?: (childId: string) => void;
}

/** Shared pill button styles — matches Logout button */
const btnDark: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '8px',
  padding: '10px 20px', fontSize: '14px', fontWeight: '600',
  color: '#ffffff', background: '#1e293b', border: 'none',
  borderRadius: '9999px', boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
  cursor: 'pointer', transition: 'background 0.2s',
};
const btnGreen: React.CSSProperties = {
  ...btnDark, background: '#059669',
  boxShadow: '0 4px 12px rgba(5,150,105,0.3)',
};
const btnRed: React.CSSProperties = {
  ...btnDark, background: '#dc2626',
  boxShadow: '0 4px 12px rgba(220,38,38,0.3)',
};
const btnOutline: React.CSSProperties = {
  ...btnDark, background: 'transparent', color: '#1e293b',
  border: '2px solid #1e293b', boxShadow: 'none',
};
const btnDisabled: React.CSSProperties = { opacity: 0.5, cursor: 'not-allowed' };

/** Risk colour helper */
function riskColor(risk: string) {
  const r = (risk || '').toUpperCase();
  if (r === 'SAM') return { bg: '#dc2626', text: '#fff', light: '#fef2f2', border: '#fca5a5' };
  if (r === 'MAM') return { bg: '#f97316', text: '#fff', light: '#fff7ed', border: '#fed7aa' };
  return { bg: '#16a34a', text: '#fff', light: '#f0fdf4', border: '#bbf7d0' };
}

/** Inline child summary panel */
function ChildSummaryPanel({ childId, onClose }: { childId: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true);
    childrenAPI.get(childId)
      .then((res: any) => {
        if (res.data?.status === 'success') setData(res.data.child);
        else setErr(res.data?.message || 'Could not load child details');
      })
      .catch((e: any) => setErr(e.response?.data?.message || 'Failed to load child'))
      .finally(() => setLoading(false));
  }, [childId]);

  const panelStyle: React.CSSProperties = {
    marginTop: '16px',
    background: '#f8fafc',
    border: '2px solid #e2e8f0',
    borderRadius: '14px',
    overflow: 'hidden',
  };

  if (loading) return (
    <div style={panelStyle}>
      <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
        <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px', display: 'block' }} />
        Loading child summary…
      </div>
    </div>
  );

  if (err || !data) return (
    <div style={panelStyle}>
      <div style={{ padding: '16px', color: '#dc2626', fontSize: '14px' }}>{err || 'No data'}</div>
    </div>
  );

  const birthRisk = riskColor(data.birth_risk_level || '');
  const curRisk = riskColor(data.current_risk_level || '');
  const age = data.dob
    ? Math.floor((Date.now() - new Date(data.dob).getTime()) / (1000 * 60 * 60 * 24 * 30))
    : null;

  const row = (label: string, value: string | null | undefined) => value ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>{label}</span>
      <span style={{ fontSize: '13px', color: '#1e293b', fontWeight: '600', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
    </div>
  ) : null;

  return (
    <div style={panelStyle}>
      {/* Panel header */}
      <div style={{ background: '#1e293b', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: '700', fontSize: '15px' }}>Child Summary</span>
        <button
          onClick={onClose}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', padding: '4px 10px', fontSize: '13px', fontWeight: '600' }}
        >
          Close ✕
        </button>
      </div>

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Name + status badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px' }}>{data.name}</h3>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
              {data.child_id || data.child_unique_id || data.id}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ padding: '4px 14px', borderRadius: '9999px', fontSize: '12px', fontWeight: '700', background: riskColor(getDisplayRiskLevel(data)).bg, color: riskColor(getDisplayRiskLevel(data)).text }}>
              Risk: {getDisplayRiskLevel(data)}
            </span>
            <span style={{ padding: '4px 14px', borderRadius: '9999px', fontSize: '12px', fontWeight: '700', background: birthRisk.bg, color: birthRisk.text }}>
              Birth: {(data.birth_risk_level || 'N/A').toUpperCase()}
            </span>
            <span style={{ padding: '4px 14px', borderRadius: '9999px', fontSize: '12px', fontWeight: '700', background: curRisk.bg, color: curRisk.text }}>
              Current: {(data.current_risk_level || 'N/A').toUpperCase()}
            </span>
          </div>
        </div>

        {/* Two-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

          {/* Personal details */}
          <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Personal Details</p>
            {row('Date of Birth', data.dob)}
            {row('Age', age != null ? `${age} months` : null)}
            {row('Gender', data.gender ? data.gender.charAt(0).toUpperCase() + data.gender.slice(1) : null)}
            {row('Guardian', data.guardian_name)}
            {row('Mother', data.mother_name)}
            {row('Phone', data.guardian_phone)}
            {row('NIC', data.guardian_nic)}
            {data.address && (
              <div style={{ display: 'flex', gap: '6px', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500', flexShrink: 0 }}>Address</span>
                <span style={{ fontSize: '13px', color: '#1e293b', fontWeight: '600', marginLeft: 'auto', textAlign: 'right', maxWidth: '60%' }}>{data.address}</span>
              </div>
            )}
          </div>

          {/* Birth measurements */}
          <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Birth Measurements</p>
            {data.birth_weight_kg != null
              ? row('Weight at birth', `${data.birth_weight_kg} kg`)
              : <p style={{ fontSize: '13px', color: '#cbd5e1' }}>Weight: —</p>}
            {data.birth_height_cm != null
              ? row('Height at birth', `${data.birth_height_cm} cm`)
              : <p style={{ fontSize: '13px', color: '#cbd5e1' }}>Height: —</p>}
            {data.birth_muac_cm != null && row('MUAC at birth', `${data.birth_muac_cm} cm`)}

            {/* Latest measurement */}
            {data.measurements && data.measurements.length > 0 && (() => {
              const latest = [...data.measurements].sort((a: any, b: any) =>
                new Date(b.measurement_date || b.date).getTime() - new Date(a.measurement_date || a.date).getTime()
              )[0];
              return (
                <>
                  <p style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 8px' }}>Latest Measurement</p>
                  {row('Date', latest.measurement_date || latest.date)}
                  {latest.weight_kg != null && row('Weight', `${latest.weight_kg} kg`)}
                  {latest.height_cm != null && row('Height', `${latest.height_cm} cm`)}
                  {latest.muac_cm != null && row('MUAC', `${latest.muac_cm} cm`)}
                </>
              );
            })()}
          </div>
        </div>

        {/* Registration info */}
        <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Registration Info</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
            {row('Registration Date', data.registration_date ? formatDate(data.registration_date) : null)}
            {row('Registered By', data.registered_by_name || data.registered_by_username)}
            {row('Hospital', data.hospital_name)}
            {row('Area', data.area_name || data.phm_area_name)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function NutritionistTransferRequestsView({ onViewChild }: Props) {
  const [requests, setRequests] = useState<TransferRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [expandedChildId, setExpandedChildId] = useState<string | null>(null);

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = filter === 'ALL' ? { status: 'ALL' } : {};
      const res = await nutritionistAPI.getTransferRequests(params);
      if (res.data?.status === 'success') {
        setRequests(res.data.transfer_requests || []);
      } else {
        setError(res.data?.message || 'Failed to load transfer requests');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load transfer requests');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (referralId: number) => {
    setActionLoadingId(referralId);
    setActionError('');
    setActionSuccess('');
    try {
      const res = await nutritionistAPI.acceptTransferRequest(referralId, {});
      if (res.data?.status === 'success') {
        setActionSuccess('Transfer accepted. Child is now under your care.');
        setTimeout(() => setActionSuccess(''), 4000);
        load();
      } else {
        setActionError(res.data?.message || 'Failed to accept transfer');
      }
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to accept transfer');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (referralId: number) => {
    if (!rejectionReason.trim()) {
      setActionError('Please provide a rejection reason.');
      return;
    }
    setActionLoadingId(referralId);
    setActionError('');
    setActionSuccess('');
    try {
      const res = await nutritionistAPI.rejectTransferRequest(referralId, {
        rejection_reason: rejectionReason,
      });
      if (res.data?.status === 'success') {
        setActionSuccess('Transfer request rejected.');
        setRejectingId(null);
        setRejectionReason('');
        setTimeout(() => setActionSuccess(''), 4000);
        load();
      } else {
        setActionError(res.data?.message || 'Failed to reject transfer');
      }
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to reject transfer');
    } finally {
      setActionLoadingId(null);
    }
  };

  const pendingCount = requests.filter(r => r.referral?.status === 'PENDING').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Page Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>Transfer Requests</h2>
          <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
            Children referred from the Pediatric Unit requiring your review
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{ ...btnDark, ...(loading ? btnDisabled : {}) }}
          onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
          onMouseLeave={e => (e.currentTarget.style.background = '#1e293b')}
        >
          <RefreshCw size={16} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          Refresh
        </button>
      </div>

      {/* ── Filter Tabs ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '6px', width: 'fit-content', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {(['PENDING', 'ALL'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '600',
              border: 'none', cursor: 'pointer',
              background: filter === f ? '#1e293b' : 'transparent',
              color: filter === f ? '#fff' : '#6b7280',
              boxShadow: filter === f ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {f === 'PENDING' ? (
              <>
                <Clock size={13} />
                Pending
                {pendingCount > 0 && filter !== 'PENDING' && (
                  <span style={{ marginLeft: '4px', background: '#ef4444', color: '#fff', fontSize: '10px', fontWeight: '700', borderRadius: '9999px', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {pendingCount}
                  </span>
                )}
              </>
            ) : <>All Requests</>}
          </button>
        ))}
      </div>

      {/* ── Toasts ──────────────────────────────────────────────── */}
      {actionSuccess && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', borderRadius: '12px', padding: '12px 16px', fontSize: '14px', fontWeight: '500' }}>
          <CheckCircle size={18} style={{ color: '#16a34a', flexShrink: 0 }} />{actionSuccess}
        </div>
      )}
      {(actionError || error) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '12px', padding: '12px 16px', fontSize: '14px', fontWeight: '500' }}>
          <AlertTriangle size={18} style={{ color: '#dc2626', flexShrink: 0 }} />{actionError || error}
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────────── */}
      {loading && (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '64px', textAlign: 'center' }}>
          <RefreshCw size={32} style={{ color: '#d1d5db', margin: '0 auto 12px', display: 'block', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#9ca3af', fontSize: '14px' }}>Loading transfer requests…</p>
        </div>
      )}

      {/* ── Empty ───────────────────────────────────────────────── */}
      {!loading && requests.length === 0 && (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '64px', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', background: '#f3f4f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <CheckCircle size={28} style={{ color: '#9ca3af' }} />
          </div>
          <p style={{ fontWeight: '600', color: '#374151', margin: '0 0 4px' }}>No transfer requests</p>
          <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>
            {filter === 'PENDING' ? 'No pending requests from the Pediatric Unit.' : 'No transfer requests found.'}
          </p>
        </div>
      )}

      {/* ── Cards ───────────────────────────────────────────────── */}
      {!loading && requests.map((item) => {
        const child = item.child;
        const isPending = item.referral?.status === 'PENDING';
        const isActing = actionLoadingId === item.referral_id;
        const isRejectingThis = rejectingId === item.referral_id;
        const displayRiskObj = { ...child, current_risk_level: item.current_risk_level, birth_risk_level: item.birth_risk_level };
        const displayRiskStyle = riskColor(getDisplayRiskLevel(displayRiskObj));
        const birthRisk = riskColor(item.birth_risk_level);
        const curRisk = riskColor(item.current_risk_level);
        const childIdStr = String(child?.child_id || child?.child_unique_id || child?.id || '');
        const isExpanded = expandedChildId === childIdStr;

        return (
          <div
            key={item.referral_id}
            style={{
              background: '#fff', borderRadius: '16px',
              border: isPending ? '1px solid #fca5a5' : '1px solid #e5e7eb',
              borderLeft: isPending ? '4px solid #ef4444' : '1px solid #e5e7eb',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden',
            }}
          >
            {/* Strip */}
            {isPending ? (
              <div style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action Required — Pending Review</span>
              </div>
            ) : (
              <div style={{ background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={14} style={{ color: '#16a34a' }} />
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Reviewed{item.referral?.reviewed_at ? ` · ${formatDate(item.referral.reviewed_at)}` : ''}
                </span>
              </div>
            )}

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Child info row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={24} style={{ color: '#64748b' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#111827', margin: 0 }}>{child?.name || 'Unnamed Child'}</h3>
                      <span style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace', background: '#f3f4f6', padding: '2px 8px', borderRadius: '4px' }}>
                        {child?.child_unique_id || child?.child_id || '—'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600', background: displayRiskStyle.bg, color: displayRiskStyle.text }}>
                        Risk: {getDisplayRiskLevel(displayRiskObj)}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600', background: birthRisk.bg, color: birthRisk.text }}>
                        Birth: {(item.birth_risk_level || 'N/A').toUpperCase()}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600', background: curRisk.bg, color: curRisk.text }}>
                        Current: {(item.current_risk_level || 'N/A').toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '9999px', padding: '6px 16px', fontSize: '14px', fontWeight: '500', color: '#475569', whiteSpace: 'nowrap' }}>
                  <span style={{ color: '#4338ca', fontWeight: '600' }}>Pediatric Unit</span>
                  <ArrowRight size={14} style={{ color: '#94a3b8' }} />
                  <span style={{ color: '#1e293b', fontWeight: '600' }}>Nutritionist</span>
                </div>
              </div>

              {/* Meta grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                {[
                  { label: 'Referred By', value: item.referred_by?.name || item.referred_by?.username || '—' },
                  { label: 'Transferred On', value: item.transferred_at ? formatDate(item.transferred_at) : '—' },
                  { label: 'Date of Birth', value: child?.dob || '—' },
                  { label: 'Gender', value: child?.gender ? child.gender.charAt(0).toUpperCase() + child.gender.slice(1) : '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: '#f9fafb', borderRadius: '10px', padding: '12px' }}>
                    <p style={{ fontSize: '10px', color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>{label}</p>
                    <p style={{ fontSize: '14px', fontWeight: '500', color: '#1f2937', margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Transfer reason */}
              {item.transfer_reason && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 16px' }}>
                  <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                  <p style={{ fontSize: '14px', color: '#991b1b', margin: 0 }}>
                    <span style={{ fontWeight: '600' }}>Transfer Reason: </span>{item.transfer_reason}
                  </p>
                </div>
              )}

              {/* Action buttons */}
              {isPending && !isRejectingThis && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
                  {/* View Child — toggles inline summary */}
                  <button
                    onClick={() => setExpandedChildId(isExpanded ? null : childIdStr)}
                    style={{ ...btnDark }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#1e293b')}
                  >
                    {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    {isExpanded ? 'Hide Summary' : 'View Child'}
                  </button>
                  <button
                    onClick={() => handleAccept(item.referral_id)}
                    disabled={isActing}
                    style={{ ...btnGreen, ...(isActing ? btnDisabled : {}) }}
                    onMouseEnter={e => { if (!isActing) e.currentTarget.style.background = '#047857'; }}
                    onMouseLeave={e => { if (!isActing) e.currentTarget.style.background = '#059669'; }}
                  >
                    <CheckCircle size={16} />
                    {isActing ? 'Accepting…' : 'Accept Transfer'}
                  </button>
                  <button
                    onClick={() => { setRejectingId(item.referral_id); setRejectionReason(''); setActionError(''); }}
                    disabled={isActing}
                    style={{ ...btnRed, ...(isActing ? btnDisabled : {}) }}
                    onMouseEnter={e => { if (!isActing) e.currentTarget.style.background = '#b91c1c'; }}
                    onMouseLeave={e => { if (!isActing) e.currentTarget.style.background = '#dc2626'; }}
                  >
                    <XCircle size={16} />
                    Reject
                  </button>
                </div>
              )}

              {/* Inline child summary panel */}
              {isExpanded && (
                <ChildSummaryPanel
                  childId={childIdStr}
                  onClose={() => setExpandedChildId(null)}
                />
              )}

              {/* Rejection form */}
              {isPending && isRejectingThis && (
                <div style={{ background: '#fff7ed', border: '2px solid #fed7aa', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
                    Provide a reason for rejection <span style={{ color: '#ef4444' }}>*</span>
                  </p>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Enter the reason for rejecting this transfer…"
                    rows={3}
                    style={{ width: '100%', padding: '10px 12px', border: '2px solid #d1d5db', borderRadius: '10px', fontSize: '14px', resize: 'none', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <button
                      onClick={() => handleReject(item.referral_id)}
                      disabled={isActing}
                      style={{ ...btnRed, ...(isActing ? btnDisabled : {}) }}
                      onMouseEnter={e => { if (!isActing) e.currentTarget.style.background = '#b91c1c'; }}
                      onMouseLeave={e => { if (!isActing) e.currentTarget.style.background = '#dc2626'; }}
                    >
                      <XCircle size={16} />
                      {isActing ? 'Rejecting…' : 'Confirm Reject'}
                    </button>
                    <button
                      onClick={() => { setRejectingId(null); setRejectionReason(''); setActionError(''); }}
                      style={btnDark}
                      onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#1e293b')}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
