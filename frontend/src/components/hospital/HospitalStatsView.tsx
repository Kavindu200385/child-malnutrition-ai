/**
 * Pediatric Unit (Hospital) Dashboard.
 * Shows birth-risk stats, TBA count, and transferred count.
 * Predicted Cases and Critical Cases alerts are hidden — hospital is read-only.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User } from '../../App';
import { hospitalAPI } from '../../services/api';
import { SharedDashboardLayout } from '../health-worker/SharedDashboardLayout';
import { ArrowRight, Clock, Loader2, RefreshCw } from 'lucide-react';

const POLL_MS = 30_000;

interface HospitalStatsViewProps {
  user: User;
  onViewChild?: (childId: string | number) => void;
}

export function HospitalStatsView({ onViewChild }: HospitalStatsViewProps) {
  const [stats, setStats] = useState<any>(null);
  const [children, setChildren] = useState<any[]>([]);
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
      const [statsRes, childrenRes] = await Promise.all([
        hospitalAPI.getStats(),
        hospitalAPI.listChildren({}),
      ]);
      setStats(statsRes.data?.status === 'success' ? statsRes.data.stats : null);
      setChildren(childrenRes.data?.status === 'success' ? childrenRes.data.children || [] : []);
      setLastUpdated(new Date());
    } catch (err: any) {
      if (!silent) setError(err.response?.data?.message || 'Failed to load dashboard');
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
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  const total_children = stats?.total_children ?? 0;
  const normal_count = stats?.normal_cases ?? 0;
  const mam_count = stats?.mam_cases ?? 0;
  const sam_count = stats?.sam_cases ?? 0;
  const transferred = stats?.transferred_to_nutritionist ?? 0;
  const tba_count = stats?.tba_cases ?? 0;
  const predicted_sam_count = stats?.predicted_sam_cases ?? 0;
  const predicted_mam_count = stats?.predicted_mam_cases ?? 0;

  return (
    <SharedDashboardLayout
      title="Dashboard"
      subtitle={
        lastUpdated ? (
          <span className="flex items-center gap-2">
            Overview of registered children and risk levels at your hospital
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Live · {lastUpdated.toLocaleTimeString()}
            </span>
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1 text-xs text-indigo-700 hover:text-indigo-900 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </span>
        ) : 'Overview of registered children and risk levels at your hospital'
      }
      stats={{
        total_children,
        normal_count,
        mam_count,
        sam_count,
        predicted_sam_count,
        predicted_mam_count,
      }}
      children={children}
      onViewChild={onViewChild}
      hidePredictedCard
      hideCriticalAlert
      extraCards={[
        {
          label: 'Transferred to Nutritionist',
          value: transferred,
          color: '#3B82F6',
          icon: <ArrowRight className="w-6 h-6 text-blue-600" />,
        },
        {
          label: 'Awaiting Care (TBA)',
          value: tba_count,
          color: '#F59E0B',
          icon: <Clock className="w-6 h-6 text-amber-600" />,
        },
      ]}
      emptyMessage="No children registered at your hospital yet."
    />
  );
}
