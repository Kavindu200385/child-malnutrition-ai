import React, { useState, useEffect, useCallback } from 'react';
import { mohAPI } from '../../services/api';
import { ConfirmDialog, type ConfirmDialogState } from '../ui/ConfirmDialog';
import { RefreshCw } from 'lucide-react';

interface EscalatedChildrenViewProps {
  onViewChild?: (childId: string) => void;
}

type Tab = 'all' | 'pending' | 'approved' | 'rejected' | 'sent';

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'sent', label: 'Sent' },
];

const RISK_BADGE: Record<string, string> = {
  SAM: 'bg-red-600 text-white',
  MAM: 'bg-yellow-500 text-white',
  NORMAL: 'bg-green-600 text-white',
};

function riskBadge(risk: string) {
  return RISK_BADGE[(risk || '').toUpperCase()] ?? 'bg-gray-400 text-white';
}

export function EscalatedChildrenView({ onViewChild }: EscalatedChildrenViewProps) {
  const [incoming, setIncoming] = useState<any[]>([]);
  const [sent, setSent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    try { return (localStorage.getItem('moh_escalated_tab') as Tab) || 'pending'; } catch { return 'pending'; }
  });

  // Assign-to-PHM panel state
  const [assignEscId, setAssignEscId] = useState<number | null>(null);
  const [phmAreas, setPhmAreas] = useState<any[]>([]);
  const [selectedPhmAreaId, setSelectedPhmAreaId] = useState<number | ''>('');
  const [assignNotes, setAssignNotes] = useState('');
  const [areasLoading, setAreasLoading] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const res = await mohAPI.getAllTransfers();
      if (res.data?.status === 'success') {
        setIncoming(res.data.incoming || []);
        setSent(res.data.sent || []);
      } else {
        setError(res.data?.message || 'Failed to load');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load transfers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);
  useEffect(() => {
    const id = setInterval(() => load(true), 30000);
    return () => clearInterval(id);
  }, [load]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleAcceptMidwife = (esc: any) => {
    const child = esc.child;
    setDialog({
      title: 'Accept Child to MOH Care',
      message: `Accept ${child?.name || child?.child_unique_id} under your direct MOH supervision?`,
      variant: 'info',
      confirmLabel: 'Yes, Accept',
      onConfirm: async () => {
        setActionLoading(esc.id);
        try {
          await mohAPI.acceptEscalation(esc.id);
          load(true);
        } catch (err: any) {
          setError(err.response?.data?.message || 'Accept failed');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleRejectEscalation = (esc: any) => {
    const child = esc.child;
    const backTo = esc.from_role === 'nutritionist' ? 'Nutritionist' : 'Midwife';
    setDialog({
      title: 'Reject Transfer',
      message: `Reject this transfer? ${child?.name || child?.child_unique_id} will remain with the ${backTo}.`,
      variant: 'warning',
      confirmLabel: 'Yes, Reject',
      onConfirm: async () => {
        setActionLoading(esc.id);
        try {
          await mohAPI.rejectEscalation(esc.id, {});
          load(true);
        } catch (err: any) {
          setError(err.response?.data?.message || 'Reject failed');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleEscalateToNutritionist = (esc: any) => {
    const child = esc.child;
    setDialog({
      title: 'Escalate to Nutritionist',
      message: `Escalate ${child?.name || child?.child_unique_id} to the hospital Nutritionist for specialist care?`,
      variant: 'warning',
      confirmLabel: 'Yes, Escalate',
      onConfirm: async () => {
        setActionLoading(esc.id);
        try {
          await mohAPI.escalateToNutritionist(child.id, {});
          load(true);
        } catch (err: any) {
          setError(err.response?.data?.message || 'Escalation failed');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const openAssignPanel = async (escId: number) => {
    setAssignEscId(escId);
    setSelectedPhmAreaId('');
    setAssignNotes('');
    setAreasLoading(true);
    try {
      const res = await mohAPI.getAreas();
      if (res.data?.status === 'success') setPhmAreas(res.data.phm_areas || []);
    } catch {
      setPhmAreas([]);
    } finally {
      setAreasLoading(false);
    }
  };

  const handleAssignToPHM = async (childId: number) => {
    setActionLoading(childId);
    setError('');
    try {
      await mohAPI.assignReturnedChild(childId, {
        phm_area_id: selectedPhmAreaId || null,
        notes: assignNotes,
      });
      setAssignEscId(null);
      load(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Assignment failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleKeepUnderMoh = (childId: number) => {
    setDialog({
      title: 'Keep Under MOH',
      message: 'Accept this child under MOH care. You can transfer to a PHM area later.',
      variant: 'info',
      confirmLabel: 'Keep Under MOH',
      onConfirm: async () => {
        setActionLoading(childId);
        try {
          await mohAPI.assignReturnedChild(childId, { phm_area_id: null });
          load(true);
        } catch (err: any) {
          setError(err.response?.data?.message || 'Action failed');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  // ── Tab counts ────────────────────────────────────────────────────────────

  const pendingCount = incoming.filter((e) => e.status === 'PENDING').length;
  const approvedCount = incoming.filter((e) => e.status === 'REVIEWED').length;
  const rejectedCount = incoming.filter((e) => e.status === 'REJECTED').length;

  const tabCount = (id: Tab) => {
    if (id === 'pending') return pendingCount;
    if (id === 'approved') return approvedCount;
    if (id === 'rejected') return rejectedCount;
    if (id === 'sent') return sent.length;
    return incoming.length + sent.length;
  };

  const filteredIncoming = incoming.filter((e) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return e.status === 'PENDING';
    if (activeTab === 'approved') return e.status === 'REVIEWED';
    if (activeTab === 'rejected') return e.status === 'REJECTED';
    return false;
  });

  if (loading) return <div className="text-gray-600 py-8 text-center">Loading transfer requests...</div>;

  return (
    <div className="space-y-6">
      <ConfirmDialog state={dialog} onClose={() => setDialog(null)} />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Incoming Transfers</h2>
          <p className="text-gray-600 mt-1">
            Children sent from Midwife or returned from Nutritionist, and transfers you have sent out.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 text-white rounded-full text-sm font-semibold hover:bg-teal-800 disabled:opacity-60 transition-colors"
        >
          <RefreshCw size={15} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {error && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Tabs — pill style matching site */}
      <div style={{ display: 'flex', gap: '6px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '6px', width: 'fit-content', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tabCount(tab.id);
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); try { localStorage.setItem('moh_escalated_tab', tab.id); } catch {} }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '7px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
                border: 'none', cursor: 'pointer',
                background: isActive ? '#0f766e' : 'transparent',
                color: isActive ? '#fff' : '#6b7280',
                boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
              {count > 0 && (
                <span style={{
                  background: isActive ? 'rgba(255,255,255,0.25)' : (tab.id === 'pending' ? '#f59e0b' : '#d1d5db'),
                  color: isActive ? '#fff' : (tab.id === 'pending' ? '#fff' : '#374151'),
                  fontSize: '10px', fontWeight: '700', borderRadius: '9999px',
                  minWidth: '18px', height: '18px', display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Sent tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'sent' && (
        <div className="space-y-3">
          {sent.length === 0 && (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              No outgoing transfers yet.
            </div>
          )}
          {sent.map((ref) => {
            const child = ref.child;
            const risk = (child?.current_risk_level || 'NORMAL').toUpperCase();
            const statusColor = ref.status === 'PENDING'
              ? 'bg-amber-100 text-amber-800'
              : ref.status === 'REVIEWED'
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-700';
            return (
              <div key={ref.id} className="bg-white rounded-lg shadow p-5 border-l-4 border-teal-400">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{child?.name || '—'}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${riskBadge(risk)}`}>{risk}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor}`}>
                        {ref.status === 'REVIEWED' ? 'Accepted' : ref.status === 'REJECTED' ? 'Rejected' : 'Pending'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800">→ Nutritionist</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">ID: {child?.child_unique_id || '—'}</p>
                    {ref.referral_reason && <p className="text-sm text-gray-500 mt-0.5 italic">"{ref.referral_reason}"</p>}
                    <p className="text-xs text-gray-400 mt-1">{new Date(ref.created_at).toLocaleString()}</p>
                  </div>
                  {onViewChild && child && (
                    <button
                      onClick={() => onViewChild(String(child.id))}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      View
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Incoming tabs (All / Pending / Approved / Rejected) ───────────── */}
      {activeTab !== 'sent' && (
        <div className="space-y-3">
          {filteredIncoming.length === 0 && (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              {activeTab === 'pending' ? 'No pending transfer requests.'
                : activeTab === 'approved' ? 'No approved transfers.'
                  : activeTab === 'rejected' ? 'No rejected transfers.'
                    : 'No transfer records found.'}
            </div>
          )}

          {filteredIncoming.map((esc) => {
            const child = esc.child;
            const risk = (child?.current_risk_level || 'NORMAL').toUpperCase();
            const isPending = String(esc.status) === 'PENDING';
            const fromNutritionist = String(esc.from_role) === 'nutritionist';
            const isAssigning = assignEscId === esc.id;
            const isActing = actionLoading === esc.id || actionLoading === child?.id;

            const borderColor = esc.status === 'REJECTED'
              ? 'border-red-300'
              : esc.status === 'REVIEWED'
                ? 'border-green-400'
                : fromNutritionist
                  ? 'border-blue-400'
                  : 'border-amber-400';

            const statusLabel = esc.status === 'REVIEWED' ? 'Approved' : esc.status === 'REJECTED' ? 'Rejected' : 'Pending';
            const statusCls = esc.status === 'REVIEWED'
              ? 'bg-green-100 text-green-800'
              : esc.status === 'REJECTED'
                ? 'bg-red-100 text-red-800'
                : 'bg-amber-100 text-amber-800';

            return (
              <div key={esc.id} className={`bg-white rounded-lg shadow p-5 border-l-4 ${borderColor}`}>
                {/* Info + buttons side by side */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-lg">{child?.name || '—'}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${riskBadge(risk)}`}>{risk}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusCls}`}>{statusLabel}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                        {fromNutritionist ? 'From Nutritionist' : 'From Midwife'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">ID: {child?.child_unique_id || '—'}</p>
                    {esc.reason && <p className="text-sm text-gray-500 mt-0.5 italic">"{esc.reason}"</p>}
                    <p className="text-xs text-gray-400 mt-1">{new Date(esc.created_at).toLocaleString()}</p>
                  </div>

                  {/* Right: action buttons */}
                  {!isAssigning && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-start', paddingTop: '4px' }}>
                      {onViewChild && child && (
                        <button
                          onClick={() => onViewChild(String(child.id))}
                          style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: '500', color: '#374151', background: '#fff', cursor: 'pointer' }}
                        >
                          View
                        </button>
                      )}
                      {/* Accept — midwife pending */}
                      {isPending && !fromNutritionist && (
                        <button
                          onClick={() => handleAcceptMidwife(esc)}
                          disabled={isActing}
                          style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', color: '#fff', background: isActing ? '#9ca3af' : '#0d9488', cursor: isActing ? 'not-allowed' : 'pointer', opacity: isActing ? 0.7 : 1 }}
                        >
                          {isActing ? 'Accepting…' : 'Accept'}
                        </button>
                      )}
                      {/* Escalate to Nutritionist — midwife pending */}
                      {isPending && !fromNutritionist && (
                        <button
                          onClick={() => handleEscalateToNutritionist(esc)}
                          disabled={isActing}
                          style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', color: '#fff', background: isActing ? '#9ca3af' : '#ea580c', cursor: isActing ? 'not-allowed' : 'pointer', opacity: isActing ? 0.7 : 1 }}
                        >
                          Escalate to Nutritionist
                        </button>
                      )}
                      {/* Transfer to PHM — nutritionist pending */}
                      {isPending && fromNutritionist && (
                        <button
                          onClick={() => openAssignPanel(esc.id)}
                          disabled={isActing}
                          style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', color: '#fff', background: isActing ? '#9ca3af' : '#0d9488', cursor: isActing ? 'not-allowed' : 'pointer', opacity: isActing ? 0.7 : 1 }}
                        >
                          Transfer to PHM
                        </button>
                      )}
                      {/* Keep Under MOH — nutritionist pending */}
                      {isPending && fromNutritionist && (
                        <button
                          onClick={() => handleKeepUnderMoh(child?.id)}
                          disabled={isActing}
                          style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', color: '#fff', background: isActing ? '#9ca3af' : '#475569', cursor: isActing ? 'not-allowed' : 'pointer', opacity: isActing ? 0.7 : 1 }}
                        >
                          Keep Under MOH
                        </button>
                      )}
                      {/* Reject — any pending */}
                      {isPending && (
                        <button
                          onClick={() => handleRejectEscalation(esc)}
                          disabled={isActing}
                          style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: '500', color: '#374151', background: '#fff', cursor: isActing ? 'not-allowed' : 'pointer', opacity: isActing ? 0.7 : 1 }}
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* PHM assign panel */}
                {isAssigning && (
                  <div style={{ marginTop: '16px', padding: '16px', background: '#f0fdfa', borderRadius: '10px', border: '1px solid #99f6e4', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#134e4a' }}>Select a PHM area to assign this child:</p>
                    {areasLoading ? (
                      <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Loading areas...</p>
                    ) : (
                      <select
                        value={selectedPhmAreaId}
                        onChange={(e) => setSelectedPhmAreaId(e.target.value ? Number(e.target.value) : '')}
                        style={{ width: '100%', maxWidth: '320px', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#111827', background: '#fff', outline: 'none' }}
                      >
                        <option value="">— Select PHM area —</option>
                        {phmAreas.map((a: any) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    )}
                    <input
                      type="text"
                      placeholder="Optional notes"
                      value={assignNotes}
                      onChange={(e) => setAssignNotes(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleAssignToPHM(child?.id)}
                        disabled={isActing || !selectedPhmAreaId}
                        style={{ padding: '9px 20px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: '#fff', background: isActing || !selectedPhmAreaId ? '#9ca3af' : '#0f766e', cursor: isActing || !selectedPhmAreaId ? 'not-allowed' : 'pointer' }}
                      >
                        {isActing ? 'Assigning…' : 'Confirm Assign'}
                      </button>
                      <button
                        onClick={() => setAssignEscId(null)}
                        style={{ padding: '9px 20px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: 500, color: '#374151', background: '#fff', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
