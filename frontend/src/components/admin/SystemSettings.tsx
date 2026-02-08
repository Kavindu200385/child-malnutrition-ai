import { useState } from 'react';
import { Save, Database, Bell, Shield, Globe, Download, Upload } from 'lucide-react';

export function SystemSettings() {
  const [autoBackup, setAutoBackup] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [twoFactorAuth, setTwoFactorAuth] = useState(true);
  const [language, setLanguage] = useState('en');

  const handleSaveSettings = () => {
    alert('Settings saved successfully!');
  };

  const handleBackupNow = () => {
    alert('Database backup initiated...\n\nThis would create a full system backup including:\n• User data\n• Child records\n• Measurements\n• Reports\n• System configuration');
  };

  const handleExportData = () => {
    alert('Data export initiated...\n\nGenerating CSV export with all system data.');
  };

  const handleImportData = () => {
    alert('This would open a file picker to import data from CSV/Excel files.');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">System Settings</h2>
        <p className="text-gray-600 mt-1">Configure system preferences and security</p>
      </div>

      {/* General Settings */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-bold text-gray-900">General Settings</h3>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-2">
              System Language
            </label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="en">English</option>
              <option value="si">Sinhala (සිංහල)</option>
              <option value="ta">Tamil (தமிழ்)</option>
            </select>
          </div>

          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
              Timezone
            </label>
            <select
              id="timezone"
              className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="asia/colombo">Asia/Colombo (UTC+5:30)</option>
            </select>
          </div>

          <div>
            <label htmlFor="date-format" className="block text-sm font-medium text-gray-700 mb-2">
              Date Format
            </label>
            <select
              id="date-format"
              className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="yyyy-mm-dd">YYYY-MM-DD</option>
              <option value="dd-mm-yyyy">DD-MM-YYYY</option>
              <option value="mm-dd-yyyy">MM-DD-YYYY</option>
            </select>
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-bold text-gray-900">Security Settings</h3>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Two-Factor Authentication</p>
              <p className="text-sm text-gray-600">Require 2FA for all admin accounts</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={twoFactorAuth}
                onChange={(e) => setTwoFactorAuth(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          <div>
            <label htmlFor="session-timeout" className="block text-sm font-medium text-gray-700 mb-2">
              Session Timeout (minutes)
            </label>
            <input
              id="session-timeout"
              type="number"
              defaultValue={30}
              className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="password-policy" className="block text-sm font-medium text-gray-700 mb-2">
              Password Policy
            </label>
            <select
              id="password-policy"
              className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="standard">Standard (8+ characters)</option>
              <option value="strong">Strong (12+ characters, mixed case, numbers, symbols)</option>
              <option value="very-strong">Very Strong (16+ characters, all requirements)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-bold text-gray-900">Notification Settings</h3>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Email Notifications</p>
              <p className="text-sm text-gray-600">Send email alerts for critical events</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">SMS Alerts</p>
              <p className="text-sm text-gray-600">Send SMS for SAM case alerts</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={smsAlerts}
                onChange={(e) => setSmsAlerts(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          <div>
            <label htmlFor="alert-recipients" className="block text-sm font-medium text-gray-700 mb-2">
              Alert Recipients (email addresses, comma-separated)
            </label>
            <textarea
              id="alert-recipients"
              rows={3}
              defaultValue="admin@health.gov.lk, director@health.gov.lk"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            />
          </div>
        </div>
      </div>

      {/* Database & Backup */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-bold text-gray-900">Database & Backup</h3>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Automatic Daily Backup</p>
              <p className="text-sm text-gray-600">Create daily backups at 2:00 AM</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoBackup}
                onChange={(e) => setAutoBackup(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          <div>
            <p className="text-sm text-gray-700 mb-3">
              <strong>Last Backup:</strong> January 13, 2025 at 2:00 AM
            </p>
            <p className="text-sm text-gray-700 mb-3">
              <strong>Backup Size:</strong> 1.8 GB
            </p>
            <p className="text-sm text-gray-700 mb-3">
              <strong>Backup Location:</strong> /backups/cmras/
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleBackupNow}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
            >
              <Database className="w-4 h-4" />
              Backup Now
            </button>
            <button
              onClick={handleExportData}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Data
            </button>
            <button
              onClick={handleImportData}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
            >
              <Upload className="w-4 h-4" />
              Import Data
            </button>
          </div>
        </div>
      </div>

      {/* WHO Standards Configuration */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">WHO Standards Configuration</h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <strong>WHO Growth Standards Version:</strong> 2006 Child Growth Standards
            </p>
            <p className="text-sm text-blue-800 mt-1">
              Z-score calculations are based on WHO reference tables for weight-for-age, height-for-age, and weight-for-height.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Classification Thresholds</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-sm font-medium text-green-700">Normal</p>
                <p className="text-xs text-gray-600 mt-1">Z-score ≥ -2</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-sm font-medium text-yellow-700">MAM</p>
                <p className="text-xs text-gray-600 mt-1">-3 ≤ Z-score &lt; -2</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-sm font-medium text-red-700">SAM</p>
                <p className="text-xs text-gray-600 mt-1">Z-score &lt; -3</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSaveSettings}
          className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
        >
          <Save className="w-4 h-4" />
          Save All Settings
        </button>
      </div>
    </div>
  );
}
