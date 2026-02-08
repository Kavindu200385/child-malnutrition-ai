import { MOCK_CHILDREN } from '../../data/mockData';
import { getRiskColor, getRiskLabel } from '../../types';
import { AlertTriangle, Users, TrendingUp, Activity } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DashboardViewProps {
  onViewChild: (childId: string) => void;
}

export function DashboardView({ onViewChild }: DashboardViewProps) {
  // Calculate statistics
  const totalChildren = MOCK_CHILDREN.length;
  const samCount = MOCK_CHILDREN.filter(c => c.riskLevel === 'sam').length;
  const mamCount = MOCK_CHILDREN.filter(c => c.riskLevel === 'mam').length;
  const normalCount = MOCK_CHILDREN.filter(c => c.riskLevel === 'normal').length;

  // Critical cases (SAM)
  const criticalCases = MOCK_CHILDREN.filter(c => c.riskLevel === 'sam');

  // Pie chart data
  const riskDistribution = [
    { name: 'Normal', value: normalCount, color: '#2ECC71' },
    { name: 'MAM', value: mamCount, color: '#F1C40F' },
    { name: 'SAM', value: samCount, color: '#E74C3C' },
  ];

  // Bar chart data - age distribution
  const ageDistribution = [
    { age: '0-6 months', normal: 0, mam: 0, sam: 0 },
    { age: '7-12 months', normal: 0, mam: 0, sam: 0 },
    { age: '13-24 months', normal: 2, mam: 0, sam: 0 },
    { age: '25-36 months', normal: 1, mam: 2, sam: 1 },
  ];

  // Line chart data - trend over last 6 months
  const trendData = [
    { month: 'Aug', normal: 3, mam: 1, sam: 2 },
    { month: 'Sep', normal: 3, mam: 2, sam: 1 },
    { month: 'Oct', normal: 3, mam: 2, sam: 1 },
    { month: 'Nov', normal: 3, mam: 2, sam: 1 },
    { month: 'Dec', normal: 3, mam: 2, sam: 1 },
    { month: 'Jan', normal: 3, mam: 2, sam: 1 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-600 mt-1">Overview of child nutrition status</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Children</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalChildren}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Normal</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#2ECC71' }}>{normalCount}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">MAM Cases</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#F1C40F' }}>{mamCount}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">SAM Cases</p>
              <p className="text-3xl font-bold mt-2" style={{ color: '#E74C3C' }}>{samCount}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Critical Cases Alert */}
      {criticalCases.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-bold text-red-900 mb-2">
                Critical Cases Requiring Immediate Attention
              </h3>
              <div className="space-y-2">
                {criticalCases.map(child => (
                  <div key={child.id} className="bg-white rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{child.name}</p>
                        <p className="text-sm text-gray-600">Last visit: {child.lastVisit}</p>
                      </div>
                      <button
                        onClick={() => onViewChild(child.id)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart - Risk Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Risk Level Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={riskDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${entry.value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {riskDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 flex justify-center gap-6">
            {riskDistribution.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }}></div>
                <span className="text-sm text-gray-600">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar Chart - Age Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Age Group Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ageDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="age" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="normal" fill="#2ECC71" name="Normal" />
              <Bar dataKey="mam" fill="#F1C40F" name="MAM" />
              <Bar dataKey="sam" fill="#E74C3C" name="SAM" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Line Chart - Trend */}
        <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
          <h3 className="text-lg font-bold text-gray-900 mb-4">6-Month Trend Analysis</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="normal" stroke="#2ECC71" strokeWidth={2} name="Normal" />
              <Line type="monotone" dataKey="mam" stroke="#F1C40F" strokeWidth={2} name="MAM" />
              <Line type="monotone" dataKey="sam" stroke="#E74C3C" strokeWidth={2} name="SAM" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Visits</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Child Name</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Last Visit</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_CHILDREN.slice()
                .sort((a, b) => new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime())
                .slice(0, 5)
                .map((child) => (
                  <tr key={child.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">{child.name}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{child.lastVisit}</td>
                    <td className="py-3 px-4">
                      <span
                        className="inline-block px-3 py-1 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: getRiskColor(child.riskLevel) }}
                      >
                        {getRiskLabel(child.riskLevel).split(' ')[0]}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => onViewChild(child.id)}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
