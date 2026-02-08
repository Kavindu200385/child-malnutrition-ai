import { MOCK_CHILDREN } from '../../data/mockData';
import { Users, Building2, AlertTriangle, TrendingUp, Activity, MapPin } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export function AdminOverview() {
  // System-wide statistics
  const totalClinics = 5;
  const totalHealthWorkers = 12;
  const totalChildren = MOCK_CHILDREN.length;
  const samCases = MOCK_CHILDREN.filter(c => c.riskLevel === 'sam').length;
  const mamCases = MOCK_CHILDREN.filter(c => c.riskLevel === 'mam').length;
  const normalCases = MOCK_CHILDREN.filter(c => c.riskLevel === 'normal').length;

  // District-wise distribution
  const districtData = [
    { district: 'Colombo', total: 6, sam: 1, mam: 2, normal: 3 },
    { district: 'Gampaha', total: 8, sam: 2, mam: 1, normal: 5 },
    { district: 'Kandy', total: 5, sam: 0, mam: 2, normal: 3 },
    { district: 'Galle', total: 7, sam: 1, mam: 1, normal: 5 },
  ];

  // Monthly trend
  const monthlyTrend = [
    { month: 'Jul', children: 42, sam: 3, mam: 8 },
    { month: 'Aug', children: 45, sam: 2, mam: 7 },
    { month: 'Sep', children: 48, sam: 3, mam: 9 },
    { month: 'Oct', children: 52, sam: 2, mam: 8 },
    { month: 'Nov', children: 55, sam: 2, mam: 7 },
    { month: 'Dec', children: 58, sam: 1, mam: 6 },
  ];

  // Risk distribution for pie chart
  const riskDistribution = [
    { name: 'Normal', value: normalCases, color: '#2ECC71' },
    { name: 'MAM', value: mamCases, color: '#F1C40F' },
    { name: 'SAM', value: samCases, color: '#E74C3C' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">System Overview</h2>
        <p className="text-gray-600 mt-1">National child malnutrition monitoring dashboard</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Clinics</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalClinics}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Health Workers</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalHealthWorkers}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Children</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalChildren}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Critical Cases</p>
              <p className="text-3xl font-bold text-red-600 mt-2">{samCases}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* National Alert */}
      {samCases > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-lg font-bold text-red-900">
                {samCases} Critical SAM Cases Nationwide
              </h3>
              <p className="text-red-800 mt-1">
                Immediate coordination required with district health offices and nutritional support programs.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart - National Risk Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">National Risk Distribution</h3>
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

        {/* Bar Chart - District Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">District-wise Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={districtData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="district" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="normal" fill="#2ECC71" name="Normal" />
              <Bar dataKey="mam" fill="#F1C40F" name="MAM" />
              <Bar dataKey="sam" fill="#E74C3C" name="SAM" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Line Chart - 6-Month Trend */}
        <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
          <h3 className="text-lg font-bold text-gray-900 mb-4">6-Month National Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="children" stroke="#3498DB" strokeWidth={2} name="Total Children" />
              <Line type="monotone" dataKey="sam" stroke="#E74C3C" strokeWidth={2} name="SAM Cases" />
              <Line type="monotone" dataKey="mam" stroke="#F1C40F" strokeWidth={2} name="MAM Cases" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Clinic Performance Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">Clinic Performance Overview</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Clinic Name</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">District</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Children</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">SAM</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">MAM</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Normal</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 text-sm text-gray-900">Colombo PHM Clinic</td>
                <td className="py-3 px-4 text-sm text-gray-600">Colombo</td>
                <td className="py-3 px-4 text-sm text-gray-900">6</td>
                <td className="py-3 px-4 text-sm text-red-600 font-medium">1</td>
                <td className="py-3 px-4 text-sm text-yellow-600 font-medium">2</td>
                <td className="py-3 px-4 text-sm text-green-600 font-medium">3</td>
                <td className="py-3 px-4">
                  <span className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                    Active
                  </span>
                </td>
              </tr>
              <tr className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 text-sm text-gray-900">Gampaha MOH Office</td>
                <td className="py-3 px-4 text-sm text-gray-600">Gampaha</td>
                <td className="py-3 px-4 text-sm text-gray-900">8</td>
                <td className="py-3 px-4 text-sm text-red-600 font-medium">2</td>
                <td className="py-3 px-4 text-sm text-yellow-600 font-medium">1</td>
                <td className="py-3 px-4 text-sm text-green-600 font-medium">5</td>
                <td className="py-3 px-4">
                  <span className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                    Active
                  </span>
                </td>
              </tr>
              <tr className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 text-sm text-gray-900">Kandy Health Center</td>
                <td className="py-3 px-4 text-sm text-gray-600">Kandy</td>
                <td className="py-3 px-4 text-sm text-gray-900">5</td>
                <td className="py-3 px-4 text-sm text-red-600 font-medium">0</td>
                <td className="py-3 px-4 text-sm text-yellow-600 font-medium">2</td>
                <td className="py-3 px-4 text-sm text-green-600 font-medium">3</td>
                <td className="py-3 px-4">
                  <span className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                    Active
                  </span>
                </td>
              </tr>
              <tr className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 text-sm text-gray-900">Galle District Hospital</td>
                <td className="py-3 px-4 text-sm text-gray-600">Galle</td>
                <td className="py-3 px-4 text-sm text-gray-900">7</td>
                <td className="py-3 px-4 text-sm text-red-600 font-medium">1</td>
                <td className="py-3 px-4 text-sm text-yellow-600 font-medium">1</td>
                <td className="py-3 px-4 text-sm text-green-600 font-medium">5</td>
                <td className="py-3 px-4">
                  <span className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                    Active
                  </span>
                </td>
              </tr>
              <tr className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 text-sm text-gray-900">Jaffna Regional Clinic</td>
                <td className="py-3 px-4 text-sm text-gray-600">Jaffna</td>
                <td className="py-3 px-4 text-sm text-gray-900">4</td>
                <td className="py-3 px-4 text-sm text-red-600 font-medium">0</td>
                <td className="py-3 px-4 text-sm text-yellow-600 font-medium">1</td>
                <td className="py-3 px-4 text-sm text-green-600 font-medium">3</td>
                <td className="py-3 px-4">
                  <span className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                    Active
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* System Health */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="font-medium text-gray-900 mb-2">System Uptime</h4>
          <p className="text-3xl font-bold text-green-600">99.9%</p>
          <p className="text-sm text-gray-600 mt-1">Last 30 days</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="font-medium text-gray-900 mb-2">Data Sync Status</h4>
          <p className="text-3xl font-bold text-green-600">100%</p>
          <p className="text-sm text-gray-600 mt-1">All clinics synced</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="font-medium text-gray-900 mb-2">Active Users</h4>
          <p className="text-3xl font-bold text-blue-600">12</p>
          <p className="text-sm text-gray-600 mt-1">Online now</p>
        </div>
      </div>
    </div>
  );
}
