/**
 * RDHS Reports – list monthly reports, generate, download (daily/weekly/monthly), send to PDHS.
 */
import { useState, useEffect } from 'react';
import { FileText, Plus, Send, RefreshCw, ChevronDown, Download, Printer } from 'lucide-react';
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
  const [reportPeriodFilter, setReportPeriodFilter] = useState<'monthly' | 'weekly' | 'daily'>('monthly');
  const [mohPeriodTab, setMohPeriodTab] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [sentPeriodReports, setSentPeriodReports] = useState<any[]>([]);
  const [periodDate, setPeriodDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sendingPeriod, setSendingPeriod] = useState(false);
  const [sendingPeriodDate, setSendingPeriodDate] = useState<string | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<number | null>(null);
  const [printingReportId, setPrintingReportId] = useState<number | null>(null);
  const [downloadingPeriodKey, setDownloadingPeriodKey] = useState<string | null>(null);
  const [printingPeriodKey, setPrintingPeriodKey] = useState<string | null>(null);

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

  const loadSentPeriodReports = (period: 'weekly' | 'daily') => {
    rdhsAPI.sentPeriodReports({ period })
      .then((res) => {
        if (res.data?.status === 'success') setSentPeriodReports(res.data.reports || []);
      })
      .catch(() => setSentPeriodReports([]));
  };

  useEffect(() => {
    load();
    loadMohReports();
  }, []);

  useEffect(() => {
    if (activeTab === 'district' && reportPeriodFilter !== 'monthly') {
      loadSentPeriodReports(reportPeriodFilter);
    }
  }, [activeTab, reportPeriodFilter]);

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

  const handleSendPeriodToPdhs = () => {
    if (reportPeriodFilter === 'monthly') return;
    setSendingPeriod(true);
    setError('');
    rdhsAPI
      .sendPeriodReportToPdhs({ period: reportPeriodFilter, date: periodDate })
      .then(() => {
        loadSentPeriodReports(reportPeriodFilter);
        load();
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to send period report'))
      .finally(() => setSendingPeriod(false));
  };

  /** Send a specific period row to PDHS (manual send from Actions like monthly). */
  const handleSendPeriodRowToPdhs = (period: 'weekly' | 'daily', date: string) => {
    setSendingPeriodDate(date);
    setError('');
    rdhsAPI
      .sendPeriodReportToPdhs({ period, date })
      .then(() => {
        loadSentPeriodReports(period);
        load();
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to send report'))
      .finally(() => setSendingPeriodDate(null));
  };

  const handleDownloadPeriodPdf = async (period: 'weekly' | 'daily', date: string) => {
    const key = `${period}-${date}`;
    setError('');
    setDownloadingPeriodKey(key);
    try {
      const res = await rdhsAPI.getFullReport({ period, date });
      if (res.data?.status !== 'success' || !res.data?.report) throw new Error(res.data?.message || 'No report data');
      const pdf = await buildReportPdf(res.data.report);
      const label = period === 'weekly' ? `Week_${date}` : date;
      pdf.save(`RDHS_Report_${label}.pdf`);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to download report');
    } finally {
      setDownloadingPeriodKey(null);
    }
  };

  const handlePrintPeriodReport = async (period: 'weekly' | 'daily', date: string) => {
    const key = `${period}-${date}`;
    setError('');
    setPrintingPeriodKey(key);
    try {
      const res = await rdhsAPI.getFullReport({ period, date });
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
      setPrintingPeriodKey(null);
    }
  };

  /** Build PDF for a full report payload (from getFullReport). Returns jsPDF instance. */
  const buildReportPdf = async (r: any) => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const M = 14;
    const PW = 297;
    const PH = 210;
    const newPage = () => { pdf.addPage(); return 18; };
    let y = 20;

    // ── Header ─────────────────────────────────────────────────────────────
    pdf.setFillColor(88, 28, 135);
    pdf.rect(0, 0, PW, 20, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('RDHS District Report', M, 13);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(`Generated: ${new Date().toLocaleString('en-GB')}`, PW - M, 13, { align: 'right' });
    y = 28;

    // ── Title block ────────────────────────────────────────────────────────
    pdf.setTextColor(30, 30, 30);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(r.district_name || 'District', M, y);
    y += 7;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(`Period: ${r.period_label}  (${r.period})   |   ${r.start_date} to ${r.end_date}`, M, y);
    y += 10;

    // ── District summary ───────────────────────────────────────────────────
    const s = r.summary || {};
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('District Summary', M, y);
    y += 5;
    pdf.setFillColor(243, 232, 255);
    pdf.rect(M, y, 180, 9, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(55, 0, 100);
    pdf.text(`Total children: ${s.total_children ?? 0}`, M + 3, y + 6);
    pdf.text(`Normal: ${s.normal ?? 0}`, M + 45, y + 6);
    pdf.text(`MAM: ${s.mam ?? 0}`, M + 80, y + 6);
    pdf.text(`SAM: ${s.sam ?? 0}`, M + 110, y + 6);
    pdf.text(`Escalations: ${s.total_escalations ?? 0}`, M + 140, y + 6);
    y += 16;

    // ── MOH areas ──────────────────────────────────────────────────────────
    const areas = r.moh_areas || [];
    if (areas.length === 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(80, 80, 80);
      pdf.text('No MOH areas in this district.', M, y + 4);
    }

    // Child-level column layout (landscape A4)
    const COL = { id: M, name: M+28, gender: M+82, age: M+98, risk: M+115, weight: M+143, height: M+162, muac: M+181, visit: M+198 };
    const ROW_H = 6;

    areas.forEach((moh: any) => {
      if (y > PH - 30) y = newPage();

      // MOH section header
      pdf.setFillColor(109, 40, 217);
      pdf.rect(0, y - 4, PW, 9, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`MOH Area: ${moh.moh_name || '—'}`, M + 2, y + 2);
      pdf.setFontSize(8);
      pdf.text(
        `Total: ${moh.total_children ?? 0}   Normal: ${moh.normal ?? 0}   MAM: ${moh.mam ?? 0}   SAM: ${moh.sam ?? 0}   Escalations: ${moh.escalations ?? 0}`,
        PW - M, y + 2, { align: 'right' }
      );
      y += 11;

      const children: any[] = moh.children || [];
      if (children.length === 0) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7.5);
        pdf.setTextColor(120, 120, 120);
        pdf.text('No children registered in this MOH area.', M + 4, y + 3);
        y += 8;
        return;
      }

      // Children table header
      if (y > PH - 20) y = newPage();
      pdf.setFillColor(237, 233, 254);
      pdf.rect(M, y - 3, PW - 2 * M, 7, 'F');
      pdf.setTextColor(55, 20, 100);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Child ID', COL.id, y + 2);
      pdf.text('Name', COL.name, y + 2);
      pdf.text('Gender', COL.gender, y + 2);
      pdf.text('Age(m)', COL.age, y + 2);
      pdf.text('Risk', COL.risk, y + 2);
      pdf.text('Wt(kg)', COL.weight, y + 2);
      pdf.text('Ht(cm)', COL.height, y + 2);
      pdf.text('MUAC', COL.muac, y + 2);
      pdf.text('Last Visit', COL.visit, y + 2);
      y += ROW_H + 1;

      // Children rows
      children.forEach((ch: any, idx: number) => {
        if (y > PH - 10) y = newPage();
        if (idx % 2 === 0) {
          pdf.setFillColor(250, 249, 255);
          pdf.rect(M, y - 3, PW - 2 * M, ROW_H, 'F');
        }
        // risk colour
        const risk = (ch.risk_level || '').toUpperCase();
        if (risk === 'SAM') pdf.setTextColor(185, 28, 28);
        else if (risk === 'MAM') pdf.setTextColor(180, 83, 9);
        else pdf.setTextColor(21, 128, 61);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.5);
        pdf.text(risk || '—', COL.risk, y + 1);

        pdf.setTextColor(40, 40, 40);
        pdf.setFont('helvetica', 'normal');
        pdf.text(String(ch.child_id || '—').slice(0, 14), COL.id, y + 1);
        pdf.text(String(ch.name || '—').slice(0, 24), COL.name, y + 1);
        pdf.text(String(ch.gender || '—').slice(0, 6), COL.gender, y + 1);
        pdf.text(ch.age_months != null ? String(ch.age_months) : '—', COL.age, y + 1);
        pdf.text(ch.weight_kg != null ? String(ch.weight_kg) : '—', COL.weight, y + 1);
        pdf.text(ch.height_cm != null ? String(ch.height_cm) : '—', COL.height, y + 1);
        pdf.text(ch.muac_cm != null ? String(ch.muac_cm) : '—', COL.muac, y + 1);
        pdf.text(ch.last_visit_date ? String(ch.last_visit_date) : '—', COL.visit, y + 1);
        y += ROW_H;
      });
      y += 6;
    });

    // ── Page numbers ───────────────────────────────────────────────────────
    const totalPages = (pdf as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(160, 160, 160);
      pdf.text(`Page ${i} of ${totalPages}`, PW - M, PH - 5, { align: 'right' });
    }

    return pdf;
  };

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  /** Build list of weekly period rows (last 12 weeks, Monday as start). */
  const getWeeklyPeriodRows = (): { date: string; periodLabel: string; sent: boolean }[] => {
    const rows: { date: string; periodLabel: string; sent: boolean }[] = [];
    const sentDates = new Set((sentPeriodReports || []).map((r: any) => r.payload?.start_date).filter(Boolean));
    for (let i = 0; i < 12; i++) {
      const d = new Date();
      d.setDate(d.getDate() - 7 * i);
      const day = d.getDay();
      const toMonday = day === 0 ? 6 : day - 1;
      d.setDate(d.getDate() - toMonday);
      const start = d.toISOString().slice(0, 10);
      const end = new Date(d);
      end.setDate(end.getDate() + 6);
      const fmt = (x: Date) => x.getDate() + ' ' + monthNames[x.getMonth()] + ' ' + x.getFullYear();
      rows.push({
        date: start,
        periodLabel: `${fmt(d)} – ${fmt(end)}`,
        sent: sentDates.has(start),
      });
    }
    return rows;
  };

  /** Build list of daily period rows (last 14 days). */
  const getDailyPeriodRows = (): { date: string; periodLabel: string; sent: boolean }[] => {
    const sentDates = new Set((sentPeriodReports || []).map((r: any) => r.payload?.start_date).filter(Boolean));
    const rows: { date: string; periodLabel: string; sent: boolean }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      rows.push({
        date,
        periodLabel: d.getDate() + ' ' + monthNames[d.getMonth()] + ' ' + d.getFullYear(),
        sent: sentDates.has(date),
      });
    }
    return rows;
  };

  const handleDownloadReportPdf = async (reportRow: { id: number; month: number; report_year: number }) => {
    setError('');
    setDownloadingReportId(reportRow.id);
    try {
      const date = `${reportRow.report_year}-${String(reportRow.month).padStart(2, '0')}-01`;
      const res = await rdhsAPI.getFullReport({ period: 'monthly', date });
      if (res.data?.status !== 'success' || !res.data?.report) throw new Error(res.data?.message || 'No report data');
      const pdf = await buildReportPdf(res.data.report);
      const label = `${monthNames[(reportRow.month || 1) - 1]}_${reportRow.report_year}`;
      pdf.save(`RDHS_Report_${label}.pdf`);
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
      const date = `${reportRow.report_year}-${String(reportRow.month).padStart(2, '0')}-01`;
      const res = await rdhsAPI.getFullReport({ period: 'monthly', date });
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

      {/* Tab 1: RDHS consolidated report – filter by Monthly / Weekly / Daily */}
      {activeTab === 'district' && (
        <>
          {/* Period filter: Monthly | Weekly | Daily */}
          <div className="flex gap-2 border-b border-gray-200 text-sm font-medium">
            {(['monthly', 'weekly', 'daily'] as const).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setReportPeriodFilter(period)}
                className={`px-4 py-2 rounded-lg transition-colors capitalize ${
                  reportPeriodFilter === period
                    ? 'text-purple-700 bg-purple-50 border border-b-white border-purple-200'
                    : 'text-gray-600 hover:bg-gray-50 border border-transparent'
                }`}
              >
                {period}
              </button>
            ))}
          </div>

          {reportPeriodFilter === 'monthly' && (
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
                              {!r.sent_to_pdhs && (
                                <button
                                  type="button"
                                  onClick={() => handleSendToPdhs(r.id)}
                                  className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                                >
                                  <Send className="w-4 h-4" /> Send to PDHS
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

          {(reportPeriodFilter === 'weekly' || reportPeriodFilter === 'daily') && (() => {
            const periodRows = reportPeriodFilter === 'weekly' ? getWeeklyPeriodRows() : getDailyPeriodRows();
            return (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <h3 className="text-lg font-bold text-gray-900 px-6 py-3 border-b bg-gray-50">
                  {reportPeriodFilter === 'weekly' ? 'Weekly' : 'Daily'} reports – Download, Print, or Send to PDHS
                </h3>
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
                    {periodRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-500">No periods to show.</td>
                      </tr>
                    ) : (
                      periodRows.map((row) => {
                        const key = `${reportPeriodFilter}-${row.date}`;
                        const isDownloading = downloadingPeriodKey === key;
                        const isPrinting = printingPeriodKey === key;
                        const isSending = sendingPeriodDate === row.date;
                        return (
                          <tr key={key} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4 text-sm font-medium text-gray-900">{row.periodLabel}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">—</td>
                            <td className="py-3 px-4 text-sm text-gray-600">—</td>
                            <td className="py-3 px-4 text-sm text-gray-600">—</td>
                            <td className="py-3 px-4">
                              {row.sent ? (
                                <span className="text-green-600 text-sm">Yes</span>
                              ) : (
                                <span className="text-gray-500 text-sm">No</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadPeriodPdf(reportPeriodFilter, row.date)}
                                  disabled={isDownloading}
                                  className="flex items-center gap-1 text-sm text-teal-600 hover:underline disabled:opacity-50"
                                  title="Download PDF"
                                >
                                  <Download className="w-4 h-4" />
                                  {isDownloading ? '…' : 'Download'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePrintPeriodReport(reportPeriodFilter, row.date)}
                                  disabled={isPrinting}
                                  className="flex items-center gap-1 text-sm text-gray-700 hover:underline disabled:opacity-50"
                                  title="Print"
                                >
                                  <Printer className="w-4 h-4" />
                                  {isPrinting ? '…' : 'Print'}
                                </button>
                                {!row.sent && (
                                  <button
                                    type="button"
                                    onClick={() => handleSendPeriodRowToPdhs(reportPeriodFilter, row.date)}
                                    disabled={isSending}
                                    className="flex items-center gap-1 text-sm text-blue-600 hover:underline disabled:opacity-50"
                                  >
                                    <Send className="w-4 h-4" />
                                    {isSending ? 'Sending…' : 'Send to PDHS'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                <p className="text-xs text-gray-500 px-6 py-3 border-t bg-gray-50">
                  {reportPeriodFilter === 'weekly' ? 'Last 12 weeks (Monday–Sunday).' : 'Last 14 days.'} Use Download or Print to preview, then Send to PDHS when ready.
                </p>
              </div>
            );
          })()}
        </>
      )}

      {/* Tab 2: MOH reports received – Daily / Weekly / Monthly tabs (MOH currently sends monthly only) */}
      {activeTab === 'moh' && (
      <div className="bg-white rounded-lg shadow">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">MOH reports received in your district</h3>
            <p className="text-xs text-gray-500">
              Reports sent by MOH areas to this RDHS. Use the tabs to filter by period (MOH currently sends monthly).
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

        {/* Period tabs: Daily | Weekly | Monthly – frame design like reference (rounded, bordered; active = purple) */}
        <div className="flex gap-2 border-b border-gray-200 px-6 pt-4 pb-3">
          {(['daily', 'weekly', 'monthly'] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setMohPeriodTab(period)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors border ${
                mohPeriodTab === period
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {period}
            </button>
          ))}
        </div>

        {mohPeriodTab !== 'monthly' ? (
          <div className="p-6 text-sm text-gray-500">No {mohPeriodTab} MOH reports. MOH areas currently send monthly reports only.</div>
        ) : mohLoading ? (
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
