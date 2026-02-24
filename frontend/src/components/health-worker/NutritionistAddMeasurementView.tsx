import { useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { nutritionistAPI } from '../../services/api';

interface NutritionistAddMeasurementViewProps {
  selectedChildId: string | null;
  onBack: () => void;
  onSuccess: (childId: string) => void;
}

export function NutritionistAddMeasurementView({ selectedChildId, onBack, onSuccess }: NutritionistAddMeasurementViewProps) {
  const [childId, setChildId] = useState(selectedChildId || '');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [muac, setMuac] = useState('');
  const [measurementDate, setMeasurementDate] = useState(new Date().toISOString().split('T')[0]);
  const [specialistNotes, setSpecialistNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cid = childId.trim();
    if (!cid) {
      setError('Child ID is required');
      return;
    }
    const w = parseFloat(weight);
    const h = parseFloat(height);
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
      setError('Valid weight and height are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await nutritionistAPI.addMeasurement({
        child_id: Number(cid),
        weight_kg: w,
        height_cm: h,
        muac_cm: muac ? parseFloat(muac) : undefined,
        measurement_date: measurementDate,
        specialist_notes: specialistNotes || undefined,
      });
      onSuccess(cid);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add measurement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-slate-700 hover:text-slate-900">
        <ArrowLeft className="w-5 h-5" />
        Back
      </button>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Add specialist measurement</h2>
        <p className="text-sm text-gray-600 mb-6">Add measurement for a referred child. Z-scores and AI risk will be calculated by the system.</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Child ID</label>
            <input
              type="text"
              value={childId}
              onChange={(e) => setChildId(e.target.value)}
              placeholder="Child numeric ID"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Measurement date</label>
            <input
              type="date"
              value={measurementDate}
              onChange={(e) => setMeasurementDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Height (cm) *</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">MUAC (cm)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={muac}
              onChange={(e) => setMuac(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Specialist notes</label>
            <textarea
              value={specialistNotes}
              onChange={(e) => setSpecialistNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-medium disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Saving...' : 'Save measurement'}
            </button>
            <button type="button" onClick={onBack} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
