/**
 * Pediatric Unit Dashboard
 * Pediatric Unit role - Birth Registration & Initial Risk Screening at hospital
 */
import { useState, useEffect } from 'react';
import { User } from '../../App';
import { BirthRegistrationView } from '../health-worker/BirthRegistrationView';
import { ChildProfileView } from '../health-worker/ChildProfileView';
import { HospitalChildrenListView } from './HospitalChildrenListView';
import { HospitalStatsView } from './HospitalStatsView';
import { HospitalStatisticsView } from './HospitalStatisticsView';
import { 
  LayoutDashboard, 
  UserPlus,
  Users,
  BarChart3,
  LogOut,
  UserCircle,
  Shield
} from 'lucide-react';

interface HospitalDashboardProps {
  user: User;
  onLogout: () => void;
}

type HospitalView = 'dashboard' | 'register' | 'children' | 'profile' | 'stats';

export function HospitalDashboard({ user, onLogout }: HospitalDashboardProps) {
  const [currentView, setCurrentView] = useState<HospitalView>('dashboard');
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  // Restore last selected hospital view so refresh stays on same page
  useEffect(() => {
    try {
      const stored = localStorage.getItem('hospital_current_view') as HospitalView | null;
      if (stored) {
        setCurrentView(stored);
      }
    } catch {
      // ignore storage issues
    }
  }, []);

  const navigationItems = [
    { id: 'dashboard' as HospitalView, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'register' as HospitalView, label: 'Register Child', icon: UserPlus },
    { id: 'children' as HospitalView, label: 'Registered Children', icon: Users },
    { id: 'stats' as HospitalView, label: 'Statistics', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header – solid dark bar so top bar is clearly visible */}
      <header
        className="sticky top-0 z-10 shadow-lg"
        style={{ backgroundColor: '#4338ca' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-white" aria-hidden />
              <div>
                <h1 className="text-xl font-bold text-white">CMRAS</h1>
                <p className="text-xs text-white font-medium opacity-95">{user.clinic || 'Pediatric Unit'}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-white">{user.name}</p>
                <p className="text-xs text-white font-medium opacity-95">Pediatric Unit</p>
              </div>
              <UserCircle className="w-8 h-8 text-white" aria-hidden />
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-white/20 hover:bg-white/30 rounded-lg transition-colors border border-white/30"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation – role-colored active (indigo) */}
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-2 overflow-x-auto py-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id);
                    try {
                      localStorage.setItem('hospital_current_view', item.id);
                    } catch {
                      // ignore
                    }
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
                    isActive ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
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
          <HospitalStatsView
            user={user}
            onViewChild={(id) => {
              setSelectedChildId(String(id));
              setCurrentView('profile');
            }}
          />
        )}
        {currentView === 'register' && (
          <BirthRegistrationView
            onBack={() => setCurrentView('dashboard')}
            onSuccess={() => {
              setCurrentView('children');
            }}
          />
        )}
        {currentView === 'children' && (
          <HospitalChildrenListView
            user={user}
            onViewChild={(id) => {
              setSelectedChildId(id);
              setCurrentView('profile');
            }}
          />
        )}
        {currentView === 'profile' && selectedChildId && (
          <ChildProfileView
            childId={selectedChildId}
            onBack={() => {
              setCurrentView('children');
              setSelectedChildId(null);
            }}
            onAddMeasurement={() => {}}
            user={user}
          />
        )}
        {currentView === 'stats' && <HospitalStatisticsView user={user} />}
      </main>
    </div>
  );
}
