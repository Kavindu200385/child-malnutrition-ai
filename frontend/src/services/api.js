/**
 * API Service for communicating with Flask backend
 */
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5173';

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

// Health check
export const healthCheck = () => api.get('/health');

export default api;
