/**
 * RDHS District Dashboard Overview
 * Same UI layout as Admin Overview but district-filtered data only.
 * Auto-refreshes so details stay live.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Users, Building2, AlertTriangle, Activity, Stethoscope, UserCheck, RefreshCw, Brain } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { rdhsAPI } from '../../services/api';

const REFRESH_INTERVAL_MS = 45 * 1000; // 45 seconds

function formatLastUpdated(d: Date) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function RdhsOverview() {
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
      const res = await rdhsAPI.dashboardSummary();
      if (res.data?.status === 'success' && res.data?.data) {
        setData(res.data.data);
        setLastUpdated(new Date());
      } else {
        if (!isBackgroundRefresh) setError(res.data?.message || 'Failed to load district dashboard');
      }
    } catch (err: any) {
      if (!isBackgroundRefresh) setError(err.response?.data?.message || 'Failed to load district dashboard');
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
        <h2 className="text-2xl font-bold text-gray-900">District Overview</h2>
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">Loading district data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">District Overview</h2>
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  const districtNames = (data?.district_names || []).join(', ') || 'Your District';
  const totalChildren = data?.total_children ?? 0;
  const samCount = data?.sam_count ?? 0;
  const predictedSam = data?.predicted_sam_count ?? 0;
  const predictedMam = data?.predicted_mam_count ?? 0;
  const predictedTotal = predictedSam + predictedMam;
  const totalMoh = data?.total_moh_areas ?? 0;
  const totalMidwives = data?.total_midwives ?? 0;
  const totalNutritionists = data?.total_nutritionists ?? 0;
  const escalationSummary = data?.escalation_summary ?? { total: 0, pending: 0, reviewed: 0 };
  const monthlyTrend = data?.monthly_trend ?? [];
  const mohPerformance = data?.moh_performance ?? [];
  const riskDistribution = (data?.risk_distribution ?? []).filter((d: any) => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">District Overview</h2>
          <p className="text-gray-600 mt-1">{districtNames} – district-level dashboard (read-only)</p>
          {lastUpdated && (
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
              {refreshing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              Last updated {formatLastUpdated(lastUpdated)}
              {refreshing && ' · Updating…'}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => loadDashboard(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-70 rounded-lg text-sm font-medium text-gray-700 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
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
              <p className="text-sm text-gray-600">Midwives</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalMidwives}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Stethoscope className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Nutritionists</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalNutritionists}</p>
            </div>
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <UserCheck className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600">Severe Cases (SAM)</p>
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
            <p className="text-sm font-medium text-purple-700">Future Risk Prediction (next 2 months)</p>
          </div>
          <p className="text-3xl font-bold text-purple-900">{predictedTotal}</p>
          <p className="text-xs text-purple-500 mt-1">Severe risk: {predictedSam} · Moderate/High risk: {predictedMam}</p>
        </div>
      </div>

      {samCount > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-lg font-bold text-red-900">{samCount} Severe SAM Cases in District</h3>
              <p className="text-red-800 mt-1">Coordinate with MOH areas and nutrition support.</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">District Current Nutrition Status</h3>
          {riskDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={riskDistribution} cx="50%" cy="50%" labelLine={false} label={(e: any) => `${e.name}: ${e.value}`} outerRadius={80} dataKey="value">
                  {riskDistribution.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 py-8 text-center">No risk data yet.</p>
          )}
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">MOH Nutrition Status Comparison</h3>
          {mohPerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={mohPerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="moh_name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="normal" fill="#2ECC71" name="Normal" />
                <Bar dataKey="mam" fill="#F1C40F" name="MAM" />
                <Bar dataKey="sam" fill="#E74C3C" name="SAM" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 py-8 text-center">No MOH area data yet.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Monthly Child Monitoring Trend</h3>
        {monthlyTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="children" stroke="#3498DB" strokeWidth={2} name="Children" />
              <Line type="monotone" dataKey="sam" stroke="#E74C3C" strokeWidth={2} name="SAM" />
              <Line type="monotone" dataKey="mam" stroke="#F1C40F" strokeWidth={2} name="MAM" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 py-8 text-center">No trend data yet.</p>
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
