const SystemConfig = require('../models/systemconfigs.model');
const Blacklist = require('../models/blacklists.model');
const IsolationForest = require('./isolationForest');
const { extractFeatureVector, calculateReconstructionError } = require('./transactionAutoencoder');

// Shared Isolation Forest instance
const isoForest = new IsolationForest(40, 128);
let isoForestTrained = false;

function trainIsolationForestOnBaseline(historicTxs = []) {
  const trainingData = historicTxs.map(tx => [
    tx.amount || 1000,
    tx.payee?.isNew ? 1 : 0,
    tx.device?.isKnown ? 0 : 1
  ]);

  if (trainingData.length > 5) {
    isoForest.fit(trainingData);
    isoForestTrained = true;
  }
}

/**
 * Unified Transaction Risk Assessment Service
 * Evaluates both Inbound (Deposits/Credits) and Outbound (Transfers/Payments)
 * with consistent, direction-aware policies and calibrated anomaly detection.
 */
async function evaluateTransactionRisk({
  transaction,
  customer,
  customerBaseline,
  velocity,
  velocityData = {},
  direction = 'outbound',
  sender,
  payee
}) {
  const startTime = Date.now();
  const isDeposit = direction === 'inbound' || transaction.type === 'deposit';

  const baseline = customer?.baseline || customerBaseline || {
    averageAmount: 5000,
    stdAmount: 2500,
    averageDeposit: 25000,
    stdDeposit: 12000,
    usualHours: [9, 14, 18],
    usualCities: ['Mumbai'],
    knownPayees: [],
    knownSenders: []
  };

  const vData = velocity || velocityData;
  const factors = [];
  let ruleScore = 0;

  // 1. AMOUNT ANOMALY SCORING (Calibrated to avoid false critical blocks on routine amounts)
  const amount = Number(transaction.amount) || 0;

  if (isDeposit) {
    // Inbound Deposit Evaluation
    const avgDeposit = baseline.averageDeposit || (baseline.averageAmount ? baseline.averageAmount * 4 : 25000);
    const depositRatio = amount / (avgDeposit || 1);

    if (amount >= 2000000 && depositRatio >= 10.0) {
      // Massive deposit surge: e.g. ₹25,00,000 when average is ₹25,000 (100x average)
      ruleScore += 50;
      factors.push({
        factor: 'Extreme High-Value Inbound Surge',
        contribution: 50,
        explanation: `Inbound credit of ₹${amount.toLocaleString('en-IN')} is ${depositRatio.toFixed(1)}x customer's normal deposit baseline (₹${avgDeposit.toLocaleString('en-IN')}).`
      });
    } else if (amount >= 500000 && depositRatio >= 5.0) {
      ruleScore += 35;
      factors.push({
        factor: 'High-Value Inbound Deposit Surge',
        contribution: 35,
        explanation: `Inbound credit of ₹${amount.toLocaleString('en-IN')} substantially exceeds typical deposit profile (${depositRatio.toFixed(1)}x normal).`
      });
    } else if (amount >= 100000 && depositRatio >= 2.5) {
      ruleScore += 20;
      factors.push({
        factor: 'Elevated Inbound Deposit',
        contribution: 20,
        explanation: `Deposit amount of ₹${amount.toLocaleString('en-IN')} is higher than customer average credit.`
      });
    }

    // Structuring / Smurfing pattern check near ₹50,000 PMLA statutory threshold
    if (vData.recentDeposits >= 3 && amount >= 40000 && amount <= 49999) {
      ruleScore += 35;
      factors.push({
        factor: 'Rapid Inbound Smurfing / Structuring Pattern',
        contribution: 35,
        explanation: 'Rapid series of deposits just below the ₹50,000 statutory compliance reporting threshold.'
      });
    }
  } else {
    // Outbound Transfer Evaluation
    const avgSpend = baseline.averageAmount || 5000;
    const spendRatio = amount / (avgSpend || 1);

    if (amount >= 200000 && spendRatio >= 10.0) {
      ruleScore += 45;
      factors.push({
        factor: 'Critical Outbound Amount Surge',
        contribution: 45,
        explanation: `Transfer amount ₹${amount.toLocaleString('en-IN')} is ${spendRatio.toFixed(1)}x above typical customer spend.`
      });
    } else if (amount >= 50000 && spendRatio >= 5.0) {
      ruleScore += 30;
      factors.push({
        factor: 'High Outbound Amount Surge',
        contribution: 30,
        explanation: `Transfer amount ₹${amount.toLocaleString('en-IN')} significantly exceeds normal customer average.`
      });
    } else if (amount > 10000 && spendRatio >= 2.0) {
      const isPayeeKnown = (baseline.knownPayees && baseline.knownPayees.includes(payee?.accountNumber)) || payee?.isNew === false;
      const amountPenalty = isPayeeKnown ? 10 : 20;
      ruleScore += amountPenalty;
      factors.push({
        factor: 'Moderate Amount Deviation',
        contribution: amountPenalty,
        explanation: `Transfer amount ₹${amount.toLocaleString('en-IN')} is ${spendRatio.toFixed(1)}x above customer baseline average spend (₹${avgSpend.toLocaleString('en-IN')}).`
      });
    }
  }

  // 2. COUNTERPARTY TRUST & REPUTATION (Payee for outgoing, Sender for incoming)
  if (isDeposit) {
    const senderObj = sender || transaction.sender || transaction.payee || {};
    const senderAcc = senderObj.accountNumber || '';
    const isKnownSender = (baseline.knownSenders && baseline.knownSenders.includes(senderAcc)) ||
      senderObj.isVerified === true ||
      senderObj.isKnown === true;

    if (!isKnownSender) {
      if (amount >= 500000) {
        ruleScore += 25;
        factors.push({
          factor: 'Unverified High-Value Remitter',
          contribution: 25,
          explanation: `Remitter '${senderObj.name || 'Unknown'}' has no established credit history or verified business relationship.`
        });
      } else if (amount >= 50000) {
        ruleScore += 15;
        factors.push({
          factor: 'Unverified Remitter',
          contribution: 15,
          explanation: `Remitter '${senderObj.name || 'Unknown'}' has no prior transaction history with this account.`
        });
      }
    }
  } else {
    const payeeObj = payee || transaction.payee || {};
    const isKnownPayee = (baseline.knownPayees && baseline.knownPayees.includes(payeeObj.accountNumber)) ||
      payeeObj.isNew === false;

    if (!isKnownPayee && payeeObj.isNew !== false) {
      ruleScore += 25;
      factors.push({
        factor: 'Unverified New Payee',
        contribution: 25,
        explanation: `Transfer recipient '${payeeObj.name || 'Payee'}' has no established prior transaction history.`
      });
    }
  }

  // 3. VELOCITY CHECKS
  if (vData.count10m >= 3) {
    ruleScore += 25;
    factors.push({
      factor: 'High Transaction Velocity',
      contribution: 25,
      explanation: `${vData.count10m} transactions initiated within the last 10 minutes.`
    });
  }

  // 4. DEVICE & CHANNEL ANOMALIES
  if (transaction.device && transaction.device.isKnown === false) {
    ruleScore += 15;
    factors.push({
      factor: 'Unrecognized Device Signature',
      contribution: 15,
      explanation: `Transaction originated from unregistered device signature (${transaction.device.deviceId || 'Unknown Device'}).`
    });
  }

  // 5. GEOGRAPHICAL LOCATION ANOMALY
  if (transaction.location?.city && baseline.usualCities && !baseline.usualCities.includes(transaction.location.city)) {
    ruleScore += 15;
    factors.push({
      factor: 'Unusual Geographical Location',
      contribution: 15,
      explanation: `Location '${transaction.location.city}' differs from customer usual operation areas (${baseline.usualCities.join(', ')}).`
    });
  }

  ruleScore = Math.min(100, ruleScore);

  // 6. MACHINE LEARNING ANOMALY MODELS: TF.js Autoencoder + Isolation Forest
  const featureVec = extractFeatureVector({
    amount: transaction.amount,
    type: transaction.type,
    direction: isDeposit ? 'inbound' : 'outbound',
    velocity10m: vData.count10m || 0,
    velocity1h: vData.count1h || 0,
    velocity24h: vData.count24h || 0,
    payee: transaction.payee,
    sender: transaction.sender || transaction.payee,
    device: transaction.device,
    location: transaction.location,
    timestamp: transaction.timestamp
  }, baseline);

  let autoencoderResult = { score: 20, mse: 0.02 };
  try {
    autoencoderResult = await calculateReconstructionError(featureVec);
  } catch (mlErr) {
    console.warn('[RiskFusionEngine] Autoencoder scoring fallback applied:', mlErr.message);
  }

  if (!isoForestTrained && customer?.historicTxs) {
    trainIsolationForestOnBaseline(customer.historicTxs);
  }
  const isoScore = isoForest.predictScore([
    transaction.amount,
    isDeposit ? (transaction.sender?.isVerified ? 0 : 1) : (transaction.payee?.isNew ? 1 : 0),
    transaction.device?.isKnown === false ? 1 : 0
  ]);

  const mlScore = Math.round(autoencoderResult.score * 0.6 + isoScore * 0.4);

  // Blended Anomaly Score: Ensure deterministic policy signals are not diluted by uncalibrated ML
  let transactionAnomalyScore = 0;
  if (mlScore > ruleScore) {
    transactionAnomalyScore = Math.round(ruleScore * 0.4 + mlScore * 0.6);
  } else {
    transactionAnomalyScore = Math.max(ruleScore, Math.round(ruleScore * 0.75 + mlScore * 0.25));
  }

  if (autoencoderResult.score > 55) {
    factors.push({
      factor: 'Neural Autoencoder Anomaly Signal',
      contribution: Math.round(autoencoderResult.score * 0.3),
      explanation: `TensorFlow.js neural autoencoder detected multidimensional pattern divergence.`
    });
  }

const BUILTIN_BLACKLIST_IDENTIFIERS = new Set([
  '998877665544',
  '112233445566',
  '556677889900',
  '+919876500111',
  '+919876500222',
  '+919876500333',
  '9876500111',
  '9876500222',
  '9876500333',
  'support@sbi-fraud-desk.com',
  'alert@kyc-verification-help.org',
  'verify-sbi-bank-login.com',
  'hdfc-secure-update-kyc.net',
  'icici-bonus-reward-points.info',
  'axis-netbanking-portal.org',
  '185.220.101.4',
  '198.51.100.42'
]);

const THREAT_KEYWORDS = ['darkweb', 'mule', 'cashout', 'scam', 'fraud', 'phishing', 'hacker'];

  // 7. MANDATORY SECURITY OVERRIDE: BLACKLIST MULE / THREAT CHECK
  let hardRuleOverride = false;
  
  // Extract all candidate values across accounts, phones, emails, names, and devices
  const candidateValues = [];
  const addCandidate = (val) => {
    if (val === undefined || val === null) return;
    const trimmed = String(val).trim();
    if (!trimmed) return;
    candidateValues.push(trimmed.toLowerCase());
    // Strip formatting (spaces, dashes, parens)
    const stripped = trimmed.replace(/[\s\-\(\)]/g, '').toLowerCase();
    if (stripped !== trimmed.toLowerCase()) {
      candidateValues.push(stripped);
    }
    // Handle Indian phone prefix +91
    if (stripped.startsWith('+91')) {
      candidateValues.push(stripped.slice(3));
    }
  };

  if (transaction.sender?.accountNumber) addCandidate(transaction.sender.accountNumber);
  if (transaction.payee?.accountNumber) addCandidate(transaction.payee.accountNumber);
  if (transaction.sender?.phone) addCandidate(transaction.sender.phone);
  if (transaction.payee?.phone) addCandidate(transaction.payee.phone);
  if (transaction.sender?.email) addCandidate(transaction.sender.email);
  if (transaction.payee?.email) addCandidate(transaction.payee.email);
  if (customer?.phone) addCandidate(customer.phone);
  if (customer?.accountNumber) addCandidate(customer.accountNumber);
  if (transaction.device?.ipAddress) addCandidate(transaction.device.ipAddress);
  if (transaction.device?.deviceId) addCandidate(transaction.device.deviceId);

  const distinctNormalized = [...new Set(candidateValues)];

  // 1. Check built-in threat set
  let matchedThreatIdentifier = distinctNormalized.find(val => BUILTIN_BLACKLIST_IDENTIFIERS.has(val));
  
  // 2. Check threat keywords in participant names or descriptions
  const allNames = [
    transaction.sender?.name,
    transaction.payee?.name,
    transaction.description
  ].filter(Boolean).map(n => String(n).toLowerCase());

  const matchedKeyword = THREAT_KEYWORDS.find(kw => allNames.some(name => name.includes(kw)));

  // 3. Check MongoDB Blacklist collection
  let blacklistedFromDb = null;
  if (distinctNormalized.length > 0) {
    try {
      blacklistedFromDb = await Blacklist.findOne({
        $or: [
          { normalizedValue: { $in: distinctNormalized } },
          { value: { $in: distinctNormalized } }
        ],
        active: { $ne: false }
      });
    } catch (dbErr) {
      console.error('Error querying Blacklist DB in risk fusion:', dbErr.message);
    }
  }

  if (blacklistedFromDb || matchedThreatIdentifier || matchedKeyword) {
    hardRuleOverride = true;
    const threatName = blacklistedFromDb?.value || matchedThreatIdentifier || (matchedKeyword ? `Flagged Pattern (${matchedKeyword})` : 'Mule Counterparty');
    const threatCat = blacklistedFromDb?.category || (matchedKeyword ? 'DarkWeb Mule Account Pattern' : 'Known Mule Account');

    factors.unshift({
      factor: 'Blacklisted Mule Threat Entity',
      contribution: 100,
      score: 100,
      explanation: `CRITICAL FRAUD THREAT: Counterparty entity '${threatName}' is matched on active blacklist / darkweb threat registry (${threatCat}). Mandatory security block enforced.`
    });
  }

  // 8. FINAL SCORE CALIBRATION & THRESHOLD MAPPING
  let finalScore = transactionAnomalyScore;
  if (hardRuleOverride) {
    finalScore = 98; // Mandatory security override forces critical risk
  }

  // Load configurable thresholds from SystemConfig (or fallback to defaults)
  let thresholds = { lowMax: 39, mediumMax: 69 };
  try {
    const cfg = await SystemConfig.findOne({ key: 'riskThresholds' }).lean();
    if (cfg && cfg.value) {
      thresholds = { ...thresholds, ...cfg.value };
    }
  } catch (cfgErr) {
    // Use defaults
  }

  let riskLevel = 'low';
  let predictionResult = 'approve';

  if (finalScore >= 85 || hardRuleOverride) {
    riskLevel = 'critical';
    predictionResult = 'block';
  } else if (finalScore > thresholds.mediumMax) {
    riskLevel = 'high';
    // For inbound, high risk = compliance hold for review (funds NOT credited)
    // For outbound, high risk = step-up auth or manual review
    predictionResult = isDeposit ? 'review' : 'stepUpAuth';
  } else if (finalScore > thresholds.lowMax) {
    riskLevel = 'medium';
    // Outbound medium = step-up OTP challenge; Inbound medium = approve if low anomaly or review
    predictionResult = isDeposit ? 'approve' : 'stepUpAuth';
  } else {
    riskLevel = 'low';
    predictionResult = 'approve';
  }

  // Normalize riskLevel to 'low', 'medium', 'high' for schema compatibility where needed
  const normalizedRiskLevel = (riskLevel === 'critical' || hardRuleOverride) ? 'high' : riskLevel;

  // Sort top factors descending by contribution
  factors.sort((a, b) => b.contribution - a.contribution);

  const processingMs = Date.now() - startTime;

  return {
    aiScore: finalScore,
    riskLevel: normalizedRiskLevel,
    rawRiskLevel: riskLevel,
    predictionResult,
    hardRuleOverride,
    componentScores: {
      transaction: transactionAnomalyScore,
      deepfake: null,
      voice: null,
      phishing: null,
      socialEngineering: null,
      identity: null
    },
    topFactors: factors,
    recommendations: (riskLevel === 'critical' || hardRuleOverride)
      ? ['Transaction auto-blocked due to critical threat indicators', 'Fraud alert dispatched to analyst queue']
      : normalizedRiskLevel === 'high'
      ? [
          isDeposit
            ? 'Inbound funds held for compliance and source-of-wealth AML review'
            : 'Outbound payment flagged high-risk; require enhanced step-up verification'
        ]
      : normalizedRiskLevel === 'medium'
      ? [
          isDeposit
            ? 'Inbound payment approved with standard monitoring'
            : 'Step-up two-factor OTP verification required'
        ]
      : ['Transaction approved cleanly'],
    processingMs
  };
}

module.exports = {
  evaluateTransactionRisk
};
