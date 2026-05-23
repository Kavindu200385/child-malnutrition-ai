import React, { useState, useEffect, useCallback } from 'react';
import { mohAPI } from '../../services/api';
import { getRiskLabel, getDisplayRiskLevelTyped } from '../../types';
import { ConfirmDialog, type ConfirmDialogState } from '../ui/ConfirmDialog';
import { RefreshCw } from 'lucide-react';

interface EscalatedChildrenViewProps {
  onViewChild?: (childId: string) => void;
}

export function EscalatedChildrenView({ onViewChild }: EscalatedChildrenViewProps) {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);

  // State for midwife-escalation inline review
  const [reviewChildId, setReviewChildId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  // State for nutritionist-return assign panel
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
      const res = await mohAPI.getEscalatedChildren();
      if (res.data?.status === 'success') setList(res.data.escalations || []);
      else setError(res.data?.message || 'Failed to load');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load');
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  // Auto-refresh every 30s so nutritionist returns appear without manual refresh
  useEffect(() => {
    const id = setInterval(() => load(true), 30000);
    return () => clearInterval(id);
  }, [load]);

  // ── Midwife escalation actions ───────────────────────────────────────────

  const handleReview = async (childId: number) => {
    setActionLoading(true);
    setError('');
    try {
      await mohAPI.reviewEscalation(childId, { review_notes: reviewNotes });
      setReviewChildId(null);
      setReviewNotes('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Review failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEscalateToNutritionist = (childId: number) => {
    setDialog({
      title: 'Escalate to Nutritionist',
      message: 'Escalate this child to the Nutritionist? The child will be referred to the hospital nutritionist for specialist care.',
      variant: 'warning',
      confirmLabel: 'Yes, Escalate',
      onConfirm: async () => {
        setActionLoading(true);
        setError('');
        try {
          await mohAPI.escalateToNutritionist(childId, {});
          load();
        } catch (err: any) {
          setError(err.response?.data?.message || 'Escalation failed');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleReturnToMidwife = (childId: number) => {
    setDialog({
      title: 'Return to Midwife',
      message: 'Return this child to midwife care? Risk will be downgraded to normal.',
      variant: 'info',
      confirmLabel: 'Yes, Return',
      onConfirm: async () => {
        setActionLoading(true);
        setError('');
        try {
          await mohAPI.returnToMidwife(childId);
          load();
        } catch (err: any) {
          setError(err.response?.data?.message || 'Action failed');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  // ── Nutritionist-return actions ──────────────────────────────────────────

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

  const handleAssignReturned = async (childId: number) => {
    setActionLoading(true);
    setError('');
    try {
      await mohAPI.assignReturnedChild(childId, {
        phm_area_id: selectedPhmAreaId || null,
        notes: assignNotes,
      });
      setAssignEscId(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleKeepUnderMoh = (childId: number) => {
    setDialog({
      title: 'Keep Under MOH',
      message: 'Accept this child under MOH care. You can escalate to nutritionist again if condition worsens.',
      variant: 'info',
      confirmLabel: 'Keep under MOH',
      onConfirm: async () => {
        setActionLoading(true);
        setError('');
        try {
          await mohAPI.assignReturnedChild(childId, { phm_area_id: null });
          load();
        } catch (err: any) {
          setError(err.response?.data?.message || 'Action failed');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  if (loading) return <div className="text-gray-600">Loading incoming children...</div>;

  const midwifeEscalations = list.filter((e) => e.from_role !== 'nutritionist');
  const nutritionistReturns = list.filter((e) => e.from_role === 'nutritionist');

  return (
    <div className="space-y-6">
      <ConfirmDialog state={dialog} onClose={() => setDialog(null)} />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Incoming Transfer Requests</h2>
          <p className="text-gray-600 mt-1">Children escalated from PHM/midwife and returned from Nutritionist</p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-full text-sm font-semibold hover:bg-slate-700 disabled:opacity-60 transition-colors"
        >
          <RefreshCw size={15} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {error && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {list.length === 0 && (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No pending transfer requests.</div>
      )}

      {/* ── Returned from Nutritionist ─────────────────────────────────── */}
      {nutritionistReturns.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-green-800 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
            Returned from Nutritionist ({nutritionistReturns.length})
          </h3>
          {nutritionistReturns.map((esc) => {
            const child = esc.child;
            const isAssigning = assignEscId === esc.id;
            return (
              <div key={esc.id} className="bg-white rounded-lg shadow p-5 border-l-4 border-green-400">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {child?.name || '—'} {child?.child_unique_id && <span className="text-gray-500 font-normal">({child.child_unique_id})</span>}
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      Current risk: <strong>{child ? getRiskLabel(getDisplayRiskLevelTyped(child)) : '—'}</strong>
                    </p>
                    {esc.reason && <p className="text-sm text-gray-500 mt-1 italic">"{esc.reason}"</p>}
                    <p className="text-xs text-gray-400 mt-1">{new Date(esc.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {onViewChild && (
                      <button
                        onClick={() => onViewChild(String(child?.id))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        View profile
                      </button>
                    )}
                    {!isAssigning && (
                      <>
                        <button
                          onClick={() => openAssignPanel(esc.id)}
                          disabled={actionLoading}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          Assign to PHM
                        </button>
                        <button
                          onClick={() => handleKeepUnderMoh(child?.id)}
                          disabled={actionLoading}
                          className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
                        >
                          Keep under MOH
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isAssigning && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-3">
                    <p className="text-sm font-medium text-blue-900">Select a PHM area to assign this child to a midwife:</p>
                    {areasLoading ? (
                      <p className="text-sm text-gray-500">Loading areas...</p>
                    ) : (
                      <select
                        value={selectedPhmAreaId}
                        onChange={(e) => setSelectedPhmAreaId(e.target.value ? Number(e.target.value) : '')}
                        className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">— Select PHM area —</option>
                        {phmAreas.map((a: any) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    )}
                    <input
                      placeholder="Optional notes"
                      value={assignNotes}
                      onChange={(e) => setAssignNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAssignReturned(child?.id)}
                        disabled={actionLoading || !selectedPhmAreaId}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {actionLoading ? 'Assigning…' : 'Confirm Assign'}
                      </button>
                      <button
                        onClick={() => setAssignEscId(null)}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
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

      {/* ── Escalated from PHM/Midwife ─────────────────────────────────── */}
      {midwifeEscalations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-red-800 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
            Escalated from PHM/Midwife ({midwifeEscalations.length})
          </h3>
          {midwifeEscalations.map((esc) => {
            const child = esc.child;
            const isReviewing = reviewChildId === child?.id;
            return (
              <div key={esc.id} className="bg-white rounded-lg shadow p-5 border-l-4 border-red-300">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {child?.name || '—'} {child?.child_unique_id && <span className="text-gray-500 font-normal">({child.child_unique_id})</span>}
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      Risk: <strong>{child ? getRiskLabel(getDisplayRiskLevelTyped(child)) : '—'}</strong>
                      {esc.previous_risk_level && esc.new_risk_level && ` • ${esc.previous_risk_level} → ${esc.new_risk_level}`}
                    </p>
                    {esc.reason && <p className="text-sm text-gray-500 mt-1">{esc.reason}</p>}
                    <p className="text-xs text-gray-400 mt-1">{new Date(esc.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {onViewChild && (
                      <button
                        onClick={() => onViewChild(String(child?.id))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        View profile
                      </button>
                    )}
                    {!isReviewing ? (
                      <button
                        onClick={() => setReviewChildId(child?.id)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                      >
                        Review
                      </button>
                    ) : (
                      <>
                        <input
                          placeholder="Clinical notes"
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 min-w-[180px]"
                        />
                        <button
                          onClick={() => handleReview(child?.id)}
                          disabled={actionLoading}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading ? 'Saving…' : 'Mark reviewed'}
                        </button>
                        <button
                          onClick={() => { setReviewChildId(null); setReviewNotes(''); }}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleEscalateToNutritionist(child?.id)}
                      disabled={actionLoading}
                      className="px-4 py-2 border border-red-300 rounded-lg text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      To Nutritionist
                    </button>
                    <button
                      onClick={() => handleReturnToMidwife(child?.id)}
                      disabled={actionLoading}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      Return to Midwife
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
