import { useState, useEffect } from 'react';
import { Search, Filter } from 'lucide-react';
import { childrenAPI } from '../../services/api';
import { ChildProfileCard } from '../ChildProfileCard';
import { PaginationControls } from '../PaginationControls';

interface SearchChildViewProps {
  onViewChild: (childId: string) => void;
}

export function SearchChildView({ onViewChild }: SearchChildViewProps) {
  const PAGE_SIZE = 12;
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [children, setChildren] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

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
        setCurrentPage(1);
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

  const pageCount = Math.max(1, Math.ceil(children.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, pageCount);
  const paginatedChildren = children.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const resultStart = children.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const resultEnd = Math.min(safePage * PAGE_SIZE, children.length);

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
        <div className="p-6 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              Results ({children.length})
            </h3>
            {children.length > 0 && (
              <p className="text-sm text-gray-500 mt-1">
                Showing {resultStart}-{resultEnd} of {children.length} children
              </p>
            )}
          </div>
        </div>

        <div>
          {isLoading ? (
            <div className="p-12 text-center">
              <p className="text-gray-500">Loading...</p>
            </div>
          ) : children.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500">No children found matching your search criteria.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 items-stretch gap-6 p-6 md:grid-cols-2 lg:grid-cols-4">
                {paginatedChildren.map((child) => {
                  const childId = child.child_id ?? child.child_unique_id ?? String(child.id);

                  return (
                    <ChildProfileCard
                      key={child.id}
                      child={child}
                      onViewProfile={() => onViewChild(childId)}
                      badges={child.is_draft ? (
                        <span className="rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                          Draft
                        </span>
                      ) : null}
                    />
                  );
                })}
              </div>

              <PaginationControls
                currentPage={safePage}
                totalItems={children.length}
                itemsPerPage={PAGE_SIZE}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
