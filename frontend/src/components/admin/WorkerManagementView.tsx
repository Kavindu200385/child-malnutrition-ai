/**
 * User/Worker Management View
 * Ministry (Admin) / System Developer can create, update, and assign users/workers to areas
 * This component manages all system users (workers) with their roles and area assignments
 */
import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, User, MapPin, AlertCircle, CheckCircle } from 'lucide-react';
import { workersAPI, areasHierarchicalAPI, hospitalsAPI } from '../../services/api';
import { ConfirmDialog, type ConfirmDialogState } from '../ui/ConfirmDialog';

interface WorkerManagementViewProps {
  onBack?: () => void;
}

export function WorkerManagementView({ onBack }: WorkerManagementViewProps) {
  const [workers, setWorkers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingWorker, setEditingWorker] = useState<any>(null);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);
  const [pdhsFilter, setPdhsFilter] = useState<string>('all');
  const [rdhsFilter, setRdhsFilter] = useState<string>('all');
  const [mohFilter, setMohFilter] = useState<string>('all');
  const [hospitalFilter, setHospitalFilter] = useState<string>('all');

  // Area options for filters
  const [pdhsAreas, setPdhsAreas] = useState<any[]>([]);
  const [rdhsAreas, setRdhsAreas] = useState<any[]>([]);
  const [mohAreas, setMohAreas] = useState<any[]>([]);
  // Hospital options (for nutritionists who are based at hospitals) - workers with role=hospital for list filter
  const [hospitalOptions, setHospitalOptions] = useState<any[]>([]);
  // Master list of hospitals (from Area Management) for assigning nutritionists
  const [hospitalsList, setHospitalsList] = useState<any[]>([]);

  const roleDisplayLabels: Record<string, string> = {
    health_ministry: 'Ministry (Admin)',
    pdhs: 'PDHS',
    rdhs: 'RDHS',
    moh: 'MOH',
    amoh: 'AMOH',
    midwife: 'Midwife',
    nutritionist: 'Nutritionist',
    hospital: 'Pediatric Unit',
  };

  // Load area options on mount
  useEffect(() => {
    loadAreaOptions();
  }, []);

  // Reload workers when filters change
  useEffect(() => {
    loadWorkers();
  }, [roleFilter, pdhsFilter, rdhsFilter, mohFilter, hospitalFilter]);

  const loadAreaOptions = async () => {
    try {
      // Load PDHS areas
      const pdhsResponse = await areasHierarchicalAPI.list({ level: 'pdhs' });
      if (pdhsResponse.data.status === 'success') {
        setPdhsAreas(pdhsResponse.data.areas || []);
      }

      // Load RDHS areas
      const rdhsResponse = await areasHierarchicalAPI.list({ level: 'rdhs' });
      if (rdhsResponse.data.status === 'success') {
        setRdhsAreas(rdhsResponse.data.areas || []);
      }

      // Load MOH areas
      const mohResponse = await areasHierarchicalAPI.list({ level: 'moh' });
      if (mohResponse.data.status === 'success') {
        setMohAreas(mohResponse.data.areas || []);
      }

      // Load hospitals (users with role=hospital) for nutritionist filter
      const hospitalResponse = await workersAPI.list({ role: 'hospital' });
      if (hospitalResponse.data.status === 'success') {
        setHospitalOptions(hospitalResponse.data.workers || []);
      }

      // Load master hospital list (from Area Management) for assigning nutritionists to hospitals
      const hospitalsRes = await hospitalsAPI.list({});
      if (hospitalsRes.data.status === 'success') {
        setHospitalsList(hospitalsRes.data.hospitals || []);
      }
    } catch (err) {
      console.error('Failed to load area options:', err);
    }
  };

  const loadWorkers = async () => {
    setIsLoading(true);
    setError('');

    try {
      const params: any = {};
      if (roleFilter !== 'all') {
        params.role = roleFilter;
      }

      // Add area filter - prioritize MOH > RDHS > PDHS (most specific first)
      if (mohFilter !== 'all') {
        params.area_id = mohFilter;
      } else if (rdhsFilter !== 'all') {
        params.area_id = rdhsFilter;
      } else if (pdhsFilter !== 'all') {
        params.area_id = pdhsFilter;
      }

      const response = await workersAPI.list(params);
      if (response.data.status === 'success') {
        let loadedWorkers: any[] = response.data.workers || [];

        // If hospital filter is selected, show ONLY nutritionists attached to that hospital
        if (hospitalFilter !== 'all') {
          const selectedHospital = hospitalOptions.find(
            (h: any) => String(h.id) === String(hospitalFilter)
          );

          if (selectedHospital) {
            loadedWorkers = loadedWorkers.filter((w: any) => {
              // Nutritionists at hospitals only
              if (w.role !== 'nutritionist') return false;
              // Match by clinic name (both nutritionist and hospital should share the same clinic/hospital name)
              if (w.clinic && selectedHospital.clinic && w.clinic === selectedHospital.clinic) {
                return true;
              }
              // Fallback: match by district if clinic is not available
              if (w.district && selectedHospital.district && w.district === selectedHospital.district) {
                return true;
              }
              return false;
            });
          } else {
            // If hospital not found, show nothing
            loadedWorkers = [];
          }
        }

        setWorkers(loadedWorkers);
      } else {
        setError(response.data.message || 'Failed to load users');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load users');
      setWorkers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (formData: any) => {
    try {
      const response = await workersAPI.create(formData);
      if (response.data.status === 'success') {
        setSuccess('User created successfully!');
        await loadWorkers();
        setShowCreateForm(false);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(response.data.message || 'Failed to create user');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create user');
    }
  };

  const handleUpdate = async (workerId: number, formData: any) => {
    try {
      const response = await workersAPI.update(workerId, formData);
      if (response.data.status === 'success') {
        setSuccess('User updated successfully!');
        await loadWorkers();
        setEditingWorker(null);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(response.data.message || 'Failed to update user');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update user');
    }
  };

  const handleDelete = async (workerId: number) => {
    setDialog({
      title: 'Delete User',
      message: 'Are you sure you want to delete this user? This will deactivate their account and cannot be undone.',
      variant: 'danger',
      confirmLabel: 'Yes, Delete',
      onConfirm: async () => {
        try {
          const response = await workersAPI.delete(workerId);
          if (response.data.status === 'success') {
            setSuccess('User deleted successfully!');
            await loadWorkers();
            setTimeout(() => setSuccess(''), 3000);
          } else {
            setError(response.data.message || 'Failed to delete user');
          }
        } catch (err: any) {
          setError(err.response?.data?.message || 'Failed to delete user');
        }
      },
    });
  };

  const roles = [
    { value: 'all', label: 'All Roles' },
    { value: 'health_ministry', label: 'Ministry (Admin)' },
    { value: 'pdhs', label: 'PDHS' },
    { value: 'rdhs', label: 'RDHS' },
    { value: 'moh', label: 'MOH' },
    { value: 'amoh', label: 'AMOH' },
    { value: 'midwife', label: 'Midwife' },
    { value: 'nutritionist', label: 'Nutritionist' },
    { value: 'hospital', label: 'Pediatric Unit' },
  ];

  return (
    <div className="space-y-6">
      <ConfirmDialog state={dialog} onClose={() => setDialog(null)} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
          <p className="text-gray-600">Create and manage system users (workers) and assign them to areas</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create User
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Role Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Role
            </label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {roles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          {/* PDHS Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by PDHS Area
            </label>
            <select
              value={pdhsFilter}
              onChange={(e) => {
                setPdhsFilter(e.target.value);
                // Clear more specific filters when PDHS changes
                if (e.target.value !== 'all') {
                  setRdhsFilter('all');
                  setMohFilter('all');
                }
              }}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All PDHS Areas</option>
              {pdhsAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.code ? `[${area.code}] ` : ''}{area.name}
                </option>
              ))}
            </select>
          </div>

          {/* RDHS Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by RDHS Area
            </label>
            <select
              value={rdhsFilter}
              onChange={(e) => {
                setRdhsFilter(e.target.value);
                // Clear more specific filters when RDHS changes
                if (e.target.value !== 'all') {
                  setMohFilter('all');
                }
              }}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All RDHS Areas</option>
              {rdhsAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.code ? `[${area.code}] ` : ''}{area.name}
                </option>
              ))}
            </select>
          </div>

          {/* MOH Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by MOH Area
            </label>
            <select
              value={mohFilter}
              onChange={(e) => setMohFilter(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All MOH Areas</option>
              {mohAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.code ? `[${area.code}] ` : ''}{area.name}
                </option>
              ))}
            </select>
          </div>

          {/* Hospital Filter (for Nutritionists at Hospitals) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Hospital (Nutritionists / Pediatric Unit)
            </label>
            <select
              value={hospitalFilter}
              onChange={(e) => {
                setHospitalFilter(e.target.value);
                // When hospital is selected, automatically focus on nutritionist role
                if (e.target.value !== 'all' && roleFilter === 'all') {
                  setRoleFilter('nutritionist');
                }
              }}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Hospitals</option>
              {hospitalOptions.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.clinic ? h.clinic : h.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Clear Filters Button */}
        {(roleFilter !== 'all' ||
          pdhsFilter !== 'all' ||
          rdhsFilter !== 'all' ||
          mohFilter !== 'all' ||
          hospitalFilter !== 'all') && (
            <div className="mt-4">
              <button
                onClick={() => {
                  setRoleFilter('all');
                  setPdhsFilter('all');
                  setRdhsFilter('all');
                  setMohFilter('all');
                  setHospitalFilter('all');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Clear All Filters
              </button>
            </div>
          )}
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-red-900">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-green-900">{success}</p>
        </div>
      )}

      {/* Create/Edit Form */}
      {(showCreateForm || editingWorker) && (
        <WorkerForm
          worker={editingWorker}
          hospitalsList={hospitalsList}
          onSave={(data) => {
            if (editingWorker) {
              handleUpdate(editingWorker.id, data);
            } else {
              handleCreate(data);
            }
          }}
          onCancel={() => {
            setShowCreateForm(false);
            setEditingWorker(null);
          }}
        />
      )}

      {/* Workers List */}
      <div className="bg-white rounded-lg shadow">
        {isLoading ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">Loading workers...</p>
          </div>
        ) : workers.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">No users found matching your criteria.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {workers.map((worker) => (
              <div key={worker.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <User className="w-5 h-5 text-gray-400" />
                      <h4 className="text-lg font-bold text-gray-900">{worker.name}</h4>
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                        {roleDisplayLabels[worker.role] ?? worker.role}
                      </span>
                      {!worker.is_active && (
                        <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 ml-8">
                      <p><span className="font-medium">Username:</span> {worker.username}</p>
                      {worker.email && <p><span className="font-medium">Email:</span> {worker.email}</p>}
                      {worker.phone && <p><span className="font-medium">Phone:</span> {worker.phone}</p>}
                      {worker.clinic && <p><span className="font-medium">Clinic:</span> {worker.clinic}</p>}
                      {worker.district && <p><span className="font-medium">District:</span> {worker.district}</p>}
                      {(worker.role === 'nutritionist' || worker.role === 'hospital') && worker.hospital && (
                        <p><span className="font-medium">Hospital:</span> {worker.hospital.hospital_name} ({worker.hospital.hospital_code})</p>
                      )}
                    </div>
                    {worker.assigned_areas && worker.assigned_areas.length > 0 && (
                      <div className="mt-3 ml-8">
                        <p className="text-sm font-medium text-gray-700 mb-1">Assigned Areas:</p>
                        <div className="flex flex-wrap gap-2">
                          {worker.assigned_areas.map((area: any) => (
                            <span
                              key={area.id}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded text-xs"
                            >
                              <MapPin className="w-3 h-3" />
                              {area.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingWorker(worker)}
                      className="p-2 hover:bg-blue-100 rounded transition-colors"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4 text-blue-600" />
                    </button>
                    <button
                      onClick={() => handleDelete(worker.id)}
                      className="p-2 hover:bg-red-100 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkerForm({
  worker,
  hospitalsList,
  onSave,
  onCancel,
}: {
  worker?: any;
  hospitalsList?: any[];
  onSave: (data: any) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    username: worker?.username || '',
    password: '',
    name: worker?.name || '',
    role: worker?.role || 'midwife',
    email: worker?.email || '',
    phone: worker?.phone || '',
    clinic: worker?.clinic || '',
    district: worker?.district || '',
    area_ids: worker?.assigned_areas?.map((a: any) => a.id) || [],
    hospital_id: worker?.hospital_id ?? worker?.hospital?.id ?? '',
  });

  const [availableAreas, setAvailableAreas] = useState<any[]>([]);

  useEffect(() => {
    loadAreas();
  }, [formData.role]);

  const loadAreas = async () => {
    try {
      // Determine area level based on role
      const levelMap: any = {
        midwife: 'phm',
        moh: 'moh',
        amoh: 'moh',
        nutritionist: 'moh',
        rdhs: 'rdhs',
        pdhs: 'pdhs',
      };

      const level = levelMap[formData.role];
      if (level) {
        const response = await areasHierarchicalAPI.list({ level });
        if (response.data.status === 'success') {
          setAvailableAreas(response.data.areas || []);
        }
      } else {
        setAvailableAreas([]);
      }
    } catch (err) {
      console.error('Failed to load areas:', err);
    }
  };

  const roles = [
    { value: 'health_ministry', label: 'Ministry (Admin)' },
    { value: 'pdhs', label: 'PDHS' },
    { value: 'rdhs', label: 'RDHS' },
    { value: 'moh', label: 'MOH' },
    { value: 'amoh', label: 'AMOH' },
    { value: 'midwife', label: 'Midwife' },
    { value: 'nutritionist', label: 'Nutritionist' },
    { value: 'hospital', label: 'Pediatric Unit' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: any = { ...formData };
    if (!data.password && worker) {
      delete data.password; // Don't update password if not provided
    }
    if (data.role === 'nutritionist' || data.role === 'hospital') {
      data.hospital_id = data.hospital_id ? Number(data.hospital_id) : null;
    } else {
      delete data.hospital_id;
    }
    onSave(data);
  };

  const toggleArea = (areaId: number) => {
    const current = formData.area_ids || [];
    if (current.includes(areaId)) {
      setFormData({ ...formData, area_ids: current.filter((id: number) => id !== areaId) });
    } else {
      setFormData({ ...formData, area_ids: [...current, areaId] });
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-blue-300">
      <h3 className="text-lg font-bold text-gray-900 mb-4">
        {worker ? 'Edit User' : 'Create New User'}
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Username <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              disabled={!!worker}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {worker ? 'New Password (leave blank to keep current)' : 'Password'} <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required={!worker}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({
                ...formData,
                role: e.target.value,
                area_ids: [],
                hospital_id: (e.target.value === 'nutritionist' || e.target.value === 'hospital') ? formData.hospital_id : '',
              })}
              required
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {roles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Clinic</label>
            <input
              type="text"
              value={formData.clinic}
              onChange={(e) => setFormData({ ...formData, clinic: e.target.value })}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {(formData.role === 'nutritionist' || formData.role === 'hospital') && (hospitalsList?.length ?? 0) > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assign to Hospital
            </label>
            <select
              value={formData.hospital_id ?? ''}
              onChange={(e) => setFormData({ ...formData, hospital_id: e.target.value ? Number(e.target.value) : '' })}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— No hospital —</option>
              {(hospitalsList || []).map((h: any) => (
                <option key={h.id} value={h.id}>
                  {h.hospital_name} ({h.hospital_code})
                  {h.district ? ` — ${h.district}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {availableAreas.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Assign to Areas
            </label>
            <div className="max-h-48 overflow-y-auto border-2 border-gray-300 rounded-lg p-3 space-y-2">
              {availableAreas.map((area) => (
                <label
                  key={area.id}
                  className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={formData.area_ids?.includes(area.id)}
                    onChange={() => toggleArea(area.id)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{area.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            {worker ? 'Update User' : 'Create User'}
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
