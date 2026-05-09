import React, { useState } from 'react';
import { Heart, Users, Activity } from 'lucide-react';
import api from '../services/api';
import { User, UserRole } from '../App';

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [workerId, setWorkerId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const response = await api.post('/api/auth/login', {
        username: workerId.trim(),
        password,
      });
      if (response.data?.status === 'success' && response.data?.access_token) {
        localStorage.setItem('token', response.data.access_token);
        const backendUser = response.data.user;
        onLogin({
          id: String(backendUser.id),
          username: backendUser.username,
          name: backendUser.name,
          role: backendUser.role as UserRole,
          clinic: backendUser.clinic,
          district: backendUser.district,
          is_protected: !!backendUser.is_protected,
        });
      } else {
        setError('Login failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid credentials. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Left Side - Background Image with Overlay */}
      <div className="hidden lg:flex lg:w-3/5 relative">
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ 
            backgroundImage: `url('https://images.unsplash.com/photo-1604599730009-fe273616197c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoZWFsdGhjYXJlJTIwY2xpbmljJTIwbW90aGVyJTIwY2hpbGQlMjBudXRyaXRpb258ZW58MXx8fHwxNzcwMDE2MzQ1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral')` 
          }}
        />
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/90 via-blue-500/80 to-green-500/70" />
        
        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-12 text-white">
          <div className="max-w-lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-20 h-20 flex items-center justify-center">
                <img
                  src="/logo-white.png"
                  alt="CMRAS Logo"
                  className="w-20 h-20 object-contain"
                />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">CMRAS</h1>
                <p className="text-blue-100 text-sm">Child Malnutrition Risk Assessment</p>
              </div>
            </div>
            
            <h2 className="text-4xl font-bold mb-4 leading-tight">
              Protecting Children's Health Through Early Detection
            </h2>
            
            <p className="text-lg text-blue-50 mb-8">
              A comprehensive digital system for Sri Lankan healthcare workers to monitor child nutrition, 
              track growth patterns, and provide timely interventions using WHO standards.
            </p>

            {/* Features */}
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center flex-shrink-0">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white mb-1">WHO Growth Standards</h3>
                  <p className="text-sm text-blue-100">Real-time Z-score calculations and comprehensive growth tracking</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center flex-shrink-0">
                  <Heart className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white mb-1">Early Risk Prediction</h3>
                  <p className="text-sm text-blue-100">AI-powered forecasting to prevent malnutrition progression</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white mb-1">Clinical Recommendations</h3>
                  <p className="text-sm text-blue-100">Personalized guidance for every child's nutritional needs</p>
                </div>
              </div>
            </div>

            <div className="mt-12 pt-8 border-t border-white/20">
              <p className="text-blue-100 text-sm">
                Ministry of Health - Sri Lanka
              </p>
              <p className="text-blue-200 text-xs mt-1">
                PHM / MOH Clinic Digital Platform
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-2/5 flex items-center justify-center bg-gray-50 p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-8 lg:p-10">
            {/* Header */}
            <div className="mb-8">
              <div className="lg:hidden inline-flex items-center justify-center w-16 h-16 mb-4">
                <img
                  src="/Logo.png"
                  alt="CMRAS Logo"
                  className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 object-contain"
                />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome Back</h2>
              <p className="text-gray-600">Sign in to access the CMRAS portal</p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 border-2 border-red-300 text-red-900 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="workerId" className="block text-sm font-medium text-gray-900 mb-2">
                  Health Worker ID
                </label>
                <input
                  type="text"
                  id="workerId"
                  value={workerId}
                  onChange={(e) => setWorkerId(e.target.value)}
                  className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="Enter your worker ID"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-900 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="Enter your password"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
              >
                Sign In
              </button>
            </form>

            <div className="mt-6 text-center text-xs text-gray-500">
              <p>For authorized health workers only</p>
              <p className="mt-1">Contact system administrator for access</p>
            </div>
          </div>
          
          {/* Mobile Ministry Info */}
          <div className="lg:hidden mt-6 text-center">
            <p className="text-sm text-gray-600">Ministry of Health - Sri Lanka</p>
            <p className="text-xs text-gray-500 mt-1">PHM / MOH Clinic Portal</p>
          </div>
        </div>
      </div>
    </div>
  );
}