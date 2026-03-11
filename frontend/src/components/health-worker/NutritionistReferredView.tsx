import { useState, useEffect } from 'react';
import { nutritionistAPI } from '../../services/api';
import { AlertTriangle, User, PlusCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { formatDate } from '../../utils/formatDate';

interface ReferredItem {
  child: any;
  referral: any;
  current_risk_level?: string;
  escalation_status?: string;
  last_measurement_date?: string;
  last_measurement_confidence?: number;
}

interface NutritionistReferredViewProps {
  onViewChild: (childId: string) => void;
  onAddMeasurement: (childId: string) => void;
}

export function NutritionistReferredView({ onViewChild, onAddMeasurement }: NutritionistReferredViewProps) {
  const [items, setItems] = useState<ReferredItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [returningId, setReturningId] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await nutritionistAPI.referredChildren();
      if (res.data?.status === 'success') setItems(res.data.children || []);
      else setError(res.data?.message || 'Failed to load');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load referred children');
    } finally {
      setLoading(false);
    }
  };

  const handleReturnToMoh = async (childId: number) => {
    setReturningId(childId);
    try {
      await nutritionistAPI.returnToMoh(childId);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Return to MOH failed');
    } finally {
      setReturningId(null);
    }
  };

  if (loading) return <div className="text-gray-600">Loading referred children...</div>;
  if (error) {
    return (
      <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
        <p className="text-sm text-red-900">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Referred Children</h2>
        <p className="text-gray-600 mt-1">Children escalated from MOH to your hospital for specialist review</p>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          <User className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p>No children referred to you yet.</p>
          <p className="text-sm mt-1">MOH can escalate children to the nutritionist from the Escalated Children page.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Child</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Risk</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Last measurement</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Referral status</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.map(({ child, referral, current_risk_level, last_measurement_date, last_measurement_confidence }) => (
                  <tr key={child.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{child.name || child.child_id || child.child_unique_id}</p>
                        <p className="text-xs text-gray-500">{child.child_unique_id || child.child_id}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium text-white ${(current_risk_level || '').toUpperCase() === 'SAM'
                          ? 'bg-red-500'
                          : (current_risk_level || '').toUpperCase() === 'MAM'
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                          }`}
                      >
                        {(current_risk_level || 'NORMAL').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {last_measurement_date
                        ? `${formatDate(last_measurement_date)}${last_measurement_confidence != null ? ` (${(last_measurement_confidence * 100).toFixed(0)}%)` : ''}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{referral?.status || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onViewChild(String(child.id))}
                          className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                        >
                          View
                        </button>
                        <button
                          onClick={() => onAddMeasurement(String(child.id))}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-slate-600 hover:bg-slate-700 rounded-lg"
                        >
                          <PlusCircle className="w-4 h-4" />
                          Add measurement
                        </button>
                        {(current_risk_level || '').toUpperCase() === 'NORMAL' && (
                          <button
                            onClick={() => handleReturnToMoh(child.id)}
                            disabled={returningId === child.id}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
                          >
                            {returningId === child.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeft className="w-4 h-4" />}
                            Return to MOH
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
