import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import AppLayout from './components/layout/AppLayout';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import CustomerDashboard from './pages/customer/CustomerDashboard';
import PerformTransaction from './pages/customer/PerformTransaction';
import TransactionHistory from './pages/customer/TransactionHistory';
import SecurityCheckCenter from './pages/customer/SecurityCheckCenter';
import VerifyIdentity from './pages/customer/VerifyIdentity';
import Notifications from './pages/customer/Notifications';
import AnalystDashboard from './pages/analyst/AnalystDashboard';
import AlertQueue from './pages/analyst/AlertQueue';
import InvestigationWorkspace from './pages/analyst/InvestigationWorkspace';
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import SystemConfigs from './pages/admin/SystemConfigs';
import BlacklistManagement from './pages/admin/BlacklistManagement';
import AIModels from './pages/admin/AIModels';
import AuditLogViewer from './pages/admin/AuditLogViewer';
import ReportsCenter from './pages/admin/ReportsCenter';
import BankingLookup from './pages/banking/BankingLookup';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm font-semibold text-purple-300">Loading DeepShield AI Workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const roleAliases = {
    analyst: 'fraudAnalyst',
    fraudAnalyst: 'analyst'
  };

  if (allowedRoles) {
    const hasRole = allowedRoles.includes(user.role) || (roleAliases[user.role] && allowedRoles.includes(roleAliases[user.role]));
    if (!hasRole) {
      return <Navigate to="/" replace />;
    }
  }

  return <AppLayout>{children}</AppLayout>;
}

function RoleHomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  if (user.role === 'administrator') return <Navigate to="/admin/dashboard" replace />;
  if (user.role === 'fraudAnalyst' || user.role === 'analyst') return <Navigate to="/analyst/dashboard" replace />;
  if (user.role === 'bankingStaff') return <Navigate to="/banking/lookup" replace />;
  return <Navigate to="/customer/dashboard" replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Default Route */}
            <Route path="/" element={<RoleHomeRedirect />} />

            {/* Customer Routes */}
            <Route path="/customer/dashboard" element={<ProtectedRoute allowedRoles={['customer']}><CustomerDashboard /></ProtectedRoute>} />
            <Route path="/customer/transaction" element={<ProtectedRoute allowedRoles={['customer']}><PerformTransaction /></ProtectedRoute>} />
            <Route path="/customer/history" element={<ProtectedRoute allowedRoles={['customer']}><TransactionHistory /></ProtectedRoute>} />
            <Route path="/customer/security-check" element={<ProtectedRoute allowedRoles={['customer']}><SecurityCheckCenter /></ProtectedRoute>} />
            <Route path="/customer/verify-identity" element={<ProtectedRoute allowedRoles={['customer']}><VerifyIdentity /></ProtectedRoute>} />
            <Route path="/customer/notifications" element={<ProtectedRoute allowedRoles={['customer']}><Notifications /></ProtectedRoute>} />

            {/* Analyst Routes */}
            <Route path="/analyst/dashboard" element={<ProtectedRoute allowedRoles={['fraudAnalyst', 'analyst', 'administrator']}><AnalystDashboard /></ProtectedRoute>} />
            <Route path="/analyst/alerts" element={<ProtectedRoute allowedRoles={['fraudAnalyst', 'analyst', 'administrator']}><AlertQueue /></ProtectedRoute>} />
            <Route path="/analyst/my-status" element={<ProtectedRoute allowedRoles={['fraudAnalyst', 'analyst', 'administrator']}><AlertQueue initialTab="myStatus" /></ProtectedRoute>} />
            <Route path="/analyst/investigations" element={<ProtectedRoute allowedRoles={['fraudAnalyst', 'analyst', 'administrator']}><InvestigationWorkspace /></ProtectedRoute>} />
            <Route path="/analyst/reports" element={<ProtectedRoute allowedRoles={['fraudAnalyst', 'analyst', 'administrator']}><ReportsCenter /></ProtectedRoute>} />

            {/* Banking Routes */}
            <Route path="/banking/lookup" element={<ProtectedRoute allowedRoles={['bankingStaff', 'administrator']}><BankingLookup /></ProtectedRoute>} />

            {/* Admin Routes */}
            <Route path="/admin/dashboard" element={<ProtectedRoute allowedRoles={['administrator']}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['administrator']}><UserManagement /></ProtectedRoute>} />
            <Route path="/admin/configs" element={<ProtectedRoute allowedRoles={['administrator']}><SystemConfigs /></ProtectedRoute>} />
            <Route path="/admin/blacklists" element={<ProtectedRoute allowedRoles={['administrator']}><BlacklistManagement /></ProtectedRoute>} />
            <Route path="/admin/models" element={<ProtectedRoute allowedRoles={['administrator']}><AIModels /></ProtectedRoute>} />
            <Route path="/admin/audit-logs" element={<ProtectedRoute allowedRoles={['administrator']}><AuditLogViewer /></ProtectedRoute>} />
            <Route path="/admin/reports" element={<ProtectedRoute allowedRoles={['administrator']}><ReportsCenter /></ProtectedRoute>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
