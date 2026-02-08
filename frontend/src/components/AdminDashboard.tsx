import { useState } from 'react';
import { User } from '../App';
import { AdminOverview } from './admin/AdminOverview';
import { UserManagement } from './admin/UserManagement';
import { SystemAnalytics } from './admin/SystemAnalytics';
import { SystemSettings } from './admin/SystemSettings';
import { 
  LayoutDashboard, 
  Users, 
  BarChart3, 
  Settings, 
  LogOut,
  Shield
} from 'lucide-react';

interface AdminDashboardProps {
  user: User;
  onLogout: () => void;
}

type AdminView = 'overview' | 'users' | 'analytics' | 'settings';

export function AdminDashboard({ user, onLogout }: AdminDashboardProps) {
  const [currentView, setCurrentView] = useState<AdminView>('overview');

  const navigationItems = [
    { id: 'overview' as AdminView, label: 'Overview', icon: LayoutDashboard },
    { id: 'users' as AdminView, label: 'User Management', icon: Users },
    { id: 'analytics' as AdminView, label: 'System Analytics', icon: BarChart3 },
    { id: 'settings' as AdminView, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-purple-600 to-blue-600 text-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8" />
              <div>
                <h1 className="text-xl font-bold">CMRAS Admin</h1>
                <p className="text-xs text-purple-100">System Administration</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-purple-100">Administrator</p>
              </div>
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-2 overflow-x-auto py-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentView === 'overview' && <AdminOverview />}
        {currentView === 'users' && <UserManagement />}
        {currentView === 'analytics' && <SystemAnalytics />}
        {currentView === 'settings' && <SystemSettings />}
      </main>
    </div>
  );
}
