/**
 * PDHS Province Dashboard Overview
 * Same UI layout as RDHS/Admin but province-filtered data only.
 * Auto-refreshes so details stay live (including nutritionist data).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Users, Building2, AlertTriangle, Activity, Stethoscope, UserCheck, MapPin, RefreshCw, Brain } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { pdhsAPI } from '../../services/api';

const REFRESH_INTERVAL_MS = 45 * 1000; // 45 seconds

function formatLastUpdated(d: Date) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function PdhsOverview() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadDashboard = useCallback(async (isBackgroundRefresh = false) => {
    if (isBackgroundRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const res = await pdhsAPI.dashboardSummary();
      if (res.data?.status === 'success' && res.data?.data) {
        setData(res.data.data);
        setLastUpdated(new Date());
      } else {
        if (!isBackgroundRefresh) setError(res.data?.message || 'Failed to load province dashboard');
      }
    } catch (err: any) {
      if (!isBackgroundRefresh) setError(err.response?.data?.message || 'Failed to load province dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard(false);
    const interval = setInterval(() => loadDashboard(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Province Overview</h2>
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">Loading province data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Province Overview</h2>
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  const provinceNames = (data?.province_names || []).join(', ') || 'Your Province';
  const totalChildren = data?.total_children ?? 0;
  const samCount = data?.sam_count ?? 0;
  const predictedSam = data?.predicted_sam_count ?? 0;
  const predictedMam = data?.predicted_mam_count ?? 0;
  const predictedTotal = predictedSam + predictedMam;
  const totalDistricts = data?.total_districts ?? 0;
  const totalMoh = data?.total_moh_areas ?? 0;
  const totalRdhs = data?.total_rdhs ?? 0;
  const totalMohUsers = data?.total_moh_users ?? 0;
  const totalMidwives = data?.total_midwives ?? 0;
  const totalNutritionists = data?.total_nutritionists ?? 0;
  const escalationSummary = data?.escalation_summary ?? { total: 0, pending: 0, reviewed: 0 };
  const monthlyTrend = data?.monthly_trend ?? [];
  const districtPerformance = data?.district_performance ?? [];
  const mohPerformance = data?.moh_performance ?? [];
  const riskDistribution = (data?.risk_distribution ?? []).filter((d: any) => (d.value ?? 0) > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Province Overview</h2>
          <p className="text-gray-600 mt-1">
            {provinceNames} – province-level dashboard (read-only)
            {lastUpdated && (
              <span className="ml-2 text-sm text-gray-500">· Last updated {formatLastUpdated(lastUpdated)}</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadDashboard(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium disabled:opacity-50"
          title="Refresh dashboard"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <p className="text-sm text-gray-600">Districts</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalDistricts}</p>
            </div>
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <MapPin className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">MOH Areas</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalMoh}</p>
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
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalRdhs + totalMohUsers + totalMidwives + totalNutritionists}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600">Critical Cases (SAM)</p>
          <p className="text-3xl font-bold text-red-600 mt-2">{samCount}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600">Escalations</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{escalationSummary.total}</p>
          <p className="text-xs text-gray-500 mt-1">Pending: {escalationSummary.pending} · Reviewed: {escalationSummary.reviewed}</p>
        </div>
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-purple-600" />
            <p className="text-sm font-medium text-purple-700">AI Predicted (next 2 months)</p>
          </div>
          <p className="text-3xl font-bold text-purple-900">{predictedTotal}</p>
          <p className="text-xs text-purple-500 mt-1">SAM: {predictedSam} · MAM: {predictedMam}</p>
        </div>
      </div>

      {samCount > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-lg font-bold text-red-900">{samCount} SAM Cases in Province</h3>
              <p className="text-red-800 mt-1">Coordinate with districts and MOH areas.</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Province Risk Distribution</h3>
          {riskDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={riskDistribution} cx="50%" cy="50%" labelLine={false} label={(e: any) => `${e.name}: ${e.value}`} outerRadius={80} dataKey="value" nameKey="name">
                  {riskDistribution.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [value, '']} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 py-8 text-center">No risk data yet. Data comes from active children in the province (including nutritionist-reviewed).</p>
          )}
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">District Comparison</h3>
          {districtPerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={districtPerformance} margin={{ top: 20, right: 16, bottom: 100, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="district_name"
                  interval={0}
                  angle={-40}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 12 }}
                />
                <YAxis allowDecimals={false} width={36} tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ fontSize: 13 }} />
                <Legend verticalAlign="top" align="center" wrapperStyle={{ paddingBottom: 12 }} />
                <Bar dataKey="normal" stackId="district" fill="#2ECC71" name="Normal" />
                <Bar dataKey="mam" stackId="district" fill="#F1C40F" name="MAM" />
                <Bar dataKey="sam" stackId="district" fill="#E74C3C" name="SAM" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 py-8 text-center">No district data yet. Data comes from active children per district.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">MOH Comparison</h3>
        {mohPerformance.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={mohPerformance} margin={{ top: 20, right: 16, bottom: 100, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="moh_name"
                interval={0}
                angle={-40}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 12 }}
              />
              <YAxis allowDecimals={false} width={36} tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ fontSize: 13 }} />
              <Legend verticalAlign="top" align="center" wrapperStyle={{ paddingBottom: 12 }} />
              <Bar dataKey="normal" stackId="moh" fill="#2ECC71" name="Normal" />
              <Bar dataKey="mam" stackId="moh" fill="#F1C40F" name="MAM" />
              <Bar dataKey="sam" stackId="moh" fill="#E74C3C" name="SAM" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 py-8 text-center">No MOH area data yet. Data comes from active children per MOH area.</p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Monthly Child Monitoring Trend</h3>
        {monthlyTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis allowDecimals={false} domain={[0, 'auto']} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="children" stroke="#3498DB" strokeWidth={2} name="Children (registered)" />
              <Line type="monotone" dataKey="normal" stroke="#2ECC71" strokeWidth={2} name="Normal" />
              <Line type="monotone" dataKey="mam" stroke="#F1C40F" strokeWidth={2} name="MAM" />
              <Line type="monotone" dataKey="sam" stroke="#E74C3C" strokeWidth={2} name="SAM" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 py-8 text-center">No trend data yet. Shows children registered per month and their current risk.</p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Referral Statistics</h3>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-4 min-w-[200px]">
            <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <UserCheck className="w-7 h-7 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">To nutritionist</p>
              <p className="text-3xl font-bold text-gray-900 mt-0.5">{data?.referral_stats?.total_referrals ?? 0}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
