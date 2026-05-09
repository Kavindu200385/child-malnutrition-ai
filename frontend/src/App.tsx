import React, { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Login } from './components/Login';
import { HealthWorkerDashboard } from './components/HealthWorkerDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { HospitalDashboard } from './components/hospital/HospitalDashboard';

export type UserRole = 
  | 'health_ministry'  // Ministry (Admin) or System Developer (superadmin)
  | 'pdhs'            // Provincial Admin
  | 'rdhs'            // District Admin
  | 'moh'             // Medical Officer of Health
  | 'amoh'            // Assistant MOH
  | 'midwife'         // PHM
  | 'nutritionist'    // Hospital role
  | 'hospital';       // Pediatric Unit (birth registration at hospital)

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  clinic?: string;
  district?: string;
  is_protected?: boolean;
  // For midwife/MOH assignments (from backend)
  phm_area_id?: number;
}

export interface ChildData {
  id: string;
  name: string;
  age: { years: number; months: number };
  sex: string;
  area: string;
  currentStatus: { classification: 'normal' | 'moderate' | 'critical' };
}

export default function App() {
  const [user, setUser] = useState(null as User | null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Restore user from localStorage on first load so refresh keeps you logged in
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      if (storedUser && token) {
        const parsed = JSON.parse(storedUser) as User;
        setUser(parsed);
      }
    } catch {
      // Ignore parse errors and start with a clean state
      localStorage.removeItem('user');
    } finally {
      setBootstrapped(true);
    }
  }, []);

  const handleLogin = (loggedInUser: User) => {
    // When a user signs in, always start them on the default dashboard/home
    // by clearing any previously remembered per-role view state.
    try {
      localStorage.removeItem(`hw_current_view_${loggedInUser.role}`);
      localStorage.removeItem(`admin_current_view_${loggedInUser.role}`);
      if (loggedInUser.role === 'hospital') {
        localStorage.removeItem('hospital_current_view');
      }
    } catch {
      // ignore storage errors
    }
    setUser(loggedInUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    navigate('/sign-in', { replace: true });
  };

  const getHomePath = (role: UserRole) => {
    if (['health_ministry', 'pdhs', 'rdhs'].includes(role)) return '/admin';
    if (role === 'hospital') return '/hospital';
    return '/health-worker';
  };

  const isAdminRole = !!user && ['health_ministry', 'pdhs', 'rdhs'].includes(user.role);
  const isHospitalRole = !!user && user.role === 'hospital';
  const homePath = user ? getHomePath(user.role) : '/sign-in';

  useEffect(() => {
    if (!bootstrapped || !user) return;
    if (location.pathname === '/' || location.pathname === '/sign-in') {
      navigate(homePath, { replace: true });
    }
  }, [bootstrapped, user, location.pathname, navigate, homePath]);

  // Avoid flicker on first load while we restore user
  if (!bootstrapped) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route
          path="/sign-in"
          element={user ? <Navigate to={homePath} replace /> : <Login onLogin={handleLogin} />}
        />
        <Route
          path="/admin"
          element={
            user && isAdminRole ? (
              <AdminDashboard user={user} onLogout={handleLogout} />
            ) : (
              <Navigate to={user ? homePath : '/sign-in'} replace />
            )
          }
        />
        <Route
          path="/hospital"
          element={
            user && isHospitalRole ? (
              <HospitalDashboard user={user} onLogout={handleLogout} />
            ) : (
              <Navigate to={user ? homePath : '/sign-in'} replace />
            )
          }
        />
        <Route
          path="/health-worker"
          element={
            user && !isAdminRole && !isHospitalRole ? (
              <HealthWorkerDashboard user={user} onLogout={handleLogout} />
            ) : (
              <Navigate to={user ? homePath : '/sign-in'} replace />
            )
          }
        />
        <Route path="/" element={<Navigate to={user ? homePath : '/sign-in'} replace />} />
        <Route path="*" element={<Navigate to={user ? homePath : '/sign-in'} replace />} />
      </Routes>
      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}
