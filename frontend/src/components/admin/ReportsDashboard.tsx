/**
 * Reports Dashboard
 * RDHS, PDHS, and Ministry can view reports at their level.
 * Health Ministry also has a tab "Reports from PDHS (Island-wide)".
 */
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { FileText, Download, Calendar, BarChart3, TrendingUp, RefreshCw, MapPin } from 'lucide-react';
import { reportsAPI, adminAPI } from '../../services/api';
import { User } from '../../App';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface ReportsDashboardProps {
  user: User;
}

export function ReportsDashboard({ user }: ReportsDashboardProps) {
  const [reportType, setReportType] = useState<'district' | 'provincial' | 'national'>('district');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // Health Ministry: tab for Generate vs Reports from PDHS (island-wide)
  const [reportsTab, setReportsTab] = useState<'generate' | 'pdhs-received'>('generate');
  const [pdhsReports, setPdhsReports] = useState<any[]>([]);
  const [pdhsReportsLoading, setPdhsReportsLoading] = useState(false);
  const [pdhsReportsError, setPdhsReportsError] = useState('');
  const [pdhsFilterYear, setPdhsFilterYear] = useState<number | ''>('');
  const [pdhsFilterMonth, setPdhsFilterMonth] = useState<number | ''>('');
  const isHealthMinistry = user.role === 'health_ministry';

  const loadPdhsReports = async () => {
    if (!isHealthMinistry) return;
    setPdhsReportsError('');
    setPdhsReportsLoading(true);
    try {
      const params: any = {};
      if (pdhsFilterYear !== '') params.year = pdhsFilterYear;
      if (pdhsFilterMonth !== '') params.month = pdhsFilterMonth;
      const res = await adminAPI.pdhsReportsSentToMinistry(params);
      if (res.data?.status === 'success') {
        setPdhsReports(res.data.reports || []);
      }
    } catch (err: any) {
      setPdhsReportsError(err.response?.data?.message || 'Failed to load PDHS reports');
      setPdhsReports([]);
    } finally {
      setPdhsReportsLoading(false);
    }
  };

  useEffect(() => {
    if (isHealthMinistry && reportsTab === 'pdhs-received') {
      loadPdhsReports();
    }
  }, [isHealthMinistry, reportsTab, pdhsFilterYear, pdhsFilterMonth]);

  // Determine available report types based on role
  const availableReports = 
    user.role === 'health_ministry'
      ? ['district', 'provincial', 'national']
      : user.role === 'pdhs'
      ? ['district', 'provincial']
      : ['district'];

  const loadReport = async () => {
    setIsLoading(true);
    setError('');
    setReportData(null);

    try {
      const params: any = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      let response;
      if (reportType === 'district') {
        response = await reportsAPI.district(params);
      } else if (reportType === 'provincial') {
        response = await reportsAPI.provincial(params);
      } else {
        response = await reportsAPI.national(params);
      }

      if (response.data.status === 'success') {
        setReportData(response.data.data);
      } else {
        setError(response.data.message || 'Failed to load report');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load report');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveReport = async () => {
    if (!reportData) return;

    try {
      await reportsAPI.save({
        report_type: reportType,
        title: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report - ${new Date().toLocaleDateString()}`,
        data: reportData,
        start_date: startDate,
        end_date: endDate,
      });
      toast.success('Report saved successfully!');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to save report';
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Reports Dashboard</h2>
        <p className="text-gray-600">Generate and view reports at your level</p>
      </div>

      {/* Health Ministry: tabs for Generate vs Reports from PDHS (island-wide) */}
      {isHealthMinistry && (
        <div className="flex gap-2 border-b border-gray-200 pb-2">
          <button
            onClick={() => setReportsTab('generate')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              reportsTab === 'generate' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Generate Report
          </button>
          <button
            onClick={() => setReportsTab('pdhs-received')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              reportsTab === 'pdhs-received' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'
            }`}
          >
            <MapPin className="w-4 h-4" />
            Reports from PDHS (Island-wide)
          </button>
        </div>
      )}

      {/* Tab: Reports from PDHS (Health Ministry only) */}
      {isHealthMinistry && reportsTab === 'pdhs-received' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Reports from PDHS (Island-wide)</h3>
          <p className="text-gray-600 mb-4">Provincial reports sent to Health Ministry by all PDHS offices.</p>
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <select
              value={pdhsFilterYear === '' ? '' : pdhsFilterYear}
              onChange={(e) => setPdhsFilterYear(e.target.value === '' ? '' : Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All years</option>
              {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={pdhsFilterMonth === '' ? '' : pdhsFilterMonth}
              onChange={(e) => setPdhsFilterMonth(e.target.value === '' ? '' : Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All months</option>
              {MONTH_NAMES.map((name, i) => (
                <option key={i} value={i + 1}>{name}</option>
              ))}
            </select>
            <button
              onClick={loadPdhsReports}
              disabled={pdhsReportsLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${pdhsReportsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          {pdhsReportsError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-800 text-sm">{pdhsReportsError}</div>
          )}
          {pdhsReportsLoading && pdhsReports.length === 0 ? (
            <p className="text-gray-500">Loading...</p>
          ) : pdhsReports.length === 0 ? (
            <p className="text-gray-500">No PDHS reports sent to ministry yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Province</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Period</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-900">Total</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-900">Normal</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-900">MAM</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-900">SAM</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-900">Escalations</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Sent at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pdhsReports.map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-900">{r.province?.name || r.province?.province || `Province ${r.province_id}`}</td>
                      <td className="px-4 py-2 text-gray-700">{MONTH_NAMES[(r.month || 1) - 1]} {r.report_year}</td>
                      <td className="px-4 py-2 text-right">{r.total_children ?? 0}</td>
                      <td className="px-4 py-2 text-right text-green-700">{r.normal_count ?? 0}</td>
                      <td className="px-4 py-2 text-right text-yellow-700">{r.mam_count ?? 0}</td>
                      <td className="px-4 py-2 text-right text-red-700">{r.sam_count ?? 0}</td>
                      <td className="px-4 py-2 text-right">{r.escalations ?? 0}</td>
                      <td className="px-4 py-2 text-gray-600">{r.sent_at ? new Date(r.sent_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Report Type Selector (Generate tab or non-ministry) */}
      {(!isHealthMinistry || reportsTab === 'generate') && (
      <>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Type
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableReports.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)} Report
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={loadReport}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <BarChart3 className="w-4 h-4" />
            {isLoading ? 'Generating...' : 'Generate Report'}
          </button>
          {reportData && (
            <button
              onClick={handleSaveReport}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Save Report
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {/* Report Display */}
      {reportData && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            {reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report
          </h3>

          {reportType === 'district' && reportData.summary && (
            <DistrictReportView data={reportData} />
          )}

          {reportType === 'provincial' && reportData.provincial_summary && (
            <ProvincialReportView data={reportData} />
          )}

          {reportType === 'national' && reportData.national_summary && (
            <NationalReportView data={reportData} />
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}

function DistrictReportView({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-blue-600 font-medium">Total Children</p>
          <p className="text-2xl font-bold text-blue-900">{data.summary.total_children}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <p className="text-sm text-green-600 font-medium">Total Visits</p>
          <p className="text-2xl font-bold text-green-900">{data.summary.total_visits}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <p className="text-sm text-purple-600 font-medium">Avg Visits/Child</p>
          <p className="text-2xl font-bold text-purple-900">{data.summary.average_visits_per_child}</p>
        </div>
      </div>

      {data.risk_distribution && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Risk Distribution</h4>
          <div className="grid grid-cols-4 gap-4">
            {Object.entries(data.risk_distribution).map(([risk, count]: [string, any]) => (
              <div key={risk} className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-sm text-gray-600">{risk}</p>
                <p className="text-xl font-bold text-gray-900">{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.worker_performance && data.worker_performance.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Worker Performance</h4>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left">Worker</th>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-right">Children</th>
                  <th className="px-4 py-2 text-right">Visits</th>
                </tr>
              </thead>
              <tbody>
                {data.worker_performance.map((worker: any, idx: number) => (
                  <tr key={idx} className="border-b">
                    <td className="px-4 py-2">{worker.worker_name}</td>
                    <td className="px-4 py-2">{worker.role}</td>
                    <td className="px-4 py-2 text-right">{worker.children_count}</td>
                    <td className="px-4 py-2 text-right">{worker.visits_count}</td>
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

function ProvincialReportView({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-blue-600 font-medium">Total Children</p>
          <p className="text-2xl font-bold text-blue-900">{data.provincial_summary.total_children}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <p className="text-sm text-green-600 font-medium">Total Districts</p>
          <p className="text-2xl font-bold text-green-900">{data.provincial_summary.total_districts}</p>
        </div>
      </div>

      {data.district_comparison && data.district_comparison.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">District Comparison</h4>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left">District</th>
                  <th className="px-4 py-2 text-right">Children</th>
                  <th className="px-4 py-2 text-right">Normal</th>
                  <th className="px-4 py-2 text-right">Moderate</th>
                  <th className="px-4 py-2 text-right">High</th>
                  <th className="px-4 py-2 text-right">Critical</th>
                </tr>
              </thead>
              <tbody>
                {data.district_comparison.map((district: any, idx: number) => (
                  <tr key={idx} className="border-b">
                    <td className="px-4 py-2">{district.district_name}</td>
                    <td className="px-4 py-2 text-right">{district.total_children}</td>
                    <td className="px-4 py-2 text-right">{district.risk_distribution.NORMAL || 0}</td>
                    <td className="px-4 py-2 text-right">{district.risk_distribution.MODERATE || 0}</td>
                    <td className="px-4 py-2 text-right">{district.risk_distribution.HIGH || 0}</td>
                    <td className="px-4 py-2 text-right">{district.risk_distribution.CRITICAL || 0}</td>
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

function NationalReportView({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-blue-600 font-medium">Total Children (National)</p>
          <p className="text-2xl font-bold text-blue-900">{data.national_summary.total_children}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <p className="text-sm text-purple-600 font-medium">AI Predictions</p>
          <p className="text-2xl font-bold text-purple-900">{data.ai_prediction_analytics.total_predictions}</p>
        </div>
      </div>

      {data.province_comparison && data.province_comparison.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Province Comparison</h4>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left">Province</th>
                  <th className="px-4 py-2 text-right">Children</th>
                  <th className="px-4 py-2 text-right">Normal</th>
                  <th className="px-4 py-2 text-right">Moderate</th>
                  <th className="px-4 py-2 text-right">High</th>
                  <th className="px-4 py-2 text-right">Critical</th>
                </tr>
              </thead>
              <tbody>
                {data.province_comparison.map((province: any, idx: number) => (
                  <tr key={idx} className="border-b">
                    <td className="px-4 py-2">{province.province_name}</td>
                    <td className="px-4 py-2 text-right">{province.total_children}</td>
                    <td className="px-4 py-2 text-right">{province.risk_distribution.NORMAL || 0}</td>
                    <td className="px-4 py-2 text-right">{province.risk_distribution.MODERATE || 0}</td>
                    <td className="px-4 py-2 text-right">{province.risk_distribution.HIGH || 0}</td>
                    <td className="px-4 py-2 text-right">{province.risk_distribution.CRITICAL || 0}</td>
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
