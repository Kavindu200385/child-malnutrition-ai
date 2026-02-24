import { useState, useEffect } from 'react';
import { Users, UserMinus } from 'lucide-react';
import { mohAPI } from '../../services/api';
import { MidwifeTransferView } from './MidwifeTransferView';

type Tab = 'workers' | 'transfer';

export function AreaWorkersView() {
  const [tab, setTab] = useState<Tab>('workers');
  const [midwives, setMidwives] = useState([]);
  const [nutritionists, setNutritionists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await mohAPI.listWorkers();
      if (res.data?.status === 'success') {
        setMidwives(res.data.midwives || []);
        setNutritionists(res.data.nutritionists || []);
      } else setError(res.data?.message || 'Failed to load');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (workerId, currentActive) => {
    setActionLoading(true);
    setError('');
    try {
      await mohAPI.setWorkerActive(workerId, !currentActive);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Update failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Area Health Workers</h2>
        <p className="text-gray-600 mt-1">Manage workers and midwife assignments in your MOH area</p>
      </div>

      {/* Tabs: Workers list | Midwife Transfer */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1" aria-label="Tabs">
          <button
            onClick={() => setTab('workers')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              tab === 'workers'
                ? 'border-teal-600 text-teal-700 bg-teal-50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Users className="w-4 h-4" />
            Workers
          </button>
          <button
            onClick={() => setTab('transfer')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              tab === 'transfer'
                ? 'border-teal-600 text-teal-700 bg-teal-50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <UserMinus className="w-4 h-4" />
            Midwife Transfer
          </button>
        </nav>
      </div>

      {tab === 'transfer' ? (
        <MidwifeTransferView />
      ) : loading ? (
        <div className="text-gray-600">Loading health workers...</div>
      ) : (
        <>

      {error && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Midwives</h3>
        {midwives.length === 0 ? (
          <p className="text-gray-500">No midwives in your area.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Username / Staff ID</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Children</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">MAM</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">SAM</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Escalations</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {midwives.map((mw) => (
                  <tr key={mw.id}>
                    <td className="px-4 py-3 text-gray-900">{mw.name}</td>
                    <td className="px-4 py-3 text-gray-600">{mw.username} {mw.staff_id ? `• ${mw.staff_id}` : ''}</td>
                    <td className="px-4 py-3 text-gray-900">{mw.stats?.total_children ?? 0}</td>
                    <td className="px-4 py-3 text-gray-900">{mw.stats?.mam_count ?? 0}</td>
                    <td className="px-4 py-3 text-gray-900">{mw.stats?.sam_count ?? 0}</td>
                    <td className="px-4 py-3 text-gray-900">{mw.stats?.escalations_count ?? 0}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(mw.id, mw.is_active)}
                        disabled={actionLoading || mw.is_protected}
                        className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        {mw.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Nutritionists (hospital in district)</h3>
        {nutritionists.length === 0 ? (
          <p className="text-gray-500">No nutritionists linked to hospitals in your district.</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {nutritionists.map((n) => (
              <li key={n.id} className="py-3 flex items-center justify-between">
                <span className="font-medium text-gray-900">{n.name}</span>
                <span className="text-sm text-gray-600">{n.username}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
        </>
      )}
    </div>
  );
}
