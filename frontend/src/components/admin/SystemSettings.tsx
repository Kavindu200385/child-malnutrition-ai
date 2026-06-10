import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Bell, Brain, Database, Download, Globe, Save, Shield, Upload } from 'lucide-react';
import { adminAPI } from '../../services/api';

type RecomputeStatus = 'idle' | 'running' | 'done' | 'error';

interface SettingsState {
  system_language: string;
  timezone: string;
  date_format: string;
  two_factor_auth_required: boolean;
  session_timeout_minutes: number;
  password_policy: string;
  email_notifications: boolean;
  sms_alerts: boolean;
  alert_recipients: string;
  automatic_daily_backup: boolean;
}

const defaults: SettingsState = {
  system_language: 'en',
  timezone: 'asia/colombo',
  date_format: 'yyyy-mm-dd',
  two_factor_auth_required: true,
  session_timeout_minutes: 30,
  password_policy: 'standard',
  email_notifications: true,
  sms_alerts: false,
  alert_recipients: '',
  automatic_daily_backup: false,
};

const buttonBaseClass = 'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const inputClass = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent';

const toBool = (value: unknown, fallback = false) => {
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  return fallback;
};

const SettingSwitch = ({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) => (
  <label className={`relative inline-flex items-center ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="sr-only peer"
    />
    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
  </label>
);

export function SystemSettings() {
  const [settings, setSettings] = useState<SettingsState>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [recomputeStatus, setRecomputeStatus] = useState<RecomputeStatus>('idle');
  const [recomputeResult, setRecomputeResult] = useState<{ updated?: number; total?: number; errors?: number } | null>(null);

  const settingsPayload = useMemo(
    () => [
      { key: 'system_language', value: settings.system_language },
      { key: 'timezone', value: settings.timezone },
      { key: 'date_format', value: settings.date_format },
      { key: 'two_factor_auth_required', value: String(settings.two_factor_auth_required) },
      { key: 'session_timeout_minutes', value: String(settings.session_timeout_minutes) },
      { key: 'password_policy', value: settings.password_policy },
      { key: 'email_notifications', value: String(settings.email_notifications) },
      { key: 'sms_alerts', value: String(settings.sms_alerts) },
      { key: 'alert_recipients', value: settings.alert_recipients },
      { key: 'automatic_daily_backup', value: String(settings.automatic_daily_backup) },
    ],
    [settings],
  );

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await adminAPI.getSettings();
        const loaded = { ...defaults };
        const rows = res.data?.settings || [];
        rows.forEach((row: { key: keyof SettingsState; value: string }) => {
          if (!(row.key in loaded)) return;
          if (['two_factor_auth_required', 'email_notifications', 'sms_alerts', 'automatic_daily_backup'].includes(row.key)) {
            (loaded as any)[row.key] = toBool(row.value, (defaults as any)[row.key]);
          } else if (row.key === 'session_timeout_minutes') {
            loaded.session_timeout_minutes = Number(row.value) || defaults.session_timeout_minutes;
          } else {
            (loaded as any)[row.key] = row.value ?? (defaults as any)[row.key];
          }
        });
        if (!cancelled) setSettings(loaded);
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load system settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setError('');
    try {
      await adminAPI.updateSettings({ settings: settingsPayload });
      setLastSavedAt(new Date().toLocaleString());
      toast.success('System settings saved');
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to save system settings';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportSettings = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cmras-system-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleRecomputePredictions = async () => {
    setRecomputeStatus('running');
    setRecomputeResult(null);
    try {
      const res = await adminAPI.recomputeMeasurements();
      setRecomputeResult(res.data?.result ?? res.data);
      setRecomputeStatus('done');
      toast.success('AI predictions recomputed');
    } catch (err: any) {
      setRecomputeStatus('error');
      toast.error(err.response?.data?.message || 'Failed to recompute predictions');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">System Settings</h2>
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">System Settings</h2>
          <p className="text-gray-600 mt-1">Configure system preferences, notifications, security, and maintenance.</p>
          {lastSavedAt && <p className="text-xs text-gray-500 mt-1">Last saved: {lastSavedAt}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExportSettings} className={`${buttonBaseClass} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
            <Download className="w-4 h-4" />
            Export Settings
          </button>
          <button onClick={handleSaveSettings} disabled={saving} className={`${buttonBaseClass} bg-blue-600 text-white hover:bg-blue-700`}>
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900">General Settings</h3>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              System Language
              <select value={settings.system_language} onChange={(e) => updateSetting('system_language', e.target.value)} className={`${inputClass} mt-2`}>
                <option value="en">English</option>
                <option value="si">Sinhala</option>
                <option value="ta">Tamil</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Timezone
              <select value={settings.timezone} onChange={(e) => updateSetting('timezone', e.target.value)} className={`${inputClass} mt-2`}>
                <option value="asia/colombo">Asia/Colombo (UTC+5:30)</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Date Format
              <select value={settings.date_format} onChange={(e) => updateSetting('date_format', e.target.value)} className={`${inputClass} mt-2`}>
                <option value="yyyy-mm-dd">YYYY-MM-DD</option>
                <option value="dd-mm-yyyy">DD-MM-YYYY</option>
                <option value="mm-dd-yyyy">MM-DD-YYYY</option>
              </select>
            </label>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900">Security Settings</h3>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-gray-900">Two-Factor Authentication</p>
                <p className="text-sm text-gray-600">Store the policy flag for admin account enforcement.</p>
              </div>
              <SettingSwitch checked={settings.two_factor_auth_required} onChange={(value) => updateSetting('two_factor_auth_required', value)} />
            </div>
            <label className="block text-sm font-medium text-gray-700">
              Session Timeout (minutes)
              <input
                type="number"
                min={5}
                max={240}
                value={settings.session_timeout_minutes}
                onChange={(e) => updateSetting('session_timeout_minutes', Number(e.target.value))}
                className={`${inputClass} mt-2 max-w-xs`}
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Password Policy
              <select value={settings.password_policy} onChange={(e) => updateSetting('password_policy', e.target.value)} className={`${inputClass} mt-2 max-w-xs`}>
                <option value="standard">Standard (8+ characters)</option>
                <option value="strong">Strong (12+ characters, mixed case, numbers, symbols)</option>
                <option value="very-strong">Very Strong (16+ characters, all requirements)</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-bold text-gray-900">Notification Settings</h3>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div>
                <p className="font-medium text-gray-900">Email Notifications</p>
                <p className="text-sm text-gray-600">Policy flag for critical event emails.</p>
              </div>
              <SettingSwitch checked={settings.email_notifications} onChange={(value) => updateSetting('email_notifications', value)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div>
                <p className="font-medium text-gray-900">SMS Alerts</p>
                <p className="text-sm text-gray-600">Policy flag for SAM case SMS alerts.</p>
              </div>
              <SettingSwitch checked={settings.sms_alerts} onChange={(value) => updateSetting('sms_alerts', value)} />
            </div>
          </div>
          <label className="block text-sm font-medium text-gray-700">
            Alert Recipients
            <textarea
              rows={3}
              value={settings.alert_recipients}
              onChange={(e) => updateSetting('alert_recipients', e.target.value)}
              placeholder="admin@health.gov.lk, director@health.gov.lk"
              className={`${inputClass} mt-2 resize-none`}
            />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900">Database & Backup</h3>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-4">
              <div>
                <p className="font-medium text-gray-900">Automatic Daily Backup</p>
                <p className="text-sm text-gray-600">Stores the backup preference. A backup worker must be configured on the server.</p>
              </div>
              <SettingSwitch checked={settings.automatic_daily_backup} onChange={(value) => updateSetting('automatic_daily_backup', value)} />
            </div>
            <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
              <p><strong>Backup Service:</strong> Not configured in this deployment</p>
              <p><strong>Last Backup:</strong> Not available</p>
              <p><strong>Backup Location:</strong> Configure on server</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button disabled className={`${buttonBaseClass} bg-gray-100 text-gray-500`}>
                <Database className="w-4 h-4" />
                Backup Now
              </button>
              <button disabled className={`${buttonBaseClass} bg-gray-100 text-gray-500`}>
                <Upload className="w-4 h-4" />
                Import Data
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900">AI Prediction Maintenance</h3>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600">
              Recompute Z-scores and 2-month risk predictions for all clinic measurements if dashboard prediction counts look stale.
            </p>
            <button onClick={handleRecomputePredictions} disabled={recomputeStatus === 'running'} className={`${buttonBaseClass} bg-blue-600 text-white hover:bg-blue-700`}>
              <Brain className="w-4 h-4" />
              {recomputeStatus === 'running' ? 'Running...' : 'Re-run Predictions'}
            </button>
            {recomputeStatus === 'done' && recomputeResult && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                Done. Updated {recomputeResult.updated ?? 0} / {recomputeResult.total ?? 0} measurements
                {recomputeResult.errors ? ` (${recomputeResult.errors} errors)` : ''}.
              </div>
            )}
            {recomputeStatus === 'error' && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Failed to recompute predictions. Check server logs.
              </div>
            )}
          </div>
        </div>
      </div>

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-sm font-medium text-green-700">Normal</p>
              <p className="text-xs text-gray-600 mt-1">Z-score &gt;= -2</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-sm font-medium text-yellow-700">MAM</p>
              <p className="text-xs text-gray-600 mt-1">-3 &lt;= Z-score &lt; -2</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-700">SAM</p>
              <p className="text-xs text-gray-600 mt-1">Z-score &lt; -3</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
