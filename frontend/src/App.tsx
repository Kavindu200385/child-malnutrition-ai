import React, { useState } from 'react';
import { Login } from './components/Login';
import { HealthWorkerDashboard } from './components/HealthWorkerDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { HospitalDashboard } from './components/hospital/HospitalDashboard';

export type UserRole = 
  | 'health_ministry'  // Super Admin
  | 'pdhs'            // Provincial Admin
  | 'rdhs'            // District Admin
  | 'moh'             // Medical Officer of Health
  | 'amoh'            // Assistant MOH
  | 'midwife'         // PHM
  | 'nutritionist'    // Hospital role
  | 'hospital';       // Hospital registration

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  clinic?: string;
  district?: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

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
