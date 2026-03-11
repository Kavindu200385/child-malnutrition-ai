import { useState, useEffect } from 'react';
import { mohAPI } from '../../services/api';
import { ConfirmDialog, type ConfirmDialogState } from '../ui/ConfirmDialog';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function MohReportsView() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [actionLoading, setActionLoading] = useState(false);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);

  useEffect(() => {
    load();
  }, [year]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await mohAPI.getMonthlyReports({ year });
      if (res.data?.status === 'success') setReports(res.data.reports || []);
      else setError(res.data?.message || 'Failed to load');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load');
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setActionLoading(true);
    setError('');
    try {
      await mohAPI.generateMonthlyReport({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Generate failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendToRdhs = async (reportId: number) => {
    setDialog({
      title: 'Send Report to RDHS',
      message: 'Mark this monthly report as sent to RDHS? This action will be recorded.',
      variant: 'info',
      confirmLabel: 'Yes, Send',
      onConfirm: async () => {
        setActionLoading(true);
        setError('');
        try {
          await mohAPI.sendReportToRdhs(reportId);
          load();
        } catch (err: any) {
          setError(err.response?.data?.message || 'Send failed');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog state={dialog} onClose={() => setDialog(null)} />
      <div>
        <h2 className="text-2xl font-bold text-gray-900">MOH Reports</h2>
        <p className="text-gray-600 mt-1">Monthly area reports and send to RDHS</p>
      </div>

      {error && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label htmlFor="report-year" className="block text-sm font-medium text-gray-700 mb-2">Year</label>
            <select
              id="report-year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
            >
              {[year, year - 1, year - 2].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleGenerate}
              disabled={actionLoading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {actionLoading ? 'Generating...' : 'Generate current month'}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-600">Loading reports...</div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No reports for this year. Generate one for the current month.</div>
      ) : (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-900">Monthly reports</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Month</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Total</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Normal</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">MAM</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">SAM</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Escalations</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Sent to RDHS</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">{MONTHS[r.month - 1]} {r.report_year}</td>
                    <td className="px-4 py-3">{r.total_children}</td>
                    <td className="px-4 py-3">{r.normal_count}</td>
                    <td className="px-4 py-3">{r.mam_count}</td>
                    <td className="px-4 py-3">{r.sam_count}</td>
                    <td className="px-4 py-3">{r.total_escalations}</td>
                    <td className="px-4 py-3">{r.sent_to_rdhs ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3">
                      {!r.sent_to_rdhs && (
                        <button
                          onClick={() => handleSendToRdhs(r.id)}
                          disabled={actionLoading}
                          className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          Send to RDHS
                        </button>
                      )}
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
