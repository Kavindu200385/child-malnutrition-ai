import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users, Activity, FileText, Building2 } from 'lucide-react';
import { reportsAPI } from '../../services/api';

interface OverviewStats {
  total_children: number;
  total_workers: number;
  total_clinics: number;
  monthly_trend: { month: string; children: number; sam: number; mam: number }[];
  clinic_performance: { clinic_name: string; district: string; total: number; sam: number; mam: number; normal: number }[];
}

export function SystemAnalytics() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [reportsCount, setReportsCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      reportsAPI.overviewStats().then((r) => r.data?.status === 'success' ? r.data.data : null),
      reportsAPI.list({}).then((r) => (r.data?.count ?? r.data?.reports?.length ?? 0)),
    ])
      .then(([data, count]) => {
        if (cancelled) return;
        setStats(data || null);
        setReportsCount(typeof count === 'number' ? count : 0);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load analytics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">System Analytics</h2>
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">System Analytics</h2>
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  const totalChildren = stats?.total_children ?? 0;
  const totalWorkers = stats?.total_workers ?? 0;
  const totalClinics = stats?.total_clinics ?? 0;
  const monthlyTrend = stats?.monthly_trend ?? [];
  const clinicPerformance = (stats?.clinic_performance ?? []).map((c) => ({
    clinic: c.clinic_name.length > 15 ? c.clinic_name.slice(0, 13) + '…' : c.clinic_name,
    children: c.total,
    sam: c.sam,
    mam: c.mam,
    normal: c.normal,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">System Analytics</h2>
        <p className="text-gray-600 mt-1">System-wide metrics from live data</p>
      </div>

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Children</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalChildren}</p>
              <p className="text-xs text-gray-600 mt-1">Registered in system</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Health Workers</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalWorkers}</p>
              <p className="text-xs text-gray-600 mt-1">PDHS, RDHS, MOH, Midwife, etc.</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Reports</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{reportsCount ?? '—'}</p>
              <p className="text-xs text-gray-600 mt-1">Saved reports</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">PHM Areas</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalClinics}</p>
              <p className="text-xs text-gray-600 mt-1">Clinic-level areas</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Registration trend (last 6 months) */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Registration Trend (Last 6 Months)</h3>
          {monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="children" stroke="#3B82F6" strokeWidth={2} name="Children Registered" />
                <Line type="monotone" dataKey="sam" stroke="#E74C3C" strokeWidth={2} name="SAM" />
                <Line type="monotone" dataKey="mam" stroke="#F59E0B" strokeWidth={2} name="MAM" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 py-12 text-center">No registration trend data yet.</p>
          )}
        </div>

        {/* MOH area performance */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">MOH Area – Children & Risk</h3>
          {clinicPerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={clinicPerformance} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="clinic" width={80} />
                <Tooltip />
                <Legend />
                <Bar dataKey="normal" fill="#10B981" name="Normal" stackId="a" />
                <Bar dataKey="mam" fill="#F59E0B" name="MAM" stackId="a" />
                <Bar dataKey="sam" fill="#E74C3C" name="SAM" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 py-12 text-center">No MOH area data yet.</p>
          )}
        </div>
      </div>

      {/* Top MOH areas table */}
      {(stats?.clinic_performance?.length ?? 0) > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-900">MOH Areas by Child Count</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Area</th>
                  <th className="text-right py-2 text-sm font-medium text-gray-700">Children</th>
                  <th className="text-right py-2 text-sm font-medium text-gray-700">SAM</th>
                  <th className="text-right py-2 text-sm font-medium text-gray-700">MAM</th>
                  <th className="text-right py-2 text-sm font-medium text-gray-700">Normal</th>
                </tr>
              </thead>
              <tbody>
                {[...(stats?.clinic_performance ?? [])]
                  .sort((a, b) => b.total - a.total)
                  .slice(0, 10)
                  .map((row) => (
                    <tr key={row.clinic_name + row.district} className="border-b border-gray-100">
                      <td className="py-2 px-4 text-sm text-gray-900">{row.clinic_name}</td>
                      <td className="py-2 text-sm text-gray-900 text-right">{row.total}</td>
                      <td className="py-2 text-sm text-red-600 text-right">{row.sam}</td>
                      <td className="py-2 text-sm text-yellow-600 text-right">{row.mam}</td>
                      <td className="py-2 text-sm text-green-600 text-right">{row.normal}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* System health note */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">About these metrics</h3>
        <p className="text-sm text-gray-600">
          All numbers are from live system data: registered children, health workers, PHM/MOH areas, and saved reports.
          Logins and per-user activity are not tracked in the current system.
        </p>
      </div>
    </div>
  );
}
