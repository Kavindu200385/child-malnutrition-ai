import React from 'react';
import { Download, Calendar, AlertTriangle, TrendingUp, Users, FileText, PieChart as PieChartIcon, BarChart3 } from 'lucide-react';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, AreaChart, Area, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

export function Reports() {
  const monthlyStats = {
    month: 'January 2025',
    totalScreened: 345,
    samCases: 12,
    mamCases: 48,
    normalCases: 285,
  };

  const weeklyData = [
    { week: 'Week 1', total: 87, sam: 3, mam: 12, normal: 72 },
    { week: 'Week 2', total: 82, sam: 2, mam: 11, normal: 69 },
    { week: 'Week 3', total: 91, sam: 4, mam: 13, normal: 74 },
    { week: 'Week 4', total: 85, sam: 3, mam: 12, normal: 70 },
  ];

  // Monthly case distribution for pie chart
  const monthlyDistribution = [
    { name: 'Normal', value: 285, color: '#2ECC71' },
    { name: 'MAM', value: 48, color: '#F1C40F' },
    { name: 'SAM', value: 12, color: '#E74C3C' },
  ];

  // Monthly trend data for line chart
  const monthlyTrends = [
    { month: 'Jul', sam: 8, mam: 42, normal: 298 },
    { month: 'Aug', sam: 10, mam: 45, normal: 295 },
    { month: 'Sep', sam: 9, mam: 40, normal: 301 },
    { month: 'Oct', sam: 11, mam: 47, normal: 289 },
    { month: 'Nov', sam: 13, mam: 50, normal: 285 },
    { month: 'Dec', sam: 14, mam: 52, normal: 280 },
    { month: 'Jan', sam: 12, mam: 48, normal: 285 },
  ];

  // Area chart data for cumulative screening
  const cumulativeData = [
    { week: 'Week 1', total: 87 },
    { week: 'Week 2', total: 169 },
    { week: 'Week 3', total: 260 },
    { week: 'Week 4', total: 345 },
  ];

  // Radar chart data for age group analysis
  const ageGroupRadar = [
    { ageGroup: '0-6 months', sam: 3, mam: 12, normal: 65 },
    { ageGroup: '6-12 months', sam: 2, mam: 10, normal: 58 },
    { ageGroup: '1-2 years', sam: 3, mam: 11, normal: 62 },
    { ageGroup: '2-3 years', sam: 2, mam: 8, normal: 55 },
    { ageGroup: '3-5 years', sam: 2, mam: 7, normal: 45 },
  ];

  // Clinic comparison data
  const clinicComparison = [
    { clinic: 'Colombo Central', sam: 3, mam: 10, normal: 72 },
    { clinic: 'Negombo', sam: 2, mam: 8, normal: 68 },
    { clinic: 'Galle', sam: 4, mam: 15, normal: 70 },
    { clinic: 'Kandy', sam: 2, mam: 9, normal: 65 },
    { clinic: 'Jaffna', sam: 1, mam: 6, normal: 10 },
  ];

  const handleExport = (format: 'pdf' | 'excel') => {
    // Mock export function - in production, this would generate actual reports
    alert(`Exporting report as ${format.toUpperCase()}...`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-gray-900 mb-2">Monthly Clinic Report</h1>
        <p className="text-gray-600">Nutritional assessment summary and statistics - {monthlyStats.month}</p>
      </div>

      {/* Monthly Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border-2 border-blue-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-blue-50 text-blue-600 p-3 rounded-lg">
              <Users className="w-7 h-7" />
            </div>
          </div>
          <p className="text-gray-900 mb-1">{monthlyStats.totalScreened}</p>
          <p className="text-gray-600 text-sm">Total Children Screened</p>
        </div>

        <div className="bg-white border-2 border-red-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-red-50 text-red-600 p-3 rounded-lg">
              <AlertTriangle className="w-7 h-7" />
            </div>
          </div>
          <p className="text-gray-900 mb-1">{monthlyStats.samCases}</p>
          <p className="text-gray-600 text-sm">SAM Cases</p>
          <p className="text-red-600 text-sm mt-1">
            {((monthlyStats.samCases / monthlyStats.totalScreened) * 100).toFixed(1)}% of total
          </p>
        </div>

        <div className="bg-white border-2 border-yellow-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-yellow-50 text-yellow-600 p-3 rounded-lg">
              <TrendingUp className="w-7 h-7" />
            </div>
          </div>
          <p className="text-gray-900 mb-1">{monthlyStats.mamCases}</p>
          <p className="text-gray-600 text-sm">MAM Cases</p>
          <p className="text-yellow-600 text-sm mt-1">
            {((monthlyStats.mamCases / monthlyStats.totalScreened) * 100).toFixed(1)}% of total
          </p>
        </div>

        <div className="bg-white border-2 border-green-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-green-50 text-green-600 p-3 rounded-lg">
              <Users className="w-7 h-7" />
            </div>
          </div>
          <p className="text-gray-900 mb-1">{monthlyStats.normalCases}</p>
          <p className="text-gray-600 text-sm">Normal Cases</p>
          <p className="text-green-600 text-sm mt-1">
            {((monthlyStats.normalCases / monthlyStats.totalScreened) * 100).toFixed(1)}% of total
          </p>
        </div>
      </div>

      {/* Chart Grid - Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Monthly Distribution Pie Chart */}
        <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="w-6 h-6 text-gray-700" />
            <h2 className="text-gray-900">Monthly Case Distribution</h2>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={monthlyDistribution}
                cx="50%"
                cy="50%"
                labelLine={true}
                label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(1)}%)`}
                outerRadius={100}
                innerRadius={50}
                fill="#8884d8"
                dataKey="value"
                paddingAngle={2}
              >
                {monthlyDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '2px solid #e5e7eb',
                  borderRadius: '0.75rem',
                  padding: '0.75rem'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-4">
            {monthlyDistribution.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }}></div>
                <span className="text-gray-700 text-sm">{item.name}: {item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly Trend Line Chart */}
        <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-6 h-6 text-gray-700" />
            <h2 className="text-gray-900">6-Month Malnutrition Trends</h2>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={monthlyTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" stroke="#6b7280" tick={{ fill: '#374151' }} />
              <YAxis stroke="#6b7280" tick={{ fill: '#374151' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '2px solid #e5e7eb',
                  borderRadius: '0.75rem',
                  padding: '0.75rem'
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="sam" stroke="#E74C3C" strokeWidth={3} name="SAM Cases" dot={{ fill: '#E74C3C', r: 6 }} />
              <Line type="monotone" dataKey="mam" stroke="#F1C40F" strokeWidth={3} name="MAM Cases" dot={{ fill: '#F1C40F', r: 6 }} />
              <Line type="monotone" dataKey="normal" stroke="#2ECC71" strokeWidth={3} name="Normal Cases" dot={{ fill: '#2ECC71', r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart Grid - Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Cumulative Screening Area Chart */}
        <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-6 h-6 text-gray-700" />
            <h2 className="text-gray-900">Cumulative Monthly Screening</h2>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={cumulativeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="week" stroke="#6b7280" tick={{ fill: '#374151' }} />
              <YAxis stroke="#6b7280" tick={{ fill: '#374151' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '2px solid #e5e7eb',
                  borderRadius: '0.75rem',
                  padding: '0.75rem'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="total" 
                stroke="#3B82F6" 
                fill="#3B82F6" 
                fillOpacity={0.3}
                strokeWidth={3}
                name="Total Children"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Age Group Radar Chart */}
        <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-6 h-6 text-gray-700" />
            <h2 className="text-gray-900">Age Group Analysis</h2>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={ageGroupRadar}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="ageGroup" tick={{ fill: '#374151', fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fill: '#6b7280' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '2px solid #e5e7eb',
                  borderRadius: '0.75rem',
                  padding: '0.75rem'
                }}
              />
              <Legend />
              <Radar name="Normal" dataKey="normal" stroke="#2ECC71" fill="#2ECC71" fillOpacity={0.3} strokeWidth={2} />
              <Radar name="MAM" dataKey="mam" stroke="#F1C40F" fill="#F1C40F" fillOpacity={0.3} strokeWidth={2} />
              <Radar name="SAM" dataKey="sam" stroke="#E74C3C" fill="#E74C3C" fillOpacity={0.3} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Clinic Comparison Bar Chart - Full Width */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-6 h-6 text-gray-700" />
          <h2 className="text-gray-900">Regional Clinic Comparison</h2>
        </div>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={clinicComparison}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="clinic" stroke="#6b7280" tick={{ fill: '#374151' }} />
            <YAxis stroke="#6b7280" tick={{ fill: '#374151' }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '2px solid #e5e7eb',
                borderRadius: '0.75rem',
                padding: '0.75rem'
              }}
            />
            <Legend />
            <Bar dataKey="normal" fill="#2ECC71" name="Normal" radius={[8, 8, 0, 0]} />
            <Bar dataKey="mam" fill="#F1C40F" name="MAM" radius={[8, 8, 0, 0]} />
            <Bar dataKey="sam" fill="#E74C3C" name="SAM" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Export Buttons */}
      <div className="mb-8">
        <h2 className="text-gray-900 mb-4">Export Report</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleExport('pdf')}
            className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg transition-colors"
          >
            <Download className="w-5 h-5" />
            <span>Export as PDF</span>
          </button>
          <button
            onClick={() => handleExport('excel')}
            className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors"
          >
            <Download className="w-5 h-5" />
            <span>Export as Excel</span>
          </button>
        </div>
      </div>

      {/* Weekly Breakdown Table */}
      <div className="bg-white rounded-xl border-2 border-gray-200 mb-8">
        <div className="p-6 border-b-2 border-gray-200">
          <div className="flex items-center gap-2">
            <Calendar className="w-6 h-6 text-gray-700" />
            <h2 className="text-gray-900">Weekly Breakdown - {monthlyStats.month}</h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-gray-900 border-b-2 border-gray-200">Week</th>
                <th className="px-6 py-4 text-left text-gray-900 border-b-2 border-gray-200">Total Screened</th>
                <th className="px-6 py-4 text-left text-gray-900 border-b-2 border-gray-200">SAM Cases</th>
                <th className="px-6 py-4 text-left text-gray-900 border-b-2 border-gray-200">MAM Cases</th>
                <th className="px-6 py-4 text-left text-gray-900 border-b-2 border-gray-200">Normal Cases</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-gray-200">
              {weeklyData.map((week, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-900">{week.week}</td>
                  <td className="px-6 py-4 text-gray-900">{week.total}</td>
                  <td className="px-6 py-4">
                    <span className="text-red-600">{week.sam}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-yellow-600">{week.mam}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-green-600">{week.normal}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Key Indicators */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-6 h-6 text-blue-600" />
          <h2 className="text-gray-900">Key Indicators</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-4">
            <p className="text-gray-600 mb-1">Malnutrition Rate (SAM + MAM)</p>
            <p className="text-gray-900">
              {(((monthlyStats.samCases + monthlyStats.mamCases) / monthlyStats.totalScreened) * 100).toFixed(1)}%
            </p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <p className="text-gray-600 mb-1">Critical Cases (SAM)</p>
            <p className="text-gray-900">
              {((monthlyStats.samCases / monthlyStats.totalScreened) * 100).toFixed(1)}%
            </p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <p className="text-gray-600 mb-1">Average Screenings per Week</p>
            <p className="text-gray-900">
              {(monthlyStats.totalScreened / 4).toFixed(0)} children
            </p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <p className="text-gray-600 mb-1">Healthy Child Rate</p>
            <p className="text-gray-900">
              {((monthlyStats.normalCases / monthlyStats.totalScreened) * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}