import { useState, useEffect } from 'react';
import { ArrowLeft, User, PlusCircle, AlertTriangle, Activity } from 'lucide-react';
import { nutritionistAPI } from '../../services/api';

interface NutritionistChildProfileViewProps {
  childId: string;
  onBack: () => void;
  onAddMeasurement: (childId: string) => void;
}

export function NutritionistChildProfileView({ childId, onBack, onAddMeasurement }: NutritionistChildProfileViewProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    load();
  }, [childId]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await nutritionistAPI.getChild(childId);
      if (res.data?.status === 'success') setData(res.data);
      else setError(res.data?.message || 'Failed to load');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load child');
    } finally {
      setLoading(false);
    }
  };

  const handleReturnToMoh = async () => {
    setReturning(true);
    try {
      await nutritionistAPI.returnToMoh(Number(childId));
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Return to MOH failed');
    } finally {
      setReturning(false);
    }
  };

  if (loading) return <div className="text-gray-600">Loading...</div>;
  if (error) {
    return (
      <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
        <p className="text-sm text-red-900">{error}</p>
        <button onClick={onBack} className="mt-3 text-slate-700 hover:underline">Go back</button>
      </div>
    );
  }
  if (!data?.child) return null;

  const child = data.child;
  const risk = (child.current_risk_level || 'NORMAL').toUpperCase();
  const isNormal = risk === 'NORMAL';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-700 hover:text-slate-900">
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center">
            <User className="w-8 h-8 text-slate-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{child.name || child.child_id || child.child_unique_id}</h2>
            <p className="text-sm text-gray-500">{child.child_unique_id || child.child_id}</p>
            <span
              className={`inline-block mt-2 px-3 py-1 rounded text-sm font-medium text-white ${
                risk === 'SAM' ? 'bg-red-500' : risk === 'MAM' ? 'bg-yellow-500' : 'bg-green-500'
              }`}
            >
              {risk}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={() => onAddMeasurement(childId)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-medium"
          >
            <PlusCircle className="w-5 h-5" />
            Add measurement
          </button>
          {isNormal && (
            <button
              onClick={handleReturnToMoh}
              disabled={returning}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
            >
              <ArrowLeft className="w-5 h-5" />
              {returning ? 'Returning...' : 'Return to MOH'}
            </button>
          )}
        </div>
      </div>

      {data.measurements?.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Measurement history</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Date</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Weight</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Height</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">MUAC</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Risk</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.measurements.map((m: any) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 text-sm text-gray-900">{m.measurement_date?.slice(0, 10)}</td>
                    <td className="px-4 py-2 text-sm">{m.weight_kg} kg</td>
                    <td className="px-4 py-2 text-sm">{m.height_cm} cm</td>
                    <td className="px-4 py-2 text-sm">{m.muac_cm ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs text-white ${
                        (m.risk_level || '').toUpperCase() === 'SAM' ? 'bg-red-500' :
                        (m.risk_level || '').toUpperCase() === 'MAM' ? 'bg-yellow-500' : 'bg-green-500'
                      }`}>
                        {(m.risk_level || 'NORMAL').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">{m.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.referrals?.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Referral history</h3>
          <ul className="space-y-2">
            {data.referrals.map((r: any) => (
              <li key={r.id} className="text-sm text-gray-700 border-l-2 border-slate-300 pl-3">
                {r.created_at?.slice(0, 10)} — {r.referral_reason || 'Referred'} — Status: {r.status}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
