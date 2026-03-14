/**
 * PDHS Area Management – view areas in province in structural order:
 * Midwife areas (PHM) → MOH areas → RDHS (districts). Create/update MOH areas only.
 */
import { useState, useEffect } from 'react';
import { MapPin, Plus, RefreshCw, Edit2 } from 'lucide-react';
import { pdhsAPI } from '../../services/api';

const LEVEL_ORDER: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'phm', label: 'Midwife areas' },
  { value: 'moh', label: 'MOH areas' },
  { value: 'rdhs', label: 'RDHS' },
];

const LEVEL_LABELS: Record<string, string> = {
  phm: 'Midwife Areas (PHM)',
  moh: 'MOH Areas',
  rdhs: 'RDHS (District)',
  pdhs: 'PDHS (Provincial)',
  ministry: 'Ministry',
};

const LEVEL_HEADER_COLORS: Record<string, string> = {
  phm: 'bg-orange-100 border-orange-300',
  moh: 'bg-yellow-100 border-yellow-300',
  rdhs: 'bg-green-100 border-green-300',
  pdhs: 'bg-blue-100 border-blue-300',
  ministry: 'bg-purple-100 border-purple-300',
};

export function PdhsAreaView() {
  const [areas, setAreas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
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

  const areasByLevel = (level: string) =>
    level === 'all' ? areas : areas.filter((a: any) => (a.level || '').toLowerCase() === level);

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

  const renderAreaTable = (list: any[]) => (
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
        {list.length === 0 ? (
          <tr>
            <td colSpan={4} className="py-6 text-center text-gray-500">No areas in this section.</td>
          </tr>
        ) : (
          list.map((a) => (
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
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Province Area Management</h2>
          <p className="text-sm text-gray-600 mt-1">Structure: Midwife areas (PHM) → MOH areas → RDHS. Create or edit MOH areas within your province.</p>
        </div>
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

      {/* Filter: All | Midwife areas | MOH areas | RDHS */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-700">Filter:</span>
        {LEVEL_ORDER.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setSelectedLevel(value)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              selectedLevel === value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Sections in order: Midwife areas (PHM) → MOH areas → RDHS */}
      <div className="space-y-8">
        {['phm', 'moh', 'rdhs'].map((level) => {
          if (selectedLevel !== 'all' && selectedLevel !== level) return null;
          const displayList = areasByLevel(level);

          return (
            <div key={level} className="bg-white rounded-lg shadow-lg border-2 border-gray-200 overflow-hidden">
              <div className={`px-6 py-4 border-b-2 ${LEVEL_HEADER_COLORS[level] || 'bg-gray-100 border-gray-300'}`}>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  {LEVEL_LABELS[level]} ({displayList.length} {displayList.length === 1 ? 'area' : 'areas'})
                </h3>
              </div>
              <div className="overflow-x-auto">
                {renderAreaTable(displayList)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
