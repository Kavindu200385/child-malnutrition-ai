import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Activity, AlertTriangle, TrendingUp, UserCheck, Send, RefreshCw, Brain, X } from 'lucide-react';
import { mohAPI } from '../../services/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

/* Same colors as DashboardView (Midwife) */
const COLORS = { normal: '#2ECC71', mam: '#F1C40F', sam: '#E74C3C' };

export function MohDashboardView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showPredictedChart, setShowPredictedChart] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const res = await mohAPI.dashboard();
      if (res.data?.status === 'success') {
        setData(res.data.dashboard);
        setLastUpdated(new Date());
      } else {
        setError(res.data?.message || 'Failed to load dashboard');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    timerRef.current = setInterval(() => load(true), 30000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load]);

  if (loading) return <div className="text-gray-600">Loading dashboard...</div>;
  if (error) {
    return (
      <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
        <p className="text-sm text-red-900">{error}</p>
      </div>
    );
  }
  if (!data) return null;

  const pieData = [
    { name: 'Normal', value: data.normal_count, color: COLORS.normal },
    { name: 'MAM', value: data.mam_count, color: COLORS.mam },
    { name: 'SAM', value: data.sam_count, color: COLORS.sam },
  ].filter((d) => d.value > 0);
  if (pieData.length === 0) pieData.push({ name: 'No data', value: 1, color: '#95A5A6' });

  const summaryBarData = [
    { name: 'Midwives in area', value: data.midwife_count, fill: '#0d9488' },
    { name: 'Referred to nutritionist', value: data.referrals_to_nutritionist, fill: '#2563eb' },
    { name: 'Pending escalations', value: data.pending_escalations, fill: '#d97706' },
  ];

  const monthlyTrend = (data.monthly_trend || []).map((row: any) => ({
    name: row.label || `${row.month}/${row.year}`,
    escalations: row.escalations,
    toNutritionist: row.to_nutritionist,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-600 mt-1">Overview of child nutrition status in your area</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Live · updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '999px',
              border: 'none',
              background: '#0f766e',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              opacity: refreshing ? 0.6 : 1,
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Children</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{data.total_children}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">New children (this month)</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{data.new_children_month ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">New escalations (this month)</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#d97706' }}>{data.new_escalations_month ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Escalations resolved (this month)</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#16a34a' }}>{data.resolved_escalations_month ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Normal Status</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#2ECC71' }}>{data.normal_count}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Moderate (MAM)</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#F1C40F' }}>{data.mam_count}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Severe (SAM)</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#E74C3C' }}>{data.sam_count}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Predicted Cases card */}
      {(() => {
        const predictedSam: number = data.predicted_sam_count ?? 0;
        const predictedMam: number = data.predicted_mam_count ?? 0;
        const predictedTotal = predictedSam + predictedMam;
        return (
          <>
            <button
              onClick={() => setShowPredictedChart(true)}
              className="w-full text-left bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg shadow p-5 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Brain className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-purple-700">Future Risk Prediction (next 2 months)</p>
                    <p className="text-3xl font-bold text-purple-900 mt-0.5">{predictedTotal}</p>
                    <p className="text-xs text-purple-500 mt-0.5">Severe risk: {predictedSam} &nbsp;·&nbsp; Moderate/High risk: {predictedMam}</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-purple-600 bg-purple-100 px-3 py-1 rounded-full">View chart →</span>
              </div>
            </button>

            {showPredictedChart && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                onClick={() => setShowPredictedChart(false)}
              >
                <div
                  className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Future Risk Prediction</h3>
                      <p className="text-sm text-gray-500">AI forecast for next 2 months</p>
                    </div>
                    <button onClick={() => setShowPredictedChart(false)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={[
                        { name: 'Severe risk', count: predictedSam },
                        { name: 'Moderate/High risk', count: predictedMam },
                      ]}
                      margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip formatter={(v: any) => [v, 'Children']} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {[{ fill: '#E74C3C' }, { fill: '#F1C40F' }].map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-4 flex gap-4 justify-center text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-gray-700">Severe risk: <strong>{predictedSam}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <span className="text-gray-700">Moderate/High risk: <strong>{predictedMam}</strong></span>
                    </div>
                  </div>
                  {predictedTotal === 0 && (
                    <p className="text-center text-gray-400 text-sm mt-3">No predicted risk cases at this time.</p>
                  )}
                </div>
              </div>
            )}
          </>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Current nutrition status distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Summary</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={summaryBarData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {summaryBarData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="pt-2 border-t border-gray-100 space-y-2">
            <div className="flex items-center gap-3 text-gray-700">
              <UserCheck className="w-5 h-5 text-teal-600 flex-shrink-0" />
              <span>Midwives in area: <strong>{data.midwife_count}</strong></span>
            </div>
            <div className="flex items-center gap-3 text-gray-700">
              <Send className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <span>Referred to nutritionist: <strong>{data.referrals_to_nutritionist}</strong></span>
            </div>
            <div className="flex items-center gap-3 text-gray-700">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span>Pending escalations: <strong>{data.pending_escalations}</strong></span>
            </div>
          </div>
        </div>

        {/* High-risk children list */}
        <div className="bg-white rounded-lg shadow p-6 space-y-3">
          <h3 className="font-semibold text-gray-900">High-risk children in area</h3>
          {Array.isArray(data.high_risk_children) && data.high_risk_children.length > 0 ? (
            <ul className="space-y-2 text-sm text-gray-700">
              {data.high_risk_children.map((c: any) => (
                <li key={c.id} className="flex items-center justify-between border-b border-gray-100 pb-1 last:border-0">
                  <div>
                    <div className="font-medium">{c.name || c.child_unique_id || c.id}</div>
                    <div className="text-xs text-gray-500">
                      ID: {c.child_unique_id || c.id}
                      {c.last_measurement_date && ` · Last measurement: ${new Date(c.last_measurement_date).toLocaleDateString()}`}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold text-white ${
                      (c.display_risk_level || '').toUpperCase() === 'SAM'
                        ? 'bg-red-600'
                        : (c.display_risk_level || '').toUpperCase() === 'MAM'
                        ? 'bg-yellow-500'
                        : 'bg-green-600'
                    }`}
                  >
                    {(c.display_risk_level || 'NORMAL').toUpperCase()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">No MAM/SAM children currently in your area.</p>
          )}
        </div>

        {monthlyTrend.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 space-y-4 col-span-1 lg:col-span-2">
            <h3 className="font-semibold text-gray-900">Monthly escalations & referrals</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyTrend} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="escalations" fill="#0d9488" radius={[4, 4, 0, 0]} name="Escalations to MOH" />
                <Bar dataKey="toNutritionist" fill="#2563eb" radius={[4, 4, 0, 0]} name="Referred to nutritionist" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
