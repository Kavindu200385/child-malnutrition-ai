/**
 * Hospital Children List View
 * Shows all children registered by this hospital with filtering
 */
import { useState, useEffect } from 'react';
import { User } from '../../App';
import { hospitalAPI } from '../../services/api';
import { Search, Filter, AlertTriangle, CheckCircle, ArrowRight, Loader2, Eye } from 'lucide-react';
import { ConfirmDialog, type ConfirmDialogState } from '../ui/ConfirmDialog';

interface HospitalChildrenListViewProps {
  user: User;
  onViewChild?: (childId: string) => void;
}

export function HospitalChildrenListView({ user, onViewChild }: HospitalChildrenListViewProps) {
  const [children, setChildren] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [birthRiskFilter, setBirthRiskFilter] = useState<string>('all');
  const [transferStatusFilter, setTransferStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadChildren();
  }, [birthRiskFilter, transferStatusFilter, startDate, endDate]);

  const loadChildren = async () => {
    setIsLoading(true);
    setError('');

    try {
      const params: any = {};
      if (birthRiskFilter !== 'all') {
        params.birth_risk_level = birthRiskFilter;
      }
      if (transferStatusFilter !== 'all') {
        params.transfer_status = transferStatusFilter;
      }
      if (startDate) {
        params.start_date = startDate;
      }
      if (endDate) {
        params.end_date = endDate;
      }
      if (searchTerm) {
        params.search = searchTerm;
      }

      const response = await hospitalAPI.listChildren(params);
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

  const handleTransferToNutritionist = async (childId: number) => {
    setDialog({
      title: 'Transfer to Nutritionist',
      message: 'Transfer this child to the Hospital Nutritionist? This action cannot be undone.',
      variant: 'warning',
      confirmLabel: 'Yes, Transfer',
      onConfirm: async () => {
        try {
          const response = await hospitalAPI.transferToNutritionist(childId, {
            reason: 'SAM case - immediate nutritionist referral required',
          });
          if (response.data.status === 'success') {
            setSuccess('Child transferred to nutritionist successfully');
            await loadChildren();
            setTimeout(() => setSuccess(''), 3000);
          } else {
            setError(response.data.message || 'Failed to transfer child');
          }
        } catch (err: any) {
          setError(err.response?.data?.message || 'Failed to transfer child');
        }
      },
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadChildren();
  };

  const getRiskBadgeColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'SAM':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'MAM':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'NORMAL':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog state={dialog} onClose={() => setDialog(null)} />
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Registered Children</h2>
        <p className="text-gray-600">View and manage children registered at your hospital</p>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-red-900">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-green-900">{success}</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Search */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name or Child ID..."
                className="w-full pl-10 pr-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </form>
          </div>

          {/* Birth Risk Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Birth Risk</label>
            <select
              value={birthRiskFilter}
              onChange={(e) => setBirthRiskFilter(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Risk Levels</option>
              <option value="NORMAL">Normal</option>
              <option value="MAM">MAM</option>
              <option value="SAM">SAM</option>
            </select>
          </div>

          {/* Transfer Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Status</label>
            <select
              value={transferStatusFilter}
              onChange={(e) => setTransferStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="NONE">Not Transferred</option>
              <option value="TRANSFERRED_TO_NUTRITIONIST">Transferred</option>
            </select>
          </div>

          {/* Date Range */}
          <div className="lg:col-span-2 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Clear Filters */}
        {(birthRiskFilter !== 'all' || transferStatusFilter !== 'all' || startDate || endDate || searchTerm) && (
          <div className="mt-4">
            <button
              onClick={() => {
                setBirthRiskFilter('all');
                setTransferStatusFilter('all');
                setStartDate('');
                setEndDate('');
                setSearchTerm('');
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Children List */}
      <div className="bg-white rounded-lg shadow">
        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-500">Loading children...</p>
          </div>
        ) : children.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">No children found matching your criteria.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {children.map((child) => (
              <div key={child.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="text-lg font-bold text-gray-900">{child.name || 'Unnamed'}</h4>
                      <span className={`px-2 py-1 rounded text-xs font-bold border ${getRiskBadgeColor(child.birth_risk_level || 'NORMAL')}`}>
                        {child.birth_risk_level || 'NORMAL'}
                      </span>
                      {child.is_transferred && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                          Transferred
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-sm text-gray-600 ml-2">
                      <p><span className="font-medium">Child ID:</span> <span className="font-mono">{child.child_unique_id || child.child_id}</span></p>
                      <p><span className="font-medium">DOB:</span> {child.dob ? new Date(child.dob).toLocaleDateString() : '-'}</p>
                      <p><span className="font-medium">Gender:</span> {child.gender || '-'}</p>
                      {child.birth_weight_kg && (
                        <p><span className="font-medium">Birth Weight:</span> {child.birth_weight_kg} kg</p>
                      )}
                      {child.mother_name && (
                        <p><span className="font-medium">Mother:</span> {child.mother_name}</p>
                      )}
                      {child.guardian_phone && (
                        <p><span className="font-medium">Contact:</span> {child.guardian_phone}</p>
                      )}
                      <p><span className="font-medium">Registered:</span> {child.registration_date ? new Date(child.registration_date).toLocaleDateString() : '-'}</p>
                    </div>

                    {onViewChild && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => onViewChild(child.child_unique_id || child.child_id || String(child.id))}
                          className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 border border-indigo-300 hover:bg-indigo-50 rounded-lg text-sm font-medium transition-colors"
                        >
                          <Eye className="w-4 h-4 text-indigo-600" />
                          View / Edit details
                        </button>
                      </div>
                    )}

                    {/* MAM / SAM Alert */}
                    {(child.birth_risk_level === 'SAM' || child.birth_risk_level === 'MAM') && !child.is_transferred && (
                      <div className={`mt-3 p-3 rounded-lg border-2 ${child.birth_risk_level === 'SAM' ? 'bg-red-50 border-red-300' : 'bg-yellow-50 border-yellow-300'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className={`w-5 h-5 ${child.birth_risk_level === 'SAM' ? 'text-red-600' : 'text-yellow-600'}`} />
                          <p className={`text-sm font-bold ${child.birth_risk_level === 'SAM' ? 'text-red-900' : 'text-yellow-900'}`}>
                            {child.birth_risk_level === 'SAM' ? 'SAM Case - Transfer to Nutritionist Required' : 'MAM Case - Consider Nutritionist Referral'}
                          </p>
                        </div>
                        <button
                          onClick={() => handleTransferToNutritionist(child.id)}
                          className={`mt-2 px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${child.birth_risk_level === 'SAM' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'}`}
                        >
                          <ArrowRight className="w-4 h-4" />
                          Transfer to Hospital Nutritionist
                        </button>
                      </div>
                    )}
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
