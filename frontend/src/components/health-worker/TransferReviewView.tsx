/**
 * Transfer Review View
 * MOH/Nutritionist can review and approve/reject transfer requests
 */
import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, XCircle, Clock, User, MapPin, AlertCircle } from 'lucide-react';
import { transfersAPI } from '../../services/api';

interface TransferReviewViewProps {
  onBack: () => void;
  onSuccess?: () => void;
}

export function TransferReviewView({ onBack, onSuccess }: TransferReviewViewProps) {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  useEffect(() => {
    loadTransfers();
  }, [filter]);

  const loadTransfers = async () => {
    setIsLoading(true);
    setError('');

    try {
      const params: any = {};
      if (filter !== 'all') {
        params.status = filter.toUpperCase();
      }

      const response = await transfersAPI.list(params);
      if (response.data.status === 'success') {
        setTransfers(response.data.transfers || []);
      } else {
        setError(response.data.message || 'Failed to load transfers');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load transfers');
      setTransfers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (transferId: number) => {
    try {
      const response = await transfersAPI.approve(transferId);
      if (response.data.status === 'success') {
        await loadTransfers();
        if (onSuccess) onSuccess();
      } else {
        setError(response.data.message || 'Failed to approve transfer');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to approve transfer');
    }
  };

  const handleReject = async (transferId: number, reason: string) => {
    if (!reason.trim()) {
      setError('Please provide a rejection reason');
      return;
    }

    try {
      const response = await transfersAPI.reject(transferId, { rejection_reason: reason });
      if (response.data.status === 'success') {
        await loadTransfers();
        if (onSuccess) onSuccess();
      } else {
        setError(response.data.message || 'Failed to reject transfer');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to reject transfer');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'APPROVED':
        return 'bg-green-100 text-green-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      case 'COMPLETED':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
          <h2 className="text-2xl font-bold text-gray-900">Transfer Requests</h2>
          <p className="text-gray-600">Review and approve/reject child transfer requests</p>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-red-900">{error}</p>
        </div>
      )}

      {/* Transfers List */}
      <div className="bg-white rounded-lg shadow">
        {isLoading ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">Loading transfers...</p>
          </div>
        ) : transfers.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">No transfers found matching your criteria.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {transfers.map((transfer) => (
              <TransferCard
                key={transfer.id}
                transfer={transfer}
                onApprove={() => handleApprove(transfer.id)}
                onReject={(reason) => handleReject(transfer.id, reason)}
                getStatusColor={getStatusColor}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TransferCard({
  transfer,
  onApprove,
  onReject,
  getStatusColor,
}: {
  transfer: any;
  onApprove: () => void;
  onReject: (reason: string) => void;
  getStatusColor: (status: string) => string;
}) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  return (
    <div className="p-6 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(transfer.status)}`}>
              {transfer.status}
            </span>
            <span className="text-sm text-gray-500">
              {new Date(transfer.created_at).toLocaleDateString()}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Child Information</h4>
              <p className="text-sm text-gray-600">
                <span className="font-medium">Child ID:</span> {transfer.child?.child_id || 'N/A'}
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-medium">Name:</span> {transfer.child?.name || 'N/A'}
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Transfer Details</h4>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                <User className="w-4 h-4" />
                <span>
                  <span className="font-medium">From:</span> {transfer.from_role} →{' '}
                  <span className="font-medium">To:</span> {transfer.to_role}
                </span>
              </div>
              {transfer.to_area && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4" />
                  <span>
                    <span className="font-medium">Area:</span> {transfer.to_area.name}
                  </span>
                </div>
              )}
            </div>
          </div>

          {transfer.reason && (
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Reason:</span> {transfer.reason}
              </p>
            </div>
          )}

          {transfer.rejection_reason && (
            <div className="mb-4 p-3 bg-red-50 rounded-lg">
              <p className="text-sm text-red-900">
                <span className="font-medium">Rejection Reason:</span> {transfer.rejection_reason}
              </p>
            </div>
          )}

          {showRejectForm && (
            <div className="mb-4 p-4 bg-yellow-50 rounded-lg border-2 border-yellow-300">
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => {
                    onReject(rejectionReason);
                    setShowRejectForm(false);
                    setRejectionReason('');
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                >
                  Confirm Reject
                </button>
                <button
                  onClick={() => {
                    setShowRejectForm(false);
                    setRejectionReason('');
                  }}
                  className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {transfer.status === 'PENDING' && (
          <div className="flex flex-col gap-2">
            <button
              onClick={onApprove}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              Approve
            </button>
            <button
              onClick={() => setShowRejectForm(!showRejectForm)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
