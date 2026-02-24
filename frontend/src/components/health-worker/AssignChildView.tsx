/**
 * Assign Child to Area View
 * Midwife can search for unassigned children and assign them to THEIR OWN PHM area
 * (no need to see full PHM area list; we auto-use midwife's area from backend).
 */
import { useState, useEffect } from 'react';
import { ArrowLeft, Search, MapPin, User, CheckCircle, AlertCircle } from 'lucide-react';
import { childrenAPI, midwifeAPI } from '../../services/api';

interface AssignChildViewProps {
  onBack: () => void;
  onSuccess: (childId: string) => void;
}

export function AssignChildView({ onBack, onSuccess }: AssignChildViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedChild, setSelectedChild] = useState<any>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);
  const [phmAreaLabel, setPhmAreaLabel] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Load current midwife's PHM area on mount (no /api/areas call – midwife isn't allowed)
  useEffect(() => {
    const bootstrap = async () => {
      try {
        // Ask backend which PHM area this midwife actually belongs to
        const res = await midwifeAPI.getDashboardStats();
        const phmId = res.data?.phm_area_id ?? res.data?.stats?.phm_area_id;
        if (phmId) {
          const idNum = Number(phmId);
          setSelectedAreaId(idNum);
          // Show ONLY the PHM area name as requested
          const label = res.data?.phm_area_name || '';
          setPhmAreaLabel(label);
        } else {
          setError('Your PHM area is not configured. Please contact the administrator.');
        }
      } catch (err: any) {
        console.error('Failed to load PHM area:', err);
        setError(err?.response?.data?.message || 'Failed to load your PHM area');
      }
    };

    bootstrap();
  }, []);

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setError('Please enter a child registration number');
      return;
    }

    setIsSearching(true);
    setError('');
    setSearchResults([]);
    setSelectedChild(null);

    try {
      const response = await childrenAPI.list({ q: searchTerm, status: 'active' });
      if (response.data.status === 'success') {
        const children = response.data.children || [];
        // Filter for unassigned children or children in accessible areas
        const unassigned = children.filter((c: any) => !c.current_assigned_area_id);
        setSearchResults(unassigned);
        
        if (unassigned.length === 0) {
          setError('No unassigned children found with this registration number');
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to search children');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectChild = (child: any) => {
    setSelectedChild(child);
    setError('');
    setSuccess('');
  };

  const handleAssign = async () => {
    if (!selectedChild) {
      setError('Please select a child');
      return;
    }

    if (!selectedAreaId) {
      setError('Your PHM area is not configured. Cannot assign.');
      return;
    }

    setIsAssigning(true);
    setError('');
    setSuccess('');

    try {
      const response = await childrenAPI.assign(selectedChild.child_id, {
        area_id: selectedAreaId,
      });

      if (response.data.status === 'success') {
        setSuccess(`Child ${selectedChild.child_id} assigned successfully!`);
        setTimeout(() => {
          onSuccess(selectedChild.child_id);
        }, 1500);
      } else {
        setError(response.data.message || 'Failed to assign child');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to assign child');
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900">Assign Child to Area</h2>
          <p className="text-gray-600">Search for unassigned children and assign them to your PHM area</p>
        </div>
      </div>

      {/* Search Section */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Child Registration Number
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter child registration number (e.g., COL001)"
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border-2 border-red-300 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-red-900">{error}</p>
          </div>
        )}

        {success && (
          <div className="mt-4 bg-green-50 border-2 border-green-300 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-green-900">{success}</p>
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Search Results ({searchResults.length})
            </h3>
            <div className="space-y-3">
              {searchResults.map((child) => (
                <div
                  key={child.id}
                  onClick={() => handleSelectChild(child)}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    selectedChild?.id === child.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{child.name || 'Unnamed'}</h4>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-600">
                        <p><span className="font-medium">ID:</span> {child.child_id}</p>
                        <p><span className="font-medium">DOB:</span> {child.dob || 'N/A'}</p>
                        <p><span className="font-medium">Gender:</span> {child.gender || 'N/A'}</p>
                        <p><span className="font-medium">Guardian:</span> {child.guardian_name || 'N/A'}</p>
                      </div>
                    </div>
                    {selectedChild?.id === child.id && (
                      <CheckCircle className="w-6 h-6 text-blue-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Assignment Section */}
      {selectedChild && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Assign to PHM Area</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                PHM Area <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={phmAreaLabel || ''}
                  disabled
                  className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg bg-gray-50 text-gray-700"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 pt-4 border-t border-gray-200">
              <button
                onClick={onBack}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={!selectedAreaId || isAssigning}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                {isAssigning ? 'Assigning...' : 'Assign Child to Area'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
