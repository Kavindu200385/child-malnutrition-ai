import React, { useState } from 'react';
import { Search, Clock, AlertCircle } from 'lucide-react';
import { childrenAPI } from '../services/api';
import { ChildData } from '../App';
import { RiskBadge } from './RiskBadge';
import { getDisplayRiskLevel } from '../types';

interface SearchChildProps {
  onSelectChild: (child: ChildData) => void;
}

function mapChildToChildData(c: any): ChildData {
  const dob = c.dob ? new Date(c.dob) : null;
  const ageMonths = dob ? Math.floor((Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 30.44)) : 0;
  const risk = getDisplayRiskLevel(c);
  const classification = risk === 'SAM' ? 'critical' : risk === 'MAM' ? 'moderate' : 'normal';
  return {
    id: c.child_id || String(c.id),
    name: c.name || 'Unnamed',
    age: { years: Math.floor(ageMonths / 12), months: ageMonths % 12 },
    sex: c.gender === 'male' ? 'Male' : c.gender === 'female' ? 'Female' : 'N/A',
    area: c.current_assigned_area?.name || c.phm_area?.name || '—',
    currentStatus: { classification },
  };
}

export function SearchChild({ onSelectChild }: SearchChildProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChildData[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentChildren, setRecentChildren] = useState<ChildData[]>([]);

  React.useEffect(() => {
    childrenAPI.list({}).then((res) => {
      if (res.data?.status === 'success' && Array.isArray(res.data.children)) {
        setRecentChildren((res.data.children as any[]).slice(0, 4).map(mapChildToChildData));
      }
    }).catch(() => setRecentChildren([]));
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSearched(true);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    childrenAPI.list({ q: searchQuery.trim() })
      .then((res) => {
        if (res.data?.status === 'success' && Array.isArray(res.data.children)) {
          setSearchResults((res.data.children as any[]).map(mapChildToChildData));
        } else {
          setSearchResults([]);
        }
      })
      .catch(() => setSearchResults([]))
      .finally(() => setLoading(false));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-gray-900 mb-2">Search Child Records</h1>
        <p className="text-gray-600">Enter Child Health ID or Name</p>
      </div>

      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-5 top-1/2 transform -translate-y-1/2 text-gray-400 w-6 h-6" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Child Health ID (e.g., CH-2024-0234) or Name"
              className="w-full pl-14 pr-5 py-5 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-10 py-5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors border-2 border-blue-700 disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {hasSearched && (
        <div className="mb-8">
          <h2 className="text-gray-900 mb-4">
            Search Results {searchResults.length > 0 && `(${searchResults.length})`}
          </h2>
          {searchResults.length === 0 ? (
            <div className="bg-white rounded-xl border-2 border-gray-200 p-10 text-center">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-900 mb-2">No records found</p>
              <p className="text-gray-500">No child found matching "{searchQuery}"</p>
              <p className="text-gray-400 text-sm mt-2">Try a different Child Health ID or name</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border-2 border-gray-200 divide-y-2 divide-gray-200">
              {searchResults.map((child) => (
                <button
                  key={child.id}
                  onClick={() => onSelectChild(child)}
                  className="w-full p-6 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="text-gray-900">{child.name}</p>
                        <RiskBadge classification={child.currentStatus.classification} size="small" />
                      </div>
                      <p className="text-gray-600 mb-1">{child.id}</p>
                      <p className="text-gray-500">
                        Age: {child.age.years}y {child.age.months}m | {child.sex} | {child.area}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-blue-600">View Profile →</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!hasSearched && recentChildren.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-6 h-6 text-gray-500" />
            <h2 className="text-gray-900">Recently Accessed Children</h2>
          </div>
          <div className="bg-white rounded-xl border-2 border-gray-200 divide-y-2 divide-gray-200">
            {recentChildren.map((child) => (
              <button
                key={child.id}
                onClick={() => onSelectChild(child)}
                className="w-full p-6 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="text-gray-900">{child.name}</p>
                      <RiskBadge classification={child.currentStatus.classification} size="small" />
                    </div>
                    <p className="text-gray-600 mb-1">{child.id}</p>
                    <p className="text-gray-500">
                      Age: {child.age.years}y {child.age.months}m | {child.sex} | {child.area}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-blue-600">View Profile →</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
