/**
 * PDHS Area Management – view districts/MOH in province, create/update MOH areas only.
 */
import { useState, useEffect } from 'react';
import { MapPin, Plus, RefreshCw, Edit2 } from 'lucide-react';
import { pdhsAPI } from '../../services/api';

export function PdhsAreaView() {
  const [areas, setAreas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateMoh, setShowCreateMoh] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [createName, setCreateName] = useState('');
  const [createParentId, setCreateParentId] = useState<number | ''>('');
  const [districtOptions, setDistrictOptions] = useState<any[]>([]);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setError('');
    setLoading(true);
    pdhsAPI
      .areas({})
      .then((res) => {
        if (res.data?.status === 'success') {
          setAreas(res.data.areas || []);
          const districts = (res.data.areas || []).filter((a: any) => a.level === 'rdhs');
          setDistrictOptions(districts);
          if (districts.length && !createParentId) setCreateParentId(districts[0].id);
        }
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load areas'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreateMoh = () => {
    if (!createName || !createParentId) {
      setError('Name and district (parent) are required');
      return;
    }
    setSubmitting(true);
    setError('');
    pdhsAPI
      .mohCreate({ name: createName, parent_id: createParentId })
      .then(() => {
        setShowCreateMoh(false);
        setCreateName('');
        load();
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to create MOH area'))
      .finally(() => setSubmitting(false));
  };

  const startEdit = (area: any) => {
    setEditingId(area.id);
    setEditName(area.name || '');
    setEditDescription(area.description || '');
  };

  const handleUpdateMoh = () => {
    if (editingId == null) return;
    setSubmitting(true);
    setError('');
    pdhsAPI
      .mohUpdate(editingId, { name: editName, description: editDescription || undefined })
      .then(() => {
        setEditingId(null);
        load();
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to update MOH area'))
      .finally(() => setSubmitting(false));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Area Management</h2>
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">Loading areas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Province Areas</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowCreateMoh(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add MOH Area
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-600">View districts and MOH areas. You can create or edit MOH areas within your province only.</p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      )}

      {showCreateMoh && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Create MOH Area</h3>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="border rounded-lg px-3 py-2 w-64"
                placeholder="MOH area name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">District (parent)</label>
              <select
                value={createParentId}
                onChange={(e) => setCreateParentId(e.target.value ? Number(e.target.value) : '')}
                className="border rounded-lg px-3 py-2 w-48"
              >
                {districtOptions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name || d.district || `District ${d.id}`}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleCreateMoh}
              disabled={submitting}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateMoh(false)}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Name</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Level</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Code</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {areas.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-500">No areas in your province.</td>
              </tr>
            ) : (
              areas.map((a) => (
                <tr key={a.id} className="border-b hover:bg-gray-50">
                  {editingId === a.id ? (
                    <>
                      <td className="py-3 px-4" colSpan={2}>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="border rounded px-2 py-1 w-48 mr-2"
                          placeholder="Name"
                        />
                        <input
                          type="text"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="border rounded px-2 py-1 w-40"
                          placeholder="Description"
                        />
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">{a.code || '—'}</td>
                      <td className="py-3 px-4 flex gap-2">
                        <button
                          type="button"
                          onClick={handleUpdateMoh}
                          disabled={submitting}
                          className="text-sm text-green-600 hover:underline"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-sm text-gray-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 px-4 text-sm font-medium text-gray-900">{a.name || '—'}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{a.level}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{a.code || '—'}</td>
                      <td className="py-3 px-4">
                        {a.level === 'moh' && (
                          <button
                            type="button"
                            onClick={() => startEdit(a)}
                            className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                          >
                            <Edit2 className="w-4 h-4" /> Edit
                          </button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
