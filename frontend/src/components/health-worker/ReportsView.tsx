import { useState } from 'react';
import { MOCK_CHILDREN } from '../../data/mockData';
import { getRiskColor, getRiskLabel } from '../../types';
import { FileText, Download, Printer, Calendar, Filter } from 'lucide-react';

export function ReportsView() {
  const [reportType, setReportType] = useState<'all' | 'sam' | 'mam' | 'normal'>('all');
  const [dateFrom, setDateFrom] = useState('2024-01-01');
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  const handleDownloadPDF = (childId?: string) => {
    const child = childId ? MOCK_CHILDREN.find(c => c.id === childId) : null;
    if (child) {
      alert(`Generating PDF Health Record for ${child.name}...\n\nThis PDF would include:\n• Child demographics\n• All measurements history\n• WHO Growth Charts (3 charts)\n• Z-score analysis\n• Risk assessment\n• Recommendations`);
    } else {
      alert(`Generating Summary Report...\n\nThis PDF would include:\n• Clinic statistics\n• Risk distribution charts\n• All children data\n• Measurement trends\n• Date range: ${dateFrom} to ${dateTo}`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredChildren = MOCK_CHILDREN.filter((child) => {
    if (reportType === 'all') return true;
    return child.riskLevel === reportType;
  });

  const stats = {
    total: MOCK_CHILDREN.length,
    sam: MOCK_CHILDREN.filter(c => c.riskLevel === 'sam').length,
    mam: MOCK_CHILDREN.filter(c => c.riskLevel === 'mam').length,
    normal: MOCK_CHILDREN.filter(c => c.riskLevel === 'normal').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Reports & Documentation</h2>
        <p className="text-gray-600 mt-1">Generate and download health records</p>
      </div>

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
        <h3 className="text-lg font-bold text-gray-900 mb-4">Summary Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Total Children</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Normal</p>
            <p className="text-3xl font-bold mt-1" style={{ color: '#2ECC71' }}>{stats.normal}</p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">MAM</p>
            <p className="text-3xl font-bold mt-1" style={{ color: '#F1C40F' }}>{stats.mam}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">SAM</p>
            <p className="text-3xl font-bold mt-1" style={{ color: '#E74C3C' }}>{stats.sam}</p>
          </div>
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
          {filteredChildren.map((child) => {
            const age = Math.floor(
              (new Date().getTime() - new Date(child.dob).getTime()) / (1000 * 60 * 60 * 24 * 30)
            );
            return (
              <div key={child.id} className="p-6 hover:bg-gray-50">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-gray-400" />
                      <div>
                        <h4 className="font-medium text-gray-900">{child.name}</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          ID: {child.id} • Age: {age} months • Last Visit: {child.lastVisit}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-block px-3 py-1 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: getRiskColor(child.riskLevel) }}
                    >
                      {getRiskLabel(child.riskLevel).split(' ')[0]}
                    </span>
                    <button
                      onClick={() => handleDownloadPDF(child.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download PDF
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Report Templates */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Available Report Templates</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-2">Individual Health Record</h4>
            <p className="text-sm text-gray-600 mb-3">
              Comprehensive child health record with demographics, measurements, WHO growth charts,
              and risk assessment
            </p>
            <div className="text-xs text-gray-500">
              Includes: 3 WHO Growth Charts, Z-score analysis, Measurement history, Recommendations
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-2">Clinic Summary Report</h4>
            <p className="text-sm text-gray-600 mb-3">
              Overview of all children in the clinic with statistics, charts, and trend analysis
            </p>
            <div className="text-xs text-gray-500">
              Includes: Risk distribution, Age analysis, Trends, Critical cases summary
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-2">SAM/MAM Case Report</h4>
            <p className="text-sm text-gray-600 mb-3">
              Detailed report of all malnutrition cases requiring intervention
            </p>
            <div className="text-xs text-gray-500">
              Includes: Case list, Severity assessment, Follow-up schedule
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-2">Monthly Progress Report</h4>
            <p className="text-sm text-gray-600 mb-3">
              Track clinic performance and child outcomes over time
            </p>
            <div className="text-xs text-gray-500">
              Includes: Monthly trends, Intervention outcomes, Coverage statistics
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
