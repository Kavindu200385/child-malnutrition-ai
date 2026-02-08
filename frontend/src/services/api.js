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
  save: (data) => api.post('/api/children/save', data),
  getHistory: (childId) => api.get(`/api/children/history/${childId}`),
};

// Health check
export const healthCheck = () => api.get('/health');

export default api;
