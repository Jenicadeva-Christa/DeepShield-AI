import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Send,
  Download,
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  KeyRound,
  CheckCircle2,
  ArrowRight,
  X,
  Gauge,
  Info,
  RefreshCw,
  Building2,
  UserCheck
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function PerformTransaction() {
  const [direction, setDirection] = useState('send'); // 'send' | 'receive'

  // Send Money Form
  const [sendForm, setSendForm] = useState({
    payeeName: 'Priya Sharma',
    payeeAccount: '300988881234',
    payeeCategory: 'p2p', // 'p2p' | 'verifiedMerchant'
    amount: '15000',
    type: 'upi',
    channel: 'upi',
    city: 'Mumbai',
    description: 'P2P Transfer'
  });

  // Receive Money Form
  const [receiveForm, setReceiveForm] = useState({
    senderName: 'Ramesh Patel',
    senderAccount: '300911223344',
    amount: '25000',
    channel: 'upi',
    category: 'standardCredit',
    bank: 'SBI',
    description: 'Invoice Settlement'
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [otpLoading, setOtpLoading] = useState(false);

  // UPI Limits State
  const [upiLimits, setUpiLimits] = useState({
    category: 'p2p',
    perTransactionLimit: 100000,
    dailyCumulativeLimit: 100000,
    rollingWindowHours: 24,
    amountUsed24h: 0,
    remainingLimit: 100000,
    outgoingCount24h: 0,
    inboundLimits: {
      category: 'standardCredit',
      perTransactionLimit: 200000,
      dailyCumulativeLimit: 500000,
      amountReceived24h: 0,
      remainingInboundLimit: 500000,
      inboundCount24h: 0
    }
  });
  const [limitsLoading, setLimitsLoading] = useState(false);

  // Fetch UPI limits from backend
  const fetchUpiLimits = useCallback(async (cat = sendForm.payeeCategory) => {
    try {
      setLimitsLoading(true);
      const res = await axios.get(`/api/v1/transactions/limits/upi?category=${cat}`);
      if (res.data?.success && res.data?.data) {
        setUpiLimits(res.data.data);
      }
    } catch (err) {
      console.warn('Failed to fetch UPI limit status:', err.message);
      // Keep previous valid state; do NOT set misleading limit values
    } finally {
      setLimitsLoading(false);
    }
  }, [sendForm.payeeCategory]);

  useEffect(() => {
    fetchUpiLimits(sendForm.payeeCategory);
  }, [fetchUpiLimits, sendForm.payeeCategory]);

  // Compute live validation errors before submission
  const getOutboundValidationError = () => {
    if (sendForm.type !== 'upi' && sendForm.channel !== 'upi') return null;
    const numAmount = parseFloat(sendForm.amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) return null;

    if (numAmount > upiLimits.perTransactionLimit) {
      return {
        type: 'perTransaction',
        message: `Amount exceeds maximum per-transaction UPI limit of ₹${upiLimits.perTransactionLimit.toLocaleString('en-IN')}. Requested: ₹${numAmount.toLocaleString('en-IN')}.`
      };
    }

    if (numAmount > upiLimits.remainingLimit) {
      return {
        type: 'dailyCumulative',
        message: `Amount exceeds remaining daily outgoing UPI limit of ₹${upiLimits.remainingLimit.toLocaleString('en-IN')}. (₹${upiLimits.amountUsed24h.toLocaleString('en-IN')} already used in past 24h).`
      };
    }

    return null;
  };

  const getInboundValidationError = () => {
    if (receiveForm.channel !== 'upi') return null;
    const numAmount = parseFloat(receiveForm.amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) return null;

    const inLimits = upiLimits.inboundLimits;
    if (inLimits && numAmount > inLimits.perTransactionLimit) {
      return {
        type: 'perTransaction',
        message: `Amount exceeds maximum inbound per-transaction limit of ₹${inLimits.perTransactionLimit.toLocaleString('en-IN')}.`
      };
    }

    if (inLimits && numAmount > inLimits.remainingInboundLimit) {
      return {
        type: 'dailyCumulative',
        message: `Amount exceeds remaining daily inbound limit of ₹${inLimits.remainingInboundLimit.toLocaleString('en-IN')}. (₹${inLimits.amountReceived24h.toLocaleString('en-IN')} already received in past 24h).`
      };
    }

    return null;
  };

  const outboundError = getOutboundValidationError();
  const inboundError = getInboundValidationError();

  // Quick preset tester for Inbound simulation
  const handleSetMuleSender = () => {
    setReceiveForm({
      senderName: 'DarkWeb Cashout Mule',
      senderAccount: '998877665544', // Blacklisted in seed script
      amount: '48500',
      channel: 'upi',
      category: 'standardCredit',
      bank: 'Unknown Offshore Bank',
      description: 'Suspicious Structuring Deposit'
    });
    toast.success('Loaded Blacklisted Mule Account preset for inbound screening test!');
  };

  // Quick preset for high-value merchant
  const handleSetMerchantPreset = () => {
    setSendForm({
      payeeName: 'Apollo Speciality Hospitals',
      payeeAccount: '300955667788',
      payeeCategory: 'verifiedMerchant',
      amount: '150000',
      type: 'upi',
      channel: 'upi',
      city: 'Mumbai',
      description: 'Medical Services Bill Settlement'
    });
    fetchUpiLimits('verifiedMerchant');
    toast.success('Loaded Verified Merchant preset with higher ₹2,00,000 limit rule!');
  };

  const handleSendSubmit = async (e) => {
    e.preventDefault();

    if (outboundError) {
      toast.error(outboundError.message);
      return;
    }

    setLoading(true);
    setResult(null);
    setShowOtpModal(false);

    // Unique idempotency key to prevent accidental duplicate submission
    const idempotencyKey = `tx-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      const payload = {
        type: sendForm.type,
        amount: parseFloat(sendForm.amount),
        channel: sendForm.channel,
        description: sendForm.description,
        category: sendForm.payeeCategory,
        idempotencyKey,
        payee: {
          name: sendForm.payeeName,
          accountNumber: sendForm.payeeAccount,
          bank: 'HDFC Bank',
          category: sendForm.payeeCategory,
          isMerchant: sendForm.payeeCategory === 'verifiedMerchant',
          isNew: true
        },
        location: { city: sendForm.city, country: 'India' },
        device: { deviceId: 'DEV-CHIP-BROWSER', ipAddress: '103.21.12.44', userAgent: navigator.userAgent, isKnown: true }
      };

      const res = await axios.post('/api/v1/transactions', payload, {
        headers: { 'Idempotency-Key': idempotencyKey }
      });

      if (res.data.success) {
        setResult(res.data.data);
        if (res.data.data.stepUpRequired) {
          setShowOtpModal(true);
        } else if (res.data.data.transaction.status === 'approved') {
          toast.success('Transaction approved and completed!');
          // Refresh remaining limits after successful transaction
          fetchUpiLimits(sendForm.payeeCategory);
        } else if (res.data.data.transaction.status === 'blocked') {
          toast.error('High risk detected! Transaction auto-blocked.');
        }
      }
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.code === 'UPI_PER_TRANSACTION_LIMIT_EXCEEDED' || errData?.code === 'UPI_DAILY_LIMIT_EXCEEDED') {
        toast.error(`UPI Limit Block: ${errData.message}`);
      } else {
        toast.error(errData?.message || 'Transaction submission failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReceiveSubmit = async (e) => {
    e.preventDefault();

    if (inboundError) {
      toast.error(inboundError.message);
      return;
    }

    setLoading(true);
    setResult(null);

    const idempotencyKey = `rx-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      const payload = {
        amount: parseFloat(receiveForm.amount),
        channel: receiveForm.channel,
        category: receiveForm.category,
        description: receiveForm.description,
        idempotencyKey,
        sender: {
          name: receiveForm.senderName,
          accountNumber: receiveForm.senderAccount,
          bank: receiveForm.bank
        }
      };

      const res = await axios.post('/api/v1/transactions/receive', payload, {
        headers: { 'Idempotency-Key': idempotencyKey }
      });

      if (res.data.success) {
        setResult({
          transaction: res.data.data.transaction,
          riskAssessment: {
            aiScore: res.data.data.riskScore,
            riskLevel: res.data.data.riskLevel,
            topFactors: res.data.data.indicators
          }
        });

        const isThreatOrHighRisk =
          res.data.data.riskLevel === 'high' ||
          res.data.data.riskLevel === 'critical' ||
          res.data.data.transaction?.status === 'blocked' ||
          res.data.data.transaction?.status === 'underReview';

        if (isThreatOrHighRisk) {
          toast.error(
            res.data.data.transaction?.status === 'blocked'
              ? 'Critical Risk Blocked: Darkweb / Blacklisted threat detected! Funds rejected.'
              : 'High Risk: Inbound funds held for AML/Fraud investigation!'
          );
        } else {
          toast.success(`Received ₹${parseFloat(receiveForm.amount).toLocaleString('en-IN')}! Balance updated.`);
          // Refresh inbound limit usage
          fetchUpiLimits(sendForm.payeeCategory);
        }
      }
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.code?.startsWith('UPI_INBOUND_')) {
        toast.error(`Inbound Limit Block: ${errData.message}`);
      } else {
        toast.error(errData?.message || 'Inbound transfer processing failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStepUpSubmit = async (e) => {
    e.preventDefault();
    const code = otpCode.join('');
    if (code.length < 6) {
      toast.error('Please enter complete 6-digit OTP code.');
      return;
    }
    setOtpLoading(true);
    try {
      const res = await axios.post(`/api/v1/transactions/${result.transaction._id}/step-up`, { otpCode: code });
      if (res.data.success) {
        toast.success('Step-up authentication verified! Transaction approved.');
        setShowOtpModal(false);
        setResult({ ...result, transaction: res.data.data.transaction });
        fetchUpiLimits(sendForm.payeeCategory);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid step-up OTP.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleCloseOtpModal = () => {
    setShowOtpModal(false);
    setOtpCode(['', '', '', '', '', '']);
    toast('Step-up verification dismissed.', { icon: '↩️' });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showOtpModal) {
        handleCloseOtpModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showOtpModal]);

  // Outbound progress percentage
  const usedPercent = Math.min(
    100,
    Math.round((upiLimits.amountUsed24h / (upiLimits.dailyCumulativeLimit || 1)) * 100)
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="p-6 rounded-xl bg-gradient-to-r from-blue-900 to-indigo-900 text-white border border-blue-800 shadow-md flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">Transaction &amp; Fund Transfer Hub</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-700/80 text-blue-100 border border-blue-500/30">
              UPI Limit Validation Active
            </span>
          </div>
          <p className="text-xs text-blue-100 mt-1">
            Real-time Outbound Payment &amp; Inbound Credit Fraud Screening with NPCI Limits Enforcement
          </p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center border border-white/20">
          {direction === 'send' ? <Send className="w-5 h-5" /> : <Download className="w-5 h-5" />}
        </div>
      </div>

      {/* Direction Switcher Tabs */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-white border border-slate-200 rounded-xl shadow-sm">
        <button
          type="button"
          onClick={() => { setDirection('send'); setResult(null); }}
          className={`py-2.5 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
            direction === 'send'
              ? 'bg-blue-900 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Send className="w-4 h-4" />
          <span>💸 Send Money (Outbound Transfer)</span>
        </button>
        <button
          type="button"
          onClick={() => { setDirection('receive'); setResult(null); }}
          className={`py-2.5 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
            direction === 'receive'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>📥 Receive Money (Inbound Simulation)</span>
        </button>
      </div>

      {/* REAL-TIME UPI LIMIT METRICS DASHBOARD */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {direction === 'send'
                  ? `UPI Outgoing Limits (${sendForm.payeeCategory === 'verifiedMerchant' ? 'Verified Merchant Policy' : 'Standard P2P Simulation Policy'})`
                  : 'UPI Inbound Credit Limits (Configurable Bank Policy)'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Rolling 24-hour window source-of-truth from MongoDB ledger records
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchUpiLimits(sendForm.payeeCategory)}
            disabled={limitsLoading}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-semibold px-2.5 py-1 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${limitsLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Limits</span>
          </button>
        </div>

        {direction === 'send' ? (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Per-Tx Limit</span>
                <span className="text-lg font-black text-slate-900 mt-0.5 block">
                  ₹{upiLimits.perTransactionLimit.toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-slate-400">Max single transaction</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Daily 24h Limit</span>
                <span className="text-lg font-black text-slate-900 mt-0.5 block">
                  ₹{upiLimits.dailyCumulativeLimit.toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-slate-400">Cumulative ceiling</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Used (Past 24h)</span>
                <span className="text-lg font-black text-amber-700 mt-0.5 block">
                  ₹{upiLimits.amountUsed24h.toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-slate-400">{upiLimits.outgoingCount24h} successful outgoing</span>
              </div>

              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <span className="text-[10px] uppercase font-bold text-emerald-800 block">Remaining Limit</span>
                <span className="text-lg font-black text-emerald-700 mt-0.5 block">
                  ₹{upiLimits.remainingLimit.toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-emerald-600">Available to send now</span>
              </div>
            </div>

            {/* Rolling Window Progress Bar */}
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                <span>Daily Cumulative Utilization: {usedPercent}%</span>
                <span>₹{upiLimits.amountUsed24h.toLocaleString('en-IN')} / ₹{upiLimits.dailyCumulativeLimit.toLocaleString('en-IN')}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    usedPercent > 90 ? 'bg-red-500' : usedPercent > 70 ? 'bg-amber-500' : 'bg-blue-600'
                  }`}
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Inbound Per-Tx Limit</span>
                <span className="text-lg font-black text-slate-900 mt-0.5 block">
                  ₹{upiLimits.inboundLimits.perTransactionLimit.toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-slate-400">Configured policy max</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Inbound 24h Ceiling</span>
                <span className="text-lg font-black text-slate-900 mt-0.5 block">
                  ₹{upiLimits.inboundLimits.dailyCumulativeLimit.toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-slate-400">Cumulative credit rule</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Received Today</span>
                <span className="text-lg font-black text-teal-700 mt-0.5 block">
                  ₹{upiLimits.inboundLimits.amountReceived24h.toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-slate-400">{upiLimits.inboundLimits.inboundCount24h} incoming credits</span>
              </div>

              <div className="p-3 rounded-lg bg-teal-50 border border-teal-200">
                <span className="text-[10px] uppercase font-bold text-teal-800 block">Inbound Capacity</span>
                <span className="text-lg font-black text-teal-700 mt-0.5 block">
                  ₹{upiLimits.inboundLimits.remainingInboundLimit.toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-teal-600">Remaining credit capacity</span>
              </div>
            </div>

            <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              <span>Project simulation inbound policy; distinct from outgoing P2P limits as required by banking policy.</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Form Panel */}
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-base">
              {direction === 'send' ? 'Outbound Transfer Details' : 'Simulate Inbound Payment'}
            </h3>
            {direction === 'send' ? (
              <button
                type="button"
                onClick={handleSetMerchantPreset}
                className="text-[11px] px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg transition-colors font-semibold flex items-center gap-1"
              >
                <Building2 className="w-3 h-3" />
                <span>Verified Merchant Preset</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSetMuleSender}
                className="text-[11px] px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg transition-colors font-semibold"
              >
                ⚠️ Load Blacklisted Mule Sender
              </button>
            )}
          </div>

          {direction === 'send' ? (
            <form onSubmit={handleSendSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                  Recipient Name
                </label>
                <input
                  type="text"
                  value={sendForm.payeeName}
                  onChange={(e) => setSendForm({ ...sendForm, payeeName: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                  Recipient Account Number / UPI ID
                </label>
                <input
                  type="text"
                  value={sendForm.payeeAccount}
                  onChange={(e) => setSendForm({ ...sendForm, payeeAccount: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                    Payee Category
                  </label>
                  <select
                    value={sendForm.payeeCategory}
                    onChange={(e) => {
                      const newCat = e.target.value;
                      setSendForm({ ...sendForm, payeeCategory: newCat });
                      fetchUpiLimits(newCat);
                    }}
                    className="w-full px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  >
                    <option value="p2p">Standard P2P (Max ₹1 Lakh)</option>
                    <option value="verifiedMerchant">Verified Merchant (Max ₹2 Lakh)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                    Transfer Type
                  </label>
                  <select
                    value={sendForm.type}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setSendForm({ ...sendForm, type: newType, channel: newType === 'upi' ? 'upi' : 'web' });
                    }}
                    className="w-full px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  >
                    <option value="upi">UPI Instant (Limit Validated)</option>
                    <option value="transfer">Bank Transfer (NEFT/IMPS)</option>
                    <option value="billPayment">Bill Payment</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                  Amount (₹ INR)
                </label>
                <input
                  type="number"
                  value={sendForm.amount}
                  onChange={(e) => setSendForm({ ...sendForm, amount: e.target.value })}
                  required
                  min="1"
                  className={`w-full px-4 py-2.5 rounded-lg bg-white border text-slate-900 text-sm font-bold focus:outline-none transition-all ${
                    outboundError
                      ? 'border-red-500 ring-1 ring-red-500'
                      : 'border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                  }`}
                />

                {/* Live Outbound Validation Error Warning */}
                {outboundError && (
                  <div className="mt-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2 animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600" />
                    <div>
                      <p className="font-bold">
                        {outboundError.type === 'perTransaction'
                          ? 'Per-Transaction Limit Warning'
                          : 'Daily Cumulative Limit Warning'}
                      </p>
                      <p className="text-[11px] leading-relaxed mt-0.5">{outboundError.message}</p>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                  Location / City
                </label>
                <input
                  type="text"
                  value={sendForm.city}
                  onChange={(e) => setSendForm({ ...sendForm, city: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading || Boolean(outboundError)}
                className={`w-full py-3 rounded-lg text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 ${
                  outboundError
                    ? 'bg-red-400 cursor-not-allowed'
                    : 'bg-blue-900 hover:bg-blue-800'
                }`}
              >
                {loading
                  ? 'Validating Limits & Evaluating Risk...'
                  : outboundError
                  ? '⚠️ Amount Exceeds UPI Limit'
                  : 'Submit & Execute Transfer'}
                {!loading && !outboundError && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          ) : (
            <form onSubmit={handleReceiveSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                  Remitter / Sender Name
                </label>
                <input
                  type="text"
                  value={receiveForm.senderName}
                  onChange={(e) => setReceiveForm({ ...receiveForm, senderName: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                  Sender Bank Account / UPI ID
                </label>
                <input
                  type="text"
                  value={receiveForm.senderAccount}
                  onChange={(e) => setReceiveForm({ ...receiveForm, senderAccount: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                    Incoming Amount (₹)
                  </label>
                  <input
                    type="number"
                    value={receiveForm.amount}
                    onChange={(e) => setReceiveForm({ ...receiveForm, amount: e.target.value })}
                    required
                    min="1"
                    className={`w-full px-4 py-2.5 rounded-lg bg-white border text-slate-900 text-sm font-bold focus:outline-none transition-all ${
                      inboundError
                        ? 'border-red-500 ring-1 ring-red-500'
                        : 'border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                    Channel
                  </label>
                  <select
                    value={receiveForm.channel}
                    onChange={(e) => setReceiveForm({ ...receiveForm, channel: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  >
                    <option value="upi">UPI Inbound (Limit Validated)</option>
                    <option value="transfer">IMPS / NEFT</option>
                    <option value="deposit">Cash Deposit</option>
                  </select>
                </div>
              </div>

              {/* Live Inbound Validation Warning */}
              {inboundError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600" />
                  <div>
                    <p className="font-bold">Inbound Limit Warning</p>
                    <p className="text-[11px] leading-relaxed mt-0.5">{inboundError.message}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                  Remittance Memo
                </label>
                <input
                  type="text"
                  value={receiveForm.description}
                  onChange={(e) => setReceiveForm({ ...receiveForm, description: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading || Boolean(inboundError)}
                className={`w-full py-3 rounded-lg text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 ${
                  inboundError
                    ? 'bg-red-400 cursor-not-allowed'
                    : 'bg-teal-600 hover:bg-teal-700'
                }`}
              >
                {loading
                  ? 'Screening Limits & Fraud Engine...'
                  : inboundError
                  ? '⚠️ Exceeds Inbound Limit'
                  : 'Simulate Receiving Inbound Funds'}
                {!loading && !inboundError && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          )}
        </div>

        {/* AI Evaluation Result Panel */}
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-bold text-base pb-3 border-b border-slate-100 text-slate-700">
              AI Risk Engine Evaluation Result
            </h3>

            {result ? (
              <div className="mt-4 space-y-4">
                {/* Risk Gauge Badge */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase">Evaluated Risk Score</p>
                    <p className="text-3xl font-black text-slate-900 mt-1">
                      {result.riskAssessment?.aiScore || result.riskAssessment?.riskScore || 0}{' '}
                      <span className="text-sm font-normal text-slate-500">/ 100</span>
                    </p>
                  </div>
                  <div>
                    <span
                      className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${
                        result.riskAssessment?.riskLevel === 'low'
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : result.riskAssessment?.riskLevel === 'medium'
                          ? 'bg-amber-100 text-amber-700 border border-amber-200'
                          : 'bg-red-100 text-red-700 border border-red-200'
                      }`}
                    >
                      {result.riskAssessment?.riskLevel} RISK
                    </span>
                  </div>
                </div>

                {/* Status Decision */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-1">Decision Flow Outcome</p>
                  <p className="text-sm font-bold text-slate-900 capitalize">
                    Status: <span className="text-blue-700">{result.transaction?.status}</span>
                  </p>
                </div>

                {/* Top Contributing Factors */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase">Top Contributing Risk Factors</p>
                  {result.riskAssessment?.topFactors && result.riskAssessment?.topFactors.length > 0 ? (
                    result.riskAssessment.topFactors.slice(0, 3).map((factor, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-white border border-slate-200 text-xs space-y-1">
                        <div className="flex justify-between font-bold text-slate-700">
                          <span>{factor.factor}</span>
                          <span>{factor.score ? `${factor.score} pts` : ''}</span>
                        </div>
                        <p className="text-slate-500 text-[11px] leading-relaxed">{factor.explanation}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      No anomaly flags detected. Sender and funds meet verified compliance standards.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center text-slate-300 space-y-2">
                <ShieldCheck className="w-12 h-12 text-slate-300" />
                <p className="text-xs text-slate-400 font-medium">
                  Enter transfer parameters to view instant multi-layer risk scoring &amp; anomaly indicators.
                </p>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 italic">
            * Screening evaluated by DeepShield Neural Autoencoders, Isolation Forests &amp; Blacklist Overrides.
          </div>
        </div>
      </div>

      {/* Step-up OTP Modal for Outbound Medium Risk */}
      {showOtpModal && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseOtpModal();
          }}
        >
          <div className="relative bg-white border border-slate-200 p-6 sm:p-8 rounded-2xl max-w-md w-full text-center space-y-5 shadow-2xl">
            <button
              type="button"
              onClick={handleCloseOtpModal}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-2 rounded-lg hover:bg-slate-100 transition-colors"
              aria-label="Close modal"
              title="Close and cancel"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-14 h-14 rounded-xl bg-amber-100 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
              <KeyRound className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-slate-900">Step-Up Authentication Required</h3>
              <p className="text-xs text-slate-500 mt-1">
                Medium Risk detected for this transfer. Enter the 6-digit OTP code to authorize.
              </p>
              {result?.isDemoAccount ? (
                <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                  <strong>Demo Mode Account:</strong> Check the backend server terminal console for the verification OTP.
                </div>
              ) : (
                <div className="mt-2 p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-[11px] text-teal-900">
                  <strong>Verification Code Sent:</strong> A 6-digit passcode has been dispatched to your registered email address.
                </div>
              )}
            </div>

            <div className="flex justify-center gap-2">
              {otpCode.map((digit, idx) => (
                <input
                  key={idx}
                  id={`stepup-otp-${idx}`}
                  type="text"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    const newOtp = [...otpCode];
                    newOtp[idx] = val;
                    setOtpCode(newOtp);
                    if (val && idx < 5) {
                      const nextInput = document.getElementById(`stepup-otp-${idx + 1}`);
                      if (nextInput) nextInput.focus();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !digit && idx > 0) {
                      const prevInput = document.getElementById(`stepup-otp-${idx - 1}`);
                      if (prevInput) prevInput.focus();
                    }
                  }}
                  className="w-11 h-13 text-center text-xl font-bold bg-white border-2 border-slate-300 text-slate-900 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                />
              ))}
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleStepUpSubmit}
                disabled={otpLoading}
                className="w-full py-3 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-bold text-sm shadow-md transition-all disabled:opacity-50"
              >
                {otpLoading ? 'Verifying OTP...' : 'Approve & Execute Transfer'}
              </button>

              <button
                type="button"
                onClick={handleCloseOtpModal}
                disabled={otpLoading}
                className="w-full py-2.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-medium text-xs transition-colors"
              >
                Cancel &amp; Return to Form
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
