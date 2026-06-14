import React, { useState, useEffect, useRef } from 'react';
import { User } from '../App';
import { AdminOverview } from './admin/AdminOverview';
import { SystemAnalytics } from './admin/SystemAnalytics';
import { SystemSettings } from './admin/SystemSettings';
import { AreaManagementView } from './admin/AreaManagementView';
import { WorkerManagementView } from './admin/WorkerManagementView';
import { ReportsDashboard } from './admin/ReportsDashboard';
import { RdhsOverview } from './admin/RdhsOverview';
import { RdhsHealthWorkersView } from './admin/RdhsHealthWorkersView';
import { RdhsReportsView } from './admin/RdhsReportsView';
import { RdhsChildrenView } from './admin/RdhsChildrenView';
import { PdhsOverview } from './admin/PdhsOverview';
import { PdhsHealthWorkersView } from './admin/PdhsHealthWorkersView';
import { PdhsReportsView } from './admin/PdhsReportsView';
import { PdhsChildrenView } from './admin/PdhsChildrenView';
import { PdhsAreaView } from './admin/PdhsAreaView';
import { MinistryChildrenView } from './admin/MinistryChildrenView';
import { SignPageUploadView } from './admin/SignPageUploadView';
import AuditLogsView from './admin/AuditLogsView';
import { NotificationBell } from './notifications/NotificationBell';
import { ProfilePopover } from './ProfilePopover';
import { LoggedInGreeting } from './LoggedInGreeting';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Shield,
  MapPin,
  FileText,
  UserCheck,
  Activity,
  ImagePlus,
  ClipboardList,
} from 'lucide-react';

interface AdminDashboardProps {
  user: User;
  onLogout: () => void;
}

type AdminView = 'overview' | 'users' | 'areas' | 'children' | 'reports' | 'analytics' | 'settings' | 'signpages' | 'audit-logs';
type RdhsView = 'overview' | 'healthworkers' | 'reports' | 'children';
type PdhsView = 'overview' | 'healthworkers' | 'reports' | 'children' | 'areas';

export function AdminDashboard({ user, onLogout }: AdminDashboardProps) {
  const [currentView, setCurrentView] = useState<AdminView>('overview');
  const [rdhsView, setRdhsView] = useState<RdhsView>('overview');
  const [pdhsView, setPdhsView] = useState<PdhsView>('overview');
  const navRef = useRef<HTMLDivElement | null>(null);
  const isRdhs = user.role === 'rdhs';
  const isPdhs = user.role === 'pdhs';
  const isHealthMinistry = user.role === 'health_ministry';

  // Restore last selected tab per admin role so refresh keeps the same page
  useEffect(() => {
    const baseKey = `admin_current_view_${user.role}`;
    try {
      if (isRdhs) {
        const stored = localStorage.getItem(baseKey) as RdhsView | null;
        if (stored) setRdhsView(stored);
      } else if (isPdhs) {
        const stored = localStorage.getItem(baseKey) as PdhsView | null;
        if (stored) setPdhsView(stored);
      } else {
        const stored = localStorage.getItem(baseKey) as AdminView | null;
        if (stored) setCurrentView(stored);
      }
    } catch {
      // ignore storage issues
    }
  }, [isPdhs, isRdhs, user.role]);

  const isAdminOrSuperadmin =
    user.role === 'superadmin' ||
    user.role === 'admin' ||
    user.role === 'health_ministry';
  const profileRoleLabel = isHealthMinistry && user.is_protected
    ? 'Super Admin'
    : isHealthMinistry
      ? 'National Admin (Health Ministry)'
      : user.role === 'rdhs'
        ? 'RDHS (District Admin)'
        : user.role === 'pdhs'
          ? 'PDHS (Province Admin)'
          : 'Administrator';

  const navigationItems = isRdhs
    ? [
        { id: 'overview' as RdhsView, label: 'Overview', icon: LayoutDashboard },
        { id: 'healthworkers' as RdhsView, label: 'Health Workers', icon: UserCheck },
        { id: 'reports' as RdhsView, label: 'Reports', icon: FileText },
        { id: 'children' as RdhsView, label: 'Children (Read-only)', icon: Activity },
      ]
    : isPdhs
    ? [
        { id: 'overview' as PdhsView, label: 'Overview', icon: LayoutDashboard },
        { id: 'healthworkers' as PdhsView, label: 'Health Workers', icon: UserCheck },
        { id: 'reports' as PdhsView, label: 'Reports', icon: FileText },
        { id: 'children' as PdhsView, label: 'Children (Read-only)', icon: Activity },
        { id: 'areas' as PdhsView, label: 'Area Management', icon: MapPin },
      ]
    : [
        { id: 'overview' as AdminView, label: 'Overview', icon: LayoutDashboard },
        { id: 'areas' as AdminView, label: 'Area Management', icon: MapPin },
        { id: 'users' as AdminView, label: 'User Management', icon: Users },
        { id: 'children' as AdminView, label: 'All Children', icon: Activity },
        { id: 'signpages' as AdminView, label: 'Sign Page Photos', icon: ImagePlus },
        { id: 'reports' as AdminView, label: 'Reports', icon: FileText },
        { id: 'analytics' as AdminView, label: 'System Analytics', icon: BarChart3 },
        ...(isAdminOrSuperadmin ? [{ id: 'audit-logs' as AdminView, label: 'Audit Logs', icon: ClipboardList }] : []),
        { id: 'settings' as AdminView, label: 'Settings', icon: Settings },
      ];

  useEffect(() => {
    const activeButton = navRef.current?.querySelector<HTMLButtonElement>('[data-active="true"]');
    activeButton?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [currentView, rdhsView, pdhsView]);

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
                <p className="text-xs text-purple-100">
                  {isRdhs ? 'District Administration (RDHS)' : isPdhs ? 'Province Administration (PDHS)' : 'System Administration'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-purple-100">{profileRoleLabel}</p>
              </div>
              <NotificationBell />
              <ProfilePopover user={user} roleLabel={profileRoleLabel} />
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
          <div ref={navRef} className="flex gap-2 overflow-x-auto overscroll-x-contain py-2 pr-6">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = isRdhs ? rdhsView === item.id : isPdhs ? pdhsView === item.id : currentView === item.id;
              return (
                <button
                  key={item.id}
                  data-active={isActive ? 'true' : undefined}
                  onClick={() => {
                    const baseKey = `admin_current_view_${user.role}`;
                    if (isRdhs) {
                      const v = item.id as RdhsView;
                      setRdhsView(v);
                      try {
                        localStorage.setItem(baseKey, v);
                      } catch {
                        // ignore
                      }
                    } else if (isPdhs) {
                      const v = item.id as PdhsView;
                      setPdhsView(v);
                      try {
                        localStorage.setItem(baseKey, v);
                      } catch {
                        // ignore
                      }
                    } else {
                      const v = item.id as AdminView;
                      setCurrentView(v);
                      try {
                        localStorage.setItem(baseKey, v);
                      } catch {
                        // ignore
                      }
                    }
                  }}
                  className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
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
        <LoggedInGreeting user={user} roleLabel={profileRoleLabel} />
        {isRdhs ? (
          <>
            {rdhsView === 'overview' && <RdhsOverview />}
            {rdhsView === 'healthworkers' && <RdhsHealthWorkersView />}
            {rdhsView === 'reports' && <RdhsReportsView />}
            {rdhsView === 'children' && <RdhsChildrenView />}
          </>
        ) : isPdhs ? (
          <>
            {pdhsView === 'overview' && <PdhsOverview />}
            {pdhsView === 'healthworkers' && <PdhsHealthWorkersView />}
            {pdhsView === 'reports' && <PdhsReportsView />}
            {pdhsView === 'children' && <PdhsChildrenView />}
            {pdhsView === 'areas' && <PdhsAreaView />}
          </>
        ) : (
          <>
            {currentView === 'overview' && <AdminOverview />}
            {currentView === 'areas' && <AreaManagementView />}
            {currentView === 'users' && <WorkerManagementView />}
            {currentView === 'children' && <MinistryChildrenView />}
            {currentView === 'signpages' && <SignPageUploadView user={user} />}
            {currentView === 'reports' && <ReportsDashboard user={user} />}
            {currentView === 'analytics' && <SystemAnalytics />}
            {currentView === 'audit-logs' && isAdminOrSuperadmin && <AuditLogsView user={user} />}
            {currentView === 'settings' && <SystemSettings />}
          </>
        )}
      </main>
    </div>
  );
}
