import { useState } from 'react';
import { UserPlus, Edit, Trash2, Search, Shield, User } from 'lucide-react';

interface UserData {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'health_worker';
  clinic?: string;
  district?: string;
  email: string;
  status: 'active' | 'inactive';
  lastLogin?: string;
}

const MOCK_USERS: UserData[] = [
  {
    id: 'admin001',
    username: 'admin',
    name: 'Administrator',
    role: 'admin',
    email: 'admin@cmras.gov.lk',
    status: 'active',
    lastLogin: '2025-01-13 09:30',
  },
  {
    id: 'hw001',
    username: 'health.worker',
    name: 'Dr. Nimal Perera',
    role: 'health_worker',
    clinic: 'Colombo PHM Clinic',
    district: 'Colombo',
    email: 'nimal.perera@health.gov.lk',
    status: 'active',
    lastLogin: '2025-01-13 10:15',
  },
  {
    id: 'hw002',
    username: 'malini.silva',
    name: 'Malini Silva',
    role: 'health_worker',
    clinic: 'Gampaha MOH Office',
    district: 'Gampaha',
    email: 'malini.silva@health.gov.lk',
    status: 'active',
    lastLogin: '2025-01-12 14:20',
  },
  {
    id: 'hw003',
    username: 'kasun.fernando',
    name: 'Dr. Kasun Fernando',
    role: 'health_worker',
    clinic: 'Kandy Health Center',
    district: 'Kandy',
    email: 'kasun.fernando@health.gov.lk',
    status: 'active',
    lastLogin: '2025-01-13 08:45',
  },
  {
    id: 'hw004',
    username: 'sanduni.rajapakse',
    name: 'Sanduni Rajapakse',
    role: 'health_worker',
    clinic: 'Galle District Hospital',
    district: 'Galle',
    email: 'sanduni.r@health.gov.lk',
    status: 'inactive',
    lastLogin: '2025-01-05 16:30',
  },
];

export function UserManagement() {
  const [users] = useState<UserData[]>(MOCK_USERS);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === 'all' || user.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  const handleAddUser = () => {
    setShowAddModal(true);
  };

  const handleEditUser = (userId: string) => {
    alert(`Edit user: ${userId}\n\nThis would open a form to edit user details.`);
  };

  const handleDeleteUser = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (confirm(`Are you sure you want to delete user: ${user?.name}?`)) {
      alert('User deleted successfully (demo mode)');
    }
  };

  const handleResetPassword = (userId: string) => {
    const user = users.find(u => u.id === userId);
    alert(`Password reset email sent to ${user?.email}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
          <p className="text-gray-600 mt-1">Manage system users and access control</p>
        </div>
        <button
          onClick={handleAddUser}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Add New User
        </button>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
              Search Users
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, username, or email..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label htmlFor="role-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Role
            </label>
            <select
              id="role-filter"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none bg-white"
            >
              <option value="all">All Roles</option>
              <option value="admin">Administrators</option>
              <option value="health_worker">Health Workers</option>
            </select>
          </div>
        </div>
      </div>

      {/* User Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Users</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{users.length}</p>
            </div>
            <User className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Users</p>
              <p className="text-3xl font-bold text-green-600 mt-2">
                {users.filter(u => u.status === 'active').length}
              </p>
            </div>
            <User className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Administrators</p>
              <p className="text-3xl font-bold text-purple-600 mt-2">
                {users.filter(u => u.role === 'admin').length}
              </p>
            </div>
            <Shield className="w-8 h-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">
            All Users ({filteredUsers.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Name</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Username</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Role</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Clinic/District</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Last Login</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{user.name}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900">{user.username}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        user.role === 'admin'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {user.role === 'admin' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      {user.role === 'admin' ? 'Admin' : 'Health Worker'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {user.clinic ? (
                      <div>
                        <p className="font-medium">{user.clinic}</p>
                        <p className="text-xs text-gray-500">{user.district}</p>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        user.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">{user.lastLogin || '-'}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditUser(user.id)}
                        className="p-1 hover:bg-blue-100 rounded text-blue-600"
                        title="Edit user"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleResetPassword(user.id)}
                        className="text-xs px-2 py-1 hover:bg-purple-100 rounded text-purple-600"
                        title="Reset password"
                      >
                        Reset
                      </button>
                      {user.role !== 'admin' && (
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-1 hover:bg-red-100 rounded text-red-600"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal (simplified) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Add New User</h3>
            <p className="text-sm text-gray-600 mb-4">
              This would open a form to add a new user with fields for name, username, email, role, clinic, etc.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert('User created successfully (demo mode)');
                  setShowAddModal(false);
                }}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
              >
                Create User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
