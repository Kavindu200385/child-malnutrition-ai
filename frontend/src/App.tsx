import React, { useState, useEffect } from 'react';
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
  };

  // Avoid flicker on first load while we restore user
  if (!bootstrapped) {
    return null;
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  // Route based on role
  const isAdminRole = ['health_ministry', 'pdhs', 'rdhs'].includes(user.role);
  const isHospitalRole = user.role === 'hospital';
  const isHealthWorkerRole = !isAdminRole && !isHospitalRole;

  return (
    <div className="min-h-screen bg-gray-50">
      {isAdminRole ? (
        <AdminDashboard user={user} onLogout={handleLogout} />
      ) : isHospitalRole ? (
        <HospitalDashboard user={user} onLogout={handleLogout} />
      ) : (
        <HealthWorkerDashboard user={user} onLogout={handleLogout} />
      )}
    </div>
  );
}
