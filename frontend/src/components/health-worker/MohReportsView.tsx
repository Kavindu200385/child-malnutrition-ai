import { useState, useEffect } from 'react';
import { mohAPI } from '../../services/api';
import { ConfirmDialog, type ConfirmDialogState } from '../ui/ConfirmDialog';
import { buildSharedReportPdf } from '../../utils/buildSharedReportPdf';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function MohReportsView() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [actionLoading, setActionLoading] = useState(false);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);
  const [startDate, setStartDate] = useState<string>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [summary, setSummary] = useState<any | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

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

  const handleLoadSummary = async () => {
    if (!startDate || !endDate) return;
    setSummaryLoading(true);
    setError('');
    try {
      const res = await mohAPI.getReportSummary({ start_date: startDate, end_date: endDate });
      if (res.data?.status === 'success') {
        setSummary(res.data.summary);
      } else {
        setError(res.data?.message || 'Failed to load summary');
        setSummary(null);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load summary');
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleDownloadSummaryPdf = async () => {
    try {
      setDownloadingPdf(true);

      let effectiveSummary: any | null = summary;
      const desiredStart = startDate;
      const desiredEnd = endDate;
      try {
        if (
          !effectiveSummary ||
          effectiveSummary.start_date !== desiredStart ||
          effectiveSummary.end_date !== desiredEnd
        ) {
          const res = await mohAPI.getReportSummary({ start_date: desiredStart, end_date: desiredEnd });
          if (res.data?.status === 'success') {
            effectiveSummary = res.data.summary;
            setSummary(res.data.summary);
          }
        }
      } catch {
        // fall back to whatever data we have
      }

      const s = effectiveSummary;
      const start = s?.start_date || desiredStart;
      const end = s?.end_date || desiredEnd;

      const children: any[] = (s?.children || []).map((c: any) => ({
        child_id: c.child_unique_id || c.id,
        name: c.name,
        gender: c.gender,
        risk_level: (c.display_risk_level || 'NORMAL').toUpperCase(),
        last_visit_date: c.last_measurement_date ? String(c.last_measurement_date).slice(0, 10) : null,
      }));

      const pdf = await buildSharedReportPdf({
        roleTitle: 'MOH Area Health Report',
        areaName: s?.moh_area_name || 'MOH Area',
        periodLabel: `${start} to ${end}`,
        startDate: start,
        endDate: end,
        summary: {
          total_children: s?.total_children ?? 0,
          normal: s?.normal_count ?? 0,
          mam: s?.mam_count ?? 0,
          sam: s?.sam_count ?? 0,
          escalations: s?.escalations ?? 0,
        },
        sections: children.length > 0
          ? [{
              title: 'Children in period',
              headerLevel: 'secondary' as const,
              summary: {
                total: s?.total_children ?? 0,
                normal: s?.normal_count ?? 0,
                mam: s?.mam_count ?? 0,
                sam: s?.sam_count ?? 0,
                escalations: s?.escalations ?? 0,
              },
              children,
            }]
          : [],
      });

      const fname = `MOH_Report_${start}_${end}.pdf`.replace(/:/g, '-');
      pdf.save(fname);
    } catch {
      // swallow
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog state={dialog} onClose={() => setDialog(null)} />
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">MOH Reports</h2>
          <p className="text-gray-600 mt-1">
            Monthly clinic reports for your MOH area and sending summaries to RDHS.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {/* Controls card – modern filter bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 no-print">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Summary period</h3>
            <p className="text-xs text-slate-500">
              Filter MOH activity by date range and year. All cards, charts and PDFs will reflect this selection.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 mr-1">Quick ranges:</span>
            <button
              type="button"
              className="px-3 py-1 rounded-full border border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors"
              onClick={() => {
                const today = new Date();
                const start = new Date(today);
                start.setDate(start.getDate() - 6);
                const fmt = (d: Date) => d.toISOString().split('T')[0];
                setStartDate(fmt(start));
                setEndDate(fmt(today));
              }}
            >
              Last 7 days
            </button>
            <button
              type="button"
              className="px-3 py-1 rounded-full border border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors"
              onClick={() => {
                const today = new Date();
                const start = new Date(today);
                start.setDate(start.getDate() - 29);
                const fmt = (d: Date) => d.toISOString().split('T')[0];
                setStartDate(fmt(start));
                setEndDate(fmt(today));
              }}
            >
              Last 30 days
            </button>
            <button
              type="button"
              className="px-3 py-1 rounded-full border border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors"
              onClick={() => {
                const now = new Date();
                const start = new Date(now.getFullYear(), now.getMonth(), 1);
                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                const fmt = (d: Date) => d.toISOString().split('T')[0];
                setStartDate(fmt(start));
                setEndDate(fmt(end));
              }}
            >
              This month
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                <span className="text-[11px] font-semibold text-slate-500">From</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border-0 bg-transparent text-sm text-slate-900 focus:ring-0 focus:outline-none"
                />
              </div>
              <span className="text-xs font-medium text-slate-400">to</span>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                <span className="text-[11px] font-semibold text-slate-500">To</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border-0 bg-transparent text-sm text-slate-900 focus:ring-0 focus:outline-none"
                />
              </div>
              <div className="hidden md:inline-flex h-6 w-px bg-slate-200 mx-1" />
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1">
                <label
                  htmlFor="report-year"
                  className="text-[11px] font-semibold text-slate-500"
                >
                  Year
                </label>
                <select
                  id="report-year"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="border-0 bg-transparent text-sm text-slate-900 focus:ring-0 focus:outline-none pr-4"
                >
                  {[year, year - 1, year - 2].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1">You can also adjust the dates manually for custom periods.</p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <button
              onClick={handleDownloadSummaryPdf}
              disabled={downloadingPdf}
              className="no-print"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '9999px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: downloadingPdf ? 'wait' : 'pointer',
                color: '#ffffff',
                backgroundColor: '#111827',
                boxShadow: '0 4px 12px rgba(15,23,42,0.30)',
                opacity: downloadingPdf ? 0.6 : 1,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!downloadingPdf) e.currentTarget.style.backgroundColor = '#1f2937';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#111827';
              }}
            >
              {downloadingPdf ? 'Downloading…' : 'Download summary PDF'}
            </button>
            <button
              onClick={handleLoadSummary}
              disabled={summaryLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '9999px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: summaryLoading ? 'wait' : 'pointer',
                color: '#ffffff',
                background: '#1e293b',
                boxShadow: '0 4px 12px rgba(15,23,42,0.25)',
                opacity: summaryLoading ? 0.7 : 1,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!summaryLoading) e.currentTarget.style.background = '#334155';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#1e293b';
              }}
            >
              {summaryLoading ? 'Loading…' : 'View summary'}
            </button>
            <button
              onClick={handleGenerate}
              disabled={actionLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '9999px',
                border: 'none',
                fontSize: '14px',
                fontWeight: 600,
                cursor: actionLoading ? 'wait' : 'pointer',
                color: '#ffffff',
                background: '#0369a1',
                boxShadow: '0 4px 12px rgba(3,105,161,0.30)',
                opacity: actionLoading ? 0.7 : 1,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!actionLoading) e.currentTarget.style.background = '#0284c7';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#0369a1';
              }}
            >
              {actionLoading ? 'Generating…' : 'Generate current month'}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Use the date range above for daily, weekly, or monthly summaries. The monthly MOH report aggregates child
          counts and risk distribution for your area. Once generated, you can review and mark it as sent to RDHS.
        </p>
      </div>

      {/* Summary for selected date range */}
      {summary && (
        <div className="bg-white rounded-lg shadow p-6 print-report-content">
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            Summary ({summary.start_date} to {summary.end_date})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs text-gray-600">Total children seen</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{summary.total_children}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-xs text-gray-600">Normal</p>
              <p className="text-2xl font-bold mt-1" style={{ color: '#2ECC71' }}>{summary.normal_count}</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
              <p className="text-xs text-gray-600">MAM</p>
              <p className="text-2xl font-bold mt-1" style={{ color: '#F1C40F' }}>{summary.mam_count}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <p className="text-xs text-gray-600">SAM</p>
              <p className="text-2xl font-bold mt-1" style={{ color: '#E74C3C' }}>{summary.sam_count}</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <p className="text-xs text-gray-600">Escalations to MOH</p>
              <p className="text-2xl font-bold mt-1" style={{ color: '#d97706' }}>{summary.escalations}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-xs text-gray-600">Referred to nutritionist</p>
              <p className="text-2xl font-bold mt-1" style={{ color: '#2563eb' }}>{summary.referrals_to_nutritionist}</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-600">Loading reports...</div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No reports for this year. Generate the current month to create your first MOH report.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow print-report-content">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Monthly reports</h3>
              <p className="text-xs text-gray-500 mt-1">
                Overview of total children, risk distribution, and escalations for each month.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Month</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Normal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">MAM</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">SAM</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Escalations</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Sent to RDHS</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {MONTHS[r.month - 1]} {r.report_year}
                    </td>
                    <td className="px-4 py-3">{r.total_children}</td>
                    <td className="px-4 py-3">{r.normal_count}</td>
                    <td className="px-4 py-3">{r.mam_count}</td>
                    <td className="px-4 py-3">{r.sam_count}</td>
                    <td className="px-4 py-3">{r.total_escalations}</td>
                    <td className="px-4 py-3">
                      {r.sent_to_rdhs ? (
                        <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                          Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-800">
                          Not sent
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!r.sent_to_rdhs && (
                        <button
                          onClick={() => handleSendToRdhs(r.id)}
                          disabled={actionLoading}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '8px 18px',
                            borderRadius: '9999px',
                            border: 'none',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: actionLoading ? 'wait' : 'pointer',
                            color: '#ffffff',
                            background: '#1e293b',
                            boxShadow: '0 4px 12px rgba(15,23,42,0.25)',
                            opacity: actionLoading ? 0.7 : 1,
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            if (!actionLoading) e.currentTarget.style.background = '#334155';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#1e293b';
                          }}
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

      {/* Print styles – only summary + table when printing */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-report-content,
          .print-report-content * {
            visibility: visible;
          }
          .print-report-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
