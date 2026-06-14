import React, { useState, useEffect } from 'react';
import { User } from '../App';
import { DashboardView } from './health-worker/DashboardView';
import { MohDashboardView } from './health-worker/MohDashboardView';
import { SearchChildView } from './health-worker/SearchChildView';
import { ChildProfileView } from './health-worker/ChildProfileView';
import { AddMeasurementView } from './health-worker/AddMeasurementView';
import { BirthRegistrationView } from './health-worker/BirthRegistrationView';
import { ReportsView } from './health-worker/ReportsView';
import { AssignChildView } from './health-worker/AssignChildView';
import { TransferReviewView } from './health-worker/TransferReviewView';
import { EscalatedChildrenView } from './health-worker/EscalatedChildrenView';
import { MohHighRiskChildrenView } from './health-worker/MohHighRiskChildrenView';
import { MohMyChildrenView } from './health-worker/MohMyChildrenView';
import { AreaWorkersView } from './health-worker/AreaWorkersView';
import { MohReportsView } from './health-worker/MohReportsView';
import { NutritionistDashboardView } from './health-worker/NutritionistDashboardView';
import { NutritionistReferredView } from './health-worker/NutritionistReferredView';
import { NutritionistChildProfileView } from './health-worker/NutritionistChildProfileView';
import { NutritionistTransferRequestsView } from './health-worker/NutritionistTransferRequestsView';
import { NotificationBell } from './notifications/NotificationBell';
import { ProfilePopover } from './ProfilePopover';
import { LoggedInGreeting } from './LoggedInGreeting';
import { nutritionistAPI, mohAPI } from '../services/api';
import {
  LayoutDashboard,
  Search,
  FileText,
  LogOut,
  PlusCircle,
  UserPlus,
  ArrowRightLeft,
  AlertTriangle,
  Users,
  ClipboardList,
  Shield,
  TrendingUp,
} from 'lucide-react';

/** Full header gradient classes (explicit so Tailwind includes them) */
function getHeaderGradientClass(role: string): string {
  const r = (role || '').toLowerCase();
  if (r === 'moh' || r === 'amoh') return 'bg-gradient-to-r from-teal-600 to-teal-700';
  if (r === 'midwife') return 'bg-gradient-to-r from-emerald-600 to-emerald-700';
  if (r === 'nutritionist') return 'bg-gradient-to-r from-slate-700 to-slate-800';
  if (r === 'hospital') return 'bg-gradient-to-r from-indigo-600 to-indigo-700';
  return 'bg-gradient-to-r from-purple-600 to-blue-600';
}

/** Inline gradient fallback so header is always visible (MOH, Midwife, etc.) */
const HEADER_GRADIENT_STYLE: Record<string, string> = {
  moh: 'linear-gradient(to right, #0d9488, #0f766e)',
  amoh: 'linear-gradient(to right, #0d9488, #0f766e)',
  midwife: 'linear-gradient(to right, #059669, #047857)',
  nutritionist: 'linear-gradient(to right, #334155, #1e293b)',
  hospital: 'linear-gradient(to right, #4f46e5, #4338ca)',
};
const DEFAULT_GRADIENT = 'linear-gradient(to right, #9333ea, #2563eb)';
function getHeaderGradientStyle(role: string): React.CSSProperties {
  const r = (role || '').toLowerCase();
  const bg = HEADER_GRADIENT_STYLE[r] ?? DEFAULT_GRADIENT;
  return { background: bg };
}
/** Subtitle and nav active (explicit classes for Tailwind) */
function getSubtitleClass(role: string): string {
  const r = (role || '').toLowerCase();
  if (r === 'moh' || r === 'amoh') return 'text-teal-100';
  if (r === 'midwife') return 'text-emerald-100';
  if (r === 'nutritionist') return 'text-slate-200';
  if (r === 'hospital') return 'text-indigo-100';
  return 'text-purple-100';
}
function getNavActiveClass(role: string): string {
  const r = (role || '').toLowerCase();
  if (r === 'moh' || r === 'amoh') return 'bg-teal-100 text-teal-700';
  if (r === 'midwife') return 'bg-emerald-100 text-emerald-700';
  if (r === 'nutritionist') return 'bg-slate-100 text-slate-800';
  if (r === 'hospital') return 'bg-indigo-100 text-indigo-700';
  return 'bg-purple-100 text-purple-700';
}

interface HealthWorkerDashboardProps {
  user: User;
  onLogout: () => void;
}

type View =
  | 'dashboard'
  | 'search'
  | 'profile'
  | 'add-child'
  | 'add-measurement'
  | 'reports'
  | 'assign-child'
  | 'transfers'
  | 'moh-escalated'
  | 'moh-high-risk'
  | 'moh-my-children'
  | 'moh-workers'
  | 'moh-reports'
  | 'nut-referred'
  | 'nut-transfer-requests';

export function HealthWorkerDashboard({ user, onLogout }: HealthWorkerDashboardProps) {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [previousView, setPreviousView] = useState<View>('dashboard');
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [topBarVisible, setTopBarVisible] = useState(true);
  const [nutPendingCount, setNutPendingCount] = useState(0);
  const [mohPendingCount, setMohPendingCount] = useState(0);
  const lastScrollY = React.useRef(0);

  const isHospital = user.role === 'hospital';
  const isNutritionist = user.role === 'nutritionist';
  const isMoh = user.role === 'moh' || user.role === 'amoh';
  const canReviewTransfers = !isMoh && !isNutritionist && !isHospital && user.role !== 'midwife';

  // Restore last selected view for this role so refresh stays on same page
  // Skip sub-views that require context (profile, add-child) — fall back to dashboard
  useEffect(() => {
    const key = `hw_current_view_${user.role}`;
    const stored = localStorage.getItem(key) as View | null;
    const contextViews: View[] = ['profile', 'add-child', 'assign-child'];
    if (stored && !contextViews.includes(stored)) {
      setCurrentView(stored);
    }
  }, [user.role]);

  // Poll pending transfer badge count for nutritionist
  useEffect(() => {
    if (!isNutritionist) return;
    const fetchBadge = async () => {
      try {
        const res = await nutritionistAPI.getTransferRequestsBadgeCount();
        if (res.data?.status === 'success') {
          setNutPendingCount(res.data.pending_count || 0);
        }
      } catch {
        // silently ignore
      }
    };
    fetchBadge();
    const interval = setInterval(fetchBadge, 30000);
    return () => clearInterval(interval);
  }, [isNutritionist]);

  // Poll pending escalation badge count for MOH
  useEffect(() => {
    if (!isMoh) return;
    const fetchBadge = async () => {
      try {
        const res = await mohAPI.escalationsBadgeCount();
        if (res.data?.status === 'success') {
          setMohPendingCount(res.data.pending_count || 0);
        }
      } catch {
        // silently ignore
      }
    };
    fetchBadge();
    const interval = setInterval(fetchBadge, 30000);
    return () => clearInterval(interval);
  }, [isMoh]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastScrollY.current && y > 80) setTopBarVisible(false);
      else if (y < lastScrollY.current) setTopBarVisible(true);
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const roleLabel =
    user.role === 'hospital'
      ? 'Pediatric Unit'
      : user.role === 'midwife'
        ? 'Midwife (PHM)'
        : user.role === 'moh' || user.role === 'amoh'
          ? user.role === 'moh' ? 'MOH' : 'AMOH'
          : user.role === 'nutritionist'
            ? 'Nutritionist'
            : 'Health Worker';

  const handleViewChild = (childId: string) => {
    setPreviousView(currentView);
    setSelectedChildId(childId);
    setCurrentView('profile');
  };

  const handleOpenNotification = (notification: { related_child_id?: number | null }) => {
    if (notification.related_child_id) {
      handleViewChild(String(notification.related_child_id));
    }
  };

  const handleAddMeasurement = (childId: string) => {
    setSelectedChildId(childId);
    setCurrentView('add-measurement');
  };

  const navigationItems: { id: View; label: string; icon: any; badge?: number }[] = isHospital
    ? [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'search', label: 'Search Child', icon: Search },
      { id: 'add-child', label: 'Register Child', icon: UserPlus },
    ]
    : user.role === 'midwife'
      ? [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'search', label: 'Search Child', icon: Search },
        { id: 'add-child', label: 'Register Child', icon: UserPlus },
        { id: 'assign-child', label: 'Assign Child', icon: UserPlus },
        { id: 'add-measurement', label: 'Add Measurement', icon: PlusCircle },
        { id: 'reports', label: 'Reports', icon: FileText },
      ]
      : isMoh
        ? [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'search', label: 'Search Child', icon: Search },
          { id: 'moh-escalated', label: 'Incoming Transfers', icon: AlertTriangle, badge: mohPendingCount },
          { id: 'moh-high-risk', label: 'High-Risk Children', icon: TrendingUp },
          { id: 'moh-my-children', label: 'My Children', icon: Users },
          { id: 'moh-workers', label: 'Area Health Workers', icon: Users },
          { id: 'moh-reports', label: 'MOH Reports', icon: ClipboardList },
          { id: 'add-measurement', label: 'Add Measurement', icon: PlusCircle },
        ]
        : isNutritionist
          ? [
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'nut-referred', label: 'Referred Children', icon: Users },
            { id: 'nut-transfer-requests', label: 'Review Transfers', icon: ArrowRightLeft, badge: nutPendingCount },
            { id: 'add-measurement', label: 'Add Measurement', icon: PlusCircle },
            { id: 'reports', label: 'Reports', icon: FileText },
          ]
          : [
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'search', label: 'Search Child', icon: Search },
            { id: 'add-measurement', label: 'Add Measurement', icon: PlusCircle },
            ...(canReviewTransfers ? [{ id: 'transfers' as View, label: 'Review Transfers', icon: ArrowRightLeft }] : []),
            { id: 'reports', label: 'Reports', icon: FileText },
          ];

  const headerClass = getHeaderGradientClass(user.role);
  const subtitleClass = getSubtitleClass(user.role);
  const navActiveClass = getNavActiveClass(user.role);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar: header + nav – hide on scroll down, show on scroll up */}
      <div
        className={`sticky top-0 z-10 transition-transform duration-300 ease-out ${topBarVisible ? 'translate-y-0' : '-translate-y-full'
          }`}
      >
        {/* Header – gradient by role; inline style fallback so MOH/Midwife always visible */}
        <header className={`${headerClass} text-white shadow-lg`} style={getHeaderGradientStyle(user.role)}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <Shield className="w-8 h-8 text-white" />
                <div>
                  <h1 className="text-xl font-bold text-white">CMRAS</h1>
                  <p className={`text-xs ${subtitleClass}`}>{user.clinic || roleLabel}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium text-white">{user.name}</p>
                  <p className={`text-xs ${subtitleClass}`}>{roleLabel}</p>
                </div>
                <NotificationBell onOpenRelated={handleOpenNotification} />
                <ProfilePopover user={user} roleLabel={roleLabel} />
                <button
                  onClick={onLogout}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Navigation – role-colored active state */}
        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex gap-2 overflow-x-auto py-2">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                const hasBadge = item.badge != null && item.badge > 0;
                return (
                  <div key={item.id} className="relative inline-flex">
                    <button
                      onClick={() => {
                        setCurrentView(item.id);
                        try {
                          localStorage.setItem(`hw_current_view_${user.role}`, item.id);
                        } catch {
                          // ignore storage issues
                        }
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${isActive ? navActiveClass : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </button>
                    {/* Badge floats on the top-right corner of the wrapper div */}
                    {hasBadge && (
                      <span className="absolute -top-2 -right-2 z-20 flex items-center justify-center bg-red-500 text-white rounded-full font-bold"
                        style={{ minWidth: '18px', height: '18px', fontSize: '10px', padding: '0 4px', lineHeight: '18px', boxShadow: '0 0 0 2px #fff' }}
                      >
                        {item.badge! > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <LoggedInGreeting user={user} roleLabel={roleLabel} />
        {currentView === 'dashboard' && (
          isMoh ? <MohDashboardView /> : isNutritionist ? <NutritionistDashboardView /> : <DashboardView onViewChild={handleViewChild} />
        )}
        {currentView === 'nut-referred' && isNutritionist && (
          <NutritionistReferredView
            onViewChild={handleViewChild}
            onAddMeasurement={handleAddMeasurement}
          />
        )}
        {currentView === 'nut-transfer-requests' && isNutritionist && (
          <NutritionistTransferRequestsView
            onViewChild={handleViewChild}
          />
        )}
        {currentView === 'search' && (
          <SearchChildView onViewChild={handleViewChild} />
        )}
        {currentView === 'add-child' && (user.role === 'hospital' || user.role === 'midwife') && (
          <BirthRegistrationView
            onBack={() => setCurrentView(user.role === 'midwife' ? 'dashboard' : 'search')}
            onSuccess={(childId) => {
              setSelectedChildId(childId);
              setCurrentView('profile');
            }}
          />
        )}
        {currentView === 'profile' && selectedChildId && (
          isNutritionist ? (
            <NutritionistChildProfileView
              childId={selectedChildId}
              onBack={() => setCurrentView('nut-referred')}
              onAddMeasurement={handleAddMeasurement}
            />
          ) : (
            <ChildProfileView
              childId={selectedChildId}
              onBack={() => setCurrentView(previousView)}
              onAddMeasurement={handleAddMeasurement}
              user={user}
            />
          )
        )}
        {currentView === 'add-measurement' && !isHospital && (
          <AddMeasurementView
            user={user}
            selectedChildId={selectedChildId}
            onBack={() => setCurrentView(isNutritionist ? 'nut-referred' : 'search')}
            onSuccess={(childId) => handleViewChild(childId)}
          />
        )}
        {currentView === 'reports' && !isHospital && !isMoh && <ReportsView user={user} />}
        {currentView === 'moh-escalated' && isMoh && <EscalatedChildrenView onViewChild={handleViewChild} />}
        {currentView === 'moh-high-risk' && isMoh && <MohHighRiskChildrenView onViewChild={handleViewChild} />}
        {currentView === 'moh-my-children' && isMoh && <MohMyChildrenView onViewChild={handleViewChild} />}
        {currentView === 'moh-workers' && isMoh && <AreaWorkersView />}
        {currentView === 'moh-reports' && isMoh && <MohReportsView />}
        {currentView === 'assign-child' && user.role === 'midwife' && (
          <AssignChildView
            onBack={() => setCurrentView('search')}
            onSuccess={(childId) => {
              setSelectedChildId(childId);
              setCurrentView('profile');
            }}
          />
        )}
        {currentView === 'transfers' && canReviewTransfers && (
          <TransferReviewView
            onBack={() => setCurrentView('dashboard')}
            onSuccess={() => {
              // Refresh data if needed
            }}
          />
        )}
      </main>
    </div>
  );
}
