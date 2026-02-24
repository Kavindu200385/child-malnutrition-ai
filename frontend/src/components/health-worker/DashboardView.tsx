import { useState, useEffect } from 'react';
import { midwifeAPI } from '../../services/api';
import { SharedDashboardLayout } from './SharedDashboardLayout';

interface DashboardViewProps {
  onViewChild: (childId: string) => void;
}

export function DashboardView({ onViewChild }: DashboardViewProps) {
  const [stats, setStats] = useState<{ total_children: number; normal_count: number; mam_count: number; sam_count: number } | null>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      midwifeAPI.getDashboardStats().then((r) => r.data?.stats ?? null),
      midwifeAPI.listChildren({}).then((r) => (r.data?.status === 'success' ? r.data.children || [] : [])),
    ])
      .then(([s, c]) => {
        if (!cancelled) {
          setStats(s || null);
          setChildren(Array.isArray(c) ? c : []);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load dashboard');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

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
      subtitle="Overview of child nutrition status in your area"
      stats={{
        total_children: stats?.total_children ?? 0,
        normal_count: stats?.normal_count ?? 0,
        mam_count: stats?.mam_count ?? 0,
        sam_count: stats?.sam_count ?? 0,
      }}
      children={children}
      onViewChild={(id) => onViewChild(String(id))}
      emptyMessage="No children in your area yet."
    />
  );
}
