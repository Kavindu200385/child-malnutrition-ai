/**
 * RDHS Reports – list monthly reports, generate, send to PDHS.
 */
import { useState, useEffect } from 'react';
import { FileText, Plus, Send, RefreshCw, ChevronDown } from 'lucide-react';
import { rdhsAPI } from '../../services/api';

export function RdhsReportsView() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [genMonth, setGenMonth] = useState(new Date().getMonth()); // 0-indexed
  const [genYear, setGenYear] = useState(new Date().getFullYear());
  const [mohReports, setMohReports] = useState<any[]>([]);
  const [mohYear, setMohYear] = useState(new Date().getFullYear());
  const [mohLoading, setMohLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'district' | 'moh'>('district');

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

  const loadMohReports = () => {
    setMohLoading(true);
    rdhsAPI
      .mohReports({ year: mohYear })
      .then((res) => {
        if (res.data?.status === 'success') {
          setMohReports(res.data.areas || []);
        }
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load MOH reports'))
      .finally(() => setMohLoading(false));
  };

  useEffect(() => {
    load();
    loadMohReports();
  }, []);

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

  if (loading && activeTab === 'district') {
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
      {/* Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">District Reports</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage your own RDHS consolidated reports and review MOH reports sent from each MOH area.
          </p>
        </div>
        <button
          type="button"
          onClick={activeTab === 'district' ? load : loadMohReports}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Sub-navigation for the two report pages – flat button style like main admin nav */}
      <div className="flex gap-2 mt-2 border-b border-gray-200 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('district')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'district'
              ? 'text-purple-700 bg-purple-50 border border-b-white border-purple-200'
              : 'text-gray-600 hover:bg-gray-50 border border-transparent'
          }`}
        >
          RDHS consolidated report
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('moh')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'moh'
              ? 'text-purple-700 bg-purple-50 border border-b-white border-purple-200'
              : 'text-gray-600 hover:bg-gray-50 border border-transparent'
          }`}
        >
          MOH reports from areas
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      )}

      {/* Tab 1: RDHS consolidated monthly report (generate, view, send to PDHS) */}
      {activeTab === 'district' && (
        <>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Generate RDHS monthly report</h3>
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
                {creating ? 'Generating…' : 'Generate from MOH data'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              RDHS report aggregates all children and escalations in your district (including MOH and nutritionist data)
              so you can review, download, and send a single consolidated report to PDHS.
            </p>
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
        </>
      )}

      {/* Tab 2: MOH reports received section */}
      {activeTab === 'moh' && (
      <div className="bg-white rounded-lg shadow">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">MOH reports received in your district</h3>
            <p className="text-xs text-gray-500">
              These are monthly reports sent by MOH areas to this RDHS. Select a report to review its details.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={mohYear}
              onChange={(e) => setMohYear(Number(e.target.value))}
              className="border rounded-full px-3 py-1 text-sm"
            >
              {[mohYear, mohYear - 1, mohYear - 2].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={loadMohReports}
              className="flex items-center gap-1 px-3 py-1 rounded-full border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
        </div>

        {mohLoading ? (
          <div className="p-6 text-sm text-gray-500">Loading MOH reports…</div>
        ) : mohReports.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No MOH reports received for this year.</div>
        ) : (
          <div className="divide-y">
            {mohReports.map((area) => (
              <details key={area.moh_area_id} className="group">
                <summary className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{area.moh_area_name}</p>
                    <p className="text-xs text-gray-500">
                      {area.reports?.length || 0} report{(area.reports?.length || 0) === 1 ? '' : 's'} received
                    </p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-500 transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-6 pb-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">Period</th>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">Children</th>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">Normal / MAM / SAM</th>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">Escalations</th>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">Sent at</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(area.reports || []).map((r: any) => (
                          <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="py-2 px-3 font-medium text-gray-900">
                              {monthNames[(r.month || 1) - 1]} {r.report_year}
                            </td>
                            <td className="py-2 px-3 text-gray-700">{r.total_children}</td>
                            <td className="py-2 px-3 text-gray-700">
                              {r.normal_count} / {r.mam_count} / {r.sam_count}
                            </td>
                            <td className="py-2 px-3 text-gray-700">{r.total_escalations}</td>
                            <td className="py-2 px-3 text-gray-700">
                              {r.sent_at ? new Date(r.sent_at).toLocaleString() : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
