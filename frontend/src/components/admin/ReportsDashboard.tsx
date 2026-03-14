/**
 * Reports Dashboard
 * Tabs: Generate Report | Saved Reports | Reports from PDHS (ministry only).
 * Saved Reports: View (professional report with charts), Download (print/PDF), Delete.
 */
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { FileText, BarChart3, RefreshCw, MapPin, Trash2, Eye, Save, Calendar, Clock, User as UserIcon, X, Download, Printer, ChevronDown } from 'lucide-react';
import { reportsAPI, adminAPI } from '../../services/api';
import { User } from '../../App';
import { ConfirmDialog, type ConfirmDialogState } from '../ui/ConfirmDialog';

const RISK_COLORS: Record<string, string> = {
  NORMAL: '#22c55e', MODERATE: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444', MAM: '#f59e0b', SAM: '#ef4444',
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

type Tab = 'generate' | 'saved' | 'pdhs-received';

interface ReportsDashboardProps { user: User; }

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ─── Printable HTML for Download (no charts, for new window + print) ──────────
function buildPrintableReportHtml(report: any): string {
  const d = report.report_data || {};
  const type = report.report_type || 'national';
  const period = report.start_date ? `${report.start_date} to ${report.end_date || '—'}` : '—';
  let body = '';
  if (type === 'district') {
    const s = d.summary || {}, dist = d.risk_distribution || {};
    const adminWorkers = d.worker_performance_admin || (d.worker_performance || []).filter((w: any) => w.role_category === 'admin');
    const fieldWorkers = d.worker_performance_field || (d.worker_performance || []).filter((w: any) => w.role_category === 'field');
    body += `<div class="cards"><div class="card" style="background:#eff6ff"><span class="card-label">Total Children</span><div class="card-value">${s.total_children ?? 0}</div></div><div class="card" style="background:#f0fdf4"><span class="card-label">Total Visits</span><div class="card-value">${s.total_visits ?? 0}</div></div><div class="card" style="background:#f5f3ff"><span class="card-label">Avg Visits/Child</span><div class="card-value">${s.average_visits_per_child ?? 0}</div></div></div>`;
    if (Object.keys(dist).length) { body += '<h4>Risk Distribution</h4><table><tr>' + Object.entries(dist).map(([k, v]) => `<th>${k}</th>`).join('') + '</tr><tr>' + Object.entries(dist).map(([_, v]) => `<td>${v}</td>`).join('') + '</tr></table>'; }
    if (adminWorkers.length) { body += '<h4>Worker Performance – Admin (RDHS / PDHS)</h4><table><thead><tr><th>Worker</th><th>Role</th><th>Children</th><th>Visits</th></tr></thead><tbody>' + adminWorkers.map((w: any) => `<tr><td>${w.worker_name || ''}</td><td>${w.role || ''}</td><td>${w.children_count ?? 0}</td><td>${w.visits_count ?? 0}</td></tr>`).join('') + '</tbody></table>'; }
    if (fieldWorkers.length) { body += '<h4>Worker Performance – Field (MOH, Midwife, Nutritionist)</h4><table><thead><tr><th>Worker</th><th>Role</th><th>Children</th><th>Visits</th></tr></thead><tbody>' + fieldWorkers.map((w: any) => `<tr><td>${w.worker_name || ''}</td><td>${w.role || ''}</td><td>${w.children_count ?? 0}</td><td>${w.visits_count ?? 0}</td></tr>`).join('') + '</tbody></table>'; }
  } else if (type === 'provincial') {
    const sum = d.provincial_summary || {}, comp = d.district_comparison || [];
    body += `<div class="cards"><div class="card" style="background:#eff6ff"><span class="card-label">Total Children</span><div class="card-value">${sum.total_children ?? 0}</div></div><div class="card" style="background:#f0fdf4"><span class="card-label">Districts</span><div class="card-value">${sum.total_districts ?? 0}</div></div></div>`;
    if (sum.risk_distribution) body += '<h4>Risk Summary</h4><table><tr>' + Object.entries(sum.risk_distribution).map(([k, v]) => `<th>${k}</th>`).join('') + '</tr><tr>' + Object.entries(sum.risk_distribution).map(([_, v]) => `<td>${v}</td>`).join('') + '</tr></table>';
    if (comp.length) body += '<h4>District Comparison</h4><table><thead><tr><th>District</th><th>Total</th><th>Normal</th><th>Moderate</th><th>High</th><th>Critical</th></tr></thead><tbody>' + comp.map((r: any) => `<tr><td>${r.district_name || ''}</td><td>${r.total_children ?? 0}</td><td>${r.risk_distribution?.NORMAL ?? 0}</td><td>${r.risk_distribution?.MODERATE ?? 0}</td><td>${r.risk_distribution?.HIGH ?? 0}</td><td>${r.risk_distribution?.CRITICAL ?? 0}</td></tr>`).join('') + '</tbody></table>';
  } else {
    const nat = d.national_summary || {}, prov = d.province_comparison || [];
    const rr = nat.risk_distribution || {};
    const normalCount = (rr.NORMAL ?? 0) + (rr.Normal ?? 0);
    const samCritical = (rr.SAM ?? 0) + (rr.CRITICAL ?? 0) + (rr.Critical ?? 0);
    body += `<div class="cards"><div class="card" style="background:#eff6ff"><span class="card-label">Total Children</span><div class="card-value">${nat.total_children ?? 0}</div></div><div class="card" style="background:#f5f3ff"><span class="card-label">AI Predictions</span><div class="card-value">${d.ai_prediction_analytics?.total_predictions ?? 0}</div></div><div class="card" style="background:#f0fdf4"><span class="card-label">Normal</span><div class="card-value">${normalCount}</div></div><div class="card" style="background:#fef2f2"><span class="card-label">SAM/Critical</span><div class="card-value">${samCritical}</div></div></div>`;
    if (nat.risk_distribution) body += '<h4>National Risk Distribution</h4><table><tr>' + Object.entries(nat.risk_distribution).map(([k, v]) => `<th>${k}</th>`).join('') + '</tr><tr>' + Object.entries(nat.risk_distribution).map(([_, v]) => `<td>${v}</td>`).join('') + '</tr></table>';
    if (prov.length) body += '<h4>Province Comparison</h4><table><thead><tr><th>Province</th><th>Total</th><th>Normal</th><th>MAM</th><th>High</th><th>SAM</th></tr></thead><tbody>' + prov.map((p: any) => `<tr><td>${(p.province_name || '').replace(/&/g, '&amp;')}</td><td>${p.total_children ?? 0}</td><td>${p.risk_distribution?.NORMAL ?? 0}</td><td>${p.risk_distribution?.MAM ?? p.risk_distribution?.MODERATE ?? 0}</td><td>${p.risk_distribution?.HIGH ?? 0}</td><td>${p.risk_distribution?.SAM ?? p.risk_distribution?.CRITICAL ?? 0}</td></tr>`).join('') + '</tbody></table>';
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${(report.title || 'Report').replace(/</g, '&lt;')}</title><style>body{font-family:system-ui,sans-serif;padding:24px;color:#111;max-width:900px;margin:0 auto;background:#fff}.meta{color:#555;font-size:13px;margin-bottom:20px}h1{font-size:20px;margin:0 0 8px 0}h4{font-size:14px;margin:20px 0 10px 0;border-bottom:1px solid #e5e7eb;padding-bottom:6px}table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}th,td{border:1px solid #ddd;padding:8px 10px;text-align:left}th{background:#f3f4f6;font-weight:600}.cards{margin:16px 0}.card{display:inline-block;padding:14px 18px;border-radius:10px;margin:0 12px 12px 0;min-width:140px;border:1px solid #e5e7eb}.card-label{font-size:12px;color:#555;display:block}.card-value{font-size:24px;font-weight:700}@media print{body{padding:16px}table{break-inside:avoid}.card{break-inside:avoid}}</style></head><body><div class="meta">Period: ${period} · Saved: ${report.created_at || '—'} · By: ${(report.created_by_name || '—').replace(/</g, '&lt;')}</div><h1>${(report.title || capitalize(type) + ' Report').replace(/</g, '&lt;')}</h1>${body}</body></html>`;
}

// Worker table (shared for admin/field sections)
function WorkerTable({ workers, title }: { workers: any[]; title: string }) {
  if (!workers?.length) return null;
  return (
    <div>
      <h4 className="font-semibold text-gray-900 mb-2">{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-left">Worker</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-right">Children</th>
              <th className="px-4 py-2 text-right">Visits</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w: any, i: number) => (
              <tr key={w.worker_id || i} className="border-b">
                <td className="px-4 py-2">{w.worker_name}</td>
                <td className="px-4 py-2">{w.role}</td>
                <td className="px-4 py-2 text-right">{w.children_count}</td>
                <td className="px-4 py-2 text-right">{w.visits_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── District Report View (simple cards + tables) ─────────────────────────────
function DistrictReportView({ data }: { data: any }) {
  const summary = data.summary || {};
  const dist = data.risk_distribution || {};
  const workers = data.worker_performance || [];
  const adminWorkers = data.worker_performance_admin ?? workers.filter((w: any) => w.role_category === 'admin');
  const fieldWorkers = data.worker_performance_field ?? workers.filter((w: any) => w.role_category === 'field');
  const transfer = data.transfer_statistics || {};
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-blue-600 font-medium">Total Children</p>
          <p className="text-2xl font-bold text-blue-900">{summary.total_children ?? 0}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <p className="text-sm text-green-600 font-medium">Total Visits</p>
          <p className="text-2xl font-bold text-green-900">{summary.total_visits ?? 0}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <p className="text-sm text-purple-600 font-medium">Avg Visits/Child</p>
          <p className="text-2xl font-bold text-purple-900">{summary.average_visits_per_child ?? 0}</p>
        </div>
      </div>
      {Object.keys(dist).length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Risk Distribution</h4>
          <div className="grid grid-cols-4 gap-4">
            {Object.entries(dist).map(([risk, count]: [string, any]) => (
              <div key={risk} className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-sm text-gray-600">{risk}</p>
                <p className="text-xl font-bold text-gray-900">{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {transfer.total_transfers != null && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Transfer Statistics</h4>
          <p className="text-gray-600">Total transfers: <strong>{transfer.total_transfers}</strong></p>
          {transfer.by_role && Object.entries(transfer.by_role).map(([role, cnt]: [string, any]) => (
            <span key={role} className="inline-block mr-4 text-sm text-gray-600">{role}: <strong>{cnt}</strong></span>
          ))}
        </div>
      )}
      {(adminWorkers.length > 0 || fieldWorkers.length > 0) && (
        <div className="space-y-4">
          <h4 className="font-semibold text-gray-900 mb-2">Worker Performance</h4>
          <WorkerTable workers={adminWorkers} title="Admin (RDHS / PDHS)" />
          <WorkerTable workers={fieldWorkers} title="Field workers (MOH, Midwife, Nutritionist)" />
        </div>
      )}
    </div>
  );
}

// ─── Provincial Report View ─────────────────────────────────────────────────
function ProvincialReportView({ data }: { data: any }) {
  const summary = data.provincial_summary || {};
  const distComp = data.district_comparison || [];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-blue-600 font-medium">Total Children</p>
          <p className="text-2xl font-bold text-blue-900">{summary.total_children ?? 0}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <p className="text-sm text-green-600 font-medium">Total Districts</p>
          <p className="text-2xl font-bold text-green-900">{summary.total_districts ?? 0}</p>
        </div>
      </div>
      {summary.risk_distribution && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Provincial Risk Summary</h4>
          <div className="grid grid-cols-4 gap-4">
            {Object.entries(summary.risk_distribution).map(([risk, count]: [string, any]) => (
              <div key={risk} className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-sm text-gray-600">{risk}</p>
                <p className="text-xl font-bold text-gray-900">{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {distComp.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">District Comparison</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left">District</th>
                  <th className="px-4 py-2 text-right">Children</th>
                  <th className="px-4 py-2 text-right">Normal</th>
                  <th className="px-4 py-2 text-right">Moderate</th>
                  <th className="px-4 py-2 text-right">High</th>
                  <th className="px-4 py-2 text-right">Critical</th>
                </tr>
              </thead>
              <tbody>
                {distComp.map((d: any, i: number) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-2">{d.district_name}</td>
                    <td className="px-4 py-2 text-right">{d.total_children}</td>
                    <td className="px-4 py-2 text-right">{d.risk_distribution?.NORMAL || 0}</td>
                    <td className="px-4 py-2 text-right">{d.risk_distribution?.MODERATE || 0}</td>
                    <td className="px-4 py-2 text-right">{d.risk_distribution?.HIGH || 0}</td>
                    <td className="px-4 py-2 text-right">{d.risk_distribution?.CRITICAL || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── National Report View ───────────────────────────────────────────────────
function NationalReportView({ data }: { data: any }) {
  const nat = data.national_summary || {};
  const provinces = data.province_comparison || [];
  const ai = data.ai_prediction_analytics || {};
  const transfers = data.transfer_analytics || {};
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-blue-600 font-medium">Total Children (National)</p>
          <p className="text-2xl font-bold text-blue-900">{nat.total_children ?? 0}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <p className="text-sm text-purple-600 font-medium">AI Predictions</p>
          <p className="text-2xl font-bold text-purple-900">{ai.total_predictions ?? 0}</p>
        </div>
      </div>
      {nat.risk_distribution && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">National Risk Distribution</h4>
          <div className="grid grid-cols-4 gap-4">
            {Object.entries(nat.risk_distribution).map(([risk, count]: [string, any]) => (
              <div key={risk} className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-sm text-gray-600">{risk}</p>
                <p className="text-xl font-bold text-gray-900">{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {provinces.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Province Comparison</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left">Province</th>
                  <th className="px-4 py-2 text-right">Children</th>
                  <th className="px-4 py-2 text-right">Normal</th>
                  <th className="px-4 py-2 text-right">Moderate</th>
                  <th className="px-4 py-2 text-right">High</th>
                  <th className="px-4 py-2 text-right">Critical</th>
                </tr>
              </thead>
              <tbody>
                {provinces.map((p: any, i: number) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-2">{p.province_name}</td>
                    <td className="px-4 py-2 text-right">{p.total_children}</td>
                    <td className="px-4 py-2 text-right">{p.risk_distribution?.NORMAL || 0}</td>
                    <td className="px-4 py-2 text-right">{p.risk_distribution?.MODERATE || 0}</td>
                    <td className="px-4 py-2 text-right">{p.risk_distribution?.HIGH || 0}</td>
                    <td className="px-4 py-2 text-right">{p.risk_distribution?.CRITICAL || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {transfers.total_transfers != null && transfers.total_transfers > 0 && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Transfer Analytics</h4>
          <p className="text-gray-600">Total transfers: <strong>{transfers.total_transfers}</strong></p>
          {transfers.by_direction && (
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
              {Object.entries(transfers.by_direction).map(([dir, cnt]: [string, any]) => (
                <span key={dir}>{dir}: <strong>{cnt}</strong></span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Report body for modal (simple, no charts) ───────────────────────────────
function ReportBody({ report }: { report: any }) {
  const type = report.report_type;
  const d = report.report_data;
  if (!d) return <p className="text-gray-500">No data stored.</p>;
  if (type === 'district')   return <DistrictReportView data={d} />;
  if (type === 'provincial') return <ProvincialReportView data={d} />;
  if (type === 'national')   return <NationalReportView data={d} />;
  return <pre className="text-xs overflow-auto max-h-96 bg-gray-50 p-3 rounded">{JSON.stringify(d, null, 2)}</pre>;
}

// ─── Professional report views WITH charts (for View modal) ───────────────────
function DistrictReportViewWithCharts({ data }: { data: any }) {
  const dist = data.risk_distribution || {};
  const workers = data.worker_performance || [];
  const adminWorkers = data.worker_performance_admin ?? workers.filter((w: any) => w.role_category === 'admin');
  const fieldWorkers = data.worker_performance_field ?? workers.filter((w: any) => w.role_category === 'field');
  const pieData = [
    { name: 'Normal', value: dist.NORMAL || 0, color: RISK_COLORS.NORMAL },
    { name: 'Moderate/MAM', value: (dist.MODERATE || 0) + (dist.MAM || 0), color: RISK_COLORS.MODERATE },
    { name: 'High', value: dist.HIGH || 0, color: RISK_COLORS.HIGH },
    { name: 'Critical/SAM', value: (dist.CRITICAL || 0) + (dist.SAM || 0), color: RISK_COLORS.CRITICAL },
  ].filter(d => d.value > 0);
  const allWorkersForChart = [...adminWorkers, ...fieldWorkers];
  const workerBarData = allWorkersForChart.slice(0, 10).map((w: any) => ({ name: (w.worker_name || '').split(' ').slice(0, 2).join(' ') || 'Worker', Children: w.children_count || 0, Visits: w.visits_count || 0 }));
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-xl p-4"><p className="text-sm text-blue-600 font-medium">Total Children</p><p className="text-2xl font-bold text-blue-900">{data.summary?.total_children ?? 0}</p></div>
        <div className="bg-green-50 rounded-xl p-4"><p className="text-sm text-green-600 font-medium">Total Visits</p><p className="text-2xl font-bold text-green-900">{data.summary?.total_visits ?? 0}</p></div>
        <div className="bg-purple-50 rounded-xl p-4"><p className="text-sm text-purple-600 font-medium">Avg Visits/Child</p><p className="text-2xl font-bold text-purple-900">{data.summary?.average_visits_per_child ?? 0}</p></div>
      </div>
      {pieData.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-gray-800 mb-3">Risk Distribution</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(dist).map(([risk, count]: [string, any]) => (
                <div key={risk} className="rounded-lg p-3 text-center border" style={{ borderColor: RISK_COLORS[risk] + '44', background: RISK_COLORS[risk] + '12' }}>
                  <p className="text-xs font-semibold text-gray-600">{risk}</p><p className="text-xl font-bold" style={{ color: RISK_COLORS[risk] }}>{count}</p>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>{pieData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {(adminWorkers.length > 0 || fieldWorkers.length > 0) && (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-gray-800 mb-2">Worker Performance</h4>
          {workerBarData.length > 0 && (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={workerBarData} margin={{ top: 4, right: 8, bottom: 24, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 11 }} /><YAxis /><Tooltip /><Legend />
                <Bar dataKey="Children" fill="#6366f1" radius={[4,4,0,0]} /><Bar dataKey="Visits" fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <WorkerTable workers={adminWorkers} title="Admin (RDHS / PDHS)" />
          <WorkerTable workers={fieldWorkers} title="Field workers (MOH, Midwife, Nutritionist)" />
        </div>
      )}
    </div>
  );
}

function ProvincialReportViewWithCharts({ data }: { data: any }) {
  const summary = data.provincial_summary || {};
  const distComp = data.district_comparison || [];
  const totalRisk = summary.risk_distribution || {};
  const pieData = [
    { name: 'Normal', value: totalRisk.NORMAL || 0, color: RISK_COLORS.NORMAL },
    { name: 'MAM', value: (totalRisk.MODERATE || 0) + (totalRisk.MAM || 0), color: RISK_COLORS.MODERATE },
    { name: 'High', value: totalRisk.HIGH || 0, color: RISK_COLORS.HIGH },
    { name: 'SAM', value: (totalRisk.CRITICAL || 0) + (totalRisk.SAM || 0), color: RISK_COLORS.CRITICAL },
  ].filter(d => d.value > 0);
  const barData = distComp.slice(0, 12).map((d: any) => ({
    name: (d.district_name || '').slice(0, 12),
    Normal: d.risk_distribution?.NORMAL || 0,
    MAM: (d.risk_distribution?.MODERATE || 0) + (d.risk_distribution?.MAM || 0),
    High: d.risk_distribution?.HIGH || 0,
    SAM: (d.risk_distribution?.CRITICAL || 0) + (d.risk_distribution?.SAM || 0),
  }));
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-xl p-4"><p className="text-sm text-blue-600 font-medium">Total Children</p><p className="text-2xl font-bold text-blue-900">{summary.total_children ?? 0}</p></div>
        <div className="bg-green-50 rounded-xl p-4"><p className="text-sm text-green-600 font-medium">Districts</p><p className="text-2xl font-bold text-green-900">{summary.total_districts ?? 0}</p></div>
        <div className="bg-emerald-50 rounded-xl p-4"><p className="text-sm text-emerald-600 font-medium">Normal</p><p className="text-2xl font-bold text-emerald-900">{totalRisk.NORMAL ?? 0}</p></div>
        <div className="bg-red-50 rounded-xl p-4"><p className="text-sm text-red-600 font-medium">SAM/Critical</p><p className="text-2xl font-bold text-red-900">{(totalRisk.CRITICAL || 0) + (totalRisk.SAM || 0)}</p></div>
      </div>
      {pieData.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-gray-800 mb-3">Provincial Risk Overview</h4>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart><Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>{pieData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip /></PieChart>
          </ResponsiveContainer>
        </div>
      )}
      {barData.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-gray-800 mb-3">District Comparison</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 24, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} /><YAxis /><Tooltip /><Legend />
              <Bar dataKey="Normal" stackId="a" fill={RISK_COLORS.NORMAL} /><Bar dataKey="MAM" stackId="a" fill={RISK_COLORS.MODERATE} /><Bar dataKey="High" stackId="a" fill={RISK_COLORS.HIGH} /><Bar dataKey="SAM" stackId="a" fill={RISK_COLORS.CRITICAL} />
            </BarChart>
          </ResponsiveContainer>
          <table className="w-full text-sm mt-2"><thead className="bg-gray-100"><tr><th className="px-3 py-2 text-left">District</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right text-green-700">Normal</th><th className="px-3 py-2 text-right text-yellow-700">MAM</th><th className="px-3 py-2 text-right text-red-700">SAM</th></tr></thead><tbody>
            {distComp.map((d: any, i: number) => (<tr key={i} className="border-b"><td className="px-3 py-2 font-medium">{d.district_name}</td><td className="px-3 py-2 text-right">{d.total_children}</td><td className="px-3 py-2 text-right text-green-700">{d.risk_distribution?.NORMAL || 0}</td><td className="px-3 py-2 text-right text-yellow-700">{(d.risk_distribution?.MODERATE || 0) + (d.risk_distribution?.MAM || 0)}</td><td className="px-3 py-2 text-right text-red-700">{(d.risk_distribution?.CRITICAL || 0) + (d.risk_distribution?.SAM || 0)}</td></tr>))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}

function NationalReportViewWithCharts({ data }: { data: any }) {
  const nat = data.national_summary || {};
  const provinces = data.province_comparison || [];
  const ai = data.ai_prediction_analytics || {};
  const transfers = data.transfer_analytics || {};
  const natPieData = [
    { name: 'Normal', value: nat.risk_distribution?.NORMAL || 0, color: RISK_COLORS.NORMAL },
    { name: 'MAM', value: (nat.risk_distribution?.MODERATE || 0) + (nat.risk_distribution?.MAM || 0), color: RISK_COLORS.MODERATE },
    { name: 'High', value: nat.risk_distribution?.HIGH || 0, color: RISK_COLORS.HIGH },
    { name: 'SAM', value: (nat.risk_distribution?.CRITICAL || 0) + (nat.risk_distribution?.SAM || 0), color: RISK_COLORS.CRITICAL },
  ].filter(d => d.value > 0);
  const provinceBarData = provinces.slice(0, 12).map((p: any) => ({
    name: (p.province_name || '').slice(0, 10),
    Normal: p.risk_distribution?.NORMAL || 0,
    MAM: (p.risk_distribution?.MODERATE || 0) + (p.risk_distribution?.MAM || 0),
    High: p.risk_distribution?.HIGH || 0,
    SAM: (p.risk_distribution?.CRITICAL || 0) + (p.risk_distribution?.SAM || 0),
  }));
  const aiPieData = [
    { name: 'Low', value: ai.prediction_distribution?.Low || 0, color: '#22c55e' },
    { name: 'Moderate', value: ai.prediction_distribution?.Moderate || 0, color: '#f59e0b' },
    { name: 'High', value: ai.prediction_distribution?.High || 0, color: '#f97316' },
    { name: 'Severe', value: ai.prediction_distribution?.Severe || 0, color: '#ef4444' },
  ].filter(d => d.value > 0);
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-xl p-4"><p className="text-sm text-blue-600 font-medium">Total Children</p><p className="text-2xl font-bold text-blue-900">{nat.total_children ?? 0}</p></div>
        <div className="bg-purple-50 rounded-xl p-4"><p className="text-sm text-purple-600 font-medium">AI Predictions</p><p className="text-2xl font-bold text-purple-900">{ai.total_predictions ?? 0}</p></div>
        <div className="bg-green-50 rounded-xl p-4"><p className="text-sm text-green-600 font-medium">Normal</p><p className="text-2xl font-bold text-green-900">{nat.risk_distribution?.NORMAL ?? 0}</p></div>
        <div className="bg-red-50 rounded-xl p-4"><p className="text-sm text-red-600 font-medium">SAM/Critical</p><p className="text-2xl font-bold text-red-900">{(nat.risk_distribution?.CRITICAL || 0) + (nat.risk_distribution?.SAM || 0)}</p></div>
      </div>
      {natPieData.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-gray-800 mb-3">National Risk Distribution</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={natPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>{natPieData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2">
              {natPieData.map(d => (<div key={d.name} className="rounded-lg p-3 text-center border" style={{ borderColor: d.color + '44', background: d.color + '12' }}><p className="text-xs font-semibold" style={{ color: d.color }}>{d.name}</p><p className="text-xl font-bold" style={{ color: d.color }}>{d.value}</p></div>))}
            </div>
          </div>
        </div>
      )}
      {provinceBarData.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-gray-800 mb-3">Province Comparison</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={provinceBarData} margin={{ top: 4, right: 8, bottom: 24, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} /><YAxis /><Tooltip /><Legend />
              <Bar dataKey="Normal" stackId="a" fill={RISK_COLORS.NORMAL} /><Bar dataKey="MAM" stackId="a" fill={RISK_COLORS.MODERATE} /><Bar dataKey="High" stackId="a" fill={RISK_COLORS.HIGH} /><Bar dataKey="SAM" stackId="a" fill={RISK_COLORS.CRITICAL} />
            </BarChart>
          </ResponsiveContainer>
          <table className="w-full text-sm mt-2"><thead className="bg-gray-100"><tr><th className="px-3 py-2 text-left">Province</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right text-green-700">Normal</th><th className="px-3 py-2 text-right text-yellow-700">MAM</th><th className="px-3 py-2 text-right text-red-700">SAM</th></tr></thead><tbody>
            {provinces.map((p: any, i: number) => (<tr key={i} className="border-b"><td className="px-3 py-2 font-medium">{p.province_name}</td><td className="px-3 py-2 text-right">{p.total_children}</td><td className="px-3 py-2 text-right text-green-700">{p.risk_distribution?.NORMAL || 0}</td><td className="px-3 py-2 text-right text-yellow-700">{(p.risk_distribution?.MODERATE || 0) + (p.risk_distribution?.MAM || 0)}</td><td className="px-3 py-2 text-right text-red-700">{(p.risk_distribution?.CRITICAL || 0) + (p.risk_distribution?.SAM || 0)}</td></tr>))}
          </tbody></table>
        </div>
      )}
      {aiPieData.length > 0 && (ai.total_predictions > 0) && (
        <div>
          <h4 className="text-sm font-bold text-gray-800 mb-3">AI Prediction Analytics</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart><Pie data={aiPieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>{aiPieData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
            <p className="text-sm text-gray-600">Total predictions: <strong>{ai.total_predictions}</strong> · Avg confidence: <strong>{((ai.average_confidence || 0) * 100).toFixed(1)}%</strong></p>
          </div>
        </div>
      )}
      {transfers?.total_transfers > 0 && (
        <div>
          <h4 className="text-sm font-bold text-gray-800 mb-3">Transfer Analytics</h4>
          <p className="text-gray-600">Total: <strong>{transfers.total_transfers}</strong></p>
          {transfers.by_direction && <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">{Object.entries(transfers.by_direction).map(([k, v]: [string, any]) => <span key={k}>{k}: <strong>{v}</strong></span>)}</div>}
        </div>
      )}
    </div>
  );
}

function ReportBodyWithCharts({ report }: { report: any }) {
  const type = report.report_type;
  const d = report.report_data;
  if (!d) return <p className="text-gray-500">No data stored.</p>;
  if (type === 'district')   return <DistrictReportViewWithCharts data={d} />;
  if (type === 'provincial') return <ProvincialReportViewWithCharts data={d} />;
  if (type === 'national')   return <NationalReportViewWithCharts data={d} />;
  return <ReportBody report={report} />;
}

// ─── View saved report modal (professional, with charts + Print/PDF) ──────────
function ReportViewerModal({ report, onClose }: { report: any; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  useEffect(() => {
    const el = backdropRef.current;
    if (!el) return;
    const check = () => setShowScrollHint(el.scrollHeight > el.clientHeight);
    check();
    const t = setTimeout(check, 300); // after charts/content render
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { clearTimeout(t); ro.disconnect(); };
  }, [report]);

  const handlePrint = () => {
    const html = buildPrintableReportHtml(report);
    const win = window.open('', '_blank');
    if (!win) { toast.error('Allow popups to print report'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  return (
    /* Backdrop — covers whole screen, itself scrollable so the modal can be taller than the viewport */
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        overflowY: 'auto', overflowX: 'hidden',
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '2rem 1rem 4rem',
      }}
    >
      <style>{`
        @media print { body * { visibility: hidden; } .rva-print, .rva-print * { visibility: visible; } .rva-print { position: absolute; left: 0; top: 0; width: 100%; } }
        .rva-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Modal card — no height cap, grows with content; backdrop provides the scroll */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="rva-print"
        style={{
          background: '#fff', borderRadius: '12px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          width: '100%', maxWidth: '960px',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Sticky header — stays at top of viewport as user scrolls */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
          borderRadius: '12px 12px 0 0',
          padding: '1rem 1.5rem',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ padding: '2px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: '#2563eb', color: '#fff', textTransform: 'uppercase' }}>{report.report_type}</span>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>#{report.id}</span>
            </div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#111827' }}>{report.title}</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '6px', fontSize: '13px', color: '#6b7280' }}>
              {report.start_date && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar className="w-4 h-4" style={{ color: '#3b82f6' }} />
                  {fmtDate(report.start_date)} → {fmtDate(report.end_date)}
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock className="w-4 h-4" style={{ color: '#3b82f6' }} />
                Saved {fmtDateTime(report.created_at)}
              </span>
              {report.created_by_name && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <UserIcon className="w-4 h-4" style={{ color: '#3b82f6' }} />
                  By {report.created_by_name}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button type="button" onClick={handlePrint}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#1f2937', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
              <Printer className="w-4 h-4" /> Print / PDF
            </button>
            <button type="button" onClick={onClose}
              style={{ padding: '6px', background: 'none', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#6b7280', display: 'flex' }}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Report content — unconstrained, scrolls with the backdrop */}
        <div ref={printRef} style={{ padding: '1.5rem' }}>
          <ReportBodyWithCharts report={report} />
        </div>
      </div>

      {/* Scroll hint */}
      {showScrollHint && (
        <div style={{
          position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 10000, display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 18px', background: '#1f2937', color: '#fff',
          fontSize: '13px', borderRadius: '999px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
        }}>
          <ChevronDown className="w-4 h-4" style={{ animation: 'bounce 1s infinite' }} />
          Scroll down to see all report details
          <ChevronDown className="w-4 h-4" style={{ animation: 'bounce 1s infinite' }} />
        </div>
      )}
    </div>
  );
}

// ─── Saved Reports Tab ──────────────────────────────────────────────────────
function SavedReportsTab({ user }: { user: User }) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState('');
  const [viewing, setViewing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ConfirmDialogState | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {};
      if (filterType) params.report_type = filterType;
      const res = await reportsAPI.list(params);
      if (res.data?.status === 'success') setReports(res.data.reports || []);
      else setError(res.data?.message || 'Failed to load');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load saved reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterType]);

  const performDelete = async (id: number) => {
    setDeleting(id);
    try {
      await reportsAPI.deleteById(id);
      toast.success('Report deleted');
      setReports(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete report');
    } finally {
      setDeleting(null);
    }
  };

  const handleDelete = (id: number) => {
    setDeleteConfirm({
      title: 'Delete saved report',
      message: 'Delete this saved report? This cannot be undone.',
      variant: 'danger',
      confirmLabel: 'Yes, Delete',
      cancelLabel: 'Cancel',
      onConfirm: () => performDelete(id),
    });
  };

  const handleView = async (r: any) => {
    if (r.report_data) { setViewing(r); return; }
    try {
      const res = await reportsAPI.getById(r.id);
      if (res.data?.status === 'success') setViewing(res.data.report);
    } catch { toast.error('Failed to load report details'); }
  };

  const handleDownload = (r: any) => {
    const openPrint = (fullReport: any) => {
      const html = buildPrintableReportHtml(fullReport);
      const win = window.open('', '_blank');
      if (!win) { toast.error('Allow popups to download report'); return; }
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); win.close(); }, 500);
      toast.success('Use "Save as PDF" or "Print" in the dialog to download.');
    };
    if (r.report_data) openPrint(r);
    else reportsAPI.getById(r.id).then((res: any) => { if (res.data?.status === 'success') openPrint(res.data.report); }).catch(() => toast.error('Failed to load report'));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All types</option>
          <option value="district">District</option>
          <option value="provincial">Provincial</option>
          <option value="national">National</option>
        </select>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">{error}</div>}
      {loading && reports.length === 0 ? (
        <p className="text-gray-500 py-8 text-center">Loading saved reports…</p>
      ) : reports.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No saved reports yet. Generate a report and click Save Report.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">Title</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">Type</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">Period</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">Saved by</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">Saved at</th>
                <th className="px-4 py-2 text-center font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reports.map((r: any) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{r.title}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-200 text-gray-800">{capitalize(r.report_type)}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {r.start_date ? `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}` : '—'}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{r.created_by_name || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{fmtDateTime(r.created_at)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <button onClick={() => handleView(r)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                        <Eye className="w-3 h-3" /> View
                      </button>
                      <button onClick={() => handleDownload(r)} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                        <Download className="w-3 h-3" /> Download
                      </button>
                      <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 disabled:opacity-50">
                        <Trash2 className="w-3 h-3" /> {deleting === r.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {viewing && <ReportViewerModal report={viewing} onClose={() => setViewing(null)} />}
      <ConfirmDialog state={deleteConfirm} onClose={() => setDeleteConfirm(null)} />
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export function ReportsDashboard({ user }: ReportsDashboardProps) {
  const isHealthMinistry = user.role === 'health_ministry';
  const isPdhs = user.role === 'pdhs';

  const [activeTab, setActiveTab] = useState<Tab>('generate');
  const [reportType, setReportType] = useState<'district' | 'provincial' | 'national'>(
    isHealthMinistry ? 'national' : isPdhs ? 'provincial' : 'district'
  );
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveTitle, setSaveTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const [pdhsReports, setPdhsReports] = useState<any[]>([]);
  const [pdhsLoading, setPdhsLoading] = useState(false);
  const [pdhsError, setPdhsError] = useState('');
  const [pdhsYear, setPdhsYear] = useState<number | ''>('');
  const [pdhsMonth, setPdhsMonth] = useState<number | ''>('');

  const availableReports = isHealthMinistry ? ['district', 'provincial', 'national'] : isPdhs ? ['district', 'provincial'] : ['district'];

  const loadReport = async () => {
    setIsLoading(true);
    setError('');
    setReportData(null);
    try {
      const params: any = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      let response;
      if (reportType === 'district') response = await reportsAPI.district(params);
      else if (reportType === 'provincial') response = await reportsAPI.provincial(params);
      else response = await reportsAPI.national(params);
      if (response.data.status === 'success') {
        setReportData(response.data.data);
        setGeneratedAt(new Date().toISOString());
        setSaveTitle(`${capitalize(reportType)} Report – ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`);
      } else {
        setError(response.data.message || 'Failed to load report');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load report');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveReport = async () => {
    if (!reportData) return;
    setSaving(true);
    try {
      await reportsAPI.save({
        report_type: reportType,
        title: saveTitle || `${capitalize(reportType)} Report – ${new Date().toLocaleDateString()}`,
        data: reportData,
        start_date: startDate || null,
        end_date: endDate || null,
      });
      toast.success('Report saved successfully!');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to save report';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const loadPdhsReports = async () => {
    if (!isHealthMinistry) return;
    setPdhsError('');
    setPdhsLoading(true);
    try {
      const params: any = {};
      if (pdhsYear !== '') params.year = pdhsYear;
      if (pdhsMonth !== '') params.month = pdhsMonth;
      const res = await adminAPI.pdhsReportsSentToMinistry(params);
      if (res.data?.status === 'success') setPdhsReports(res.data.reports || []);
    } catch (err: any) {
      setPdhsError(err.response?.data?.message || 'Failed to load PDHS reports');
      setPdhsReports([]);
    } finally {
      setPdhsLoading(false);
    }
  };

  useEffect(() => {
    if (isHealthMinistry && activeTab === 'pdhs-received') loadPdhsReports();
  }, [activeTab, pdhsYear, pdhsMonth]);

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'generate', label: 'Generate Report', icon: BarChart3 },
    { id: 'saved', label: 'Saved Reports', icon: FileText },
    ...(isHealthMinistry ? [{ id: 'pdhs-received' as Tab, label: 'Reports from PDHS (Island-wide)', icon: MapPin }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Reports Dashboard</h2>
        <p className="text-gray-600">Generate and view reports at your level</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                activeTab === t.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Generate Tab */}
      {activeTab === 'generate' && (
        <>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-base font-semibold text-gray-800 mb-4">Report Parameters</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Report Type</label>
                <select
                  value={reportType}
                  onChange={e => setReportType(e.target.value as any)}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {availableReports.map(t => (
                    <option key={t} value={t}>{capitalize(t)} Report</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={loadReport} disabled={isLoading}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                <BarChart3 className="w-4 h-4" />
                {isLoading ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
              <p className="text-sm text-red-900">{error}</p>
            </div>
          )}

          {reportData && (
            <div className="bg-white rounded-lg shadow p-6">
              {/* Report header: type, period, time */}
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 mb-4 border-b border-gray-200">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 uppercase">{reportType}</span>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Generated {generatedAt ? fmtDateTime(generatedAt) : 'just now'}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">{capitalize(reportType)} Report</h3>
                  {(startDate || endDate) && (
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      Period: {startDate ? fmtDate(startDate) : 'Start'} to {endDate ? fmtDate(endDate) : 'Today'}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    value={saveTitle}
                    onChange={e => setSaveTitle(e.target.value)}
                    placeholder="Report title"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button onClick={handleSaveReport} disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Report'}
                  </button>
                </div>
              </div>

              {reportType === 'district' && <DistrictReportView data={reportData} />}
              {reportType === 'provincial' && <ProvincialReportView data={reportData} />}
              {reportType === 'national' && <NationalReportView data={reportData} />}
            </div>
          )}
        </>
      )}

      {/* Saved Reports Tab */}
      {activeTab === 'saved' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Saved Reports</h3>
          <SavedReportsTab user={user} />
        </div>
      )}

      {/* PDHS Received Tab */}
      {isHealthMinistry && activeTab === 'pdhs-received' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Reports from PDHS (Island-wide)</h3>
          <p className="text-gray-600 mb-4">Provincial reports sent to Health Ministry by all PDHS offices.</p>
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <select value={pdhsYear === '' ? '' : pdhsYear} onChange={e => setPdhsYear(e.target.value === '' ? '' : Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
              <option value="">All years</option>
              {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select value={pdhsMonth === '' ? '' : pdhsMonth} onChange={e => setPdhsMonth(e.target.value === '' ? '' : Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
              <option value="">All months</option>
              {MONTH_NAMES.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
            </select>
            <button onClick={loadPdhsReports} disabled={pdhsLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${pdhsLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
          {pdhsError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-800 text-sm">{pdhsError}</div>}
          {pdhsLoading && pdhsReports.length === 0 ? (
            <p className="text-gray-500">Loading...</p>
          ) : pdhsReports.length === 0 ? (
            <p className="text-gray-500">No PDHS reports sent to ministry yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Province</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Period</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-900">Total</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-900">Normal</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-900">MAM</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-900">SAM</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-900">Escalations</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-900">Sent at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pdhsReports.map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-900">{r.province?.name || r.province?.province || `Province ${r.province_id}`}</td>
                      <td className="px-4 py-2 text-gray-700">{MONTH_NAMES[(r.month || 1) - 1]} {r.report_year}</td>
                      <td className="px-4 py-2 text-right">{r.total_children ?? 0}</td>
                      <td className="px-4 py-2 text-right text-green-700">{r.normal_count ?? 0}</td>
                      <td className="px-4 py-2 text-right text-yellow-700">{r.mam_count ?? 0}</td>
                      <td className="px-4 py-2 text-right text-red-700">{r.sam_count ?? 0}</td>
                      <td className="px-4 py-2 text-right">{r.escalations ?? 0}</td>
                      <td className="px-4 py-2 text-gray-600">{r.sent_at ? fmtDateTime(r.sent_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
