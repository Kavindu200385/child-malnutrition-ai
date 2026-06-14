import React, { useState, useEffect, useCallback } from 'react';
import { nutritionistAPI } from '../../services/api';
import { User, PlusCircle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { formatDate } from '../../utils/formatDate';
import { ConfirmDialog, type ConfirmDialogState } from '../ui/ConfirmDialog';
import { ChildProfileCard } from '../ChildProfileCard';
import { PaginationControls } from '../PaginationControls';

interface ReferredItem {
  child: any;
  referral: any;
  current_risk_level?: string;
  escalation_status?: string;
  last_measurement_date?: string;
  last_measurement_confidence?: number;
}

interface NutritionistReferredViewProps {
  onViewChild: (childId: string) => void;
  onAddMeasurement: (childId: string) => void;
}

export function NutritionistReferredView({ onViewChild, onAddMeasurement }: NutritionistReferredViewProps) {
  const PAGE_SIZE = 12;
  const [items, setItems] = useState<ReferredItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [returningId, setReturningId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  };

  const headerTitleStyle: React.CSSProperties = {
    fontSize: '22px',
    fontWeight: 700,
    color: '#0f172a',
    margin: 0,
  };

  const headerSubtitleStyle: React.CSSProperties = {
    marginTop: '4px',
    fontSize: '13px',
    color: '#64748b',
  };

  const emptyCardStyle: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: '14px',
    boxShadow: '0 10px 30px rgba(15,23,42,0.10)',
    padding: '32px',
    textAlign: 'center',
    color: '#6b7280',
  };

  const emptyIconWrapStyle: React.CSSProperties = {
    width: '56px',
    height: '56px',
    borderRadius: '999px',
    margin: '0 auto 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f3f4f6',
  };

  const cardsWrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  };

  const cardStyle: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: '16px',
    boxShadow: '0 10px 32px rgba(15,23,42,0.12)',
    padding: '18px 20px',
    border: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  };

  const topRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    flexWrap: 'wrap',
  };

  const childNameStyle: React.CSSProperties = {
    fontSize: '15px',
    fontWeight: 600,
    color: '#0f172a',
  };

  const childIdStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#6b7280',
    marginTop: '2px',
  };

  const pillBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '999px',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
  };

  const btnBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 20px',
    borderRadius: '9999px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    color: '#ffffff',
    transition: 'background 0.2s',
    whiteSpace: 'nowrap',
  };

  const btnDark: React.CSSProperties = {
    ...btnBase,
    background: '#1e293b',
    boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
  };

  const btnPrimary: React.CSSProperties = {
    ...btnBase,
    background: '#0369a1',
    boxShadow: '0 4px 12px rgba(3,105,161,0.3)',
  };

  const btnGreen: React.CSSProperties = {
    ...btnBase,
    background: '#059669',
    boxShadow: '0 4px 12px rgba(5,150,105,0.3)',
  };

  const actionsRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '8px',
    marginTop: '6px',
    flexWrap: 'wrap',
  };

  const metaRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    fontSize: '11px',
    color: '#6b7280',
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const res = await nutritionistAPI.referredChildren();
      if (res.data?.status === 'success') {
        setItems(res.data.children || []);
        setCurrentPage(1);
      } else setError(res.data?.message || 'Failed to load');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load referred children');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  // Auto-refresh so risk levels and new referrals stay live without manual refresh
  useEffect(() => {
    const id = setInterval(() => {
      load(true);
    }, 30000);
    return () => clearInterval(id);
  }, [load]);

  const handleReturnToMoh = (child: any) => {
    setDialog({
      title: 'Return to MOH',
      message: `Send ${child.name || child.child_unique_id} back to MOH supervision? The MOH will review and reassign the child to a PHM area. You will still be able to view this child's history.`,
      variant: 'info',
      confirmLabel: 'Yes, Return to MOH',
      onConfirm: async () => {
        setReturningId(child.id);
        try {
          await nutritionistAPI.returnToMoh(child.id);
          load(true);
        } catch (err: any) {
          // show error inline — dialog is already closed by ConfirmDialog
          setError(err.response?.data?.message || 'Return to MOH failed');
        } finally {
          setReturningId(null);
        }
      },
    });
  };

  if (loading) return <div style={{ color: '#4b5563', fontSize: '14px' }}>Loading referred children...</div>;
  if (error) {
    return (
      <div style={{ background: '#fef2f2', border: '2px solid #fecaca', borderRadius: '12px', padding: '12px 14px' }}>
        <p style={{ fontSize: '13px', color: '#b91c1c', margin: 0 }}>{error}</p>
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, pageCount);
  const paginatedItems = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div style={containerStyle}>
      <ConfirmDialog state={dialog} onClose={() => setDialog(null)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={headerTitleStyle}>Referred Children</h2>
          <p style={headerSubtitleStyle}>
            Children escalated from MOH to your hospital for specialist review and on-going nutrition management.
          </p>
        </div>
        <button
          type="button"
          style={{
            ...btnDark,
            opacity: refreshing ? 0.7 : 1,
            cursor: refreshing ? 'wait' : 'pointer',
          }}
          onClick={() => load(true)}
          disabled={refreshing}
          onMouseEnter={(e) => { if (!refreshing) e.currentTarget.style.background = '#334155'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#1e293b'; }}
        >
          <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {items.length === 0 ? (
        <div style={emptyCardStyle}>
          <div style={emptyIconWrapStyle}>
            <User size={26} color="#d1d5db" />
          </div>
          <p style={{ margin: 0, fontSize: '14px' }}>No children referred to you yet.</p>
          <p style={{ marginTop: '6px', fontSize: '12px', color: '#9ca3af' }}>
            MOH can escalate children to the nutritionist from the Escalated Children page.
          </p>
        </div>
      ) : (
        <div className="rounded-lg bg-white shadow">
          <div className="border-b border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900">Referred Children ({items.length})</h3>
            <p className="mt-1 text-sm text-gray-500">
              Showing {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, items.length)} of {items.length} children
            </p>
          </div>
          <div className="grid grid-cols-1 items-stretch gap-6 p-6 md:grid-cols-2 lg:grid-cols-4">
          {paginatedItems.map(({ child, display_risk_level, current_risk_level, is_active, pending_moh_return, last_measurement_date, last_measurement_confidence, }: any) => {
            const displayRisk = (display_risk_level ||
              child.display_risk_level ||
              current_risk_level ||
              child.birth_risk_level ||
              'NORMAL').toUpperCase();
            const canReturn = is_active && (current_risk_level || '').toUpperCase() === 'NORMAL';

            return (
              <ChildProfileCard
                key={child.id}
                child={{
                  ...child,
                  current_risk_level: displayRisk,
                  display_risk_level: displayRisk,
                }}
                accent="slate"
                risk={displayRisk}
                onViewProfile={() => onViewChild(String(child.id))}
                badges={(
                  <div className="flex flex-wrap justify-end gap-1">
                    {pending_moh_return && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        Pending MOH Review
                      </span>
                    )}
                    {!is_active && !pending_moh_return && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                        Returned
                      </span>
                    )}
                  </div>
                )}
                actions={(
                  <>
                    <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      <div>
                        Last measurement:{' '}
                        <span className="font-semibold">
                          {last_measurement_date
                            ? `${formatDate(last_measurement_date)}${
                                last_measurement_confidence != null
                                  ? ` (${(last_measurement_confidence * 100).toFixed(0)}%)`
                                  : ''
                              }`
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="mt-1">
                        Status:{' '}
                        <span className={`font-semibold ${pending_moh_return ? 'text-amber-700' : is_active ? 'text-sky-700' : 'text-green-700'}`}>
                          {pending_moh_return ? 'Pending MOH review' : is_active ? 'Under your care' : 'Returned to MOH'}
                        </span>
                      </div>
                    </div>
                    {is_active && (
                    <button
                      type="button"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-800"
                      onClick={() => onAddMeasurement(String(child.id))}
                    >
                      <PlusCircle size={16} />
                      Add Measurement
                    </button>
                    )}
                    {canReturn && (
                    <button
                      type="button"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => handleReturnToMoh(child)}
                      disabled={returningId === child.id}
                    >
                      {returningId === child.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <ArrowLeft size={16} />
                      )}
                      Return to MOH
                    </button>
                    )}
                  </>
                )}
              />
            );
          })}
          </div>
          <PaginationControls
            currentPage={safePage}
            totalItems={items.length}
            itemsPerPage={PAGE_SIZE}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
