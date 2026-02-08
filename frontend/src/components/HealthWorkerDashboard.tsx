import { useState } from 'react';
import { User } from '../App';
import { DashboardView } from './health-worker/DashboardView';
import { SearchChildView } from './health-worker/SearchChildView';
import { ChildProfileView } from './health-worker/ChildProfileView';
import { AddMeasurementView } from './health-worker/AddMeasurementView';
import { AddChildView } from './health-worker/AddChildView';
import { ReportsView } from './health-worker/ReportsView';
import { 
  LayoutDashboard, 
  Search, 
  FileText, 
  LogOut,
  UserCircle,
  PlusCircle,
  UserPlus
} from 'lucide-react';

interface HealthWorkerDashboardProps {
  user: User;
  onLogout: () => void;
}

type View = 'dashboard' | 'search' | 'profile' | 'add-child' | 'add-measurement' | 'reports';

export function HealthWorkerDashboard({ user, onLogout }: HealthWorkerDashboardProps) {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  const handleViewChild = (childId: string) => {
    setSelectedChildId(childId);
    setCurrentView('profile');
  };

  const handleAddMeasurement = (childId: string) => {
    setSelectedChildId(childId);
    setCurrentView('add-measurement');
  };

  const navigationItems = [
    { id: 'dashboard' as View, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'search' as View, label: 'Search Child', icon: Search },
    { id: 'add-child' as View, label: 'Add Child', icon: UserPlus },
    { id: 'add-measurement' as View, label: 'Add Measurement', icon: PlusCircle },
    { id: 'reports' as View, label: 'Reports', icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-xl font-bold text-gray-900">CMRAS</h1>
              <p className="text-xs text-gray-500">{user.clinic}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">Health Worker</p>
              </div>
              <UserCircle className="w-8 h-8 text-gray-400" />
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
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
                      ? 'bg-blue-100 text-blue-700'
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
        {currentView === 'dashboard' && (
          <DashboardView onViewChild={handleViewChild} />
        )}
        {currentView === 'search' && (
          <SearchChildView onViewChild={handleViewChild} />
        )}
        {currentView === 'add-child' && (
          <AddChildView 
            onBack={() => setCurrentView('search')}
            onSuccess={(childId) => {
              setSelectedChildId(childId);
              setCurrentView('profile');
            }}
          />
        )}
        {currentView === 'profile' && selectedChildId && (
          <ChildProfileView 
            childId={selectedChildId} 
            onBack={() => setCurrentView('search')}
            onAddMeasurement={handleAddMeasurement}
          />
        )}
        {currentView === 'add-measurement' && (
          <AddMeasurementView 
            selectedChildId={selectedChildId}
            onBack={() => setCurrentView('search')}
            onSuccess={(childId) => handleViewChild(childId)}
          />
        )}
        {currentView === 'reports' && <ReportsView />}
      </main>
    </div>
  );
}
