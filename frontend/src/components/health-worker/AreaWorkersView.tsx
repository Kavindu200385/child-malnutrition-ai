import { useState, useEffect, useCallback } from 'react';
import { Users, UserMinus, RefreshCw, Stethoscope, Activity } from 'lucide-react';
import { mohAPI } from '../../services/api';
import { MidwifeTransferView } from './MidwifeTransferView';
import { ConfirmDialog, type ConfirmDialogState } from '../ui/ConfirmDialog';

type Tab = 'workers' | 'transfer';

export function AreaWorkersView() {
  const [tab, setTab] = useState<Tab>(() => {
    try { return (localStorage.getItem('moh_area_workers_tab') as Tab) || 'workers'; } catch { return 'workers'; }
  });
  const [midwives, setMidwives] = useState<any[]>([]);
  const [nutritionists, setNutritionists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const res = await mohAPI.listWorkers();
      if (res.data?.status === 'success') {
        setMidwives(res.data.midwives || []);
        setNutritionists(res.data.nutritionists || []);
      } else {
        setError(res.data?.message || 'Failed to load');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const handleToggleActive = (worker: any) => {
    const next = !worker.is_active;
    setDialog({
      title: next ? 'Activate Worker' : 'Deactivate Worker',
      message: `${next ? 'Activate' : 'Deactivate'} ${worker.name}? ${next ? 'They will regain access to the system.' : 'They will lose access until reactivated.'}`,
      variant: next ? 'info' : 'warning',
      confirmLabel: next ? 'Yes, Activate' : 'Yes, Deactivate',
      onConfirm: async () => {
        setActionLoading(worker.id);
        try {
          await mohAPI.setWorkerActive(worker.id, next);
          load(true);
        } catch (err: any) {
          setError(err.response?.data?.message || 'Update failed');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'workers', label: 'Workers', icon: <Users size={15} /> },
    { id: 'transfer', label: 'Midwife Transfer', icon: <UserMinus size={15} /> },
  ];

  return (
    <div className="space-y-6">
      <ConfirmDialog state={dialog} onClose={() => setDialog(null)} />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Area Health Workers</h2>
          <p className="text-gray-600 mt-1">Manage workers and midwife assignments in your MOH area</p>
        </div>
        {tab === 'workers' && (
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 text-white rounded-full text-sm font-semibold hover:bg-teal-800 disabled:opacity-60 transition-colors"
          >
            <RefreshCw size={15} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Pill tabs */}
      <div style={{ display: 'flex', gap: '6px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '6px', width: 'fit-content', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {TABS.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); try { localStorage.setItem('moh_area_workers_tab', t.id); } catch {} }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '7px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: isActive ? '#0f766e' : 'transparent',
                color: isActive ? '#fff' : '#6b7280',
                boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'transfer' ? (
        <MidwifeTransferView />
      ) : loading ? (
        <div className="bg-white rounded-lg shadow p-10 text-center text-gray-500 text-sm">Loading health workers…</div>
      ) : (
        <>
          {error && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Midwives card */}
          <div style={{ background: '#fff', borderRadius: '14px', boxShadow: '0 1px 6px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '18px 24px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Users size={18} color="#16a34a" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>Midwives</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>{midwives.length} midwife{midwives.length !== 1 ? 's' : ''} in your area</p>
              </div>
            </div>

            {midwives.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No midwives assigned to your area.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Name', 'Username / Staff ID', 'Children', 'MAM', 'SAM', 'Escalations', 'Status'].map((h) => (
                        <th key={h} style={{ padding: '11px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f4f6' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {midwives.map((mw, idx) => {
                      const mam = mw.stats?.mam_count ?? 0;
                      const sam = mw.stats?.sam_count ?? 0;
                      const isActing = actionLoading === mw.id;
                      return (
                        <tr key={mw.id} style={{ borderTop: idx === 0 ? 'none' : '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '14px 20px', fontWeight: 600, color: '#111827' }}>{mw.name}</td>
                          <td style={{ padding: '14px 20px', color: '#6b7280' }}>{mw.username}{mw.staff_id ? ` · ${mw.staff_id}` : ''}</td>
                          <td style={{ padding: '14px 20px', color: '#374151', fontWeight: 600 }}>{mw.stats?.total_children ?? 0}</td>
                          <td style={{ padding: '14px 20px' }}>
                            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: 700, background: mam > 0 ? '#fef9c3' : '#f3f4f6', color: mam > 0 ? '#92400e' : '#9ca3af' }}>{mam}</span>
                          </td>
                          <td style={{ padding: '14px 20px' }}>
                            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: 700, background: sam > 0 ? '#fee2e2' : '#f3f4f6', color: sam > 0 ? '#b91c1c' : '#9ca3af' }}>{sam}</span>
                          </td>
                          <td style={{ padding: '14px 20px', color: '#374151' }}>{mw.stats?.escalations_count ?? 0}</td>
                          <td style={{ padding: '14px 20px' }}>
                            <button
                              onClick={() => handleToggleActive(mw)}
                              disabled={isActing || mw.is_protected}
                              style={{
                                padding: '5px 14px', borderRadius: '9999px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: isActing || mw.is_protected ? 'not-allowed' : 'pointer', opacity: isActing ? 0.6 : 1, transition: 'background 0.15s',
                                background: mw.is_active ? '#dcfce7' : '#f3f4f6',
                                color: mw.is_active ? '#166534' : '#6b7280',
                              }}
                            >
                              {mw.is_active ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Nutritionists card */}
          <div style={{ background: '#fff', borderRadius: '14px', boxShadow: '0 1px 6px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '18px 24px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Stethoscope size={18} color="#2563eb" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>Nutritionists in your area</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>{nutritionists.length} nutritionist{nutritionists.length !== 1 ? 's' : ''} linked to your district hospitals</p>
              </div>
            </div>

            {nutritionists.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No nutritionists assigned to hospitals in your district.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Name', 'Username / Staff ID', 'Hospital', 'Children under care', 'Status'].map((h) => (
                        <th key={h} style={{ padding: '11px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f4f6' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {nutritionists.map((n, idx) => {
                      const care = n.stats?.children_under_care ?? 0;
                      const isActing = actionLoading === n.id;
                      return (
                        <tr key={n.id} style={{ borderTop: idx === 0 ? 'none' : '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '14px 20px', fontWeight: 600, color: '#111827' }}>{n.name ?? '—'}</td>
                          <td style={{ padding: '14px 20px', color: '#6b7280' }}>{n.username ?? '—'}{n.staff_id ? ` · ${n.staff_id}` : ''}</td>
                          <td style={{ padding: '14px 20px', color: '#374151' }}>{n.hospital_name ?? n.hospital?.hospital_name ?? '—'}</td>
                          <td style={{ padding: '14px 20px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: 700, background: care > 0 ? '#eff6ff' : '#f3f4f6', color: care > 0 ? '#1d4ed8' : '#9ca3af' }}>
                              <Activity size={11} />
                              {care}
                            </span>
                          </td>
                          <td style={{ padding: '14px 20px' }}>
                            <button
                              onClick={() => handleToggleActive(n)}
                              disabled={isActing || n.is_protected}
                              style={{
                                padding: '5px 14px', borderRadius: '9999px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: isActing || n.is_protected ? 'not-allowed' : 'pointer', opacity: isActing ? 0.6 : 1, transition: 'background 0.15s',
                                background: n.is_active ? '#dcfce7' : '#f3f4f6',
                                color: n.is_active ? '#166534' : '#6b7280',
                              }}
                            >
                              {n.is_active ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
