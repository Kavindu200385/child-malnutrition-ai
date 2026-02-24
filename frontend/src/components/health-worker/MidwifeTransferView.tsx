import { useState, useEffect } from 'react';
import { UserMinus, Search } from 'lucide-react';
import { mohAPI } from '../../services/api';

export function MidwifeTransferView() {
  const [midwives, setMidwives] = useState([]);
  const [phmAreas, setPhmAreas] = useState([]);
  const [searchStaffId, setSearchStaffId] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [assignPhmId, setAssignPhmId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadWorkers();
    loadAreas();
  }, []);

  const loadWorkers = async () => {
    try {
      const res = await mohAPI.listWorkers();
      if (res.data?.status === 'success') setMidwives(res.data.midwives || []);
    } catch {
      setMidwives([]);
    }
  };

  const loadAreas = async () => {
    try {
      const res = await mohAPI.getAreas();
      if (res.data?.status === 'success') setPhmAreas(res.data.phm_areas || []);
    } catch {
      setPhmAreas([]);
    }
  };

  const handleSearch = async () => {
    if (!searchStaffId.trim()) return;
    setError('');
    setSearchResult(null);
    setLoading(true);
    try {
      const res = await mohAPI.searchMidwife({ staff_id: searchStaffId.trim() });
      if (res.data?.status === 'success') setSearchResult(res.data.midwife);
      else setError(res.data?.message || 'Not found');
    } catch (err) {
      setError(err.response?.data?.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async (midwifeId) => {
    setError('');
    setMessage('');
    try {
      await mohAPI.releaseMidwife(midwifeId);
      setMessage('Midwife released successfully.');
      loadWorkers();
    } catch (err) {
      setError(err.response?.data?.message || 'Release failed');
    }
  };

  const handleAssign = async () => {
    if (!searchResult?.id || !assignPhmId) {
      setError('Select a PHM area to assign.');
      return;
    }
    setError('');
    setMessage('');
    try {
      await mohAPI.assignMidwife(searchResult.id, { phm_area_id: parseInt(assignPhmId, 10) });
      setMessage('Midwife assigned successfully.');
      setSearchResult(null);
      setSearchStaffId('');
      setAssignPhmId('');
      loadWorkers();
    } catch (err) {
      setError(err.response?.data?.message || 'Assign failed');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Midwife Transfer Management</h2>
        <p className="text-gray-600 mt-1">Release midwives from your area or assign unassigned midwives</p>
      </div>

      {error && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}
      {message && (
        <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
          <p className="text-sm text-green-900">{message}</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Assign unassigned midwife</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="staff-search" className="block text-sm font-medium text-gray-700 mb-2">
              Staff ID or username
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="staff-search"
                type="text"
                value={searchStaffId}
                onChange={(e) => setSearchStaffId(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. MW001"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
        {searchResult && (
          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="font-medium text-gray-900">{searchResult.name}</p>
                <p className="text-sm text-gray-600">{searchResult.username} {searchResult.staff_id ? `• ${searchResult.staff_id}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="phm-area" className="text-sm font-medium text-gray-700">Assign to PHM area:</label>
                <select
                  id="phm-area"
                  value={assignPhmId}
                  onChange={(e) => setAssignPhmId(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                >
                  <option value="">Select area</option>
                  {phmAreas.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleAssign}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Assign
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Midwives in your area (release for transfer)</h3>
        {midwives.length === 0 ? (
          <p className="text-gray-500">No midwives in your area.</p>
        ) : (
          <div className="divide-y divide-gray-200">
            {midwives.map((mw) => (
              <div key={mw.id} className="py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{mw.name}</p>
                  <p className="text-sm text-gray-600">
                    {mw.username} • Children: {mw.stats?.total_children ?? 0} • MAM: {mw.stats?.mam_count ?? 0} • SAM: {mw.stats?.sam_count ?? 0}
                  </p>
                </div>
                <button
                  onClick={() => handleRelease(mw.id)}
                  className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Release
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
