/**
 * API Service for communicating with Flask backend
 */
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add JWT token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Analysis API
export const analysisAPI = {
  analyze: (data) => api.post('/api/analysis/analyze', data),
};

// Children API
export const childrenAPI = {
  create: (data) => api.post('/api/children', data),
  list: (params) => api.get('/api/children', { params }),
  get: (childId) => api.get(`/api/children/${childId}`),
  update: (childId, data) => api.put(`/api/children/${childId}`, data),
  delete: (childId) => api.delete(`/api/children/${childId}`),
  assign: (childId, data) => api.post(`/api/children/${childId}/assign`, data),
  getVisits: (childId) => api.get(`/api/children/${childId}/visits`),
  assignAreas: (childId, data) => api.post(`/api/children/${childId}/assign-areas`, data),
  // Legacy endpoints
  save: (data) => api.post('/api/children/save', data),
  getHistory: (childId) => api.get(`/api/children/history/${childId}`),
};

// Hierarchical Areas API (Health Ministry only)
export const areasHierarchicalAPI = {
  list: (params) => api.get('/api/areas', { params }),
  get: (areaId) => api.get(`/api/areas/${areaId}`),
  create: (data) => api.post('/api/areas', data),
  update: (areaId, data) => api.put(`/api/areas/${areaId}`, data),
  delete: (areaId) => api.delete(`/api/areas/${areaId}`),
  getHierarchy: () => api.get('/api/areas/hierarchy'),
};

// Hospitals API (Health Ministry only – hospital code auto-generated)
export const hospitalsAPI = {
  list: (params) => api.get('/api/areas/hospitals', { params }),
  create: (data) => api.post('/api/areas/hospitals', data),
  update: (hospitalId, data) => api.put(`/api/areas/hospitals/${hospitalId}`, data),
};

// Child Transfers API
export const transfersAPI = {
  request: (childId, data) => api.post(`/api/transfers/children/${childId}/request`, data),
  list: (params) => api.get('/api/transfers', { params }),
  approve: (transferId) => api.post(`/api/transfers/${transferId}/approve`),
  reject: (transferId, data) => api.post(`/api/transfers/${transferId}/reject`, data),
};

// Worker Management API (Health Ministry only)
export const workersAPI = {
  list: (params) => api.get('/api/workers', { params }),
  get: (workerId) => api.get(`/api/workers/${workerId}`),
  create: (data) => api.post('/api/workers', data),
  update: (workerId, data) => api.put(`/api/workers/${workerId}`, data),
  delete: (workerId) => api.delete(`/api/workers/${workerId}`),
  assignAreas: (workerId, data) => api.post(`/api/workers/${workerId}/areas`, data),
};

// Reporting API
export const reportsAPI = {
  district: (params) => api.get('/api/reports/district', { params }),
  provincial: (params) => api.get('/api/reports/provincial', { params }),
  national: (params) => api.get('/api/reports/national', { params }),
  overviewStats: () => api.get('/api/reports/overview-stats'),
  save: (data) => api.post('/api/reports/save', data),
  list: (params) => api.get('/api/reports', { params }),
};

// Admin: Area master data (Legacy - for backward compatibility)
export const areasAdminAPI = {
  list: (params) => api.get('/api/admin/areas', { params }),
  create: (data) => api.post('/api/admin/areas', data),
  update: (areaId, data) => api.put(`/api/admin/areas/${areaId}`, data),
  remove: (areaId) => api.delete(`/api/admin/areas/${areaId}`),
};

// Hospital API (Hospital role only)
export const hospitalAPI = {
  registerChild: (data) => api.post('/api/hospital/child/register', data),
  listChildren: (params) => api.get('/api/hospital/children', { params }),
  getChild: (childId) => api.get(`/api/hospital/child/${childId}`),
  transferToNutritionist: (childId, data) => api.post(`/api/hospital/transfer-to-nutritionist/${childId}`, data),
  getStats: () => api.get('/api/hospital/stats'),
};

// Midwife API (Midwife role only)
export const midwifeAPI = {
  searchChild: (childUniqueId) => api.get('/api/midwife/search-child', { params: { child_unique_id: childUniqueId } }),
  assignChild: (childId) => api.post(`/api/midwife/assign-child/${childId}`),
  listChildren: (params) => api.get('/api/midwife/children', { params }),
  addMeasurement: (data) => api.post('/api/midwife/measurement/add', data),
  escalateToMoh: (childId, data) => api.post(`/api/midwife/escalate/${childId}`, data),
  getChildReport: (childId) => api.get(`/api/midwife/child-report/${childId}`),
  submitClinicReport: (data) => api.post('/api/midwife/clinic-report/submit', data),
  getDashboardStats: () => api.get('/api/midwife/dashboard/stats'),
};

// Nutritionist API (Nutritionist role only - specialist at hospital)
export const nutritionistAPI = {
  referredChildren: () => api.get('/api/nutritionist/referred-children'),
  getChild: (childId) => api.get(`/api/nutritionist/child/${childId}`),
  addMeasurement: (data) => api.post('/api/nutritionist/measurement/add', data),
  returnToMoh: (childId) => api.post(`/api/nutritionist/return-to-moh/${childId}`),
  dashboardSummary: () => api.get('/api/nutritionist/dashboard-summary'),
  // Transfer requests from Pediatric Unit (hospital)
  getTransferRequests: (params) => api.get('/api/nutritionist/transfer-requests', { params }),
  getTransferRequestsBadgeCount: () => api.get('/api/nutritionist/transfer-requests/badge-count'),
  acceptTransferRequest: (referralId, data) => api.post(`/api/nutritionist/transfer-requests/${referralId}/accept`, data),
  rejectTransferRequest: (referralId, data) => api.post(`/api/nutritionist/transfer-requests/${referralId}/reject`, data),
};

// MOH API (MOH/AMOH role only)
export const mohAPI = {
  dashboard: () => api.get('/api/moh/dashboard'),
  addMeasurement: (data) => api.post('/api/moh/measurement/add', data),
  releaseMidwife: (midwifeId) => api.post(`/api/moh/release-midwife/${midwifeId}`),
  searchMidwife: (params) => api.get('/api/moh/search-midwife', { params }),
  assignMidwife: (midwifeId, data) => api.post(`/api/moh/assign-midwife/${midwifeId}`, data),
  getEscalatedChildren: () => api.get('/api/moh/escalated-children'),
  reviewEscalation: (childId, data) => api.post(`/api/moh/review-escalation/${childId}`, data),
  escalateToNutritionist: (childId, data) => api.post(`/api/moh/escalate-to-nutritionist/${childId}`, data),
  returnToMidwife: (childId) => api.post(`/api/moh/return-to-midwife/${childId}`),
  listWorkers: () => api.get('/api/moh/workers'),
  setWorkerActive: (workerId, active) => api.post(`/api/moh/workers/${workerId}/activate`, { active }),
  getAreas: () => api.get('/api/moh/areas'),
  getMonthlyReports: (params) => api.get('/api/moh/reports/monthly', { params }),
  generateMonthlyReport: (data) => api.post('/api/moh/reports/monthly/generate', data),
  sendReportToRdhs: (reportId) => api.post(`/api/moh/send-report-to-rdhs/${reportId}`),
  getReportSummary: (params) => api.get('/api/moh/reports/summary', { params }),
};

// RDHS API (District Admin only – district-filtered data)
export const rdhsAPI = {
  dashboardSummary: () => api.get('/api/rdhs/dashboard-summary'),
  healthWorkers: (params) => api.get('/api/rdhs/health-workers', { params }),
  setUserStatus: (userId, data) => api.put(`/api/rdhs/user/status/${userId}`, data),
  userPerformance: (userId) => api.get(`/api/rdhs/user/performance/${userId}`),
  reportsMonthly: (params) => api.get('/api/rdhs/reports/monthly', { params }),
  createMonthlyReport: (data) => api.post('/api/rdhs/reports/monthly', data),
  sendReportToPdhs: (reportId) => api.post(`/api/rdhs/send-report-to-pdhs/${reportId}`),
  /** Full report for download (daily/weekly/monthly) with all details and MOH breakdown */
  getFullReport: (params) => api.get('/api/rdhs/reports/full', { params }),
  /** Send the same period report to PDHS */
  sendPeriodReportToPdhs: (data) => api.post('/api/rdhs/reports/send-period-to-pdhs', data),
  /** List period reports (daily/weekly/monthly) sent to PDHS by this district. params.period = daily|weekly|monthly */
  sentPeriodReports: (params) => api.get('/api/rdhs/sent-period-reports', { params }),
  mohReports: (params) => api.get('/api/rdhs/moh-reports', { params }),
};

// PDHS API (Province Admin only – province-filtered data)
export const pdhsAPI = {
  dashboardSummary: () => api.get('/api/pdhs/dashboard-summary'),
  healthWorkers: (params) => api.get('/api/pdhs/health-workers', { params }),
  setUserStatus: (userId, data) => api.put(`/api/pdhs/user/status/${userId}`, data),
  userPerformance: (userId) => api.get(`/api/pdhs/user/performance/${userId}`),
  areas: (params) => api.get('/api/pdhs/areas', { params }),
  mohCreate: (data) => api.post('/api/pdhs/moh/create', data),
  mohUpdate: (areaId, data) => api.put(`/api/pdhs/moh/update/${areaId}`, data),
  reportsMonthly: (params) => api.get('/api/pdhs/reports/monthly', { params }),
  createMonthlyReport: (data) => api.post('/api/pdhs/reports/monthly', data),
  sendReportToMinistry: (reportId) => api.post(`/api/pdhs/send-report-to-ministry/${reportId}`),
  /** RDHS period reports (daily/weekly/monthly) sent to PDHS from districts in this province. params.period_type = daily|weekly|monthly */
  rdhsPeriodReports: (params) => api.get('/api/pdhs/rdhs-period-reports', { params }),
  /** Full report for month/year: province + all districts + MOH + children (for PDF download/print) */
  getFullReport: (params) => api.get('/api/pdhs/reports/full', { params }),
};

// Admin (Health Ministry) API – national dashboard, messaging, settings
export const adminAPI = {
  dashboardSummary: () => api.get('/api/admin/dashboard-summary'),
  sendMessage: (data) => api.post('/api/admin/send-message', data),
  getSettings: () => api.get('/api/admin/settings'),
  updateSettings: (data) => api.put('/api/admin/settings/update', data),
  /** Children with nutritionist but null district_id (missing from RDHS list) */
  childrenMissingDistrict: (params) => api.get('/api/admin/children-missing-district', { params }),
  /** Repair district from nutritionist who reviewed the referral */
  repairChildDistrict: (childId) => api.post(`/api/admin/children/${childId}/repair-district`),
  /** List all escalations (Health Ministry). Optional params: status, limit */
  listEscalations: (params) => api.get('/api/admin/escalations', { params }),
  /** List all referrals (Health Ministry). Optional params: status, limit */
  listReferrals: (params) => api.get('/api/admin/referrals', { params }),
  /** PDHS reports sent to ministry (island-wide). Optional params: year, month */
  pdhsReportsSentToMinistry: (params) => api.get('/api/admin/pdhs-reports-sent-to-ministry', { params }),
};

// Health check
export const healthCheck = () => api.get('/health');

export default api;
