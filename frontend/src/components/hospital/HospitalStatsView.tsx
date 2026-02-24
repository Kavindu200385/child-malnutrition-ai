/**
 * Pediatric Unit (Hospital) Dashboard – same UI as other roles.
 * Each hospital sees only their own registered children and stats (backend scopes by user.hospital_id).
 */
import { useState, useEffect } from 'react';
import { User } from '../../App';
import { hospitalAPI } from '../../services/api';
import { SharedDashboardLayout } from '../health-worker/SharedDashboardLayout';
import { ArrowRight, Loader2 } from 'lucide-react';

interface HospitalStatsViewProps {
  user: User;
  onViewChild?: (childId: string | number) => void;
}

export function HospitalStatsView({ user, onViewChild }: HospitalStatsViewProps) {
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

  return (
    <SharedDashboardLayout
      title="Dashboard"
      subtitle="Overview of registered children and risk levels at your hospital"
      stats={{
        total_children,
        normal_count,
        mam_count,
        sam_count,
      }}
      children={children}
      onViewChild={onViewChild}
      extraCard={{
        label: 'Transferred to Nutritionist',
        value: transferred,
        color: '#3B82F6',
        icon: <ArrowRight className="w-6 h-6 text-blue-600" />,
      }}
      emptyMessage="No children registered at your hospital yet."
    />
  );
}
