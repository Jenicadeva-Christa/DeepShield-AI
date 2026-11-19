import React, { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const AuthContext = createContext();

// Ensure initial token from localStorage is set on Axios before any requests run
const initialToken = localStorage.getItem('deepshield_token');
if (initialToken) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${initialToken}`;
}

// Request Interceptor: Guarantees latest token is attached to every single outgoing request
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('deepshield_token');
    if (token && !config.headers?.['Authorization']) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Session Expired Toast Throttling (prevent duplicate alerts on parallel 401s)
let lastSessionToast = 0;
function notifySessionExpired() {
  const now = Date.now();
  if (now - lastSessionToast > 4000) {
    lastSessionToast = now;
    toast.error('Session expired. Please log in again.');
  }
}

// Refresh token concurrency management (avoid duplicate refresh requests)
let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('deepshield_token') || null);
  const [loading, setLoading] = useState(true);

  // Sync token state changes with axios & localStorage
  useEffect(() => {
    if (accessToken) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
      localStorage.setItem('deepshield_token', accessToken);
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('deepshield_token');
    }
  }, [accessToken]);

  // Axios response interceptor for automatic token refresh on 401
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // If 401 and not already retried and not an auth route
        if (
          error.response?.status === 401 &&
          originalRequest &&
          !originalRequest._retry &&
          !originalRequest.url?.includes('/api/v1/auth/login') &&
          !originalRequest.url?.includes('/api/v1/auth/verify-otp') &&
          !originalRequest.url?.includes('/api/v1/auth/refresh')
        ) {
          originalRequest._retry = true;
          const storedRefreshToken = localStorage.getItem('deepshield_refresh_token');

          if (!storedRefreshToken) {
            localStorage.removeItem('deepshield_token');
            localStorage.removeItem('deepshield_refresh_token');
            delete axios.defaults.headers.common['Authorization'];
            setAccessToken(null);
            setUser(null);
            notifySessionExpired();
            return Promise.reject(error);
          }

          // If a refresh is already in-flight, wait for it
          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              subscribeTokenRefresh((newToken) => {
                if (!newToken) {
                  return reject(error);
                }
                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                resolve(axios(originalRequest));
              });
            });
          }

          isRefreshing = true;

          try {
            const refreshRes = await axios.post('/api/v1/auth/refresh', { refreshToken: storedRefreshToken });
            if (refreshRes.data.success && refreshRes.data.data?.accessToken) {
              const newAccess = refreshRes.data.data.accessToken;
              localStorage.setItem('deepshield_token', newAccess);
              axios.defaults.headers.common['Authorization'] = `Bearer ${newAccess}`;
              setAccessToken(newAccess);
              onRefreshed(newAccess);
              isRefreshing = false;

              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers['Authorization'] = `Bearer ${newAccess}`;
              return axios(originalRequest);
            } else {
              throw new Error('Refresh response missing token');
            }
          } catch (refreshErr) {
            onRefreshed(null);
            isRefreshing = false;
            localStorage.removeItem('deepshield_token');
            localStorage.removeItem('deepshield_refresh_token');
            delete axios.defaults.headers.common['Authorization'];
            setAccessToken(null);
            setUser(null);
            notifySessionExpired();
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  // Load current user profile on initial mount
  useEffect(() => {
    async function loadMe() {
      if (!accessToken) {
        setLoading(false);
        return;
      }
      try {
        const res = await axios.get('/api/v1/auth/me');
        if (res.data.success) {
          setUser(res.data.data);
        }
      } catch (err) {
        console.error('Failed to restore session:', err);
        setAccessToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    loadMe();
  }, [accessToken]);

  const loginStep1 = async (email, password) => {
    const res = await axios.post('/api/v1/auth/login', { email, password });
    if (res.data.success && res.data.data?.accessToken) {
      // Direct authentication for demo accounts (no OTP required)
      const newAccessToken = res.data.data.accessToken;
      localStorage.setItem('deepshield_token', newAccessToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
      setAccessToken(newAccessToken);

      if (res.data.data.refreshToken) {
        localStorage.setItem('deepshield_refresh_token', res.data.data.refreshToken);
      }
      setUser(res.data.data.user);
    }
    return res.data;
  };

  const verifyOTP = async (userId, otpCode, sessionId) => {
    const res = await axios.post('/api/v1/auth/verify-otp', { userId, otpCode, sessionId, purpose: 'login' });
    if (res.data.success) {
      const newAccessToken = res.data.data.accessToken;

      // Immediately persist token & default headers synchronously
      localStorage.setItem('deepshield_token', newAccessToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
      setAccessToken(newAccessToken);

      if (res.data.data.refreshToken) {
        localStorage.setItem('deepshield_refresh_token', res.data.data.refreshToken);
      }
      setUser(res.data.data.user);
    }
    return res.data;
  };

  const resendOTP = async (userId, purpose = 'login', sessionId) => {
    const res = await axios.post('/api/v1/auth/resend-otp', { userId, purpose, sessionId });
    return res.data;
  };

  const logout = async () => {
    try {
      await axios.post('/api/v1/auth/logout');
    } catch (err) {
      // Ignore
    } finally {
      localStorage.removeItem('deepshield_token');
      localStorage.removeItem('deepshield_refresh_token');
      delete axios.defaults.headers.common['Authorization'];
      setAccessToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, loginStep1, verifyOTP, resendOTP, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
