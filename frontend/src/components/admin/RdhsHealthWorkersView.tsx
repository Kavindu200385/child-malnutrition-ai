/**
 * RDHS Health Workers – list district workers, activate/deactivate, view performance.
 */
import { useState, useEffect } from 'react';
import { Users, RefreshCw, UserCheck, UserX, BarChart2 } from 'lucide-react';
import { rdhsAPI } from '../../services/api';

export function RdhsHealthWorkersView() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [performanceUser, setPerformanceUser] = useState<any>(null);
  const [performance, setPerformance] = useState<any>(null);

  const load = () => {
    setError('');
    setLoading(true);
    rdhsAPI
      .healthWorkers({ include_inactive: true })
      .then((res) => {
        if (res.data?.status === 'success') {
          setWorkers(res.data.workers || []);
        } else {
          setError(res.data?.message || 'Failed to load workers');
        }
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load workers'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleStatus = (user: any, active: boolean) => {
    rdhsAPI
      .setUserStatus(user.id, { is_active: active })
      .then(() => load())
      .catch((err) => setError(err.response?.data?.message || 'Failed to update status'));
  };

  const showPerformance = (user: any) => {
    setPerformanceUser(user);
    rdhsAPI
      .userPerformance(user.id)
      .then((res) => {
        if (res.data?.status === 'success') {
          setPerformance(res.data.performance);
        }
      })
      .catch(() => setPerformance(null));
  };

  const roleLabel: Record<string, string> = {
    moh: 'MOH',
    amoh: 'AMOH',
    midwife: 'Midwife',
    nutritionist: 'Nutritionist',
    hospital: 'Pediatric Unit',
    rdhs: 'RDHS',
    pdhs: 'PDHS',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Health Workers</h2>
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">Loading workers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-900">District Health Workers</h2>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Name</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Role</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Assigned Areas</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {workers.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-500">No workers in your district.</td>
              </tr>
            ) : (
              workers.map((w) => (
                <tr key={w.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-medium text-gray-900">{w.name}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{roleLabel[w.role] || w.role}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {(w.assigned_areas || []).map((a: any) => a.name).join(', ') || '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-block px-2 py-1 text-xs rounded-full ${w.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                      {w.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => showPerformance(w)}
                      className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                    >
                      <BarChart2 className="w-4 h-4" /> Performance
                    </button>
                    {w.role !== 'health_ministry' && (
                      w.is_active ? (
                        <button
                          type="button"
                          onClick={() => handleStatus(w, false)}
                          className="text-amber-600 hover:underline text-sm flex items-center gap-1"
                        >
                          <UserX className="w-4 h-4" /> Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStatus(w, true)}
                          className="text-green-600 hover:underline text-sm flex items-center gap-1"
                        >
                          <UserCheck className="w-4 h-4" /> Activate
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {performanceUser && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Performance: {performanceUser.name}</h3>
          {performance ? (
            <ul className="space-y-1 text-sm text-gray-600">
              <li>Children in area: {performance.children_in_area}</li>
              <li>Measurements taken: {performance.measurements_taken}</li>
              <li>Escalations made: {performance.escalations_made}</li>
            </ul>
          ) : (
            <p className="text-gray-500">Loading…</p>
          )}
          <button
            type="button"
            onClick={() => { setPerformanceUser(null); setPerformance(null); }}
            className="mt-4 text-sm text-gray-500 hover:underline"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
