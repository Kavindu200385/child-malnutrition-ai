/**
 * Hospital Children List View
 * Shows all children registered by this hospital with filtering
 */
import { useState, useEffect } from 'react';
import { User } from '../../App';
import { hospitalAPI } from '../../services/api';
import { Search, Filter, AlertTriangle, CheckCircle, ArrowRight, Loader2 } from 'lucide-react';
import { ConfirmDialog, type ConfirmDialogState } from '../ui/ConfirmDialog';
import { ChildProfileCard } from '../ChildProfileCard';
import { PaginationControls } from '../PaginationControls';

interface HospitalChildrenListViewProps {
  user: User;
  onViewChild?: (childId: string) => void;
}

export function HospitalChildrenListView({ user, onViewChild }: HospitalChildrenListViewProps) {
  const PAGE_SIZE = 12;
  const [children, setChildren] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

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

  const getArea = (child: any) => (
    child.current_assigned_area?.name ||
    child.assigned_to_clinic ||
    child.registered_by_clinic ||
    user.clinic ||
    'N/A'
  );

  const pageCount = Math.max(1, Math.ceil(children.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, pageCount);
  const paginatedChildren = children.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const resultStart = children.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const resultEnd = Math.min(safePage * PAGE_SIZE, children.length);

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
                setCurrentPage(1);
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
        <div className="border-b border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900">Children ({children.length})</h3>
          {children.length > 0 && (
            <p className="mt-1 text-sm text-gray-500">
              Showing {resultStart}-{resultEnd} of {children.length} children
            </p>
          )}
        </div>
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
          <>
            <div className="grid grid-cols-1 items-stretch gap-6 p-6 md:grid-cols-2 lg:grid-cols-4">
              {paginatedChildren.map((child) => {
                const childId = child.child_unique_id || child.child_id || String(child.id);
                const risk = child.birth_risk_level || 'NORMAL';

                return (
                  <ChildProfileCard
                    key={child.id}
                    child={child}
                    accent="indigo"
                    risk={risk}
                    area={getArea(child)}
                    onViewProfile={onViewChild ? () => onViewChild(childId) : undefined}
                    actions={(
                      <>
                        {(risk === 'SAM' || risk === 'MAM') && !child.is_transferred && (
                        <button
                          onClick={() => handleTransferToNutritionist(child.id)}
                          className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors ${risk === 'SAM' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'}`}
                        >
                          <ArrowRight className="h-4 w-4" aria-hidden />
                          Transfer to Nutritionist
                        </button>
                        )}
                        {child.is_transferred && (
                        <span className="inline-flex justify-center rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                          Transferred
                        </span>
                        )}
                      </>
                    )}
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
  );
}
