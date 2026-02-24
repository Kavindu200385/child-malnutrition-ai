/**
 * RDHS Reports – list monthly reports, generate, send to PDHS.
 */
import { useState, useEffect } from 'react';
import { FileText, Plus, Send, RefreshCw } from 'lucide-react';
import { rdhsAPI } from '../../services/api';

export function RdhsReportsView() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [genMonth, setGenMonth] = useState(new Date().getMonth()); // 0-indexed
  const [genYear, setGenYear] = useState(new Date().getFullYear());

  const load = () => {
    setError('');
    setLoading(true);
    rdhsAPI
      .reportsMonthly()
      .then((res) => {
        if (res.data?.status === 'success') {
          setReports(res.data.reports || []);
        }
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load reports'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleGenerate = () => {
    setCreating(true);
    setError('');
    rdhsAPI
      .createMonthlyReport({ month: genMonth + 1, year: genYear })
      .then((res) => {
        if (res.data?.status === 'success') {
          load();
        }
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to generate report'))
      .finally(() => setCreating(false));
  };

  const handleSendToPdhs = (reportId: number) => {
    rdhsAPI
      .sendReportToPdhs(reportId)
      .then(() => load())
      .catch((err) => setError(err.response?.data?.message || 'Failed to send report'));
  };

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">District Reports</h2>
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-900">District Monthly Reports</h2>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Generate Report</h3>
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={genMonth}
            onChange={(e) => setGenMonth(Number(e.target.value))}
            className="border rounded-lg px-3 py-2"
          >
            {monthNames.map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>
          <select
            value={genYear}
            onChange={(e) => setGenYear(Number(e.target.value))}
            className="border rounded-lg px-3 py-2"
          >
            {[genYear, genYear - 1, genYear - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Period</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Children</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Normal / MAM / SAM</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Escalations</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Sent to PDHS</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500">No reports yet. Generate one above.</td>
              </tr>
            ) : (
              reports.map((r) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-medium text-gray-900">
                    {monthNames[(r.month || 1) - 1]} {r.report_year}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">{r.total_children}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {r.normal_count} / {r.mam_count} / {r.sam_count}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">{r.total_escalations}</td>
                  <td className="py-3 px-4">
                    {r.sent_to_pdhs ? (
                      <span className="text-green-600 text-sm">Yes</span>
                    ) : (
                      <span className="text-gray-500 text-sm">No</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {!r.sent_to_pdhs && (
                      <button
                        type="button"
                        onClick={() => handleSendToPdhs(r.id)}
                        className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                      >
                        <Send className="w-4 h-4" /> Send to PDHS
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
