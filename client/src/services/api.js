import axios from 'axios';

const api = axios.create({
  baseURL: '', // Using Vite proxy
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('iptv_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('iptv_token');
      localStorage.removeItem('iptv_user');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export default api;
