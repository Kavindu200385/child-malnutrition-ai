import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { mohAPI } from '../../services/api';
import { ConfirmDialog, type ConfirmDialogState } from '../ui/ConfirmDialog';
import { ChildProfileCard } from '../ChildProfileCard';
import { PaginationControls } from '../PaginationControls';

interface MohHighRiskChildrenViewProps {
  onViewChild?: (childId: string) => void;
}

export function MohHighRiskChildrenView({ onViewChild }: MohHighRiskChildrenViewProps) {
  const PAGE_SIZE = 12;
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const res = await mohAPI.getHighRiskMidwifeChildren();
      if (res.data?.status === 'success') {
        setChildren(res.data.children || []);
        setCurrentPage(1);
      } else {
        setError(res.data?.message || 'Failed to load');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load high-risk children');
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

  const handleTransferToMoh = (child: any) => {
    setDialog({
      title: 'Transfer Child to MOH Care',
      message: `Transfer ${child.name || child.child_unique_id} (${child.current_risk_level}) from midwife to MOH care?`,
      variant: 'warning',
      confirmLabel: 'Yes, Transfer to MOH',
      onConfirm: async () => {
        setActionLoading(child.id);
        setError('');
        try {
          await mohAPI.pullChildToMoh(child.id, {});
          load(true);
        } catch (err: any) {
          setError(err.response?.data?.message || 'Transfer failed');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  if (loading) return <div className="text-gray-600 py-8 text-center">Loading high-risk children...</div>;

  const pageCount = Math.max(1, Math.ceil(children.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, pageCount);
  const paginatedChildren = children.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <ConfirmDialog state={dialog} onClose={() => setDialog(null)} />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">High-Risk Children Under Midwife Care</h2>
          <p className="text-gray-600 mt-1">
            MAM/SAM children in your area under midwife care. Transfer to MOH for closer monitoring.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 text-white rounded-full text-sm font-semibold hover:bg-teal-800 disabled:opacity-60 transition-colors"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {children.length === 0 && !error && (
        <div className="bg-white rounded-lg shadow p-10 text-center">
          <AlertTriangle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No high-risk children under midwife care.</p>
          <p className="text-sm text-gray-400 mt-1">All MAM/SAM children are already with MOH or there are no cases.</p>
        </div>
      )}

      {children.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900">High-Risk Children ({children.length})</h3>
            <p className="mt-1 text-sm text-gray-500">
              Showing {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, children.length)} of {children.length} children
            </p>
          </div>
          <div className="grid grid-cols-1 items-stretch gap-6 p-6 md:grid-cols-2 lg:grid-cols-4">
          {paginatedChildren.map((child) => {
            const risk = (child.current_risk_level || '').toUpperCase();
            const isActing = actionLoading === child.id;

            return (
              <ChildProfileCard
                key={child.id}
                child={child}
                accent="teal"
                risk={risk}
                onViewProfile={onViewChild ? () => onViewChild(String(child.id)) : undefined}
                actions={(
                  <button
                    onClick={() => handleTransferToMoh(child)}
                    disabled={isActing}
                    className="inline-flex w-full items-center justify-center rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
                  >
                    {isActing ? 'Transferring…' : 'Transfer to MOH'}
                  </button>
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
