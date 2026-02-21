/**
 * Hospital Statistics View
 * Shows hospital-level statistics
 */
import { useState, useEffect } from 'react';
import { User } from '../../App';
import { hospitalAPI } from '../../services/api';
import { Users, AlertTriangle, CheckCircle, ArrowRight, Loader2, BarChart3 } from 'lucide-react';

interface HospitalStatsViewProps {
  user: User;
}

export function HospitalStatsView({ user }: HospitalStatsViewProps) {
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await hospitalAPI.getStats();
      if (response.data.status === 'success') {
        setStats(response.data.stats);
      } else {
        setError(response.data.message || 'Failed to load statistics');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load statistics');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-gray-500">Loading statistics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
        <p className="text-sm font-medium text-red-900">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const samPercentage = stats.total_children > 0 
    ? ((stats.sam_cases / stats.total_children) * 100).toFixed(1)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Hospital Dashboard</h2>
        <p className="text-gray-600">Overview of registered children and risk levels</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Children */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Children</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total_children}</p>
            </div>
            <Users className="w-10 h-10 text-blue-500" />
          </div>
        </div>

        {/* SAM Cases */}
        <div className="bg-white rounded-lg shadow p-6 border-2 border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">SAM Cases</p>
              <p className="text-3xl font-bold text-red-600 mt-2">{stats.sam_cases}</p>
              <p className="text-xs text-gray-500 mt-1">{samPercentage}% of total</p>
            </div>
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
        </div>

        {/* MAM Cases */}
        <div className="bg-white rounded-lg shadow p-6 border-2 border-yellow-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">MAM Cases</p>
              <p className="text-3xl font-bold text-yellow-600 mt-2">{stats.mam_cases}</p>
            </div>
            <AlertTriangle className="w-10 h-10 text-yellow-500" />
          </div>
        </div>

        {/* Transferred */}
        <div className="bg-white rounded-lg shadow p-6 border-2 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Transferred to Nutritionist</p>
              <p className="text-3xl font-bold text-blue-600 mt-2">{stats.transferred_to_nutritionist}</p>
            </div>
            <ArrowRight className="w-10 h-10 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Risk Distribution Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          Risk Level Distribution
        </h3>
        <div className="space-y-4">
          {/* SAM Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">SAM (Severe)</span>
              <span className="text-sm font-bold text-red-600">{stats.sam_cases}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-red-600 h-4 rounded-full"
                style={{ width: `${samPercentage}%` }}
              />
            </div>
          </div>

          {/* MAM Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">MAM (Moderate)</span>
              <span className="text-sm font-bold text-yellow-600">{stats.mam_cases}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-yellow-500 h-4 rounded-full"
                style={{ width: `${stats.total_children > 0 ? ((stats.mam_cases / stats.total_children) * 100) : 0}%` }}
              />
            </div>
          </div>

          {/* Normal Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Normal</span>
              <span className="text-sm font-bold text-green-600">{stats.normal_cases}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-green-500 h-4 rounded-full"
                style={{ width: `${stats.total_children > 0 ? ((stats.normal_cases / stats.total_children) * 100) : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-4 border border-blue-200">
            <p className="text-sm font-medium text-gray-700 mb-2">Pending SAM Transfers</p>
            <p className="text-2xl font-bold text-red-600">
              {stats.sam_cases - stats.transferred_to_nutritionist}
            </p>
            <p className="text-xs text-gray-500 mt-1">SAM cases not yet transferred</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-blue-200">
            <p className="text-sm font-medium text-gray-700 mb-2">Transfer Rate</p>
            <p className="text-2xl font-bold text-blue-600">
              {stats.sam_cases > 0 
                ? ((stats.transferred_to_nutritionist / stats.sam_cases) * 100).toFixed(1)
                : 0}%
            </p>
            <p className="text-xs text-gray-500 mt-1">Of SAM cases transferred</p>
          </div>
        </div>
      </div>
    </div>
  );
}
