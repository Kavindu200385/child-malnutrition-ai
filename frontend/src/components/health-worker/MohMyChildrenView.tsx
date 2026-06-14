import React, { useState, useEffect, useCallback } from 'react';
import { Users, RefreshCw } from 'lucide-react';
import { mohAPI } from '../../services/api';
import { ConfirmDialog, type ConfirmDialogState } from '../ui/ConfirmDialog';
import { ChildProfileCard } from '../ChildProfileCard';
import { PaginationControls } from '../PaginationControls';

interface MohMyChildrenViewProps {
  onViewChild?: (childId: string) => void;
}

const RISK_BADGE: Record<string, string> = {
  SAM: 'bg-red-600 text-white',
  MAM: 'bg-yellow-500 text-white',
  NORMAL: 'bg-green-600 text-white',
};

export function MohMyChildrenView({ onViewChild }: MohMyChildrenViewProps) {
  const PAGE_SIZE = 12;
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
  const [currentPage, setCurrentPage] = useState(1);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const res = await mohAPI.getMyChildren();
      if (res.data?.status === 'success') {
        setChildren(res.data.children || []);
        setCurrentPage(1);
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

  const pageCount = Math.max(1, Math.ceil(children.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, pageCount);
  const paginatedChildren = children.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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

      {children.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900">Children ({children.length})</h3>
            <p className="mt-1 text-sm text-gray-500">
              Showing {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, children.length)} of {children.length} children
            </p>
          </div>

          <div className="grid grid-cols-1 items-stretch gap-6 p-6 md:grid-cols-2 lg:grid-cols-4">
            {paginatedChildren.map((child) => {
              const risk = (child.current_risk_level || 'NORMAL').toUpperCase();
              const isAssigning = assignPanelId === child.id;
              const canEscalate = risk === 'MAM' || risk === 'SAM';
              const canReturnToPhm = !!child.phm_area_id;
              const isActing = actionLoading === child.id;

              return (
                <ChildProfileCard
                  key={child.id}
                  child={child}
                  accent="teal"
                  risk={risk}
                  onViewProfile={onViewChild ? () => onViewChild(String(child.id)) : undefined}
                  badges={child.escalation_status && child.escalation_status !== 'NONE' ? (
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">
                      {child.escalation_status.replace(/_/g, ' ')}
                    </span>
                  ) : null}
                  actions={(
                    <>
                      {!isAssigning && canEscalate && (
                        <input
                          type="text"
                          placeholder="Escalation reason (optional)"
                          value={reasonMap[child.id] || ''}
                          onChange={(e) => setReasonMap((prev) => ({ ...prev, [child.id]: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
                        />
                      )}

                      {!isAssigning && canEscalate && (
                        <button
                          onClick={() => handleEscalateToNutritionist(child)}
                          disabled={isActing}
                          className="inline-flex w-full items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isActing ? 'Escalating…' : 'Escalate to Nutritionist'}
                        </button>
                      )}

                      {!isAssigning && canReturnToPhm && (
                        <button
                          onClick={() => handleReturnToOriginalPhm(child)}
                          disabled={isActing}
                          className="inline-flex w-full items-center justify-center rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isActing ? 'Returning…' : `Return to ${child.phm_area_name || 'Original PHM'}`}
                        </button>
                      )}

                      {!isAssigning && (
                        <button
                          onClick={() => openAssignPanel(child.id)}
                          disabled={isActing}
                          className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Assign to Different PHM
                        </button>
                      )}

                      {isAssigning && (
                        <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50 p-3">
                          <p className="text-sm font-medium text-teal-900">Select a PHM area:</p>
                          {areasLoading ? (
                            <p className="text-sm text-gray-500">Loading areas...</p>
                          ) : (
                            <select
                              value={selectedPhmId}
                              onChange={(e) => setSelectedPhmId(e.target.value ? Number(e.target.value) : '')}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
                            >
                              <option value="">Select PHM area</option>
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
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => handleAssignToPHM(child)}
                              disabled={isActing || !selectedPhmId}
                              className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isActing ? 'Assigning…' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setAssignPanelId(null)}
                              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                />
              );
            })}
          </div>

          <PaginationControls
            currentPage={safePage}
            totalItems={children.length}
            itemsPerPage={PAGE_SIZE}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </div>
  );
}
