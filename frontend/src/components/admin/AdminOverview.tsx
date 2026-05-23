import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Building2, AlertTriangle, Activity, RefreshCw, Brain } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { reportsAPI } from '../../services/api';

interface OverviewStats {
  total_children: number;
  total_workers: number;
  total_clinics: number;
  sam_count: number;
  mam_count: number;
  normal_count: number;
  predicted_sam_count: number;
  predicted_mam_count: number;
  district_breakdown: { district: string; total: number; sam: number; mam: number; normal: number }[];
  monthly_trend: { month: string; children: number; sam: number; mam: number }[];
  clinic_performance: { clinic_name: string; district: string; total: number; sam: number; mam: number; normal: number; status: string }[];
}

const POLL_MS = 45_000;

export function AdminOverview() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const res = await reportsAPI.overviewStats();
      if (res.data?.status === 'success' && res.data?.data) {
        setStats(res.data.data);
        setLastUpdated(new Date());
      } else if (!silent) {
        setError(res.data?.message || 'Failed to load overview');
      }
    } catch (err: any) {
      if (!silent) setError(err.response?.data?.message || 'Failed to load overview');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    timerRef.current = setInterval(() => load(true), POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">System Overview</h2>
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">Loading overview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">System Overview</h2>
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  const totalChildren = stats?.total_children ?? 0;
  const totalHealthWorkers = stats?.total_workers ?? 0;
  const totalClinics = stats?.total_clinics ?? 0;
  const samCases = stats?.sam_count ?? 0;
  const mamCases = stats?.mam_count ?? 0;
  const normalCases = stats?.normal_count ?? 0;
  const predictedSam = stats?.predicted_sam_count ?? 0;
  const predictedMam = stats?.predicted_mam_count ?? 0;
  const predictedTotal = predictedSam + predictedMam;

  const districtData = (stats?.district_breakdown ?? []).map((d) => ({
    district: d.district.length > 20 ? d.district.slice(0, 18) + '…' : d.district,
    total: d.total,
    sam: d.sam,
    mam: d.mam,
    normal: d.normal,
  }));

  const monthlyTrend = stats?.monthly_trend ?? [];

  const riskDistribution = [
    { name: 'Normal', value: normalCases, color: '#2ECC71' },
    { name: 'MAM', value: mamCases, color: '#F1C40F' },
    { name: 'SAM', value: samCases, color: '#E74C3C' },
  ].filter((d) => d.value > 0);

  const clinicRows = stats?.clinic_performance ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">System Overview</h2>
          <p className="text-gray-600 mt-1">National child malnutrition monitoring dashboard</p>
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
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Clinics (PHM)</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalClinics}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Health Workers</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalHealthWorkers}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Children</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalChildren}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Critical Cases (SAM)</p>
              <p className="text-3xl font-bold text-red-600 mt-2">{samCases}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {samCases > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-lg font-bold text-red-900">
                {samCases} Critical SAM Cases Nationwide
              </h3>
              <p className="text-red-800 mt-1">
                Immediate coordination required with district health offices and nutritional support programs.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* AI Predicted Cases */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg shadow p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Brain className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-purple-700">AI Predicted Cases (next 2 months) – National</p>
              <p className="text-3xl font-bold text-purple-900 mt-0.5">{predictedTotal}</p>
              <p className="text-xs text-purple-500 mt-0.5">SAM: {predictedSam} &nbsp;·&nbsp; MAM: {predictedMam}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart - National Risk Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">National Risk Distribution</h3>
          {riskDistribution.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={riskDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {riskDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 flex justify-center gap-6">
                {riskDistribution.map((item) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }} />
                    <span className="text-sm text-gray-600">{item.name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-gray-500 py-8 text-center">No risk distribution data yet.</p>
          )}
        </div>

        {/* Bar Chart - District Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">District-wise Distribution</h3>
          {districtData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={districtData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="district" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="normal" fill="#2ECC71" name="Normal" />
                <Bar dataKey="mam" fill="#F1C40F" name="MAM" />
                <Bar dataKey="sam" fill="#E74C3C" name="SAM" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 py-8 text-center">No district data yet.</p>
          )}
        </div>

        {/* Line Chart - 6-Month Trend */}
        <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
          <h3 className="text-lg font-bold text-gray-900 mb-4">6-Month National Trend</h3>
          {monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="children" stroke="#3498DB" strokeWidth={2} name="Total Children" />
                <Line type="monotone" dataKey="sam" stroke="#E74C3C" strokeWidth={2} name="SAM Cases" />
                <Line type="monotone" dataKey="mam" stroke="#F1C40F" strokeWidth={2} name="MAM Cases" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 py-8 text-center">No trend data yet.</p>
          )}
        </div>
      </div>

      {/* Clinic Performance Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">MOH Area Performance Overview</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Area Name</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">District</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Children</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">SAM</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">MAM</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Normal</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {clinicRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">
                    No MOH areas with data yet. Create areas and assign children to see performance.
                  </td>
                </tr>
              ) : (
                clinicRows.map((row) => (
                  <tr key={row.clinic_name + row.district} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">{row.clinic_name}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{row.district}</td>
                    <td className="py-3 px-4 text-sm text-gray-900">{row.total}</td>
                    <td className="py-3 px-4 text-sm text-red-600 font-medium">{row.sam}</td>
                    <td className="py-3 px-4 text-sm text-yellow-600 font-medium">{row.mam}</td>
                    <td className="py-3 px-4 text-sm text-green-600 font-medium">{row.normal}</td>
                    <td className="py-3 px-4">
                      <span className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* System Health */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="font-medium text-gray-900 mb-2">Total Children Registered</h4>
          <p className="text-3xl font-bold text-green-600">{totalChildren}</p>
          <p className="text-sm text-gray-600 mt-1">Active in system</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="font-medium text-gray-900 mb-2">PHM Areas</h4>
          <p className="text-3xl font-bold text-blue-600">{totalClinics}</p>
          <p className="text-sm text-gray-600 mt-1">Clinic-level areas</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="font-medium text-gray-900 mb-2">Health Workers</h4>
          <p className="text-3xl font-bold text-blue-600">{totalHealthWorkers}</p>
          <p className="text-sm text-gray-600 mt-1">PDHS, RDHS, MOH, Midwife, Nutritionist, Pediatric Unit</p>
        </div>
      </div>
    </div>
  );
}
