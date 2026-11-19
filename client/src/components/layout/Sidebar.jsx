import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Send,
  History,
  ShieldCheck,
  FileCheck,
  AlertTriangle,
  Search,
  Users,
  Cpu,
  Sliders,
  Slash,
  FileText,
  Bell,
  UserCheck
} from 'lucide-react';

export default function Sidebar() {
  const { user } = useAuth();
  const role = user?.role || 'customer';

  const customerNav = [
    { name: 'Dashboard', path: '/customer/dashboard', icon: LayoutDashboard },
    { name: 'Perform Transaction', path: '/customer/transaction', icon: Send },
    { name: 'Transaction History', path: '/customer/history', icon: History },
    { name: 'Verify Identity', path: '/customer/verify-identity', icon: FileCheck },
    { name: 'Security Check Center', path: '/customer/security-check', icon: ShieldCheck },
    { name: 'Notifications', path: '/customer/notifications', icon: Bell }
  ];

  const analystNav = [
    { name: 'Analyst Dashboard', path: '/analyst/dashboard', icon: LayoutDashboard },
    { name: 'Alert Queue', path: '/analyst/alerts', icon: AlertTriangle },
    { name: 'My Status', path: '/analyst/my-status', icon: UserCheck },
    { name: 'Investigation Workspace', path: '/analyst/investigations', icon: Search },
    { name: 'Reports & Export', path: '/analyst/reports', icon: FileText }
  ];

  const bankingNav = [
    { name: 'Transaction Lookup', path: '/banking/lookup', icon: History },
    { name: 'Fraud Reports Viewer', path: '/banking/reports', icon: FileText }
  ];

  const adminNav = [
    { name: 'Admin Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Reports & Analytics', path: '/admin/reports', icon: FileText },
    { name: 'Fraud Alerts Queue', path: '/analyst/alerts', icon: AlertTriangle },
    { name: 'User Management', path: '/admin/users', icon: Users },
    { name: 'Identity Review Queue', path: '/admin/identity-reviews', icon: FileCheck },
    { name: 'AI Models Management', path: '/admin/models', icon: Cpu },
    { name: 'System Configuration', path: '/admin/configs', icon: Sliders },
    { name: 'Blacklist Management', path: '/admin/blacklists', icon: Slash },
    { name: 'Audit Log Viewer', path: '/admin/audit-logs', icon: ShieldCheck }
  ];

  let navItems = customerNav;
  if (role === 'fraudAnalyst' || role === 'analyst') navItems = analystNav;
  if (role === 'bankingStaff') navItems = bankingNav;
  if (role === 'administrator') navItems = adminNav;

  const roleLabel = {
    customer: 'Customer',
    fraudAnalyst: 'Fraud Analyst',
    analyst: 'Fraud Analyst',
    bankingStaff: 'Banking Staff',
    administrator: 'Administrator'
  }[role] || role;

  return (
    <aside className="w-64 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 min-h-[calc(100vh-4rem)] flex flex-col border-r border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <div className="px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/40">
          <p className="text-[11px] uppercase tracking-wider text-blue-700 dark:text-blue-400 font-bold">Active Role Workspace</p>
          <p className="text-sm font-bold text-blue-900 dark:text-white capitalize mt-0.5">{roleLabel}</p>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                isActive
                  ? 'flex items-center gap-3 px-3 py-2.5 rounded-lg font-semibold text-sm bg-teal-600 text-white shadow-sm'
                  : 'flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-100'
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 text-center font-medium">
        DeepShield AI Engine v1.0.0
      </div>
    </aside>
  );
}
