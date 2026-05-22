/**
 * PDHS Reports – list provincial monthly reports, generate, send to Health Ministry.
 * Also lists RDHS period reports (daily/weekly/monthly) sent from districts in this province.
 */
import { useState, useEffect } from 'react';
import { Plus, Send, RefreshCw, ChevronDown, Download, Printer } from 'lucide-react';
import { pdhsAPI } from '../../services/api';
import { buildSharedReportPdf, type SharedAreaSection } from '../../utils/buildSharedReportPdf';

const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const REFRESH_INTERVAL_MS = 30 * 1000; // 30 seconds when on province tab
const RDHS_TAB_REFRESH_MS = 10 * 1000; // 10 seconds when on RDHS reports tab – so new reports appear live

export function PdhsReportsView() {
  const [reports, setReports] = useState<any[]>([]);
  const [rdhsPeriodReports, setRdhsPeriodReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [genMonth, setGenMonth] = useState(new Date().getMonth());
  const [genYear, setGenYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<'province' | 'rdhs'>('province');
  const [rdhsPeriodTab, setRdhsPeriodTab] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [expandedRdhsId, setExpandedRdhsId] = useState<number | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<number | null>(null);
  const [printingReportId, setPrintingReportId] = useState<number | null>(null);

  const load = (isBackground = false, periodType?: 'daily' | 'weekly' | 'monthly') => {
    if (!isBackground) {
      setError('');
      setLoading(true);
    }
    const period = periodType ?? (activeTab === 'rdhs' ? rdhsPeriodTab : undefined);
    Promise.all([
      pdhsAPI.reportsMonthly(),
      pdhsAPI.rdhsPeriodReports(period ? { period_type: period } : {}),
    ])
      .then(([monthlyRes, periodRes]) => {
        if (monthlyRes.data?.status === 'success') {
          setReports(monthlyRes.data.reports || []);
        }
        if (periodRes.data?.status === 'success') {
          setRdhsPeriodReports(periodRes.data.reports || []);
        }
      })
      .catch((err) => {
        if (!isBackground) setError(err.response?.data?.message || 'Failed to load reports');
      })
      .finally(() => {
        if (!isBackground) setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  // When on RDHS tab and period tab changes, refetch RDHS period reports for that period
  useEffect(() => {
    if (activeTab === 'rdhs') {
      pdhsAPI.rdhsPeriodReports({ period_type: rdhsPeriodTab })
        .then((res) => {
          if (res.data?.status === 'success') setRdhsPeriodReports(res.data.reports || []);
        })
        .catch(() => {});
    }
  }, [activeTab, rdhsPeriodTab]);

  // Auto-refresh so when RDHS sends a report, it appears without clicking Refresh (faster when on RDHS tab)
  useEffect(() => {
    const ms = activeTab === 'rdhs' ? RDHS_TAB_REFRESH_MS : REFRESH_INTERVAL_MS;
    const interval = setInterval(() => load(true, activeTab === 'rdhs' ? rdhsPeriodTab : undefined), ms);
    return () => clearInterval(interval);
  }, [activeTab, rdhsPeriodTab]);

  const handleGenerate = () => {
    setCreating(true);
    setError('');
    pdhsAPI
      .createMonthlyReport({ month: genMonth + 1, year: genYear })
      .then((res) => {
        if (res.data?.status === 'success') {
          load();
        }
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to generate report'))
      .finally(() => setCreating(false));
  };

  const handleSendToMinistry = (reportId: number) => {
    pdhsAPI
      .sendReportToMinistry(reportId)
      .then(() => load())
      .catch((err) => setError(err.response?.data?.message || 'Failed to send report'));
  };

  /** Build full provincial report PDF using the shared PDHS-style template. */
  const buildReportPdf = async (r: any) => {
    const s = r.summary || {};
    const sections: SharedAreaSection[] = (r.districts || []).map((dist: any, dIdx: number) => {
      const ds = dist.summary || {};
      return {
        title: `District ${dIdx + 1}: ${dist.district_name || '—'}`,
        headerLevel: 'primary' as const,
        summary: {
          total: ds.total_children ?? 0,
          normal: ds.normal ?? 0,
          mam: ds.mam ?? 0,
          sam: ds.sam ?? 0,
          escalations: ds.total_escalations ?? 0,
        },
        subsections: (dist.moh_areas || []).map((moh: any) => ({
          title: `MOH Area: ${moh.moh_name || '—'}`,
          headerLevel: 'secondary' as const,
          summary: {
            total: moh.total_children ?? 0,
            normal: moh.normal ?? 0,
            mam: moh.mam ?? 0,
            sam: moh.sam ?? 0,
            escalations: moh.escalations ?? 0,
          },
          children: (moh.children || []).map((ch: any) => ({
            child_id: ch.child_id,
            name: ch.name,
            gender: ch.gender,
            age_months: ch.age_months,
            risk_level: ch.risk_level,
            weight_kg: ch.weight_kg,
            height_cm: ch.height_cm,
            muac_cm: ch.muac_cm,
            last_visit_date: ch.last_visit_date,
          })),
        })),
      };
    });

    return buildSharedReportPdf({
      roleTitle: 'PDHS Provincial Health Report',
      areaName: r.province_name || 'Province',
      periodLabel: r.period_label || '',
      startDate: r.start_date || '',
      endDate: r.end_date || '',
      summary: {
        total_children: s.total_children ?? 0,
        normal: s.normal ?? 0,
        mam: s.mam ?? 0,
        sam: s.sam ?? 0,
        escalations: s.total_escalations ?? 0,
      },
      sections,
    });
  };

  const handleDownloadReportPdf = async (reportRow: { id: number; month: number; report_year: number }) => {
    setError('');
    setDownloadingReportId(reportRow.id);
    try {
      const res = await pdhsAPI.getFullReport({ month: reportRow.month, year: reportRow.report_year });
      if (res.data?.status !== 'success' || !res.data?.report) throw new Error(res.data?.message || 'No report data');
      const pdf = await buildReportPdf(res.data.report);
      const label = `${monthNames[(reportRow.month || 1) - 1]}_${reportRow.report_year}`;
      pdf.save(`PDHS_Report_${label}.pdf`);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to download report');
    } finally {
      setDownloadingReportId(null);
    }
  };

  const handlePrintReport = async (reportRow: { id: number; month: number; report_year: number }) => {
    setError('');
    setPrintingReportId(reportRow.id);
    try {
      const res = await pdhsAPI.getFullReport({ month: reportRow.month, year: reportRow.report_year });
      if (res.data?.status !== 'success' || !res.data?.report) throw new Error(res.data?.message || 'No report data');
      const pdf = await buildReportPdf(res.data.report);
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (w) w.onload = () => { w.print(); URL.revokeObjectURL(url); };
      else URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to print report');
    } finally {
      setPrintingReportId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Provincial Reports</h2>
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Same layout as RDHS: title + subtitle + Refresh */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Provincial Reports</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage your provincial consolidated reports and review RDHS reports sent from districts.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Tabs – same style as RDHS (purple active state) */}
      <div className="flex gap-2 mt-2 border-b border-gray-200 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('province')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'province'
              ? 'text-purple-700 bg-purple-50 border border-b-white border-purple-200'
              : 'text-gray-600 hover:bg-gray-50 border border-transparent'
          }`}
        >
          PDHS consolidated report
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rdhs')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'rdhs'
              ? 'text-purple-700 bg-purple-50 border border-b-white border-purple-200'
              : 'text-gray-600 hover:bg-gray-50 border border-transparent'
          }`}
        >
          RDHS reports from districts
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      )}

      {/* Tab 1: Provincial report – same design as RDHS district tab */}
      {activeTab === 'province' && (
        <>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Generate PDHS monthly report</h3>
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
            <p className="text-xs text-gray-500 mt-3">
              PDHS report aggregates all children and escalations in your province (districts, MOH areas, nutritionist data)
              so you can review, download, and send a single consolidated report to Health Ministry.
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
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Sent to Ministry</th>
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
                      <td className="py-3 px-4 text-sm text-gray-600">{r.escalations}</td>
                      <td className="py-3 px-4">
                        {r.sent_to_ministry ? (
                          <span className="text-green-600 text-sm">Yes</span>
                        ) : (
                          <span className="text-gray-500 text-sm">No</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownloadReportPdf(r)}
                            disabled={downloadingReportId === r.id}
                            className="flex items-center gap-1 text-sm text-teal-600 hover:underline disabled:opacity-50"
                            title="Download PDF"
                          >
                            <Download className="w-4 h-4" />
                            {downloadingReportId === r.id ? '…' : 'Download'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintReport(r)}
                            disabled={printingReportId === r.id}
                            className="flex items-center gap-1 text-sm text-gray-700 hover:underline disabled:opacity-50"
                            title="Print"
                          >
                            <Printer className="w-4 h-4" />
                            {printingReportId === r.id ? '…' : 'Print'}
                          </button>
                          {!r.sent_to_ministry && (
                            <button
                              type="button"
                              onClick={() => handleSendToMinistry(r.id)}
                              className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                            >
                              <Send className="w-4 h-4" /> Send to Ministry
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Tab 2: RDHS reports from districts – Daily / Weekly / Monthly tabs */}
      {activeTab === 'rdhs' && (
        <div className="bg-white rounded-lg shadow">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">RDHS reports received from districts</h3>
              <p className="text-xs text-gray-500">
                Daily, weekly, or monthly reports sent by RDHS in this province. Expand to see full details and MOH breakdown.
              </p>
            </div>
            <button
              type="button"
              onClick={() => load(false, rdhsPeriodTab)}
              className="flex items-center gap-1 px-3 py-1 rounded-full border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>

          {/* Period tabs: Daily | Weekly | Monthly */}
          <div className="flex gap-2 border-b border-gray-200 px-6 pt-2 pb-0">
            {(['daily', 'weekly', 'monthly'] as const).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setRdhsPeriodTab(period)}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium capitalize transition-colors ${
                  rdhsPeriodTab === period
                    ? 'text-purple-700 bg-white border border-b-0 border-gray-200 -mb-px'
                    : 'text-gray-600 hover:bg-gray-50 border border-transparent'
                }`}
              >
                {period}
              </button>
            ))}
          </div>

          {rdhsPeriodReports.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">No {rdhsPeriodTab} RDHS reports received yet.</div>
          ) : (
            <div className="divide-y">
              {rdhsPeriodReports.map((r) => {
                const payload = r.payload || {};
                const summary = payload.summary || {};
                const mohAreas = payload.moh_areas || [];
                const isExpanded = expandedRdhsId === r.id;
                return (
                  <details key={r.id} open={isExpanded} className="group">
                    <summary
                      className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-gray-50 list-none"
                      onClick={(e) => { e.preventDefault(); setExpandedRdhsId(isExpanded ? null : r.id); }}
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{payload.district_name || 'District'}</p>
                        <p className="text-xs text-gray-500">
                          {payload.period_label} ({payload.period}) · {payload.start_date} to {payload.end_date}
                          {r.sent_at ? ` · Sent ${new Date(r.sent_at).toLocaleString()}` : ''}
                        </p>
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-500 transition-transform group-open:rotate-180 shrink-0" />
                    </summary>
                    <div className="px-6 pb-4 border-t bg-gray-50/50">
                      <div className="pt-3 mb-3 text-sm text-gray-700">
                        <strong>Summary:</strong> Total children: {summary.total_children ?? 0} · Normal: {summary.normal ?? 0} · MAM: {summary.mam ?? 0} · SAM: {summary.sam ?? 0} · Escalations: {summary.total_escalations ?? 0}
                      </div>
                      {mohAreas.length > 0 && (
                        <div className="space-y-4">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b bg-gray-50">
                                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">MOH Area</th>
                                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">Total</th>
                                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">Normal</th>
                                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">MAM</th>
                                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">SAM</th>
                                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700">Escalations</th>
                                </tr>
                              </thead>
                              <tbody>
                                {mohAreas.map((m: any, i: number) => (
                                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                                    <td className="py-2 px-3 font-medium text-gray-900">{m.moh_name || '—'}</td>
                                    <td className="py-2 px-3 text-gray-700">{m.total_children ?? 0}</td>
                                    <td className="py-2 px-3 text-gray-700">{m.normal ?? 0}</td>
                                    <td className="py-2 px-3 text-gray-700">{m.mam ?? 0}</td>
                                    <td className="py-2 px-3 text-gray-700">{m.sam ?? 0}</td>
                                    <td className="py-2 px-3 text-gray-700">{m.escalations ?? 0}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {(mohAreas.some((m: any) => (m.children || []).length > 0)) && (
                            <div className="mt-4 space-y-3">
                              <p className="font-medium text-gray-800 text-sm">MOH area details (children)</p>
                              {mohAreas.map((m: any, i: number) => {
                                const children = m.children || [];
                                if (children.length === 0) return null;
                                return (
                                  <div key={i} className="border rounded-lg overflow-hidden bg-white">
                                    <div className="px-3 py-2 bg-gray-100 font-medium text-gray-800 text-sm">{m.moh_name || '—'}</div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="border-b bg-gray-50">
                                            <th className="text-left py-1.5 px-2 font-medium text-gray-700">Child ID</th>
                                            <th className="text-left py-1.5 px-2 font-medium text-gray-700">Name</th>
                                            <th className="text-left py-1.5 px-2 font-medium text-gray-700">Gender</th>
                                            <th className="text-left py-1.5 px-2 font-medium text-gray-700">Age(m)</th>
                                            <th className="text-left py-1.5 px-2 font-medium text-gray-700">Risk</th>
                                            <th className="text-left py-1.5 px-2 font-medium text-gray-700">Wt(kg)</th>
                                            <th className="text-left py-1.5 px-2 font-medium text-gray-700">Ht(cm)</th>
                                            <th className="text-left py-1.5 px-2 font-medium text-gray-700">MUAC</th>
                                            <th className="text-left py-1.5 px-2 font-medium text-gray-700">Last Visit</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {children.map((ch: any, j: number) => (
                                            <tr key={j} className="border-b last:border-0 hover:bg-gray-50">
                                              <td className="py-1 px-2">{ch.child_id || '—'}</td>
                                              <td className="py-1 px-2">{ch.name || '—'}</td>
                                              <td className="py-1 px-2">{ch.gender || '—'}</td>
                                              <td className="py-1 px-2">{ch.age_months != null ? ch.age_months : '—'}</td>
                                              <td className="py-1 px-2">
                                                <span className={ch.risk_level === 'SAM' ? 'text-red-600 font-medium' : ch.risk_level === 'MAM' ? 'text-amber-600 font-medium' : 'text-green-600'}>{ch.risk_level || '—'}</span>
                                              </td>
                                              <td className="py-1 px-2">{ch.weight_kg != null ? ch.weight_kg : '—'}</td>
                                              <td className="py-1 px-2">{ch.height_cm != null ? ch.height_cm : '—'}</td>
                                              <td className="py-1 px-2">{ch.muac_cm != null ? ch.muac_cm : '—'}</td>
                                              <td className="py-1 px-2">{ch.last_visit_date || '—'}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
