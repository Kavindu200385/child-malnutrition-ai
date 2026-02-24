import { useState, useEffect } from 'react';
import { getRiskColor, getRiskLabel } from '../../types';
import { FileText, Download, Printer, Calendar, Filter, Send, BarChart3, User as UserIcon, FileCheck, TrendingUp } from 'lucide-react';
import { childrenAPI, midwifeAPI } from '../../services/api';

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
  last_risk_update?: string;
}

interface ReportsViewProps {
  user?: { role?: string; name?: string; clinic?: string } | null;
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

  useEffect(() => {
    loadChildren();
    if (isMidwife) {
      loadDashboardStats();
    }
  }, [isMidwife]);

  const loadChildren = async () => {
    setLoading(true);
    setError(null);
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
      setError(err.response?.data?.message || 'Failed to load children');
      console.error('Error loading children:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDashboardStats = async () => {
    if (!isMidwife) return;
    try {
      const response = await childrenAPI.list({});
      if (response.data?.status === 'success') {
        const list = response.data.children || [];
        setStats({
          total: list.length,
          sam: list.filter((c: Child) => (c.current_risk_level || '').toUpperCase() === 'SAM').length,
          mam: list.filter((c: Child) => (c.current_risk_level || '').toUpperCase() === 'MAM').length,
          normal: list.filter((c: Child) => (c.current_risk_level || '').toUpperCase() === 'NORMAL').length,
          escalated: 0,
        });
      }
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const updateStats = (childrenList: Child[]) => {
    setStats({
      total: childrenList.length,
      sam: childrenList.filter(c => c.current_risk_level === 'SAM').length,
      mam: childrenList.filter(c => c.current_risk_level === 'MAM').length,
      normal: childrenList.filter(c => c.current_risk_level === 'NORMAL').length,
      escalated: 0,
    });
  };

  useEffect(() => {
    loadChildren();
  }, [reportType]);

  const handleDownloadPDF = async (childId?: number) => {
    if (!childId) {
      alert(`Generating Summary Report...\n\nThis PDF would include:\n• Clinic statistics\n• Risk distribution charts\n• All children data\n• Measurement trends\n• Date range: ${dateFrom} to ${dateTo}`);
      return;
    }

    try {
      let response;
      if (isMidwife) {
        response = await midwifeAPI.getChildReport(childId);
      } else {
        response = await childrenAPI.get(childId);
      }

      if (response.data.status === 'success') {
        const childData = response.data.child || response.data;
        alert(`Generating PDF Health Record for ${childData.name}...\n\nThis PDF would include:\n• Child demographics\n• All measurements history\n• WHO Growth Charts (3 charts)\n• Z-score analysis\n• Risk assessment\n• Recommendations\n• Escalation history`);
        // TODO: Implement actual PDF generation
      }
    } catch (err: any) {
      alert(`Error: ${err.response?.data?.message || 'Failed to generate report'}`);
    }
  };

  const handleSubmitClinicReport = async () => {
    if (!isMidwife) return;
    
    setSubmittingClinicReport(true);
    try {
      const response = await midwifeAPI.submitClinicReport({
        report_month: clinicReportMonth,
        report_year: clinicReportYear,
      });

      if (response.data.status === 'success') {
        alert(`Clinic report submitted successfully to MOH!\n\nMonth: ${clinicReportMonth}/${clinicReportYear}\nTotal Children: ${response.data.report.total_children_seen}\nNormal: ${response.data.report.normal_count}\nMAM: ${response.data.report.mam_count}\nSAM: ${response.data.report.sam_count}\nEscalated: ${response.data.report.escalated_cases}`);
        loadDashboardStats();
      }
    } catch (err: any) {
      alert(`Error: ${err.response?.data?.message || 'Failed to submit clinic report'}`);
    } finally {
      setSubmittingClinicReport(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredChildren = children.filter((child) => {
    if (reportType === 'all') return true;
    return child.current_risk_level?.toLowerCase() === reportType;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Reports & Documentation</h2>
        <p className="text-gray-600 mt-1">
          {isMidwife 
            ? 'Generate child reports, submit clinic reports to MOH, and download health records'
            : 'Generate and download health records'}
        </p>
      </div>

      {/* Midwife-specific: Clinic Report Submission */}
      {isMidwife && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg shadow p-6">
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
              const riskLevel = (child.current_risk_level || 'normal').toLowerCase();
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
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <Download className="w-4 h-4" />
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

      {/* Report Templates */}
      <div className="bg-white rounded-lg shadow p-6">
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

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .bg-white, .bg-white * {
            visibility: visible;
          }
          .bg-white {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            box-shadow: none !important;
          }
          button {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
