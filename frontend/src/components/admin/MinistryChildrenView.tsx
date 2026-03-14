/**
 * Health Ministry – read-only list of ALL children on the island.
 * Backend returns all children for health_ministry role (no area filter).
 */
import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { childrenAPI } from '../../services/api';
import { getDisplayRiskLevel } from '../../types';

export function MinistryChildrenView() {
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    setLoading(true);
    childrenAPI
      .list({})
      .then((res) => {
        if (res.data?.status === 'success') {
          setChildren(res.data.children || []);
        }
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load children'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const riskColor: Record<string, string> = {
    NORMAL: 'bg-green-100 text-green-800',
    MAM: 'bg-yellow-100 text-yellow-800',
    MODERATE: 'bg-yellow-100 text-yellow-800',
    SAM: 'bg-red-100 text-red-800',
    CRITICAL: 'bg-red-100 text-red-800',
    HIGH: 'bg-orange-100 text-orange-800',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">All Children</h2>
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">Loading all island children...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-900">All Island Children</h2>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>
      <p className="text-sm text-gray-600">All children in the system (island-wide). Read-only view.</p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">ID</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Name</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Risk</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Guardian</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
            </tr>
          </thead>
          <tbody>
            {children.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-500">No children in the system.</td>
              </tr>
            ) : (
              children.map((c) => (
                <tr key={c.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-mono text-gray-700">{c.child_id || c.child_unique_id || c.id}</td>
                  <td className="py-3 px-4 text-sm font-medium text-gray-900">{c.name || '—'}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-block px-2 py-1 text-xs rounded-full ${riskColor[getDisplayRiskLevel(c)] || 'bg-gray-100 text-gray-700'}`}>
                      {getDisplayRiskLevel(c)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">{c.guardian_name || '—'}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{c.status || 'ACTIVE'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
