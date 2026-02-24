/**
 * Pediatric Unit Statistics page – analytics and charts only (distinct from Dashboard).
 * Dashboard = overview + critical cases + recent children; Statistics = charts and trends.
 */
import { useState, useEffect } from 'react';
import { User } from '../../App';
import { hospitalAPI } from '../../services/api';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Loader2, BarChart3 } from 'lucide-react';

interface HospitalStatisticsViewProps {
  user: User;
}

function getRisk(risk: string): 'normal' | 'mam' | 'sam' {
  const r = (risk || 'NORMAL').toUpperCase();
  if (r === 'SAM' || r === 'CRITICAL') return 'sam';
  if (r === 'MAM' || r === 'MODERATE' || r === 'HIGH') return 'mam';
  return 'normal';
}

export function HospitalStatisticsView({ user }: HospitalStatisticsViewProps) {
  const [stats, setStats] = useState<any>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      hospitalAPI.getStats().then((r) => (r.data?.status === 'success' ? r.data.stats : null)),
      hospitalAPI.listChildren({}).then((r) => (r.data?.status === 'success' ? r.data.children || [] : [])),
    ])
      .then(([s, c]) => {
        if (!cancelled) {
          setStats(s || null);
          setChildren(Array.isArray(c) ? c : []);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load statistics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Statistics</h2>
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading statistics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Statistics</h2>
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  const total = stats?.total_children ?? 0;
  const normalCount = stats?.normal_cases ?? 0;
  const mamCount = stats?.mam_cases ?? 0;
  const samCount = stats?.sam_cases ?? 0;
  const transferred = stats?.transferred_to_nutritionist ?? 0;
  const atRiskCount = mamCount + samCount;

  const pct = (value: number, base: number) =>
    base > 0 ? Math.round((value / base) * 100) : 0;

  const percentNormal = pct(normalCount, total);
  const percentAtRisk = pct(atRiskCount, total);
  const percentTransferred = pct(transferred, total);

  // Gender distribution – unique to Statistics page
  let male = 0;
  let female = 0;
  let other = 0;
  children.forEach((c) => {
    const g = (c.gender || '').toLowerCase();
    if (g === 'male') male += 1;
    else if (g === 'female') female += 1;
    else other += 1;
  });
  const genderDistribution = [
    { name: 'Male', value: male, color: '#60A5FA' },
    { name: 'Female', value: female, color: '#F472B6' },
    { name: 'Other / Unknown', value: other, color: '#9CA3AF' },
  ].filter((d) => d.value > 0);
  if (genderDistribution.length === 0) {
    genderDistribution.push({ name: 'No data', value: 1, color: '#9CA3AF' });
  }

  // Birth weight distribution – unique to Statistics page
  const weightBuckets = [
    { label: '< 2.5 kg', count: 0 },
    { label: '2.5 – 3.0 kg', count: 0 },
    { label: '3.0 – 3.5 kg', count: 0 },
    { label: '> 3.5 kg', count: 0 },
  ];
  children.forEach((c) => {
    const raw = c.birth_weight_kg;
    const w = typeof raw === 'number' ? raw : raw ? parseFloat(String(raw)) : NaN;
    if (!w || Number.isNaN(w)) return;
    if (w < 2.5) weightBuckets[0].count += 1;
    else if (w < 3.0) weightBuckets[1].count += 1;
    else if (w < 3.5) weightBuckets[2].count += 1;
    else weightBuckets[3].count += 1;
  });

  // Escalation & transfer status – unique to Statistics page
  let escNone = 0;
  let escMoh = 0;
  let escNutritionist = 0;
  let transferredNutritionist = 0;
  children.forEach((c) => {
    const esc = (c.escalation_status || 'NONE').toUpperCase();
    if (esc === 'ESCALATED_TO_MOH') escMoh += 1;
    else if (esc === 'ESCALATED_TO_NUTRITIONIST') escNutritionist += 1;
    else escNone += 1;

    const transferStatus = (c.transfer_status || '').toUpperCase();
    if (transferStatus === 'TRANSFERRED_TO_NUTRITIONIST' || c.is_transferred) {
      transferredNutritionist += 1;
    }
  });
  const escalationData = [
    { label: 'Not escalated', value: escNone },
    { label: 'Escalated to MOH', value: escMoh },
    { label: 'Escalated to nutritionist', value: escNutritionist },
    { label: 'Transferred to nutritionist', value: transferredNutritionist },
  ].filter((d) => d.value > 0);
  if (escalationData.length === 0) {
    escalationData.push({ label: 'No escalations or transfers', value: 1 });
  }

  // Registrations by month (last 12 months) – Statistics-specific (not on Dashboard)
  const last12Months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (11 - i));
    return {
      key: d.toISOString().slice(0, 7),
      label: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
    };
  });
  const registrationByMonth = last12Months.map(({ key, label }) => {
    const count = children.filter((c) => {
      const date = c.registration_date || c.created_at;
      if (!date) return false;
      const childMonth = new Date(date).toISOString().slice(0, 7);
      return childMonth === key;
    }).length;
    return { month: label, registrations: count };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="w-8 h-8 text-indigo-600" />
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Statistics</h2>
          <p className="text-gray-600 mt-0.5">
            Deeper analytics for children registered at your hospital
          </p>
        </div>
      </div>

      {/* Statistics summary – compact grid (2x2 on medium, 1x4 on small, up to 4 in a row on large) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total children</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{total}</p>
          <p className="text-xs text-gray-500 mt-1">All children registered at this hospital</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">% Normal</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{percentNormal}%</p>
          <p className="text-xs text-gray-500 mt-1">Children with normal nutritional status</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">% At risk (MAM + SAM)</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{percentAtRisk}%</p>
          <p className="text-xs text-gray-500 mt-1">Children needing closer follow-up</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">% Transferred</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{percentTransferred}%</p>
          <p className="text-xs text-gray-500 mt-1">Children already referred to nutritionist</p>
        </div>
      </div>

      {/* Gender and birth weight analytics – not shown on Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Gender distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={genderDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${entry.value}`}
                outerRadius={90}
                dataKey="value"
              >
                {genderDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 flex justify-center gap-6">
            {genderDistribution.filter((d) => d.name !== 'No data').map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-gray-600">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Birth weight distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={weightBuckets}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#6366F1" name="Children" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Registrations over time and escalation/transfer overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Registrations by Month</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={registrationByMonth}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="registrations" fill="#4338ca" name="Registrations" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Escalation & transfer status</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={escalationData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#F97316" name="Children" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
