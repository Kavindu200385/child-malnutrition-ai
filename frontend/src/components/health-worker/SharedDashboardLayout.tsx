/**
 * Shared dashboard layout – same UI for all roles (Midwife, Pediatric Unit, etc.).
 * Each role sees only their own area's/hospital's data; backend scopes by user.
 */
import { useState, type ReactNode } from 'react';
import { AlertTriangle, Users, TrendingUp, Activity, Brain, X } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getRiskColor, getRiskLabel, getDisplayRiskLevel, getDisplayRiskLevelTyped } from '../../types';
import { formatDateTime } from '../../utils/formatDate';

export interface SharedDashboardStats {
  total_children: number;
  normal_count: number;
  mam_count: number;
  sam_count: number;
  predicted_sam_count?: number;
  predicted_mam_count?: number;
}

export interface SharedDashboardLayoutProps {
  title?: string;
  subtitle: string;
  stats: SharedDashboardStats;
  children: any[];
  onViewChild?: (childId: string | number) => void;
  /** Optional extra card (e.g. "Transferred to Nutritionist" for Pediatric Unit) */
  extraCard?: { label: string; value: number; color?: string; icon?: ReactNode };
  /** Label when no children in table */
  emptyMessage?: string;
}

export function SharedDashboardLayout({
  title = 'Dashboard',
  subtitle,
  stats,
  children = [],
  onViewChild,
  extraCard,
  emptyMessage = 'No children in your area yet.',
}: SharedDashboardLayoutProps) {
  const [showPredictedChart, setShowPredictedChart] = useState(false);

  const totalChildren = stats.total_children ?? 0;
  const samCount = stats.sam_count ?? 0;
  const mamCount = stats.mam_count ?? 0;
  const normalCount = stats.normal_count ?? 0;
  const predictedSam = stats.predicted_sam_count ?? 0;
  const predictedMam = stats.predicted_mam_count ?? 0;
  const predictedTotal = predictedSam + predictedMam;

  const getRisk = (c: any) => getDisplayRiskLevel(c);
  const criticalCases = children.filter((c) => getRisk(c) === 'SAM');

  const riskDistribution = [
    { name: 'Normal', value: normalCount, color: '#2ECC71' },
    { name: 'MAM', value: mamCount, color: '#F1C40F' },
    { name: 'SAM', value: samCount, color: '#E74C3C' },
  ].filter((d) => d.value > 0);
  if (riskDistribution.length === 0) riskDistribution.push({ name: 'No data', value: 1, color: '#95A5A6' });

  const ageBuckets = [
    { age: '0-6 months', normal: 0, mam: 0, sam: 0 },
    { age: '7-12 months', normal: 0, mam: 0, sam: 0 },
    { age: '13-24 months', normal: 0, mam: 0, sam: 0 },
    { age: '25-36 months', normal: 0, mam: 0, sam: 0 },
  ];
  children.forEach((c) => {
    const dob = c.dob ? new Date(c.dob) : null;
    const ageMonths = dob ? Math.floor((Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 30.44)) : 0;
    const risk = getRisk(c);
    const isSam = risk === 'SAM' || risk === 'CRITICAL';
    const isMam = risk === 'MAM' || risk === 'MODERATE' || risk === 'HIGH';
    const isNormal = risk === 'NORMAL';
    let idx = 0;
    if (ageMonths <= 6) idx = 0;
    else if (ageMonths <= 12) idx = 1;
    else if (ageMonths <= 24) idx = 2;
    else idx = 3;
    if (isSam) ageBuckets[idx].sam += 1;
    else if (isMam) ageBuckets[idx].mam += 1;
    else ageBuckets[idx].normal += 1;
  });

  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return d.toLocaleString('en-US', { month: 'short' });
  });
  const trendData = last6Months.map((month) => {
    const normal = children.filter((c) => {
      const ru = c.last_risk_update || c.updated_at || c.created_at;
      if (!ru) return getRisk(c) === 'NORMAL';
      const m = new Date(ru).toLocaleString('en-US', { month: 'short' });
      return m === month && getRisk(c) === 'NORMAL';
    }).length;
    const mam = children.filter((c) => ['MAM', 'MODERATE', 'HIGH'].includes(getRisk(c))).length;
    const sam = children.filter((c) => ['SAM', 'CRITICAL'].includes(getRisk(c))).length;
    return { month, normal, mam, sam };
  });

  const recentChildren = [...children].sort((a, b) => {
    const da = a.last_risk_update || a.updated_at || a.created_at || a.registration_date || '';
    const db = b.last_risk_update || b.updated_at || b.created_at || b.registration_date || '';
    return new Date(db).getTime() - new Date(da).getTime();
  }).slice(0, 5);

  const childIdForView = (c: any) => {
    const id = c.child_id ?? c.child_unique_id ?? c.id;
    return id != null ? String(id) : '';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        <p className="text-gray-600 mt-1">{subtitle}</p>
      </div>

      {/* Stats cards */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${extraCard ? 'xl:grid-cols-5' : 'xl:grid-cols-4'} gap-4`}>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Children</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalChildren}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Normal</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#2ECC71' }}>{normalCount}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">MAM Cases</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#F1C40F' }}>{mamCount}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">SAM Cases</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#E74C3C' }}>{samCount}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
        {extraCard && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{extraCard.label}</p>
                <p className="text-3xl font-bold mt-2" style={{ color: extraCard.color || '#3B82F6' }}>{extraCard.value}</p>
              </div>
              {extraCard.icon && <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">{extraCard.icon}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Predicted Cases card – clickable, spans full width as a standalone row */}
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
              <p className="text-sm font-medium text-purple-700">Predicted Cases (next 2 months)</p>
              <p className="text-3xl font-bold text-purple-900 mt-0.5">{predictedTotal}</p>
              <p className="text-xs text-purple-500 mt-0.5">SAM: {predictedSam} &nbsp;·&nbsp; MAM: {predictedMam}</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-purple-600 bg-purple-100 px-3 py-1 rounded-full">View chart →</span>
        </div>
      </button>

      {/* Predicted cases modal chart */}
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
                <h3 className="text-lg font-bold text-gray-900">Predicted Risk Cases</h3>
                <p className="text-sm text-gray-500">AI forecast for next 2 months</p>
              </div>
              <button onClick={() => setShowPredictedChart(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={[
                  { name: 'Predicted SAM', count: predictedSam, fill: '#E74C3C' },
                  { name: 'Predicted MAM', count: predictedMam, fill: '#F1C40F' },
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
                <span className="text-gray-700">Predicted SAM: <strong>{predictedSam}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="text-gray-700">Predicted MAM: <strong>{predictedMam}</strong></span>
              </div>
            </div>
            {predictedTotal === 0 && (
              <p className="text-center text-gray-400 text-sm mt-3">No predicted risk cases at this time.</p>
            )}
          </div>
        </div>
      )}

      {criticalCases.length > 0 && onViewChild && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-bold text-red-900 mb-2">Critical Cases Requiring Immediate Attention</h3>
              <div className="space-y-2">
                {criticalCases.map((child) => (
                  <div key={child.id} className="bg-white rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{child.name || child.child_id || child.child_unique_id || 'Unnamed'}</p>
                        <p className="text-sm text-gray-600">Last update: {formatDateTime(child.last_risk_update || child.updated_at || child.registration_date) || '—'}</p>
                      </div>
                      <button
                        onClick={() => onViewChild(childIdForView(child))}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Risk Level Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={riskDistribution} cx="50%" cy="50%" labelLine={false} label={(entry) => `${entry.name}: ${entry.value}`} outerRadius={80} dataKey="value">
                {riskDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 flex justify-center gap-6">
            {riskDistribution.filter((d) => d.name !== 'No data').map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-gray-600">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Age Group Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ageBuckets}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="age" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="normal" fill="#2ECC71" name="Normal" />
              <Bar dataKey="mam" fill="#F1C40F" name="MAM" />
              <Bar dataKey="sam" fill="#E74C3C" name="SAM" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
          <h3 className="text-lg font-bold text-gray-900 mb-4">6-Month Trend Analysis</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="normal" stroke="#2ECC71" strokeWidth={2} name="Normal" />
              <Line type="monotone" dataKey="mam" stroke="#F1C40F" strokeWidth={2} name="MAM" />
              <Line type="monotone" dataKey="sam" stroke="#E74C3C" strokeWidth={2} name="SAM" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">Recent {children.length ? 'Children' : 'Visits'}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Child Name</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Last Update</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                {onViewChild && <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Action</th>}
              </tr>
            </thead>
            <tbody>
              {recentChildren.length === 0 ? (
                <tr>
                  <td colSpan={onViewChild ? 4 : 3} className="py-8 text-center text-gray-500">{emptyMessage}</td>
                </tr>
              ) : (
                recentChildren.map((child) => (
                  <tr key={child.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">{child.name || child.child_id || child.child_unique_id || '—'}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{formatDateTime(child.last_risk_update || child.updated_at || child.registration_date) || '—'}</td>
                    <td className="py-3 px-4">
                      <span
                        className="inline-block px-3 py-1 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: getRiskColor(getDisplayRiskLevelTyped(child)) }}
                      >
                        {getRiskLabel(getDisplayRiskLevelTyped(child)).split(' ')[0]}
                      </span>
                    </td>
                    {onViewChild && (
                      <td className="py-3 px-4">
                        <button onClick={() => onViewChild(childIdForView(child))} className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                          View
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
