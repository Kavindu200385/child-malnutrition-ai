import React, { useState, useEffect, useCallback } from 'react';
import { nutritionistAPI } from '../../services/api';
import { User, PlusCircle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { formatDate } from '../../utils/formatDate';
import { ConfirmDialog, type ConfirmDialogState } from '../ui/ConfirmDialog';

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
  const [items, setItems] = useState<ReferredItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [returningId, setReturningId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);

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
      if (res.data?.status === 'success') setItems(res.data.children || []);
      else setError(res.data?.message || 'Failed to load');
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
        <div style={cardsWrapperStyle}>
          {items.map(({ child, display_risk_level, current_risk_level, is_active, pending_moh_return, last_measurement_date, last_measurement_confidence, }: any) => {
            const displayRisk = (display_risk_level ||
              child.display_risk_level ||
              current_risk_level ||
              child.birth_risk_level ||
              'NORMAL').toUpperCase();
            let riskStyle: React.CSSProperties = { ...pillBase, background: '#dcfce7', color: '#166534' };
            if (displayRisk === 'MAM') riskStyle = { ...pillBase, background: '#fef9c3', color: '#92400e' };
            if (displayRisk === 'SAM') riskStyle = { ...pillBase, background: '#fee2e2', color: '#b91c1c' };

            const returnedBadge: React.CSSProperties = {
              ...pillBase,
              background: '#f0fdf4',
              color: '#166534',
              border: '1px solid #bbf7d0',
            };

            const canReturn = is_active && (current_risk_level || '').toUpperCase() === 'NORMAL';

            const borderColor = pending_moh_return ? '#f59e0b' : is_active ? '#0369a1' : '#22c55e';
            const cardBorderStyle: React.CSSProperties = {
              ...cardStyle,
              borderLeft: `4px solid ${borderColor}`,
              opacity: is_active || pending_moh_return ? 1 : 0.85,
            };

            const pendingReturnBadge: React.CSSProperties = {
              ...pillBase,
              background: '#fef3c7',
              color: '#92400e',
              border: '1px solid #fcd34d',
            };

            return (
              <div key={child.id} style={cardBorderStyle}>
                <div style={topRowStyle}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={childNameStyle}>
                        {child.name || child.child_id || child.child_unique_id}
                      </span>
                      <span style={riskStyle}>{displayRisk}</span>
                      {pending_moh_return && (
                        <span style={pendingReturnBadge}>Pending MOH Review</span>
                      )}
                      {!is_active && !pending_moh_return && (
                        <span style={returnedBadge}>Returned to MOH</span>
                      )}
                    </div>
                    <div style={childIdStyle}>
                      ID: {child.child_unique_id || child.child_id || child.id}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '11px', color: '#6b7280' }}>
                    <div>
                      Last measurement:{' '}
                      {last_measurement_date
                        ? `${formatDate(last_measurement_date)}${
                            last_measurement_confidence != null
                              ? ` (${(last_measurement_confidence * 100).toFixed(0)}%)`
                              : ''
                          }`
                        : '—'}
                    </div>
                    <div style={{ marginTop: '2px' }}>
                      Status:{' '}
                      <strong style={{ color: pending_moh_return ? '#b45309' : is_active ? '#0369a1' : '#166534' }}>
                        {pending_moh_return ? 'Pending MOH review' : is_active ? 'Under your care' : 'Returned to MOH'}
                      </strong>
                    </div>
                  </div>
                </div>

                <div style={metaRowStyle}>
                  {child.gender && <span>Sex: <strong>{String(child.gender).toUpperCase()}</strong></span>}
                  {child.dob && <span>DOB: <strong>{formatDate(child.dob)}</strong></span>}
                  {child.guardian_name && <span>Guardian: <strong>{child.guardian_name}</strong></span>}
                  {child.moh_area && <span>MOH: <strong>{typeof child.moh_area === 'object' ? child.moh_area.name : child.moh_area}</strong></span>}
                  {child.phm_area && <span>PHM Area: <strong>{typeof child.phm_area === 'object' ? child.phm_area.name : child.phm_area}</strong></span>}
                </div>

                <div style={actionsRowStyle}>
                  <button
                    type="button"
                    style={btnDark}
                    onClick={() => onViewChild(String(child.id))}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#334155')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#1e293b')}
                  >
                    <User size={16} />
                    View profile
                  </button>
                  {is_active && (
                    <button
                      type="button"
                      style={btnPrimary}
                      onClick={() => onAddMeasurement(String(child.id))}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#0284c7')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#0369a1')}
                    >
                      <PlusCircle size={16} />
                      Add measurement
                    </button>
                  )}
                  {canReturn && (
                    <button
                      type="button"
                      style={{
                        ...btnGreen,
                        opacity: returningId === child.id ? 0.7 : 1,
                        cursor: returningId === child.id ? 'wait' : 'pointer',
                      }}
                      onClick={() => handleReturnToMoh(child)}
                      disabled={returningId === child.id}
                      onMouseEnter={(e) => { if (returningId !== child.id) e.currentTarget.style.background = '#047857'; }}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#059669')}
                    >
                      {returningId === child.id ? (
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <ArrowLeft size={16} />
                      )}
                      Return to MOH
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
