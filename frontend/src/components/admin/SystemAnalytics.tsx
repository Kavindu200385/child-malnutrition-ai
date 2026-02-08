import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, Activity, Database } from 'lucide-react';

export function SystemAnalytics() {
  // Monthly usage data
  const monthlyUsage = [
    { month: 'Jan', logins: 245, measurements: 156, reports: 42 },
    { month: 'Feb', logins: 267, measurements: 178, reports: 48 },
    { month: 'Mar', logins: 289, measurements: 192, reports: 55 },
    { month: 'Apr', logins: 312, measurements: 205, reports: 61 },
    { month: 'May', logins: 298, measurements: 198, reports: 58 },
    { month: 'Jun', logins: 334, measurements: 221, reports: 67 },
    { month: 'Jul', logins: 356, measurements: 235, reports: 72 },
    { month: 'Aug', logins: 378, measurements: 248, reports: 78 },
    { month: 'Sep', logins: 392, measurements: 261, reports: 84 },
    { month: 'Oct', logins: 415, measurements: 275, reports: 89 },
    { month: 'Nov', logins: 431, measurements: 287, reports: 95 },
    { month: 'Dec', logins: 456, measurements: 302, reports: 102 },
  ];

  // Daily activity (last 7 days)
  const dailyActivity = [
    { day: 'Mon', users: 8, actions: 45 },
    { day: 'Tue', users: 10, actions: 52 },
    { day: 'Wed', users: 9, actions: 48 },
    { day: 'Thu', users: 11, actions: 58 },
    { day: 'Fri', users: 12, actions: 63 },
    { day: 'Sat', users: 6, actions: 28 },
    { day: 'Sun', users: 5, actions: 22 },
  ];

  // Clinic performance comparison
  const clinicPerformance = [
    { clinic: 'Colombo', measurements: 156, children: 45, efficiency: 92 },
    { clinic: 'Gampaha', measurements: 178, children: 52, efficiency: 88 },
    { clinic: 'Kandy', measurements: 142, children: 38, efficiency: 85 },
    { clinic: 'Galle', measurements: 165, children: 47, efficiency: 90 },
    { clinic: 'Jaffna', measurements: 128, children: 35, efficiency: 82 },
  ];

  // Growth metrics
  const growthMetrics = [
    { period: 'Q1', children: 120, clinics: 3, workers: 7 },
    { period: 'Q2', children: 145, clinics: 4, workers: 9 },
    { period: 'Q3', children: 168, clinics: 5, workers: 11 },
    { period: 'Q4', children: 195, clinics: 5, workers: 12 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">System Analytics</h2>
        <p className="text-gray-600 mt-1">Comprehensive system usage and performance metrics</p>
      </div>

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Logins</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">4,353</p>
              <p className="text-xs text-green-600 mt-1">↑ 12% vs last month</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Measurements Taken</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">2,758</p>
              <p className="text-xs text-green-600 mt-1">↑ 8% vs last month</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Reports Generated</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">849</p>
              <p className="text-xs text-green-600 mt-1">↑ 15% vs last month</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Database Size</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">2.4 GB</p>
              <p className="text-xs text-gray-600 mt-1">72% capacity</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Database className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Usage Trend */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Annual Usage Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyUsage}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="logins" stroke="#3B82F6" strokeWidth={2} name="Logins" />
              <Line type="monotone" dataKey="measurements" stroke="#10B981" strokeWidth={2} name="Measurements" />
              <Line type="monotone" dataKey="reports" stroke="#8B5CF6" strokeWidth={2} name="Reports" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Daily Activity */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Daily Activity (Last 7 Days)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dailyActivity}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="users" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} name="Active Users" />
              <Area type="monotone" dataKey="actions" stroke="#10B981" fill="#10B981" fillOpacity={0.3} name="Actions" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Clinic Performance */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Clinic Performance Comparison</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={clinicPerformance}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="clinic" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="measurements" fill="#3B82F6" name="Measurements" />
              <Bar dataKey="children" fill="#10B981" name="Children" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Quarterly Growth */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Quarterly Growth Metrics</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={growthMetrics}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="children" fill="#F59E0B" name="Children Enrolled" />
              <Bar dataKey="clinics" fill="#8B5CF6" name="Active Clinics" />
              <Bar dataKey="workers" fill="#EC4899" name="Health Workers" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Statistics Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Performing Clinics */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-900">Top Performing Clinics</h3>
          </div>
          <div className="p-6">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-sm font-medium text-gray-700">Clinic</th>
                  <th className="text-right py-2 text-sm font-medium text-gray-700">Efficiency</th>
                  <th className="text-right py-2 text-sm font-medium text-gray-700">Measurements</th>
                </tr>
              </thead>
              <tbody>
                {clinicPerformance
                  .sort((a, b) => b.efficiency - a.efficiency)
                  .map((clinic) => (
                    <tr key={clinic.clinic} className="border-b border-gray-100">
                      <td className="py-2 text-sm text-gray-900">{clinic.clinic}</td>
                      <td className="py-2 text-sm text-right">
                        <span className="text-green-600 font-medium">{clinic.efficiency}%</span>
                      </td>
                      <td className="py-2 text-sm text-gray-900 text-right">{clinic.measurements}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* System Health Metrics */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-900">System Health Metrics</h3>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">Server Response Time</span>
                <span className="font-medium text-green-600">95ms (Excellent)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: '95%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">Database Performance</span>
                <span className="font-medium text-green-600">92% (Good)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: '92%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">API Availability</span>
                <span className="font-medium text-green-600">99.9% (Excellent)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: '99.9%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">Storage Utilization</span>
                <span className="font-medium text-yellow-600">72% (Monitor)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '72%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">User Satisfaction</span>
                <span className="font-medium text-green-600">4.8/5.0 (Excellent)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: '96%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
