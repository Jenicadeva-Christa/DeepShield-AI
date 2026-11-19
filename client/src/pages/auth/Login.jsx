import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Shield,
  Lock,
  Mail,
  KeyRound,
  AlertCircle,
  ArrowRight,
  UserCheck,
  ShieldAlert,
  Settings,
  Eye,
  EyeOff,
  Activity,
  CheckCircle2,
  Cpu,
  Fingerprint,
  Radio,
  ArrowLeft
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Login() {
  const navigate = useNavigate();
  const { loginStep1, verifyOTP, resendOTP } = useAuth();

  const [activePortal, setActivePortal] = useState('customer'); // customer, analyst, admin
  const [step, setStep] = useState(1); // 1 = Email/Password, 2 = OTP Verification
  const [email, setEmail] = useState('customer1@deepshield.ai');
  const [password, setPassword] = useState('Password@123');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [userId, setUserId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Countdown timer for OTP resend cooldown
  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handlePortalSwitch = (portal) => {
    setActivePortal(portal);
    setErrorMsg('');
    if (portal === 'admin') {
      setEmail('admin@deepshield.ai');
      setPassword('Admin@123');
    } else if (portal === 'analyst') {
      setEmail('analyst1@deepshield.ai');
      setPassword('Password@123');
    } else {
      setEmail('customer1@deepshield.ai');
      setPassword('Password@123');
    }
    setStep(1);
    setOtpCode(['', '', '', '', '', '']);
  };

  const handleStep1Submit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await loginStep1(email, password);
      if (res.success) {
        if (res.data?.accessToken) {
          // Predefined demo account: login completed directly without OTP
          toast.success(res.message || 'Welcome back to DeepShield AI!');
          const role = res.data.user?.role;
          if (role === 'administrator') navigate('/admin/dashboard');
          else if (role === 'fraudAnalyst' || role === 'analyst') navigate('/analyst/dashboard');
          else if (role === 'bankingStaff') navigate('/banking/lookup');
          else navigate('/customer/dashboard');
          return;
        }

        // Normal account: proceeds to Step 2 OTP verification
        setUserId(res.data.userId);
        setSessionId(res.data.sessionId);
        setMaskedEmail(res.data.maskedEmail || getMaskedEmail(res.data.email || email));
        setStep(2);
        setResendCooldown(60);
        toast.success(res.message);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Check your credentials.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resending) return;
    setErrorMsg('');
    setResending(true);
    try {
      const res = await resendOTP(userId, 'login', sessionId);
      if (res.success) {
        if (res.data?.maskedEmail) setMaskedEmail(res.data.maskedEmail);
        setResendCooldown(60);
        toast.success(res.message || 'A new verification passcode has been sent to your email.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to resend verification code.';
      setErrorMsg(msg);
      toast.error(msg);
      if (err.response?.status === 429 && err.response?.data?.cooldownRemaining) {
        setResendCooldown(err.response.data.cooldownRemaining);
      }
    } finally {
      setResending(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (value.length > 1) value = value.charAt(value.length - 1);
    const newOtp = [...otpCode];
    newOtp[index] = value;
    setOtpCode(newOtp);

    // Auto focus next input box
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      const prevInput = document.getElementById(`otp-input-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  const handleStep2Submit = async (e) => {
    e.preventDefault();
    const fullOtp = otpCode.join('');
    if (fullOtp.length < 6) {
      setErrorMsg('Please enter the complete 6-digit OTP code.');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await verifyOTP(userId, fullOtp, sessionId);
      if (res.success) {
        toast.success('Welcome back to DeepShield AI!');
        const role = res.data.user.role;
        if (role === 'administrator') navigate('/admin/dashboard');
        else if (role === 'fraudAnalyst' || role === 'analyst') navigate('/analyst/dashboard');
        else if (role === 'bankingStaff') navigate('/banking/lookup');
        else navigate('/customer/dashboard');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid OTP code.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Helper to mask email for OTP display
  const getMaskedEmail = (rawEmail) => {
    if (!rawEmail || !rawEmail.includes('@')) return 'your registered contact';
    const [name, domain] = rawEmail.split('@');
    if (name.length <= 2) return `${name}***@${domain}`;
    return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}@${domain}`;
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row antialiased selection:bg-teal-500 selection:text-white">
      {/* ============================================================== */}
      {/* LEFT PANEL — Authentication (Approx 48% width on desktop)      */}
      {/* ============================================================== */}
      <div className="w-full lg:w-[48%] min-h-screen flex flex-col justify-between p-6 sm:p-10 lg:p-14 bg-white border-r border-[#E2E8F0] z-10">
        {/* Top Branding Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#0F766E] to-[#0F172A] text-white flex items-center justify-center shadow-md shadow-teal-900/10">
              <Shield className="w-6 h-6 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl tracking-tight text-[#0F172A]">
                  DeepShield <span className="text-[#0F766E]">AI</span>
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
                  v1.0
                </span>
              </div>
              <p className="text-[11px] text-[#64748B] font-medium leading-tight">
                Autonomous Multi-Modal Fraud Prevention &amp; Identity Protection
              </p>
            </div>
          </div>
        </div>

        {/* Middle Form Area */}
        <div className="my-auto py-8 max-w-md w-full mx-auto">
          {step === 1 ? (
            <div className="space-y-6">
              {/* Header Titles */}
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
                  Welcome back
                </h1>
                <p className="text-sm text-[#64748B] mt-1.5">
                  Sign in to access your secure enterprise banking &amp; security dashboard.
                </p>
              </div>

              {/* Segmented 3-Option Portal Selector */}
              <div>
                <label className="block text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2">
                  Select Workspace Portal
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-[#F1F5F9] border border-[#E2E8F0] rounded-xl">
                  <button
                    type="button"
                    onClick={() => handlePortalSwitch('customer')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-150 ${
                      activePortal === 'customer'
                        ? 'bg-white text-[#0F172A] shadow-sm font-bold border border-[#CBD5E1]'
                        : 'text-[#64748B] hover:text-[#0F172A] hover:bg-white/50'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5 text-teal-600" />
                    <span>Customer</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePortalSwitch('analyst')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-150 ${
                      activePortal === 'analyst'
                        ? 'bg-white text-[#0F172A] shadow-sm font-bold border border-[#CBD5E1]'
                        : 'text-[#64748B] hover:text-[#0F172A] hover:bg-white/50'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-blue-600" />
                    <span>Analyst</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePortalSwitch('admin')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-150 ${
                      activePortal === 'admin'
                        ? 'bg-white text-[#0F172A] shadow-sm font-bold border border-[#CBD5E1]'
                        : 'text-[#64748B] hover:text-[#0F172A] hover:bg-white/50'
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5 text-amber-600" />
                    <span>Admin</span>
                  </button>
                </div>
              </div>

              {/* Error Message Banner */}
              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleStep1Submit} className="space-y-4">
                {/* Email Field */}
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] uppercase tracking-wider mb-1.5">
                    Email or User Identifier
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@deepshield.ai"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-[#CBD5E1] text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/20 text-sm transition-all"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-semibold text-[#0F172A] uppercase tracking-wider">
                      Security Password
                    </label>
                    <Link
                      to="/forgot-password"
                      className="text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] hover:underline transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-white border border-[#CBD5E1] text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/20 text-sm transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#94A3B8] hover:text-[#0F172A] transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Sign In Primary CTA */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50 group cursor-pointer"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>Authenticating Credentials...</span>
                    </span>
                  ) : (
                    <>
                      <span>
                        Sign In as {activePortal.charAt(0).toUpperCase() + activePortal.slice(1)}
                      </span>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>

              {/* Role-Specific Secondary Footnotes */}
              {activePortal === 'customer' ? (
                <div className="text-center pt-2 border-t border-[#E2E8F0]">
                  <span className="text-xs text-[#64748B]">Need to register a new account? </span>
                  <Link
                    to="/register"
                    className="text-xs font-semibold text-[#0F766E] hover:text-[#115E59] hover:underline"
                  >
                    Open protected banking account
                  </Link>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900 flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">
                    i
                  </div>
                  <p className="leading-relaxed">
                    <strong>Notice:</strong> Staff profiles ({activePortal === 'admin' ? 'Administrator' : 'Fraud Analyst'}) are pre-provisioned via internal access control. Self-registration is disabled.
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Step 2 — OTP Verification Experience */
            <div className="space-y-6 animate-in fade-in duration-200">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748B] hover:text-[#0F172A] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to login credentials</span>
              </button>

              <div>
                <div className="w-12 h-12 rounded-xl bg-teal-50 text-[#0F766E] border border-teal-200 flex items-center justify-center mb-3">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-extrabold text-[#0F172A]">Verify your identity</h2>
                <p className="text-xs text-[#64748B] mt-1.5 leading-relaxed">
                  Two-factor authentication is enforced for this workspace. A 6-digit one-time passcode has been dispatched to{' '}
                  <strong className="text-[#0F172A]">{maskedEmail || getMaskedEmail(email)}</strong>.
                </p>
                <div className="mt-2.5 p-2.5 rounded-lg bg-teal-50/80 border border-teal-200/60 text-[11px] text-teal-800 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse"></span>
                  <span>Please check your email inbox and spam folder. The verification code expires in 5 minutes.</span>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleStep2Submit} className="space-y-6">
                <div className="flex justify-between gap-2 sm:gap-2.5">
                  {otpCode.map((digit, idx) => (
                    <input
                      key={idx}
                      id={`otp-input-${idx}`}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      className="w-11 h-14 sm:w-13 sm:h-16 text-center text-xl font-bold bg-[#F8FAFC] border-2 border-[#CBD5E1] text-[#0F172A] rounded-xl focus:outline-none focus:border-[#0F766E] focus:bg-white focus:ring-2 focus:ring-[#0F766E]/20 transition-all shadow-sm"
                      autoFocus={idx === 0}
                    />
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>Verifying Passcode...</span>
                    </span>
                  ) : (
                    <span>Verify Code &amp; Complete Sign In</span>
                  )}
                </button>

                <div className="flex justify-between items-center text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpCode(['', '', '', '', '', '']);
                      const first = document.getElementById('otp-input-0');
                      if (first) first.focus();
                    }}
                    className="text-[#64748B] hover:text-[#0F172A]"
                  >
                    Clear code
                  </button>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendCooldown > 0 || resending}
                    className={`font-semibold text-xs transition-colors ${
                      resendCooldown > 0 || resending
                        ? 'text-[#94A3B8] cursor-not-allowed'
                        : 'text-[#0F766E] hover:text-[#115E59] hover:underline cursor-pointer'
                    }`}
                  >
                    {resending ? (
                      'Sending code...'
                    ) : resendCooldown > 0 ? (
                      `Resend Passcode in ${resendCooldown}s`
                    ) : (
                      'Resend Passcode'
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="pt-4 border-t border-[#E2E8F0] flex flex-col sm:flex-row justify-between items-center gap-2 text-[11px] text-[#64748B]">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-teal-600" />
            <span>Protected by DeepShield AI Security Architecture</span>
          </div>
          <span className="font-mono text-[10px]">TLS 1.3 &bull; SHA-256 Verified</span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* RIGHT PANEL — Cybersecurity Visual Experience (Approx 52%)     */}
      {/* ============================================================== */}
      <div className="hidden lg:flex lg:w-[52%] min-h-screen relative overflow-hidden bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0A0F1D] text-white flex-col justify-between p-12 lg:p-16 select-none">
        {/* Subtle decorative glow overlays */}
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Top Header telemetry tag */}
        <div className="relative z-10 flex justify-between items-center">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-semibold text-slate-300 tracking-wide font-mono">
              SYSTEM INTEGRITY: 100% OPERATIONAL
            </span>
          </div>
          <div className="text-right text-[11px] text-slate-400 font-mono">
            SEC-NODE: APAC-MUM-01
          </div>
        </div>

        {/* Centerpiece Cybersecurity Illustration & Floating Glass Cards */}
        <div className="relative z-10 my-auto py-10">
          {/* Main Visual Composition */}
          <div className="relative max-w-lg mx-auto">
            {/* Concentric Pulse Rings & Abstract Shield */}
            <div className="relative w-48 h-48 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-teal-500/20 animate-ping duration-1000"></div>
              <div className="absolute inset-4 rounded-full border border-blue-500/25"></div>
              <div className="absolute inset-8 rounded-full border border-teal-400/30"></div>
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-teal-500/30 text-white">
                <Shield className="w-12 h-12" />
              </div>
            </div>

            {/* Connecting network node lines */}
            <div className="h-4"></div>

            {/* Floating Translucent Security Cards */}
            <div className="space-y-3.5 mt-4">
              {/* Card 1: Identity & Voice Cloning Protection */}
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-700/60 backdrop-blur-md shadow-xl flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center">
                    <Fingerprint className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Voice Cloning &amp; Identity Guard
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      ONNX Local Whisper Tiny + Spectral Acoustic Forensics
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-950/80 text-emerald-400 border border-emerald-800/70">
                    Active Guard
                  </span>
                </div>
              </div>

              {/* Card 2: Transaction Anomaly Autoencoder */}
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-700/60 backdrop-blur-md shadow-xl flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Real-Time Transaction Autoencoder
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Isolation Forest + K-Means Latent Feature Clustering
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-teal-300">
                    &lt; 12ms Latency
                  </span>
                </div>
              </div>

              {/* Card 3: Cryptographic Audit Trail */}
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-700/60 backdrop-blur-md shadow-xl flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-teal-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Cryptographic Audit Ledger
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      SHA-256 chained transaction blocks with zero-tamper proofs
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-800 text-slate-300">
                    Verified
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Headline & Supporting Copy */}
        <div className="relative z-10 border-t border-slate-800 pt-6">
          <h2 className="text-xl lg:text-2xl font-extrabold text-white tracking-tight">
            Security that thinks ahead.
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-lg leading-relaxed">
            Intelligent protection against evolving synthetic voice cloning, deepfake injection, social engineering, and unauthorized transaction anomalies.
          </p>
          <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500 font-medium">
            <span>&bull; Role-Based Access Control</span>
            <span>&bull; Step-Up Adaptive 2FA</span>
            <span>&bull; Local Model Inference</span>
          </div>
        </div>
      </div>
    </div>
  );
}
