import { useState, useEffect } from 'react';
import { Users, Activity, AlertTriangle, TrendingUp, UserCheck, Send } from 'lucide-react';
import { nutritionistAPI } from '../../services/api';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from 'recharts';

const COLORS = { normal: '#2ECC71', mam: '#F1C40F', sam: '#E74C3C' };

export function NutritionistDashboardView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await nutritionistAPI.dashboardSummary();
      if (res.data?.status === 'success') setData(res.data.dashboard);
      else setError(res.data?.message || 'Failed to load dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

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
    { name: 'Normal', value: data.normal_count || 0, color: COLORS.normal },
    { name: 'MAM', value: data.mam_count || 0, color: COLORS.mam },
    { name: 'SAM', value: data.sam_count || 0, color: COLORS.sam },
  ].filter((d) => d.value > 0);
  if (pieData.length === 0) pieData.push({ name: 'No data', value: 1, color: '#94a3b8' });

  const monthlyData = (data.monthly_referrals || []).map((m: any) => ({
    name: m.label || `${m.month}/${m.year}`,
    count: m.count,
  }));

  const improvementData = data.improvement_stats
    ? [
        { name: 'Improved', value: data.improvement_stats.improved || 0, fill: '#2ECC71' },
        { name: 'Not improved', value: data.improvement_stats.not_improved || 0, fill: '#F1C40F' },
        { name: 'Pending review', value: data.improvement_stats.pending_review || 0, fill: '#94a3b8' },
      ].filter((d) => d.value > 0)
    : [];
  if (improvementData.length === 0) improvementData.push({ name: 'No data', value: 1, fill: '#94a3b8' });

  const trendData = (data.monthly_referrals || []).slice(-6).map((m: any) => ({
    month: m.label || `${m.month}`,
    referred: m.count,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-600 mt-1">Specialist view: referred children and outcomes</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Referred</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{data.total_referred ?? 0}</p>
            </div>
            <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-slate-700" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Normal</p>
              <p className="text-3xl font-bold mt-2" style={{ color: COLORS.normal }}>{data.normal_count ?? 0}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">MAM</p>
              <p className="text-3xl font-bold mt-2" style={{ color: COLORS.mam }}>{data.mam_count ?? 0}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">SAM</p>
              <p className="text-3xl font-bold mt-2" style={{ color: COLORS.sam }}>{data.sam_count ?? 0}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Risk distribution</h3>
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
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Improved vs not improved</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={improvementData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
          <h3 className="font-semibold text-gray-900 mb-4">Monthly referrals</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#475569" radius={[4, 4, 0, 0]} name="Referrals" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {trendData.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
            <h3 className="font-semibold text-gray-900 mb-4">Referral trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="referred" stroke="#475569" strokeWidth={2} name="Referred" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Summary</h3>
        <div className="flex items-center gap-3 text-gray-700">
          <UserCheck className="w-5 h-5 text-slate-600 flex-shrink-0" />
          <span>Pending cases: <strong>{data.pending_cases ?? 0}</strong></span>
        </div>
        <div className="flex items-center gap-3 text-gray-700">
          <Send className="w-5 h-5 text-slate-600 flex-shrink-0" />
          <span>Reviewed cases: <strong>{data.reviewed_cases ?? 0}</strong></span>
        </div>
      </div>
    </div>
  );
}
