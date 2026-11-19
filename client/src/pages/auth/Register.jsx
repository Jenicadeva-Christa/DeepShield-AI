import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Shield, User, Mail, Phone, Lock, Home, Calendar, CreditCard, ArrowRight, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    address: 'Mumbai, Maharashtra',
    dateOfBirth: '1996-08-20',
    gender: 'Male',
    idProofType: 'Aadhaar'
  });
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [registeredUserId, setRegisteredUserId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post('/api/v1/auth/register', formData);
      if (res.data.success) {
        setRegisteredUserId(res.data.data.userId);
        setStep(3);
        toast.success(res.data.message);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const fullOtp = otpCode.join('');
    setLoading(true);
    try {
      const res = await axios.post('/api/v1/auth/verify-otp', {
        userId: registeredUserId,
        otpCode: fullOtp,
        purpose: 'registration'
      });
      if (res.data.success) {
        toast.success('Registration & OTP verification complete! Please sign in.');
        navigate('/login');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="sm:mx-auto sm:w-full sm:max-w-lg text-center z-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-900 text-white shadow-lg mb-4">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-extrabold text-blue-900 tracking-tight">
          Create Customer Account
        </h2>
        <p className="mt-1 text-sm text-slate-500">Join DeepShield AI Protected Banking Network</p>

        {/* Stepper Header */}
        <div className="flex items-center justify-center gap-4 mt-6">
          <div className={`flex items-center gap-2 text-xs font-semibold ${step >= 1 ? 'text-blue-900' : 'text-slate-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${step >= 1 ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-slate-300 text-slate-400'}`}>1</span>
            Personal
          </div>
          <div className="w-8 h-0.5 bg-slate-200"></div>
          <div className={`flex items-center gap-2 text-xs font-semibold ${step >= 2 ? 'text-blue-900' : 'text-slate-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${step >= 2 ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-slate-300 text-slate-400'}`}>2</span>
            Details
          </div>
          <div className="w-8 h-0.5 bg-slate-200"></div>
          <div className={`flex items-center gap-2 text-xs font-semibold ${step >= 3 ? 'text-blue-900' : 'text-slate-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${step >= 3 ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-slate-300 text-slate-400'}`}>3</span>
            OTP
          </div>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg z-10 px-4 sm:px-0">
        <div className="bg-white border border-slate-200 py-8 px-6 sm:px-10 shadow-lg rounded-2xl">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Full Name</label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  placeholder="e.g. Ramesh Patel"
                  className="w-full px-4 py-3 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="ramesh@example.com"
                  className="w-full px-4 py-3 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Phone Number</label>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+919876543210"
                  className="w-full px-4 py-3 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Password</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Password@123"
                  className="w-full px-4 py-3 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full py-3 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-semibold text-sm shadow-md mt-2 transition-all"
              >
                Next Step: Address &amp; Identity →
              </button>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Address</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Date of Birth</label>
                  <input
                    type="date"
                    name="dateOfBirth"
                    value={formData.dateOfBirth}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Gender</label>
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">ID Proof Type</label>
                <select
                  name="idProofType"
                  value={formData.idProofType}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                >
                  <option value="Aadhaar">Aadhaar Card</option>
                  <option value="PAN">PAN Card</option>
                  <option value="Passport">Passport</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-1/3 py-3 rounded-lg bg-white text-slate-700 border border-slate-300 font-semibold text-sm hover:bg-slate-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 py-3 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-semibold text-sm shadow-md transition-all disabled:opacity-50"
                >
                  {loading ? 'Submitting...' : 'Register & Send OTP'}
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={handleVerifyOtp} className="space-y-5 text-center">
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-900 border border-blue-200 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Verify Registration OTP</h3>
              <p className="text-xs text-slate-500">
                Enter the 6-digit authentication code dispatched to your registered email address.
              </p>
              <p className="text-[11px] text-blue-700 font-medium">
                Please check your inbox (and spam folder) for the verification email.
              </p>
              <div className="flex justify-center gap-2">
                {otpCode.map((digit, idx) => (
                  <input
                    key={idx}
                    type="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => {
                      const newOtp = [...otpCode];
                      newOtp[idx] = e.target.value;
                      setOtpCode(newOtp);
                    }}
                    className="w-11 h-13 text-center text-xl font-bold bg-white border-2 border-slate-300 text-slate-900 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
                ))}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-semibold text-sm shadow-md transition-all disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Complete Registration'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-xs text-slate-500">
            Already registered? <Link to="/login" className="text-blue-700 font-semibold hover:text-blue-900">Sign In</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
