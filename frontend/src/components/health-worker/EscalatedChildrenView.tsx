import { useState, useEffect } from 'react';
import { mohAPI } from '../../services/api';
import { getRiskLabel } from '../../types';

interface EscalatedChildrenViewProps {
  onViewChild?: (childId: string) => void;
}

export function EscalatedChildrenView({ onViewChild }: EscalatedChildrenViewProps) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewChildId, setReviewChildId] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await mohAPI.getEscalatedChildren();
      if (res.data?.status === 'success') setList(res.data.escalations || []);
      else setError(res.data?.message || 'Failed to load');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load');
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (childId) => {
    setActionLoading(true);
    setError('');
    try {
      await mohAPI.reviewEscalation(childId, { review_notes: reviewNotes });
      setReviewChildId(null);
      setReviewNotes('');
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Review failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEscalateToNutritionist = async (childId) => {
    if (!confirm('Escalate this child to Nutritionist?')) return;
    setActionLoading(true);
    setError('');
    try {
      await mohAPI.escalateToNutritionist(childId, {});
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Escalation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReturnToMidwife = async (childId) => {
    if (!confirm('Return this child to midwife care (risk downgrade)?')) return;
    setActionLoading(true);
    setError('');
    try {
      await mohAPI.returnToMidwife(childId);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="text-gray-600">Loading escalated children...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Escalated Children</h2>
        <p className="text-gray-600 mt-1">Review and take action on children escalated to you</p>
      </div>

      {error && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {list.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No pending escalations.</div>
      ) : (
        <div className="space-y-4">
          {list.map((esc) => {
            const child = esc.child;
            const isReviewing = reviewChildId === child?.id;
            return (
              <div key={esc.id} className="bg-white rounded-lg shadow p-6 border-l-4 border-red-300">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">
                      {child?.name || '—'} {child?.child_unique_id && `(${child.child_unique_id})`}
                    </p>
                    <p className="text-sm text-gray-600">
                      Risk: {(child?.current_risk_level && getRiskLabel((child.current_risk_level.toLowerCase()) as import('../../types').RiskLevel)) || child?.current_risk_level || '—'} • Previous: {esc.previous_risk_level} → New: {esc.new_risk_level}
                    </p>
                    {esc.reason && <p className="text-sm text-gray-600 mt-1">{esc.reason}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {onViewChild && (
                      <button
                        onClick={() => onViewChild(String(child?.id))}
                        className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        View profile
                      </button>
                    )}
                    {!isReviewing ? (
                      <button
                        onClick={() => setReviewChildId(child?.id)}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                      >
                        Review
                      </button>
                    ) : (
                      <>
                        <input
                          placeholder="Clinical notes"
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent flex-1 min-w-[200px]"
                        />
                        <button
                          onClick={() => handleReview(child?.id)}
                          disabled={actionLoading}
                          className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {actionLoading ? 'Saving...' : 'Mark reviewed'}
                        </button>
                        <button
                          onClick={() => { setReviewChildId(null); setReviewNotes(''); }}
                          className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleEscalateToNutritionist(child?.id)}
                      disabled={actionLoading}
                      className="px-4 py-2 border border-red-300 rounded-lg font-medium text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      To Nutritionist
                    </button>
                    <button
                      onClick={() => handleReturnToMidwife(child?.id)}
                      disabled={actionLoading}
                      className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Return to Midwife
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
