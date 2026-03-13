import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { getRiskColor, getRiskLabel, type RiskLevel } from '../../types';
import { FileText, Download, Printer, Calendar, Filter, Send, BarChart3, User as UserIcon, FileCheck, TrendingUp, Loader2 } from 'lucide-react';
import { childrenAPI, midwifeAPI, nutritionistAPI } from '../../services/api';
import { HiddenPdfCharts, generateProfessionalPdf } from './PdfReportGenerator';
import type { Measurement } from '../../types';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogAction,
} from '../ui/alert-dialog';

// Get user from localStorage (temporary solution)
const getUser = () => {
  try {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
};

interface Child {
  id: number;
  child_unique_id?: string;
  name: string;
  dob: string;
  current_risk_level?: string;
  birth_risk_level?: string;
  last_risk_update?: string;
}

interface ReportsViewProps {
  user?: { role?: string; name?: string; clinic?: string } | null;
}

/** Map API child + measurements to format expected by generateProfessionalPdf */
function mapApiToPdfChild(apiChild: any, measurementsArray?: any[]): { childData: any; measurements: Measurement[] } {
  const raw = measurementsArray ?? apiChild?.measurements ?? [];
  const dob = apiChild?.dob ?? '';
  const dobDate = dob ? new Date(dob) : null;
  const mapOne = (v: any): Measurement => {
    const dateStr = v.measurement_date || v.visit_date || '';
    const visitDate = dateStr ? new Date(dateStr) : new Date();
    const ageMonths = dobDate ? Math.max(0, Math.floor((visitDate.getTime() - dobDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44))) : 0;
    const r = (v.risk_level || v.current_risk || 'NORMAL').toUpperCase();
    const riskLevel: RiskLevel = r === 'SAM' ? 'sam' : r === 'MAM' ? 'mam' : 'normal';
    return {
      id: String(v.id || visitDate.getTime()),
      date: dateStr?.slice(0, 10) || visitDate.toISOString().slice(0, 10),
      ageMonths,
      weight: Number(v.weight_kg) || 0,
      height: Number(v.height_cm) || 0,
      muac: v.muac_cm != null ? Number(v.muac_cm) : undefined,
      weightForAge: v.z_score_wfa != null ? Number(v.z_score_wfa) : undefined,
      heightForAge: v.z_score_hfa != null ? Number(v.z_score_hfa) : undefined,
      weightForHeight: v.z_score_wfh != null ? Number(v.z_score_wfh) : undefined,
      riskLevel,
      notes: v.notes,
    };
  };
  const baseList = raw.map(mapOne).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const hasBirth = dob && (Number(apiChild?.birth_weight_kg) > 0 || Number(apiChild?.birth_height_cm) > 0 || apiChild?.birth_risk_level);
  const birthRisk = (apiChild?.birth_risk_level || 'NORMAL').toUpperCase();
  const birthLevel: RiskLevel = birthRisk === 'SAM' ? 'sam' : birthRisk === 'MAM' ? 'mam' : 'normal';
  const birthMeas: Measurement = {
    id: 'birth',
    date: dob.slice(0, 10),
    ageMonths: 0,
    weight: Number(apiChild?.birth_weight_kg) || 0,
    height: Number(apiChild?.birth_height_cm) || 0,
    weightForAge: undefined,
    heightForAge: undefined,
    weightForHeight: undefined,
    riskLevel: birthLevel,
    notes: 'Birth',
  };
  const measurements = hasBirth ? [birthMeas, ...baseList] : baseList;
  const cur = (apiChild?.current_risk_level || 'NORMAL').toUpperCase();
  const riskLevel: RiskLevel = cur === 'SAM' ? 'sam' : cur === 'MAM' ? 'mam' : 'normal';
  const childData = {
    id: String(apiChild?.child_unique_id || apiChild?.child_id || apiChild?.id),
    name: apiChild?.name ?? '',
    dob: apiChild?.dob ?? '',
    gender: (apiChild?.gender || 'male') === 'male' ? 'male' as const : 'female' as const,
    guardianName: apiChild?.guardian_name ?? '',
    guardianPhone: apiChild?.guardian_phone ?? '',
    address: apiChild?.address ?? '',
    riskLevel: measurements.length > 1 ? riskLevel : (hasBirth ? birthLevel : riskLevel),
    measurements,
    motherName: apiChild?.mother_name,
    guardianNic: apiChild?.guardian_nic,
    birthWeightKg: apiChild?.birth_weight_kg != null ? Number(apiChild.birth_weight_kg) : null,
    birthHeightCm: apiChild?.birth_height_cm != null ? Number(apiChild.birth_height_cm) : null,
    birthRiskLevel: apiChild?.birth_risk_level ?? null,
  };
  return { childData, measurements };
}

export function ReportsView({ user: userProp }: ReportsViewProps = {}) {
  const userFromStorage = getUser();
  const user = userProp ?? userFromStorage;
  const isMidwife = user?.role === 'midwife';
  
  const [reportType, setReportType] = useState<'all' | 'sam' | 'mam' | 'normal'>('all');
  const [dateFrom, setDateFrom] = useState('2024-01-01');
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Clinic report state (for midwives)
  const [clinicReportMonth, setClinicReportMonth] = useState(new Date().getMonth() + 1);
  const [clinicReportYear, setClinicReportYear] = useState(new Date().getFullYear());
  const [submittingClinicReport, setSubmittingClinicReport] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    sam: 0,
    mam: 0,
    normal: 0,
    escalated: 0,
  });

  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [messageDialogTitle, setMessageDialogTitle] = useState('');
  const [messageDialogContent, setMessageDialogContent] = useState<ReactNode>('');
  const [messageDialogVariant, setMessageDialogVariant] = useState<'info' | 'success' | 'error'>('info');

  const [pdfChildData, setPdfChildData] = useState<{ childData: any; measurements: Measurement[] } | null>(null);
  const [pdfGeneratingChildId, setPdfGeneratingChildId] = useState<number | null>(null);
  const chartRefs = {
    wfa: useRef<HTMLDivElement>(null),
    hfa0_24: useRef<HTMLDivElement>(null),
    hfa24_60: useRef<HTMLDivElement>(null),
    wfh: useRef<HTMLDivElement>(null),
    zscore: useRef<HTMLDivElement>(null),
  };

  const showMessage = (title: string, content: ReactNode, variant: 'info' | 'success' | 'error' = 'info') => {
    setMessageDialogTitle(title);
    setMessageDialogContent(content);
    setMessageDialogVariant(variant);
    setMessageDialogOpen(true);
  };
  const closeMessage = () => setMessageDialogOpen(false);

  useEffect(() => {
    loadChildren();
    if (isMidwife) {
      loadDashboardStats();
    }
  }, [isMidwife]);

  // Auto-refresh summary statistics and children list (e.g. every 30s)
  useEffect(() => {
    const interval = setInterval(() => {
      loadChildren(true);
      if (isMidwife) loadDashboardStats();
    }, 30000);
    return () => clearInterval(interval);
  }, [isMidwife]);

  const loadChildren = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const params: any = {
        risk: reportType !== 'all' ? reportType.toUpperCase() : undefined,
      };
      const response = await childrenAPI.list(params);
      if (response.data.status === 'success') {
        setChildren(response.data.children || []);
        updateStats(response.data.children || []);
      }
    } catch (err: any) {
      if (!silent) setError(err.response?.data?.message || 'Failed to load children');
      console.error('Error loading children:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [reportType]);

  const loadDashboardStats = async () => {
    if (!isMidwife) return;
    try {
      const response = await childrenAPI.list({});
      if (response.data?.status === 'success') {
        const list = response.data.children || [];
        updateStats(list);
      }
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const updateStats = (childrenList: Child[]) => {
    const displayRisk = (c: Child) => {
      const r = c.last_risk_update ? (c.current_risk_level || 'NORMAL') : (c.birth_risk_level || c.current_risk_level || 'NORMAL');
      return (r || 'NORMAL').toUpperCase();
    };
    setStats({
      total: childrenList.length,
      sam: childrenList.filter(c => displayRisk(c) === 'SAM').length,
      mam: childrenList.filter(c => displayRisk(c) === 'MAM').length,
      normal: childrenList.filter(c => displayRisk(c) === 'NORMAL').length,
      escalated: 0,
    });
  };

  useEffect(() => {
    loadChildren();
  }, [reportType]);

  // When PDF data is ready, render charts then generate PDF after delay
  useEffect(() => {
    if (!pdfChildData) return;
    const timer = setTimeout(async () => {
      try {
        await generateProfessionalPdf(pdfChildData.childData, {
          wfa: chartRefs.wfa.current,
          hfa0_24: chartRefs.hfa0_24.current,
          hfa24_60: chartRefs.hfa24_60.current,
          wfh: chartRefs.wfh.current,
          zscore: chartRefs.zscore.current,
        });
        showMessage('PDF downloaded', `Health record for ${pdfChildData.childData.name} has been saved.`, 'success');
      } catch (e) {
        console.error('PDF generation failed', e);
        showMessage('Error', 'Failed to generate PDF. Please try again.', 'error');
      }
      setPdfChildData(null);
      setPdfGeneratingChildId(null);
    }, 1800);
    return () => clearTimeout(timer);
  }, [pdfChildData]);

  const handleDownloadPDF = async (childId?: number) => {
    if (!childId) {
      try {
        await generateSummaryPdf();
        showMessage('Summary PDF downloaded', 'The clinic summary report has been saved to your device.', 'success');
      } catch (e) {
        console.error('Summary PDF error:', e);
        showMessage('Error', 'Failed to generate summary PDF. Please try again.', 'error');
      }
      return;
    }

    setPdfGeneratingChildId(childId);
    try {
      let res: any;
      if (isMidwife) {
        res = await midwifeAPI.getChildReport(childId);
      } else {
        res = await nutritionistAPI.getChild(childId);
      }
      if (res.data?.status !== 'success') {
        showMessage('Error', res.data?.message || 'Failed to load child data', 'error');
        setPdfGeneratingChildId(null);
        return;
      }
      const apiChild = res.data.child || res.data;
      const measurementsArray = res.data.measurements ?? apiChild?.measurements;
      const { childData, measurements } = mapApiToPdfChild(apiChild, measurementsArray);
      setPdfChildData({ childData, measurements });
    } catch (err: any) {
      showMessage('Error', err.response?.data?.message || 'Failed to generate report', 'error');
      setPdfGeneratingChildId(null);
    }
  };

  async function generateSummaryPdf() {
    const { jsPDF } = await import('jspdf');
    const M = 14;
    const PW = 210;
    const CW = PW - M * 2;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    pdf.setFillColor(15, 40, 90);
    pdf.rect(0, 0, PW, 18, 'F');
    pdf.setFillColor(0, 120, 120);
    pdf.rect(0, 18, PW, 2, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Clinic Summary Report', M, 12);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(`Generated: ${new Date().toLocaleString('en-GB')}`, PW - M, 12, { align: 'right' });
    pdf.text('CMRAS', PW - M, 16, { align: 'right' });

    let y = 28;
    pdf.setTextColor(60, 60, 60);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Report parameters', M, y);
    y += 6;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(`Date range: ${dateFrom} to ${dateTo}`, M, y);
    y += 5;
    pdf.text(`Filter: ${reportType === 'all' ? 'All Children' : reportType.toUpperCase()}`, M, y);
    y += 8;

    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.25);
    pdf.line(M, y, PW - M, y);
    y += 8;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('Summary statistics', M, y);
    y += 7;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const statW = CW / 4;
    [
      { label: 'Total', value: stats.total, col: [30, 30, 30] as [number, number, number] },
      { label: 'Normal', value: stats.normal, col: [22, 163, 74] as [number, number, number] },
      { label: 'MAM', value: stats.mam, col: [245, 158, 11] as [number, number, number] },
      { label: 'SAM', value: stats.sam, col: [220, 38, 38] as [number, number, number] },
    ].forEach((s, i) => {
      const x = M + i * statW;
      pdf.setFillColor(248, 250, 252);
      pdf.rect(x, y - 4, statW - 2, 12, 'F');
      pdf.setTextColor(107, 114, 128);
      pdf.setFontSize(7);
      pdf.text(s.label, x + (statW - 2) / 2, y + 2, { align: 'center' });
      pdf.setFontSize(11);
      pdf.setTextColor(...s.col);
      pdf.setFont('helvetica', 'bold');
      pdf.text(String(s.value), x + (statW - 2) / 2, y + 8, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
    });
    y += 16;

    pdf.setDrawColor(200, 200, 200);
    pdf.line(M, y, PW - M, y);
    y += 8;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(`Children (${filteredChildren.length})`, M, y);
    y += 7;

    const colW = [50, 35, 25, 40, 35];
    const headers = ['Name', 'ID', 'Risk', 'Age (mo)', 'Last update'];
    pdf.setFillColor(225, 232, 248);
    pdf.rect(M, y - 4, CW, 7, 'F');
    pdf.setFontSize(8);
    pdf.setTextColor(30, 30, 30);
    let cx = M;
    headers.forEach((h, i) => {
      pdf.text(h, cx + 2, y + 2);
      cx += colW[i];
    });
    y += 8;

    const rowH = 6;
    const maxRows = Math.floor((297 - y - 20) / rowH);
    const rows = filteredChildren.slice(0, maxRows);
    rows.forEach((child, i) => {
      if (i % 2 === 0) {
        pdf.setFillColor(249, 251, 255);
        pdf.rect(M, y - 3.5, CW, rowH, 'F');
      }
      const age = child.dob
        ? Math.floor((Date.now() - new Date(child.dob).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
        : 0;
      const lastUp = child.last_risk_update
        ? new Date(child.last_risk_update).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : '-';
      const risk = (child.current_risk_level || 'Normal').toUpperCase();
      const riskCol: [number, number, number] =
        risk === 'SAM' ? [220, 38, 38] : risk === 'MAM' ? [245, 158, 11] : [22, 163, 74];
      pdf.setFontSize(7);
      pdf.setTextColor(40, 40, 40);
      cx = M;
      const nameStr = pdf.splitTextToSize(child.name || '-', colW[0] - 2)[0] ?? '-';
      pdf.text(nameStr, cx + 2, y + 2);
      cx += colW[0];
      pdf.text(String(child.child_unique_id || child.id), cx + 2, y + 2);
      cx += colW[1];
      pdf.setTextColor(...riskCol);
      pdf.text(risk, cx + 2, y + 2);
      cx += colW[2];
      pdf.setTextColor(40, 40, 40);
      pdf.text(String(age), cx + 2, y + 2);
      cx += colW[3];
      pdf.text(lastUp, cx + 2, y + 2);
      y += rowH;
    });

    if (filteredChildren.length > maxRows) {
      pdf.setFontSize(7);
      pdf.setTextColor(107, 114, 128);
      pdf.text(`... and ${filteredChildren.length - maxRows} more`, M + 2, y + 4);
    }

    pdf.setFontSize(7);
    pdf.setTextColor(150, 150, 150);
    const footerY = 297 - 8;
    pdf.text(
      `CMRAS Clinic Summary  |  ${dateFrom} to ${dateTo}  |  ${filteredChildren.length} children`,
      M,
      footerY
    );
    pdf.text('Page 1', PW - M, footerY, { align: 'right' });

    pdf.save(`Summary_Report_${dateFrom}_to_${dateTo}.pdf`);
  }

  const handleSubmitClinicReport = async () => {
    if (!isMidwife) return;
    
    setSubmittingClinicReport(true);
    try {
      const response = await midwifeAPI.submitClinicReport({
        report_month: clinicReportMonth,
        report_year: clinicReportYear,
      });

      if (response.data.status === 'success') {
        const r = response.data.report || {};
        showMessage('Clinic report submitted successfully', (
          <div className="space-y-2 text-left text-sm text-gray-700">
            <p><strong>Month:</strong> {clinicReportMonth}/{clinicReportYear}</p>
            <p><strong>Total Children:</strong> {r.total_children_seen ?? '—'}</p>
            <p><strong>Normal:</strong> {r.normal_count ?? '—'} · <strong>MAM:</strong> {r.mam_count ?? '—'} · <strong>SAM:</strong> {r.sam_count ?? '—'}</p>
            <p><strong>Escalated:</strong> {r.escalated_cases ?? '—'}</p>
          </div>
        ), 'success');
        loadDashboardStats();
      }
    } catch (err: any) {
      showMessage('Error', err.response?.data?.message || 'Failed to submit clinic report', 'error');
    } finally {
      setSubmittingClinicReport(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredChildren = children.filter((child) => {
    if (reportType === 'all') return true;
    const displayRisk = child.last_risk_update
      ? (child.current_risk_level || 'NORMAL').toUpperCase()
      : (child.birth_risk_level || child.current_risk_level || 'NORMAL').toUpperCase();
    return displayRisk === reportType.toUpperCase();
  });

  return (
    <div className="space-y-6">
      {/* Header - hidden when printing */}
      <div className="no-print">
        <h2 className="text-2xl font-bold text-gray-900">Reports & Documentation</h2>
        <p className="text-gray-600 mt-1">
          {isMidwife 
            ? 'Generate child reports, submit clinic reports to MOH, and download health records'
            : 'Generate and download health records'}
        </p>
      </div>

      {/* Midwife-specific: Clinic Report Submission - hidden when printing */}
      {isMidwife && (
        <div className="no-print bg-blue-50 border border-blue-200 rounded-lg shadow p-6">
          <div className="flex items-start gap-4">
            <div className="bg-blue-100 rounded-lg p-3">
              <Send className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Submit Monthly Clinic Report to MOH</h3>
              <p className="text-sm text-gray-600 mb-4">
                Submit your monthly clinic report to the MOH office. This report includes statistics for all children in your PHM area.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
                  <select
                    value={clinicReportMonth}
                    onChange={(e) => setClinicReportMonth(parseInt(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                      <option key={month} value={month}>
                        {new Date(2000, month - 1).toLocaleString('default', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
                  <input
                    type="number"
                    value={clinicReportYear}
                    onChange={(e) => setClinicReportYear(parseInt(e.target.value))}
                    min="2020"
                    max={new Date().getFullYear() + 1}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleSubmitClinicReport}
                    disabled={submittingClinicReport}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    {submittingClinicReport ? 'Submitting...' : 'Submit to MOH'}
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                <strong>Note:</strong> Once submitted, the report cannot be edited. Please review all data before submission.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Printable report content: filters + summary + children list */}
      <div className="print-report-content">
      <div className="hidden print:block mb-4 text-xl font-bold text-gray-900">Clinic Summary Report</div>
      {/* Report Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Report Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="report-type" className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Risk Level
            </label>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                id="report-type"
                value={reportType}
                onChange={(e) => setReportType(e.target.value as any)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="all">All Children</option>
                <option value="sam">SAM Cases Only</option>
                <option value="mam">MAM Cases Only</option>
                <option value="normal">Normal Only</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="date-from" className="block text-sm font-medium text-gray-700 mb-2">
              Date From
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label htmlFor="date-to" className="block text-sm font-medium text-gray-700 mb-2">
              Date To
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Summary Statistics</h3>
          {loading && <span className="text-sm text-gray-500">Loading...</span>}
        </div>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        <div className={`grid grid-cols-2 ${isMidwife ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4`}>
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <UserIcon className="w-4 h-4 text-blue-600" />
              <p className="text-sm text-gray-600">Total Children</p>
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <p className="text-sm text-gray-600">Normal</p>
            </div>
            <p className="text-3xl font-bold mt-1" style={{ color: '#2ECC71' }}>{stats.normal}</p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-yellow-600" />
              <p className="text-sm text-gray-600">MAM</p>
            </div>
            <p className="text-3xl font-bold mt-1" style={{ color: '#F1C40F' }}>{stats.mam}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <FileCheck className="w-4 h-4 text-red-600" />
              <p className="text-sm text-gray-600">SAM</p>
            </div>
            <p className="text-3xl font-bold mt-1" style={{ color: '#E74C3C' }}>{stats.sam}</p>
          </div>
          {isMidwife && (
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Send className="w-4 h-4 text-orange-600" />
                <p className="text-sm text-gray-600">Escalated</p>
              </div>
              <p className="text-3xl font-bold mt-1" style={{ color: '#FF6B35' }}>{stats.escalated}</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => handleDownloadPDF()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Summary PDF
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </button>
        </div>
      </div>

      {/* Individual Child Records */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">
            Individual Health Records ({filteredChildren.length})
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Download comprehensive PDF reports with WHO growth charts for each child
          </p>
        </div>

        <div className="divide-y divide-gray-200">
          {loading && filteredChildren.length === 0 ? (
            <div className="p-6 text-center text-gray-500">Loading children...</div>
          ) : filteredChildren.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No children found matching the selected filters.</div>
          ) : (
            filteredChildren.map((child) => {
              const age = child.dob 
                ? Math.floor((new Date().getTime() - new Date(child.dob).getTime()) / (1000 * 60 * 60 * 24 * 30))
                : 0;
              const displayRisk = child.last_risk_update
                ? (child.current_risk_level || 'normal').toLowerCase()
                : (child.birth_risk_level || child.current_risk_level || 'normal').toLowerCase();
              const riskLevel = (displayRisk === 'sam' || displayRisk === 'mam' || displayRisk === 'normal') ? displayRisk : 'normal';
              const isGeneratingPdf = pdfGeneratingChildId === child.id;
              return (
                <div key={child.id} className="p-6 hover:bg-gray-50">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-gray-400" />
                        <div>
                          <h4 className="font-medium text-gray-900">{child.name}</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            ID: {child.child_unique_id || child.id} • Age: {age} months
                            {child.last_risk_update && ` • Last Update: ${new Date(child.last_risk_update).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-block px-3 py-1 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: getRiskColor(riskLevel) }}
                      >
                        {getRiskLabel(riskLevel).split(' ')[0]}
                      </span>
                      <button
                        onClick={() => handleDownloadPDF(child.id)}
                        disabled={isGeneratingPdf}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-70 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {isMidwife ? 'Child Report' : 'Download PDF'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      </div>

      {/* Report Templates - hidden when printing */}
      <div className="no-print bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Available Report Templates</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
            <div className="flex items-start gap-3 mb-2">
              <UserIcon className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 mb-2">Individual Child Report</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Comprehensive child health record with demographics, clinic visit measurements, WHO growth charts,
                  and risk assessment
                </p>
                <div className="text-xs text-gray-500">
                  Includes: 3 WHO Growth Charts, Z-score analysis, Measurement history, Escalation history, Recommendations
                </div>
              </div>
            </div>
          </div>

          {isMidwife && (
            <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-2">
                <Send className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 mb-2">Monthly Clinic Report (MOH Submission)</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    Submit monthly aggregated clinic report to MOH office with statistics and case summaries
                  </p>
                  <div className="text-xs text-gray-500">
                    Includes: Total children seen, Risk distribution (Normal/MAM/SAM), Escalated cases, Monthly trends
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
            <div className="flex items-start gap-3 mb-2">
              <BarChart3 className="w-5 h-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 mb-2">Clinic Summary Report</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Overview of all children in the clinic with statistics, charts, and trend analysis
                </p>
                <div className="text-xs text-gray-500">
                  Includes: Risk distribution, Age analysis, Trends, Critical cases summary
                </div>
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
            <div className="flex items-start gap-3 mb-2">
              <FileCheck className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 mb-2">SAM/MAM Case Report</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Detailed report of all malnutrition cases requiring intervention
                </p>
                <div className="text-xs text-gray-500">
                  Includes: Case list, Severity assessment, Follow-up schedule, Intervention recommendations
                </div>
              </div>
            </div>
          </div>

          {isMidwife && (
            <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
              <div className="flex items-start gap-3 mb-2">
                <TrendingUp className="w-5 h-5 text-purple-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 mb-2">Escalation Report</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    View all children escalated to MOH with escalation history and review status
                  </p>
                  <div className="text-xs text-gray-500">
                    Includes: Escalated cases list, Escalation reasons, Review status, MOH feedback
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
            <div className="flex items-start gap-3 mb-2">
              <Calendar className="w-5 h-5 text-orange-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 mb-2">Monthly Progress Report</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Track clinic performance and child outcomes over time
                </p>
                <div className="text-xs text-gray-500">
                  Includes: Monthly trends, Intervention outcomes, Coverage statistics, Performance metrics
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Print Styles: only .print-report-content is visible when printing */}
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
            background: white;
          }
          .print-report-content button {
            display: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Hidden charts for PDF generation (off-screen) */}
      {pdfChildData && (
        <div style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1, pointerEvents: 'none' }}>
          <HiddenPdfCharts
            measurements={pdfChildData.measurements}
            gender={pdfChildData.childData.gender}
            refs={chartRefs}
          />
        </div>
      )}

      {/* Message dialog – matches system AlertDialog design (card + pill button) */}
      <AlertDialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
        <AlertDialogContent
          className="border-2"
          style={{
            backgroundColor: messageDialogVariant === 'error' ? '#fef2f2' : messageDialogVariant === 'success' ? '#f0fdf4' : '#ffffff',
            borderColor: messageDialogVariant === 'error' ? '#fecaca' : messageDialogVariant === 'success' ? '#bbf7d0' : '#cbd5e1',
            borderRadius: '16px',
            boxShadow: '0 10px 32px rgba(15,23,42,0.12)',
            padding: '24px',
            maxWidth: '28rem',
          }}
        >
          <AlertDialogHeader style={{ gap: '8px', textAlign: 'left' }}>
            <AlertDialogTitle style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              {messageDialogTitle}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div style={{ color: '#475569', fontSize: '14px', lineHeight: 1.5, marginTop: '4px' }}>
                {typeof messageDialogContent === 'string' ? <p>{messageDialogContent}</p> : messageDialogContent}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter style={{ marginTop: '20px', justifyContent: 'flex-end' }}>
            <AlertDialogAction
              onClick={closeMessage}
              style={{
                background: '#1e293b',
                color: '#ffffff',
                border: 'none',
                borderRadius: '9999px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
                cursor: 'pointer',
              }}
              className="hover:opacity-90"
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
