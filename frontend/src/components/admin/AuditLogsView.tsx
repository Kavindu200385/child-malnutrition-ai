import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Brain, ClipboardList, Download, FileSpreadsheet, FileText, RefreshCcw, Search, ShieldCheck, UserCog } from 'lucide-react';
import api from '../../services/api';
import { User } from '../../App';

interface AuditLog {
  id: number;
  timestamp: string;
  user_id?: number | null;
  username?: string | null;
  role?: string | null;
  action_type: string;
  action_category: string;
  status: string;
  entity_type?: string | null;
  entity_id?: number | null;
  description?: string | null;
  ip_address?: string | null;
}

interface DashboardStats {
  total_events_today: number;
  failed_logins_today: number;
  user_changes_today: number;
  prediction_events_today: number;
}

interface FilterOptions {
  roles: string[];
  action_types: string[];
  action_categories: string[];
  statuses: string[];
  entity_types: string[];
}

interface AuditLogsViewProps {
  user: User;
}

const emptyFilters: FilterOptions = {
  roles: [],
  action_types: [],
  action_categories: [],
  statuses: [],
  entity_types: [],
};

const formatLabel = (value?: string | null) => value ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : 'N/A';
const buttonBaseClass = "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const buttonStyles = {
  csv: `${buttonBaseClass} bg-emerald-600 text-white hover:bg-emerald-700`,
  excel: `${buttonBaseClass} bg-green-600 text-white hover:bg-green-700`,
  pdf: `${buttonBaseClass} bg-red-600 text-white hover:bg-red-700`,
  reset: `${buttonBaseClass} bg-gray-100 text-gray-700 hover:bg-gray-200`,
  pagination: `${buttonBaseClass} bg-blue-600 text-white hover:bg-blue-700`,
};

const isLegacyPlaceholderLog = (log: AuditLog) => {
  const action = (log.action_type || '').trim().toLowerCase();
  const category = (log.action_category || '').trim().toLowerCase();

  return ['', 'unknown'].includes(action) && ['', 'system', 'unknown'].includes(category);
};

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

export default function AuditLogsView({ user }: AuditLogsViewProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(emptyFilters);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState(todayIsoDate);
  const [endDate, setEndDate] = useState('');
  const [role, setRole] = useState('');
  const [actionType, setActionType] = useState('');
  const [status, setStatus] = useState('');
  const [username, setUsername] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [sortBy, setSortBy] = useState('timestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(false);

  const canExport = user.role === 'superadmin' || (user.role === 'health_ministry' && !!user.is_protected);

  const params = useMemo(() => {
    const values: Record<string, string | number> = {
      page,
      per_page: perPage,
      sort_by: sortBy,
      sort_dir: sortDir,
    };
    if (search.trim()) values.search = search.trim();
    if (startDate) values.start_date = startDate;
    if (endDate) values.end_date = endDate;
    if (role) values.role = role;
    if (actionType) values.action_type = actionType;
    if (status) values.status = status;
    if (username.trim()) values.username = username.trim();
    if (entityType) values.entity_type = entityType;
    if (entityId.trim()) values.entity_id = entityId.trim();
    return values;
  }, [actionType, endDate, entityId, entityType, page, perPage, role, search, sortBy, sortDir, startDate, status, username]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/audit-logs', { params });
      if (res.data.status === 'success') {
        const rawLogs = res.data.logs || [];
        const visibleLogs = rawLogs.filter((log: AuditLog) => !isLegacyPlaceholderLog(log));
        const filteredOnClient = visibleLogs.length !== rawLogs.length;
        setLogs(visibleLogs);
        setTotalPages(filteredOnClient ? 1 : (res.data.pages || 1));
        setTotalRows(filteredOnClient ? visibleLogs.length : (res.data.total || 0));
      }
    } catch (err) {
      console.error('Failed to fetch audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboard = async () => {
    try {
      const [dashboardRes, filtersRes] = await Promise.all([
        api.get('/api/audit-logs/dashboard'),
        api.get('/api/audit-logs/filters'),
      ]);
      if (dashboardRes.data.status === 'success') setDashboard(dashboardRes.data.dashboard);
      if (filtersRes.data.status === 'success') setFilterOptions(filtersRes.data.filters || emptyFilters);
    } catch (err) {
      console.error('Failed to fetch audit dashboard data', err);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const resetFilters = () => {
    setSearch('');
    setStartDate(todayIsoDate());
    setEndDate('');
    setRole('');
    setActionType('');
    setStatus('');
    setUsername('');
    setEntityType('');
    setEntityId('');
    setPage(1);
  };

  const handleExport = async (format: 'csv' | 'xlsx' | 'pdf') => {
    try {
      const exportParams = Object.fromEntries(
        Object.entries(params).filter(([key]) => !['page', 'per_page'].includes(key))
      );
      exportParams.format = format;
      const res = await api.get('/api/audit-logs/export', { params: exportParams, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit_logs.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
      alert('Export failed. Superadmin permission is required.');
    }
  };

  const updateSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const summaryCards = [
    {
      label: 'Total Audit Events Today',
      value: dashboard?.total_events_today ?? 0,
      icon: ShieldCheck,
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      valueColor: 'text-gray-900',
    },
    {
      label: 'Failed Logins Today',
      value: dashboard?.failed_logins_today ?? 0,
      icon: AlertTriangle,
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      valueColor: 'text-red-600',
    },
    {
      label: 'User Changes Today',
      value: dashboard?.user_changes_today ?? 0,
      icon: UserCog,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      valueColor: 'text-gray-900',
    },
    {
      label: 'Prediction Events Today',
      value: dashboard?.prediction_events_today ?? 0,
      icon: Brain,
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      valueColor: 'text-gray-900',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Audit Logs</h2>
          <p className="text-gray-600 mt-1">System activity trail for accountability, monitoring, and compliance</p>
        </div>
        {canExport && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => handleExport('csv')} className={buttonStyles.csv}>
              <Download className="h-4 w-4" />
              <span>CSV</span>
            </button>
            <button onClick={() => handleExport('xlsx')} className={buttonStyles.excel}>
              <FileSpreadsheet className="h-4 w-4" />
              <span>Excel</span>
            </button>
            <button onClick={() => handleExport('pdf')} className={buttonStyles.pdf}>
              <FileText className="h-4 w-4" />
              <span>PDF</span>
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
          <div key={card.label} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{card.label}</p>
                <p className={`text-3xl font-bold mt-2 ${card.valueColor}`}>{card.value}</p>
              </div>
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${card.iconBg}`}>
                <Icon className={`w-6 h-6 ${card.iconColor}`} />
              </div>
            </div>
          </div>
        )})}
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-bold text-gray-900">Search & Filters</h3>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm font-medium text-gray-700">
            Search
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-transparent">
              <Search className="h-4 w-4 text-gray-400" />
              <input className="w-full outline-none" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Username, action, description" />
            </div>
          </label>
          <label className="text-sm font-medium text-gray-700">
            From
            <input type="date" className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} />
          </label>
          <label className="text-sm font-medium text-gray-700">
            To
            <input type="date" className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Role
            <select className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
              <option value="">All roles</option>
              {filterOptions.roles.map((item) => <option key={item} value={item}>{formatLabel(item)}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Status
            <select className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {filterOptions.statuses.map((item) => <option key={item} value={item}>{formatLabel(item)}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Action Type
            <select className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent" value={actionType} onChange={(e) => { setActionType(e.target.value); setPage(1); }}>
              <option value="">All actions</option>
              {filterOptions.action_types.map((item) => <option key={item} value={item}>{formatLabel(item)}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            User
            <input className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent" value={username} onChange={(e) => { setUsername(e.target.value); setPage(1); }} placeholder="Username" />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Entity
            <select className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
              <option value="">All entities</option>
              {filterOptions.entity_types.map((item) => <option key={item} value={item}>{formatLabel(item)}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Entity ID
            <input className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent" value={entityId} onChange={(e) => { setEntityId(e.target.value); setPage(1); }} placeholder="Numeric ID" />
          </label>
          <div className="flex items-end gap-2">
            <button onClick={resetFilters} className={`${buttonStyles.reset} w-full justify-center`}>
              <RefreshCcw className="h-4 w-4" /> Reset
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">Audit Event Records</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[13%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[9%]" />
              <col className="w-[12%]" />
              <col className="w-[23%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {[
                  ['timestamp', 'Timestamp'],
                  ['username', 'User'],
                  ['role', 'Role'],
                  ['action_type', 'Action'],
                  ['action_category', 'Category'],
                  ['status', 'Status'],
                  ['entity_type', 'Entity'],
                ].map(([field, label]) => (
                  <th key={field} className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                    <button onClick={() => updateSort(field)} className="text-left">
                      {label} {sortBy === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </button>
                  </th>
                ))}
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Description</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10">
                    <div className="flex flex-col items-center justify-center text-center">
                      <div className="mb-2 h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                        <ClipboardList className="h-6 w-6 text-blue-600" />
                      </div>
                      <p className="text-sm font-medium leading-5 text-gray-900">Loading audit logs...</p>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10">
                    <div className="flex flex-col items-center justify-center text-center">
                      <div className="mb-2 h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center">
                        <ClipboardList className="h-6 w-6 text-gray-500" />
                      </div>
                      <p className="text-sm font-medium leading-5 text-gray-900">No audit logs found</p>
                      <p className="text-sm leading-5 text-gray-500">No audit logs match the selected filters.</p>
                    </div>
                  </td>
                </tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="whitespace-nowrap py-3 px-4 text-gray-700 truncate">{log.timestamp ? new Date(log.timestamp).toLocaleString() : '-'}</td>
                  <td className="py-3 px-4 font-medium text-gray-900 truncate">{log.username || 'System'}</td>
                  <td className="py-3 px-4 text-gray-700 truncate">{formatLabel(log.role)}</td>
                  <td className="py-3 px-4 text-gray-900 truncate">{formatLabel(log.action_type)}</td>
                  <td className="py-3 px-4 text-gray-700 truncate">{formatLabel(log.action_category)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${log.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {formatLabel(log.status)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-3 px-4 text-gray-700 truncate">{log.entity_type ? `${log.entity_type}:${log.entity_id || '-'}` : '-'}</td>
                  <td className="py-3 px-4 text-gray-600">{log.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-4 border-t border-gray-200 bg-gray-50 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm text-gray-600">
            Showing page {page} of {Math.max(totalPages, 1)} • {totalRows} records
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent" value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
              {[10, 25, 50, 100].map((value) => <option key={value} value={value}>{value} / page</option>)}
            </select>
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className={buttonStyles.pagination}>Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className={buttonStyles.pagination}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
