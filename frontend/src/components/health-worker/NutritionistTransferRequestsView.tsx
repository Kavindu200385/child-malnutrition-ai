/**
 * NutritionistTransferRequestsView
 * Shows pending transfer requests from the Pediatric Unit (Hospital) to the Nutritionist.
 * Nutritionist can Accept or Reject each request.
 */
import React, { useState, useEffect } from 'react';
import {
  AlertTriangle, CheckCircle, XCircle, User, Clock,
  ArrowRight, RefreshCw,
} from 'lucide-react';
import { nutritionistAPI } from '../../services/api';
import { formatDate } from '../../utils/formatDate';

interface TransferRequestItem {
  referral_id: number;
  child: any;
  referral: any;
  current_risk_level: string;
  birth_risk_level: string;
  escalation_status: string;
  last_measurement_date: string | null;
  referred_by: any;
  transfer_reason: string | null;
  transferred_at: string | null;
}

interface Props {
  onViewChild?: (childId: string) => void;
}

export function NutritionistTransferRequestsView({ onViewChild }: Props) {
  const [requests, setRequests] = useState<TransferRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = filter === 'ALL' ? { status: 'ALL' } : {};
      const res = await nutritionistAPI.getTransferRequests(params);
      if (res.data?.status === 'success') {
        setRequests(res.data.transfer_requests || []);
      } else {
        setError(res.data?.message || 'Failed to load transfer requests');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load transfer requests');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (referralId: number) => {
    setActionLoadingId(referralId);
    setActionError('');
    setActionSuccess('');
    try {
      const res = await nutritionistAPI.acceptTransferRequest(referralId, {});
      if (res.data?.status === 'success') {
        setActionSuccess('Transfer accepted. Child is now under your care.');
        setTimeout(() => setActionSuccess(''), 4000);
        load();
      } else {
        setActionError(res.data?.message || 'Failed to accept transfer');
      }
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to accept transfer');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (referralId: number) => {
    if (!rejectionReason.trim()) {
      setActionError('Please provide a rejection reason.');
      return;
    }
    setActionLoadingId(referralId);
    setActionError('');
    setActionSuccess('');
    try {
      const res = await nutritionistAPI.rejectTransferRequest(referralId, {
        rejection_reason: rejectionReason,
      });
      if (res.data?.status === 'success') {
        setActionSuccess('Transfer request rejected.');
        setRejectingId(null);
        setRejectionReason('');
        setTimeout(() => setActionSuccess(''), 4000);
        load();
      } else {
        setActionError(res.data?.message || 'Failed to reject transfer');
      }
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to reject transfer');
    } finally {
      setActionLoadingId(null);
    }
  };

  const getRiskStyle = (risk: string) => {
    const r = (risk || '').toUpperCase();
    if (r === 'SAM') return { bg: 'bg-red-600', text: 'text-white' };
    if (r === 'MAM') return { bg: 'bg-orange-500', text: 'text-white' };
    return { bg: 'bg-green-500', text: 'text-white' };
  };

  const pendingCount = requests.filter(r => r.referral?.status === 'PENDING').length;

  return (
    <div className="space-y-5">

      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Transfer Requests</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Children referred from the Pediatric Unit requiring your review
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="self-start sm:self-auto inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-2xl shadow-md hover:shadow-lg hover:bg-gray-50 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 text-gray-700 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Filter Tabs ─────────────────────────────────────────── */}
      <div className="flex gap-2 bg-white border border-gray-200 rounded-xl p-1.5 w-fit shadow-sm">
        {(['PENDING', 'ALL'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              filter === f
                ? 'bg-slate-800 text-white shadow'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            {f === 'PENDING' ? (
              <>
                <Clock className="w-3.5 h-3.5" />
                Pending
                {pendingCount > 0 && filter !== 'PENDING' && (
                  <span className="ml-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </>
            ) : (
              <>All Requests</>
            )}
          </button>
        ))}
      </div>

      {/* ── Toast messages ──────────────────────────────────────── */}
      {actionSuccess && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-300 text-green-800 rounded-xl px-4 py-3 text-sm font-medium">
          <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
          {actionSuccess}
        </div>
      )}
      {(actionError || error) && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-300 text-red-800 rounded-xl px-4 py-3 text-sm font-medium">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          {actionError || error}
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────────── */}
      {loading && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-16 text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading transfer requests…</p>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────── */}
      {!loading && requests.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-16 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-700 font-semibold">No transfer requests</p>
          <p className="text-gray-400 text-sm mt-1">
            {filter === 'PENDING'
              ? 'No pending requests from the Pediatric Unit.'
              : 'No transfer requests found.'}
          </p>
        </div>
      )}

      {/* ── Cards ───────────────────────────────────────────────── */}
      {!loading && requests.map((item) => {
        const child = item.child;
        const isPending = item.referral?.status === 'PENDING';
        const isActing = actionLoadingId === item.referral_id;
        const isRejectingThis = rejectingId === item.referral_id;
        const riskBirth = getRiskStyle(item.birth_risk_level);
        const riskCurrent = getRiskStyle(item.current_risk_level);

        return (
          <div
            key={item.referral_id}
            className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
              isPending ? 'border-l-4 border-l-red-500 border-gray-200' : 'border-gray-200'
            }`}
          >
            {/* Card top strip */}
            {isPending && (
              <div className="bg-red-50 border-b border-red-100 px-6 py-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                  Action Required — Pending Review
                </span>
              </div>
            )}
            {!isPending && (
              <div className="bg-green-50 border-b border-green-100 px-6 py-2 flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                  Reviewed
                  {item.referral?.reviewed_at && ` · ${formatDate(item.referral.reviewed_at)}`}
                </span>
              </div>
            )}

            <div className="p-6 space-y-5">
              {/* ── Child info row ── */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    <User className="w-6 h-6 text-slate-500" />
                  </div>

                  <div className="space-y-1.5">
                    {/* Name + ID */}
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-gray-900">
                        {child?.name || 'Unnamed Child'}
                      </h3>
                      <span className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded">
                        {child?.child_unique_id || child?.child_id || '—'}
                      </span>
                    </div>

                    {/* Risk badges */}
                    <div className="flex flex-wrap gap-2">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${riskBirth.bg} ${riskBirth.text}`}>
                        Birth Risk: {(item.birth_risk_level || 'N/A').toUpperCase()}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${riskCurrent.bg} ${riskCurrent.text}`}>
                        Current: {(item.current_risk_level || 'N/A').toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Transfer flow pill */}
                <div className="inline-flex items-center gap-2 self-start bg-gray-50 border border-gray-200 rounded-full px-4 py-1.5 text-sm font-medium text-gray-600 whitespace-nowrap">
                  <span className="text-indigo-700 font-semibold">Pediatric Unit</span>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                  <span className="text-slate-700 font-semibold">Nutritionist</span>
                </div>
              </div>

              {/* ── Meta grid ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Referred By</p>
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {item.referred_by?.name || item.referred_by?.username || '—'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Transferred On</p>
                  <p className="text-sm font-medium text-gray-800">
                    {item.transferred_at ? formatDate(item.transferred_at) : '—'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Date of Birth</p>
                  <p className="text-sm font-medium text-gray-800">{child?.dob || '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Gender</p>
                  <p className="text-sm font-medium text-gray-800 capitalize">{child?.gender || '—'}</p>
                </div>
              </div>

              {/* ── Transfer reason ── */}
              {item.transfer_reason && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">
                    <span className="font-semibold">Transfer Reason: </span>
                    {item.transfer_reason}
                  </p>
                </div>
              )}

              {/* ── Action buttons (PENDING only) ── */}
              {isPending && !isRejectingThis && (
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {onViewChild && (
                    <button
                      onClick={() => onViewChild(String(child?.id))}
                      className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all"
                    >
                      View Child
                    </button>
                  )}
                  <button
                    onClick={() => handleAccept(item.referral_id)}
                    disabled={isActing}
                    className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-green-600 border-2 border-green-600 rounded-xl hover:bg-green-700 hover:border-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {isActing ? 'Accepting…' : 'Accept Transfer'}
                  </button>
                  <button
                    onClick={() => { setRejectingId(item.referral_id); setRejectionReason(''); setActionError(''); }}
                    disabled={isActing}
                    className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-red-600 border-2 border-red-600 rounded-xl hover:bg-red-700 hover:border-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              )}

              {/* ── Rejection form ── */}
              {isPending && isRejectingThis && (
                <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-800">
                    Provide a reason for rejection <span className="text-red-500">*</span>
                  </p>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Enter the reason for rejecting this transfer…"
                    rows={3}
                    className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 resize-none"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleReject(item.referral_id)}
                      disabled={isActing}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-all disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      {isActing ? 'Rejecting…' : 'Confirm Reject'}
                    </button>
                    <button
                      onClick={() => { setRejectingId(null); setRejectionReason(''); setActionError(''); }}
                      className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
