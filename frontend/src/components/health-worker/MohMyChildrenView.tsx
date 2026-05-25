import React, { useState, useEffect, useCallback } from 'react';
import { Users, RefreshCw } from 'lucide-react';
import { mohAPI } from '../../services/api';
import { ConfirmDialog, type ConfirmDialogState } from '../ui/ConfirmDialog';

interface MohMyChildrenViewProps {
  onViewChild?: (childId: string) => void;
}

const RISK_BADGE: Record<string, string> = {
  SAM: 'bg-red-600 text-white',
  MAM: 'bg-yellow-500 text-white',
  NORMAL: 'bg-green-600 text-white',
};

export function MohMyChildrenView({ onViewChild }: MohMyChildrenViewProps) {
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);

  // Per-child state
  const [reasonMap, setReasonMap] = useState<Record<number, string>>({});
  // 'assign' = pick any PHM area, 'return' not used (handled inline)
  const [assignPanelId, setAssignPanelId] = useState<number | null>(null);
  const [phmAreas, setPhmAreas] = useState<any[]>([]);
  const [selectedPhmId, setSelectedPhmId] = useState<number | ''>('');
  const [assignNote, setAssignNote] = useState('');
  const [areasLoading, setAreasLoading] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const res = await mohAPI.getMyChildren();
      if (res.data?.status === 'success') {
        setChildren(res.data.children || []);
      } else {
        setError(res.data?.message || 'Failed to load');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load children');
      setChildren([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const id = setInterval(() => load(true), 30000);
    return () => clearInterval(id);
  }, [load]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleEscalateToNutritionist = (child: any) => {
    const reason = reasonMap[child.id] || '';
    setDialog({
      title: 'Escalate to Nutritionist',
      message: `Escalate ${child.name || child.child_unique_id} (${child.current_risk_level}) to the hospital Nutritionist for specialist care?`,
      variant: 'warning',
      confirmLabel: 'Yes, Escalate',
      onConfirm: async () => {
        setActionLoading(child.id);
        setError('');
        try {
          await mohAPI.escalateToNutritionist(child.id, { reason });
          setReasonMap((prev) => { const next = { ...prev }; delete next[child.id]; return next; });
          load(true);
        } catch (err: any) {
          setError(err.response?.data?.message || 'Escalation failed');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  // Quick return to the original PHM area (no dropdown needed)
  const handleReturnToOriginalPhm = (child: any) => {
    setDialog({
      title: 'Return to Original PHM Area',
      message: `Return ${child.name || child.child_unique_id} to their original PHM area "${child.phm_area_name}"? The area's midwife will resume monitoring.`,
      variant: 'info',
      confirmLabel: 'Yes, Return to PHM',
      onConfirm: async () => {
        setActionLoading(child.id);
        setError('');
        try {
          await mohAPI.reassignToPhm(child.id, {
            phm_area_id: child.phm_area_id,
            notes: 'Condition improved — returned to original PHM area',
          });
          load(true);
        } catch (err: any) {
          setError(err.response?.data?.message || 'Return failed');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  // Assign to a different PHM area (opens dropdown)
  const openAssignPanel = async (childId: number) => {
    setAssignPanelId(childId);
    setSelectedPhmId('');
    setAssignNote('');
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

  const handleAssignToPHM = async (child: any) => {
    if (!selectedPhmId) return;
    setActionLoading(child.id);
    setError('');
    try {
      await mohAPI.reassignToPhm(child.id, {
        phm_area_id: selectedPhmId,
        notes: assignNote,
      });
      setAssignPanelId(null);
      load(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Assignment failed');
    } finally {
      setActionLoading(null);
    }
  };

  const riskBadge = (risk: string) =>
    RISK_BADGE[(risk || '').toUpperCase()] ?? 'bg-gray-400 text-white';

  if (loading) return <div className="text-gray-600">Loading children under your care...</div>;

  return (
    <div className="space-y-6">
      <ConfirmDialog state={dialog} onClose={() => setDialog(null)} />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Children Under MOH Care</h2>
          <p className="text-gray-600 mt-1">
            Children currently under your direct supervision.
            Escalate to Nutritionist if condition worsens, or return to PHM when stable.
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
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {children.length === 0 && !error && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No children currently under direct MOH care.</p>
          <p className="text-sm text-gray-400 mt-1">Children accepted from Incoming Transfers will appear here.</p>
        </div>
      )}

      {children.map((child) => {
        const risk = (child.current_risk_level || 'NORMAL').toUpperCase();
        const isAssigning = assignPanelId === child.id;
        const canEscalate = risk === 'MAM' || risk === 'SAM';
        const canReturnToPhm = !!child.phm_area_id;
        const isActing = actionLoading === child.id;

        return (
          <div
            key={child.id}
            className={`bg-white rounded-lg shadow p-5 border-l-4 ${
              risk === 'SAM' ? 'border-red-500' : risk === 'MAM' ? 'border-yellow-400' : 'border-green-400'
            }`}
          >
            {/* Info */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="font-semibold text-gray-900 text-lg">{child.name || '—'}</p>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${riskBadge(risk)}`}>
                {risk}
              </span>
              {child.escalation_status && child.escalation_status !== 'NONE' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                  {child.escalation_status.replace(/_/g, ' ')}
                </span>
              )}
            </div>
            <div className="space-y-0.5 text-sm text-gray-600">
              <p>ID: <span className="font-medium">{child.child_unique_id || child.child_id}</span></p>
              {child.dob && <p>DOB: <span className="font-medium">{new Date(child.dob).toLocaleDateString()}</span></p>}
              {child.phm_area_name && (
                <p>Original PHM Area: <span className="font-medium">{child.phm_area_name}</span></p>
              )}
              {child.last_measurement_date && (
                <p>Last measurement: <span className="font-medium">{new Date(child.last_measurement_date).toLocaleDateString()}</span></p>
              )}
            </div>

            {/* Escalation reason input — only for MAM/SAM when not in assign panel */}
            {!isAssigning && canEscalate && (
              <div className="mt-3">
                <input
                  type="text"
                  placeholder="Reason for Nutritionist escalation (optional)"
                  value={reasonMap[child.id] || ''}
                  onChange={(e) => setReasonMap((prev) => ({ ...prev, [child.id]: e.target.value }))}
                  className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                />
              </div>
            )}

            {/* Action buttons */}
            {!isAssigning && (
              <div className="mt-3 flex flex-wrap gap-2">
                {onViewChild && (
                  <button
                    onClick={() => onViewChild(String(child.id))}
                    style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: '500', color: '#374151', background: '#fff', cursor: 'pointer' }}
                  >
                    View
                  </button>
                )}

                {/* Condition worsened → Escalate to Nutritionist */}
                {canEscalate && (
                  <button
                    onClick={() => handleEscalateToNutritionist(child)}
                    disabled={isActing}
                    style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', color: '#fff', background: isActing ? '#9ca3af' : '#dc2626', cursor: isActing ? 'not-allowed' : 'pointer', opacity: isActing ? 0.7 : 1 }}
                  >
                    {isActing ? 'Escalating…' : 'Escalate to Nutritionist'}
                  </button>
                )}

                {/* Condition improved → Return to original PHM (quick action) */}
                {canReturnToPhm && (
                  <button
                    onClick={() => handleReturnToOriginalPhm(child)}
                    disabled={isActing}
                    style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', color: '#fff', background: isActing ? '#9ca3af' : '#0d9488', cursor: isActing ? 'not-allowed' : 'pointer', opacity: isActing ? 0.7 : 1 }}
                  >
                    {isActing ? 'Returning…' : `Return to ${child.phm_area_name || 'Original PHM'}`}
                  </button>
                )}

                {/* Assign to a different PHM area */}
                <button
                  onClick={() => openAssignPanel(child.id)}
                  disabled={isActing}
                  style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: '500', color: '#374151', background: '#fff', cursor: isActing ? 'not-allowed' : 'pointer', opacity: isActing ? 0.7 : 1 }}
                >
                  Assign to Different PHM
                </button>
              </div>
            )}

            {/* PHM area selection panel (for different PHM area) */}
            {isAssigning && (
              <div className="mt-4 p-4 bg-teal-50 rounded-lg border border-teal-200 space-y-3">
                <p className="text-sm font-medium text-teal-900">Select a PHM area to assign this child to:</p>
                {areasLoading ? (
                  <p className="text-sm text-gray-500">Loading areas...</p>
                ) : (
                  <select
                    value={selectedPhmId}
                    onChange={(e) => setSelectedPhmId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">— Select PHM area —</option>
                    {phmAreas.map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.name}{child.phm_area_id === a.id ? ' (original)' : ''}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  placeholder="Optional notes"
                  value={assignNote}
                  onChange={(e) => setAssignNote(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAssignToPHM(child)}
                    disabled={isActing || !selectedPhmId}
                    style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', color: '#fff', background: isActing || !selectedPhmId ? '#9ca3af' : '#0d9488', cursor: isActing || !selectedPhmId ? 'not-allowed' : 'pointer' }}
                  >
                    {isActing ? 'Assigning…' : 'Confirm Assign'}
                  </button>
                  <button
                    onClick={() => setAssignPanelId(null)}
                    style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: '500', color: '#374151', background: '#fff', cursor: 'pointer' }}
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
  );
}
