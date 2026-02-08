import { useState } from 'react';
import { MOCK_CHILDREN } from '../../data/mockData';
import { getRiskColor, getRiskLabel } from '../../types';
import { Search, Filter } from 'lucide-react';

interface SearchChildViewProps {
  onViewChild: (childId: string) => void;
}

export function SearchChildView({ onViewChild }: SearchChildViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');

  const filteredChildren = MOCK_CHILDREN.filter((child) => {
    const matchesSearch =
      child.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      child.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      child.guardianName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRisk = riskFilter === 'all' || child.riskLevel === riskFilter;

    return matchesSearch && matchesRisk;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Search Children</h2>
        <p className="text-gray-600 mt-1">Find and view child records</p>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <option value="mam">MAM</option>
                <option value="sam">SAM</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">
            Results ({filteredChildren.length})
          </h3>
        </div>

        <div className="divide-y divide-gray-200">
          {filteredChildren.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500">No children found matching your search criteria.</p>
            </div>
          ) : (
            filteredChildren.map((child) => {
              const age = Math.floor(
                (new Date().getTime() - new Date(child.dob).getTime()) / (1000 * 60 * 60 * 24 * 30)
              );
              return (
                <div
                  key={child.id}
                  className="p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <h4 className="text-lg font-bold text-gray-900">{child.name}</h4>
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                            <p>
                              <span className="font-medium">ID:</span> {child.id}
                            </p>
                            <p>
                              <span className="font-medium">Age:</span> {age} months
                            </p>
                            <p>
                              <span className="font-medium">Gender:</span>{' '}
                              {child.gender === 'male' ? 'Male' : 'Female'}
                            </p>
                            <p>
                              <span className="font-medium">Last Visit:</span> {child.lastVisit}
                            </p>
                            <p className="sm:col-span-2">
                              <span className="font-medium">Guardian:</span> {child.guardianName} (
                              {child.guardianPhone})
                            </p>
                          </div>
                        </div>
                        <div>
                          <span
                            className="inline-block px-3 py-1 rounded-full text-xs font-medium text-white"
                            style={{ backgroundColor: getRiskColor(child.riskLevel) }}
                          >
                            {getRiskLabel(child.riskLevel).split(' ')[0]}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex sm:flex-col gap-2">
                      <button
                        onClick={() => onViewChild(child.id)}
                        className="flex-1 sm:flex-none px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                      >
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
