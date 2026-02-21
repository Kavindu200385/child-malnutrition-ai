/**
 * Area Management View
 * Health Ministry can create, update, and manage the area hierarchy
 */
import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, ChevronRight, MapPin, AlertCircle } from 'lucide-react';
import { areasHierarchicalAPI } from '../../services/api';

interface AreaManagementViewProps {
  onBack?: () => void;
}

export function AreaManagementView({ onBack }: AreaManagementViewProps) {
  const [hierarchy, setHierarchy] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingArea, setEditingArea] = useState<any>(null);
  const [selectedLevel, setSelectedLevel] = useState<string>('ministry');

  useEffect(() => {
    loadHierarchy();
  }, []);

  const loadHierarchy = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await areasHierarchicalAPI.getHierarchy();
      if (response.data.status === 'success') {
        setHierarchy(response.data.hierarchy || []);
      } else {
        setError(response.data.message || 'Failed to load hierarchy');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load hierarchy');
      setHierarchy([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (formData: any) => {
    try {
      const response = await areasHierarchicalAPI.create(formData);
      if (response.data.status === 'success') {
        await loadHierarchy();
        setShowCreateForm(false);
      } else {
        setError(response.data.message || 'Failed to create area');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create area');
    }
  };

  const handleUpdate = async (areaId: number, formData: any) => {
    try {
      const response = await areasHierarchicalAPI.update(areaId, formData);
      if (response.data.status === 'success') {
        await loadHierarchy();
        setEditingArea(null);
      } else {
        setError(response.data.message || 'Failed to update area');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update area');
    }
  };

  const handleDelete = async (areaId: number) => {
    if (!confirm('Are you sure you want to delete this area? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await areasHierarchicalAPI.delete(areaId);
      if (response.data.status === 'success') {
        await loadHierarchy();
      } else {
        setError(response.data.message || 'Failed to delete area');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete area');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Area Hierarchy Management</h2>
          <p className="text-gray-600">Manage the 5-level area hierarchy (Ministry → PDHS → RDHS → MOH → PHM)</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Area
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-red-900">{error}</p>
        </div>
      )}

      {/* Create/Edit Form */}
      {(showCreateForm || editingArea) && (
        <AreaForm
          area={editingArea}
          onSave={(data) => {
            if (editingArea) {
              handleUpdate(editingArea.id, data);
            } else {
              handleCreate(data);
            }
          }}
          onCancel={() => {
            setShowCreateForm(false);
            setEditingArea(null);
          }}
        />
      )}

      {/* Level Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-700">Filter by Level:</span>
        <button
          onClick={() => setSelectedLevel('all')}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            selectedLevel === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All Levels
        </button>
        {['ministry', 'pdhs', 'rdhs', 'moh', 'phm'].map((level) => (
          <button
            key={level}
            onClick={() => setSelectedLevel(level)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              selectedLevel === level
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {level.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Areas by Level */}
      {isLoading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">Loading hierarchy...</p>
        </div>
      ) : hierarchy.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">No areas found. Create the first area to get started.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {['ministry', 'pdhs', 'rdhs', 'moh', 'phm'].map((level) => {
            const areasAtLevel = getAllAreasAtLevel(hierarchy, level);
            if (selectedLevel !== 'all' && selectedLevel !== level) return null;
            if (areasAtLevel.length === 0) return null;

            return (
              <div key={level} className="bg-white rounded-lg shadow-lg border-2 border-gray-200">
                <div className={`px-6 py-4 border-b-2 ${getLevelHeaderColor(level)}`}>
                  <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    {getLevelLabel(level)} ({areasAtLevel.length} {areasAtLevel.length === 1 ? 'area' : 'areas'})
                  </h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {areasAtLevel.map((area) => (
                      <AreaCard
                        key={area.id}
                        area={area}
                        level={level}
                        onEdit={setEditingArea}
                        onDelete={handleDelete}
                        getParentName={(id) => getAreaNameById(hierarchy, id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Helper function to get all areas at a specific level
function getAllAreasAtLevel(hierarchy: any[], level: string): any[] {
  const result: any[] = [];
  
  function traverse(areas: any[]) {
    for (const area of areas) {
      if (area.level === level) {
        result.push(area);
      }
      if (area.children && area.children.length > 0) {
        traverse(area.children);
      }
    }
  }
  
  traverse(hierarchy);
  return result;
}

// Helper function to get area name by ID
function getAreaNameById(hierarchy: any[], id: number | null): string {
  if (!id) return 'N/A';
  
  function findArea(areas: any[]): any | null {
    for (const area of areas) {
      if (area.id === id) return area;
      if (area.children && area.children.length > 0) {
        const found = findArea(area.children);
        if (found) return found;
      }
    }
    return null;
  }
  
  const area = findArea(hierarchy);
  return area ? area.name : `ID: ${id}`;
}

// Helper function to get level label
function getLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    ministry: 'Ministry Level',
    pdhs: 'PDHS (Provincial) Level',
    rdhs: 'RDHS (District) Level',
    moh: 'MOH (Medical Officer) Level',
    phm: 'PHM (Public Health Midwife) Level',
  };
  return labels[level] || level.toUpperCase();
}

// Helper function to get level header color
function getLevelHeaderColor(level: string): string {
  const colors: Record<string, string> = {
    ministry: 'bg-purple-100 border-purple-300',
    pdhs: 'bg-blue-100 border-blue-300',
    rdhs: 'bg-green-100 border-green-300',
    moh: 'bg-yellow-100 border-yellow-300',
    phm: 'bg-orange-100 border-orange-300',
  };
  return colors[level] || 'bg-gray-100 border-gray-300';
}

// Helper function to get level badge color
function getLevelBadgeColor(level: string): string {
  const colors: Record<string, string> = {
    ministry: 'bg-purple-100 text-purple-800 border-purple-300',
    pdhs: 'bg-blue-100 text-blue-800 border-blue-300',
    rdhs: 'bg-green-100 text-green-800 border-green-300',
    moh: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    phm: 'bg-orange-100 text-orange-800 border-orange-300',
  };
  return colors[level] || 'bg-gray-100 text-gray-800 border-gray-300';
}

// Area Card Component - displays each area as a separate card
function AreaCard({
  area,
  level,
  onEdit,
  onDelete,
  getParentName,
}: {
  area: any;
  level: string;
  onEdit: (area: any) => void;
  onDelete: (id: number) => void;
  getParentName: (id: number | null) => string;
}) {
  return (
    <div className="border-2 border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-1 rounded text-xs font-bold border ${getLevelBadgeColor(level)}`}>
              {level.toUpperCase()}
            </span>
            {area.code && (
              <span className="text-xs text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded">
                {area.code}
              </span>
            )}
          </div>
          <h4 className="text-lg font-bold text-gray-900 mb-1">{area.name}</h4>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onEdit(area)}
            className="p-2 hover:bg-blue-100 rounded transition-colors"
            title="Edit Area"
          >
            <Edit className="w-4 h-4 text-blue-600" />
          </button>
          <button
            onClick={() => onDelete(area.id)}
            className="p-2 hover:bg-red-100 rounded transition-colors"
            title="Delete Area"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        {area.parent_id && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-medium">Parent:</span>
            <span className="text-gray-700">{getParentName(area.parent_id)}</span>
          </div>
        )}
        {area.province && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-medium">Province:</span>
            <span className="text-gray-700">{area.province}</span>
          </div>
        )}
        {area.district && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-medium">District:</span>
            <span className="text-gray-700">{area.district}</span>
          </div>
        )}
        {area.description && (
          <div className="pt-2 border-t border-gray-200">
            <p className="text-gray-600 text-xs">{area.description}</p>
          </div>
        )}
        {area.children && area.children.length > 0 && (
          <div className="pt-2 border-t border-gray-200">
            <span className="text-gray-500 font-medium text-xs">
              {area.children.length} {area.children.length === 1 ? 'child area' : 'child areas'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function AreaForm({
  area,
  onSave,
  onCancel,
}: {
  area?: any;
  onSave: (data: any) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    name: area?.name || '',
    level: area?.level || 'ministry',
    parent_id: area?.parent_id || null,
    district: area?.district || '',
    province: area?.province || '',
    description: area?.description || '',
  });
  const [parentOptions, setParentOptions] = useState<any[]>([]);
  const [loadingParents, setLoadingParents] = useState(false);

  const levels = [
    { value: 'ministry', label: 'Ministry' },
    { value: 'pdhs', label: 'PDHS (Province)' },
    { value: 'rdhs', label: 'RDHS (District)' },
    { value: 'moh', label: 'MOH Area' },
    { value: 'phm', label: 'PHM Area' },
  ];

  // Get required parent level based on selected level
  const getRequiredParentLevel = (level: string): string | null => {
    const parentMap: Record<string, string> = {
      pdhs: 'ministry',
      rdhs: 'pdhs',
      moh: 'rdhs',
      phm: 'moh',
    };
    return parentMap[level] || null;
  };

  // Load parent options when level changes
  useEffect(() => {
    const requiredParentLevel = getRequiredParentLevel(formData.level);
    if (!requiredParentLevel) {
      setParentOptions([]);
      setFormData({ ...formData, parent_id: null });
      return;
    }

    setLoadingParents(true);
    areasHierarchicalAPI.list({ level: requiredParentLevel })
      .then((response) => {
        if (response.data.status === 'success') {
          setParentOptions(response.data.areas || []);
        }
      })
      .catch((err) => {
        console.error('Failed to load parent options:', err);
        setParentOptions([]);
      })
      .finally(() => {
        setLoadingParents(false);
      });
  }, [formData.level]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...formData };
    // Remove code from data - it's auto-generated
    if (!data.parent_id) delete data.parent_id;
    onSave(data);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-blue-300">
      <h3 className="text-lg font-bold text-gray-900 mb-4">
        {area ? 'Edit Area' : 'Create New Area'}
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Level <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.level}
            onChange={(e) => setFormData({ ...formData, level: e.target.value, parent_id: null })}
            required
            disabled={!!area} // Cannot change level when editing
            className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            {levels.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </select>
          {area && (
            <p className="text-xs text-gray-500 mt-1">
              Level cannot be changed after creation
            </p>
          )}
        </div>

        {/* Show auto-generated code in edit mode */}
        {area && area.code && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Area Code (Auto-generated, Read-only)
            </label>
            <input
              type="text"
              value={area.code}
              disabled
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg bg-gray-100 font-mono text-gray-700 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">
              Area code is auto-generated and cannot be changed
            </p>
          </div>
        )}

        {/* Show code generation info for new areas */}
        {!area && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-900 font-medium mb-1">
              📝 Area Code will be Auto-Generated
            </p>
            <p className="text-xs text-blue-700">
              Code format: <span className="font-mono font-bold">
                {formData.level === 'ministry' ? 'HM' : 
                 formData.level === 'pdhs' ? 'PDHS' :
                 formData.level === 'rdhs' ? 'RDHS' :
                 formData.level === 'moh' ? 'MOH' :
                 formData.level === 'phm' ? 'MWA' : 'XXX'}
              </span> + 3-digit number (e.g., {formData.level === 'ministry' ? 'HM001' : 
                 formData.level === 'pdhs' ? 'PDHS001' :
                 formData.level === 'rdhs' ? 'RDHS001' :
                 formData.level === 'moh' ? 'MOH001' :
                 formData.level === 'phm' ? 'MWA001' : 'XXX001'})
            </p>
          </div>
        )}

        {/* Parent Selection - Required for non-ministry levels */}
        {formData.level !== 'ministry' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Parent {getRequiredParentLevel(formData.level)?.toUpperCase()} Area <span className="text-red-500">*</span>
            </label>
            {loadingParents ? (
              <div className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                Loading parent options...
              </div>
            ) : parentOptions.length === 0 ? (
              <div className="w-full px-3 py-2 border-2 border-red-300 rounded-lg bg-red-50 text-red-700">
                No {getRequiredParentLevel(formData.level)?.toUpperCase()} areas found. Create a parent area first.
              </div>
            ) : (
              <select
                value={formData.parent_id || ''}
                onChange={(e) => setFormData({ ...formData, parent_id: Number(e.target.value) || null })}
                required
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Parent Area --</option>
                {parentOptions.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.code ? `[${parent.code}] ` : ''}{parent.name}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {formData.level === 'pdhs' && 'Must select a MINISTRY area'}
              {formData.level === 'rdhs' && 'Must select a PDHS area'}
              {formData.level === 'moh' && 'Must select a RDHS area'}
              {formData.level === 'phm' && 'Must select a MOH area'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Province</label>
            <input
              type="text"
              value={formData.province}
              onChange={(e) => setFormData({ ...formData, province: e.target.value })}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
            <input
              type="text"
              value={formData.district}
              onChange={(e) => setFormData({ ...formData, district: e.target.value })}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            {area ? 'Update Area' : 'Create Area'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
