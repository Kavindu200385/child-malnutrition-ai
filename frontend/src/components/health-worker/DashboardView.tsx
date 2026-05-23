import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { midwifeAPI } from '../../services/api';
import { SharedDashboardLayout } from './SharedDashboardLayout';

const POLL_MS = 30_000;

interface DashboardViewProps {
  onViewChild: (childId: string) => void;
}

export function DashboardView({ onViewChild }: DashboardViewProps) {
  const [stats, setStats] = useState<{ total_children: number; normal_count: number; mam_count: number; sam_count: number; predicted_sam_count?: number; predicted_mam_count?: number } | null>(null);
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
        midwifeAPI.getDashboardStats(),
        midwifeAPI.listChildren({}),
      ]);
      setStats(statsRes.data?.stats ?? null);
      setChildren(Array.isArray(childrenRes.data?.children) ? childrenRes.data.children : []);
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

  return (
    <SharedDashboardLayout
      title="Dashboard"
      subtitle={
        lastUpdated ? (
          <span className="flex items-center gap-2">
            Overview of child nutrition status in your area
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Live · {lastUpdated.toLocaleTimeString()}
            </span>
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </span>
        ) : 'Overview of child nutrition status in your area'
      }
      stats={{
        total_children: stats?.total_children ?? 0,
        normal_count: stats?.normal_count ?? 0,
        mam_count: stats?.mam_count ?? 0,
        sam_count: stats?.sam_count ?? 0,
        predicted_sam_count: stats?.predicted_sam_count ?? 0,
        predicted_mam_count: stats?.predicted_mam_count ?? 0,
      }}
      children={children}
      onViewChild={(id) => onViewChild(String(id))}
      emptyMessage="No children in your area yet."
    />
  );
}
