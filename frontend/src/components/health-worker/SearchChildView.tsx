import { useState, useEffect } from 'react';
import { Search, Filter, UserPlus, Eye } from 'lucide-react';
import { childrenAPI } from '../../services/api';
import { getRiskColor, getRiskLabel, getDisplayRiskLevelTyped } from '../../types';

interface SearchChildViewProps {
  onViewChild: (childId: string) => void;
}

export function SearchChildView({ onViewChild }: SearchChildViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [children, setChildren] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Load children on mount and when filters change
  useEffect(() => {
    loadChildren();
  }, [riskFilter, statusFilter]);

  const loadChildren = async () => {
    setIsLoading(true);
    setError('');

    try {
      const params: any = {};
      if (searchTerm.trim()) {
        params.q = searchTerm.trim();
      }
      if (riskFilter !== 'all') {
        params.risk = riskFilter.toUpperCase();
      }
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      const response = await childrenAPI.list(params);
      if (response.data.status === 'success') {
        setChildren(response.data.children || []);
      } else {
        setError(response.data.message || 'Failed to load children');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load children');
      setChildren([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    loadChildren();
  };

  // Risk pill uses display risk (birth when no clinic measurement) so list matches profile
  const getRiskStyle = (child: any) => {
    const level = getDisplayRiskLevelTyped(child);
    return { backgroundColor: getRiskColor(level) };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Search Children</h2>
        <p className="text-gray-600 mt-1">Find and view child records</p>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search by name, ID, or guardian name..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label htmlFor="risk-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Risk Level
            </label>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                id="risk-filter"
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="all">All Risk Levels</option>
                <option value="normal">Normal</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="transferred">Transferred</option>
            </select>
          </div>
        </div>

        <div className="mt-4">
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {/* Results */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">
            Results ({children.length})
          </h3>
        </div>

        <div className="divide-y divide-gray-200">
          {isLoading ? (
            <div className="p-12 text-center">
              <p className="text-gray-500">Loading...</p>
            </div>
          ) : children.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500">No children found matching your search criteria.</p>
            </div>
          ) : (
            children.map((child) => {
              const age = child.dob
                ? Math.floor(
                    (new Date().getTime() - new Date(child.dob).getTime()) / (1000 * 60 * 60 * 24 * 30)
                  )
                : null;

              return (
                <div
                  key={child.id}
                  className="p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <h4 className="text-lg font-bold text-gray-900">
                            {child.name || 'Unnamed Child'}
                          </h4>
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                            <p>
                              <span className="font-medium">ID:</span> {child.child_id}
                            </p>
                            {age !== null && (
                              <p>
                                <span className="font-medium">Age:</span> {age} months
                              </p>
                            )}
                            <p>
                              <span className="font-medium">Gender:</span>{' '}
                              {child.gender === 'male' ? 'Male' : child.gender === 'female' ? 'Female' : 'N/A'}
                            </p>
                            {child.current_assigned_area && (
                              <p>
                                <span className="font-medium">Area:</span> {child.current_assigned_area.name}
                              </p>
                            )}
                            <p className="sm:col-span-2">
                              <span className="font-medium">Guardian:</span> {child.guardian_name || 'N/A'} (
                              {child.guardian_phone || 'N/A'})
                            </p>
                            {child.is_draft && (
                              <p className="sm:col-span-2">
                                <span className="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                                  Draft
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                        <div>
                          <span
                            className="inline-block px-3 py-1 rounded-full text-xs font-medium text-white"
                            style={getRiskStyle(child)}
                          >
                            {getRiskLabel(getDisplayRiskLevelTyped(child))}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex sm:flex-col gap-2">
                      <button
                        onClick={() => onViewChild(child.child_id ?? child.child_unique_id ?? String(child.id))}
                        className="flex items-center gap-2 flex-1 sm:flex-none px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        View Profile
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
