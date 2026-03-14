/**
 * RDHS Health Workers – list district workers, activate/deactivate, view performance.
 * Same layout and behaviour as PDHS Health Workers page.
 */
import React, { useState, useEffect } from 'react';
import { Users, RefreshCw, UserCheck, UserX, BarChart2, UserCircle, ClipboardList, AlertTriangle, X } from 'lucide-react';
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
    pdhs: 'PDHS',
    rdhs: 'RDHS',
    moh: 'MOH',
    amoh: 'AMOH',
    nutritionist: 'Nutritionist',
    midwife: 'Midwife',
    hospital: 'Pediatric Unit',
  };

  /** Role order for sections (role-wise view), same as PDHS */
  const roleOrder = ['pdhs', 'rdhs', 'moh', 'amoh', 'nutritionist', 'midwife', 'hospital'];
  const byRole = roleOrder.reduce<Record<string, any[]>>((acc, role) => {
    acc[role] = workers.filter((w) => w.role === role);
    return acc;
  }, {});

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

      {workers.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          No workers in your district.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full table-fixed" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '22%' }} />
              <col style={{ width: '38%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '28%' }} />
            </colgroup>
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Name</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Assigned Areas</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roleOrder.map((role) => {
                const list = byRole[role];
                if (!list || list.length === 0) return null;
                const label = roleLabel[role] || role;
                return (
                  <React.Fragment key={role}>
                    <tr className="border-b bg-gray-100">
                      <td colSpan={4} className="py-2 px-4 text-sm font-semibold text-gray-800">
                        {label} <span className="font-normal text-gray-500">({list.length} worker{list.length !== 1 ? 's' : ''})</span>
                      </td>
                    </tr>
                    {list.map((w) => (
                      <tr key={w.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm font-medium text-gray-900 align-middle">{w.name}</td>
                        <td className="py-3 px-4 text-sm text-gray-600 align-middle">
                          {(w.assigned_areas || []).map((a: any) => a.name).join(', ') || '—'}
                        </td>
                        <td className="py-3 px-4 align-middle">
                          <span className={`inline-block px-2 py-1 text-xs rounded-full ${w.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                            {w.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 px-4 align-middle">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => showPerformance(w)}
                              className="text-blue-600 hover:underline text-sm flex items-center gap-1 whitespace-nowrap"
                            >
                              <BarChart2 className="w-4 h-4 shrink-0" /> Performance
                            </button>
                            {w.role !== 'health_ministry' && (
                              w.is_active ? (
                                <button
                                  type="button"
                                  onClick={() => handleStatus(w, false)}
                                  className="text-amber-600 hover:underline text-sm flex items-center gap-1 whitespace-nowrap"
                                >
                                  <UserX className="w-4 h-4 shrink-0" /> Deactivate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleStatus(w, true)}
                                  className="text-green-600 hover:underline text-sm flex items-center gap-1 whitespace-nowrap"
                                >
                                  <UserCheck className="w-4 h-4 shrink-0" /> Activate
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {performanceUser && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <UserCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Performance</h3>
                <p className="text-indigo-100 text-sm">{performanceUser.name}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setPerformanceUser(null); setPerformance(null); }}
              className="p-2 rounded-lg text-white/80 hover:bg-white/20 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6">
            {performance ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Children in area</p>
                    <p className="text-2xl font-bold text-gray-900 mt-0.5">{performance.children_in_area ?? 0}</p>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <ClipboardList className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Measurements taken</p>
                    <p className="text-2xl font-bold text-gray-900 mt-0.5">{performance.measurements_taken ?? 0}</p>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Escalations made</p>
                    <p className="text-2xl font-bold text-gray-900 mt-0.5">{performance.escalations_made ?? 0}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center">
                <div className="inline-block w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-gray-500">Loading performance…</p>
              </div>
            )}
            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => { setPerformanceUser(null); setPerformance(null); }}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
