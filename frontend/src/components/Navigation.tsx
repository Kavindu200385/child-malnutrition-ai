import React from 'react';
import { Home, Search, Plus, FileText, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { UserInfo } from '../App';

type Screen = 'login' | 'dashboard' | 'search' | 'profile' | 'add-measurement' | 'reports';

interface NavigationProps {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
  userInfo: UserInfo | null;
}

export function Navigation({ currentScreen, onNavigate, onLogout, userInfo }: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'search', label: 'Search Child', icon: Search },
    { id: 'add-measurement', label: 'Add Measurement', icon: Plus },
    { id: 'reports', label: 'Reports', icon: FileText },
  ];

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="hidden md:block bg-white border-b-2 border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center space-x-8">
              <h1 className="text-blue-600">Child Nutrition Risk System</h1>
              <div className="flex space-x-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(item.id as Screen)}
                      className={`flex items-center space-x-2 px-5 py-3 rounded-lg transition-colors ${
                        currentScreen === item.id
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-gray-900">{userInfo?.name}</p>
                <p className="text-gray-500 text-sm">{userInfo?.role}</p>
              </div>
              <button
                onClick={onLogout}
                className="flex items-center space-x-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Top Bar */}
      <div className="md:hidden bg-white border-b-2 border-gray-200 sticky top-0 z-50">
        <div className="flex justify-between items-center h-16 px-4">
          <h1 className="text-blue-600 text-lg">CNRS</h1>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-gray-700 p-2"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="border-t-2 border-gray-200 bg-white">
            <div className="p-4 bg-blue-50 border-b-2 border-blue-200">
              <p className="text-gray-900">{userInfo?.name}</p>
              <p className="text-gray-600 text-sm">{userInfo?.role}</p>
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id as Screen);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-4 py-4 border-b border-gray-200 ${
                    currentScreen === item.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700'
                  }`}
                >
                  <Icon className="w-6 h-6" />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <button
              onClick={onLogout}
              className="w-full flex items-center space-x-3 px-4 py-4 text-red-600"
            >
              <LogOut className="w-6 h-6" />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 z-50">
        <div className="flex justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id as Screen)}
                className={`flex flex-col items-center py-3 flex-1 ${
                  currentScreen === item.id
                    ? 'text-blue-600'
                    : 'text-gray-500'
                }`}
              >
                <Icon className="w-7 h-7" />
                <span className="text-xs mt-1">{item.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}