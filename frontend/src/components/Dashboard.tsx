import React from 'react';
import { Search, Plus, AlertTriangle, TrendingUp, Users, CheckCircle, Activity } from 'lucide-react';
import { UserInfo } from '../App';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

type Screen = 'login' | 'dashboard' | 'search' | 'profile' | 'add-measurement' | 'reports';

interface DashboardProps {
  onNavigate: (screen: Screen) => void;
  userInfo: UserInfo | null;
}

export function Dashboard({ onNavigate, userInfo }: DashboardProps) {
  // Get current date in a readable format
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const stats = [
    {
      label: 'Total Children Screened Today',
      value: '23',
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
    },
    {
      label: 'SAM Cases Today',
      value: '2',
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200',
    },
    {
      label: 'MAM Cases Today',
      value: '5',
      icon: TrendingUp,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
    },
    {
      label: 'Normal Cases Today',
      value: '16',
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-200',
    },
  ];

  const recentActivity = [
    { childId: 'CH-2024-0234', name: 'Amal Perera', status: 'Normal', time: '10 mins ago' },
    { childId: 'CH-2024-0235', name: 'Kamal Silva', status: 'MAM', time: '25 mins ago' },
    { childId: 'CH-2024-0236', name: 'Nimal Fernando', status: 'Normal', time: '1 hour ago' },
    { childId: 'CH-2024-0237', name: 'Sunil Jayawardena', status: 'SAM', time: '2 hours ago' },
  ];

  // Pie chart data for case distribution
  const caseDistribution = [
    { name: 'Normal', value: 16, color: '#2ECC71' },
    { name: 'MAM', value: 5, color: '#F1C40F' },
    { name: 'SAM', value: 2, color: '#E74C3C' },
  ];

  // Line chart data for weekly trends (last 7 days)
  const weeklyTrends = [
    { day: 'Mon', total: 18, sam: 1, mam: 3, normal: 14 },
    { day: 'Tue', total: 21, sam: 2, mam: 4, normal: 15 },
    { day: 'Wed', total: 19, sam: 1, mam: 5, normal: 13 },
    { day: 'Thu', total: 24, sam: 3, mam: 6, normal: 15 },
    { day: 'Fri', total: 22, sam: 2, mam: 4, normal: 16 },
    { day: 'Sat', total: 20, sam: 1, mam: 3, normal: 16 },
    { day: 'Today', total: 23, sam: 2, mam: 5, normal: 16 },
  ];

  // Bar chart data for age group distribution
  const ageGroupData = [
    { group: '0-6m', sam: 1, mam: 2, normal: 5 },
    { group: '6-12m', sam: 0, mam: 1, normal: 4 },
    { group: '1-2y', sam: 1, mam: 1, normal: 3 },
    { group: '2-3y', sam: 0, mam: 1, normal: 2 },
    { group: '3-5y', sam: 0, mam: 0, normal: 2 },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-gray-900 mb-1">Welcome, {userInfo?.name}</h1>
        <p className="text-gray-600">{currentDate}</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className={`bg-white border-2 ${stat.border} rounded-xl p-6`}>
              <div className="flex items-center justify-between mb-3">
                <div className={`${stat.bg} ${stat.color} p-3 rounded-lg`}>
                  <Icon className="w-7 h-7" />
                </div>
              </div>
              <p className="text-gray-900 mb-1">{stat.value}</p>
              <p className="text-gray-600 text-sm">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Case Distribution Pie Chart */}
        <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-6 h-6 text-gray-700" />
            <h2 className="text-gray-900">Today's Case Distribution</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={caseDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {caseDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-4">
            {caseDistribution.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }}></div>
                <span className="text-gray-700 text-sm">{item.name}: {item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly Screening Trends Line Chart */}
        <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-6 h-6 text-gray-700" />
            <h2 className="text-gray-900">Weekly Screening Trends</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={weeklyTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" stroke="#6b7280" tick={{ fill: '#374151' }} />
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
              <Line type="monotone" dataKey="normal" stroke="#2ECC71" strokeWidth={3} name="Normal" dot={{ fill: '#2ECC71', r: 5 }} />
              <Line type="monotone" dataKey="mam" stroke="#F1C40F" strokeWidth={3} name="MAM" dot={{ fill: '#F1C40F', r: 5 }} />
              <Line type="monotone" dataKey="sam" stroke="#E74C3C" strokeWidth={3} name="SAM" dot={{ fill: '#E74C3C', r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Age Group Distribution Bar Chart */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-6 h-6 text-gray-700" />
          <h2 className="text-gray-900">Today's Cases by Age Group</h2>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={ageGroupData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="group" stroke="#6b7280" tick={{ fill: '#374151' }} />
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

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => onNavigate('search')}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-8 text-left transition-colors border-2 border-blue-700"
          >
            <Search className="w-10 h-10 mb-4" />
            <h3 className="text-white mb-2">Search Child</h3>
            <p className="text-blue-100">Find existing child records by Child Health ID</p>
          </button>

          <button
            onClick={() => onNavigate('add-measurement')}
            className="bg-green-600 hover:bg-green-700 text-white rounded-xl p-8 text-left transition-colors border-2 border-green-700"
          >
            <Plus className="w-10 h-10 mb-4" />
            <h3 className="text-white mb-2">Add New Measurement</h3>
            <p className="text-green-100">Record new clinic visit and assessment</p>
          </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border-2 border-gray-200">
        <div className="p-6 border-b-2 border-gray-200">
          <h2 className="text-gray-900">Recent Activity</h2>
        </div>
        <div className="divide-y-2 divide-gray-200">
          {recentActivity.map((activity, index) => (
            <div key={index} className="p-5 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-gray-900 mb-1">{activity.name}</p>
                  <p className="text-gray-500">{activity.childId}</p>
                </div>
                <div className="flex items-center space-x-4">
                  <span
                    className={`px-4 py-2 rounded-lg border-2 ${
                      activity.status === 'Normal'
                        ? 'bg-green-50 text-green-800 border-green-300'
                        : activity.status === 'MAM'
                        ? 'bg-yellow-50 text-yellow-800 border-yellow-300'
                        : 'bg-red-50 text-red-800 border-red-300'
                    }`}
                  >
                    {activity.status}
                  </span>
                  <span className="text-gray-400 hidden sm:block">{activity.time}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}