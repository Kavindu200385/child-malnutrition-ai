import { useState } from 'react';
import { Login } from './components/Login';
import { HealthWorkerDashboard } from './components/HealthWorkerDashboard';
import { AdminDashboard } from './components/AdminDashboard';

export type UserRole = 'health_worker' | 'admin';

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
    setUser(null);
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {user.role === 'health_worker' ? (
        <HealthWorkerDashboard user={user} onLogout={handleLogout} />
      ) : (
        <AdminDashboard user={user} onLogout={handleLogout} />
      )}
    </div>
  );
}
