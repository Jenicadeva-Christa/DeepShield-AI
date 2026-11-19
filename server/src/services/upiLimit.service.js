const Transaction = require('../models/transactions.model');
const SystemConfig = require('../models/systemconfigs.model');

// Default NPCI simulation policies
const DEFAULT_UPI_LIMITS = {
  p2p: {
    perTransactionLimit: 100000,
    dailyCumulativeLimit: 100000,
    rollingWindowHours: 24,
    description: 'Standard Person-to-Person (P2P) Outgoing UPI Limit'
  },
  verifiedMerchant: {
    perTransactionLimit: 200000,
    dailyCumulativeLimit: 500000,
    rollingWindowHours: 24,
    description: 'Verified Merchant (P2M) Outgoing UPI Limit'
  },
  inbound: {
    standardCredit: {
      perTransactionLimit: 200000,
      dailyCumulativeLimit: 500000,
      rollingWindowHours: 24,
      description: 'Project Inbound UPI Credit Limit (Simulation Rule)'
    },
    p2pCredit: {
      perTransactionLimit: 100000,
      dailyCumulativeLimit: 200000,
      rollingWindowHours: 24,
      description: 'Inbound P2P Transfer Credit Limit'
    }
  }
};

// In-process Per-User Mutex for preventing concurrent request race conditions
class UserLockQueue {
  constructor() {
    this.activeLocks = new Map();
  }

  async acquire(key) {
    while (this.activeLocks.has(key)) {
      await this.activeLocks.get(key);
    }
    let resolveLock;
    const lockPromise = new Promise((resolve) => {
      resolveLock = resolve;
    });
    this.activeLocks.set(key, lockPromise);
    return () => {
      this.activeLocks.delete(key);
      resolveLock();
    };
  }

  async runWithLock(key, fn) {
    const release = await this.acquire(key.toString());
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

const userLockQueue = new UserLockQueue();

/**
 * Fetch dynamic UPI limit configs from SystemConfig (or fallback to defaults)
 */
async function getUpiConfig() {
  try {
    const cfg = await SystemConfig.findOne({ key: 'upiLimits' }).lean();
    if (cfg && cfg.value) {
      return {
        p2p: { ...DEFAULT_UPI_LIMITS.p2p, ...cfg.value.p2p },
        verifiedMerchant: { ...DEFAULT_UPI_LIMITS.verifiedMerchant, ...cfg.value.verifiedMerchant },
        inbound: {
          standardCredit: {
            ...DEFAULT_UPI_LIMITS.inbound.standardCredit,
            ...(cfg.value.inbound && cfg.value.inbound.standardCredit)
          },
          p2pCredit: {
            ...DEFAULT_UPI_LIMITS.inbound.p2pCredit,
            ...(cfg.value.inbound && cfg.value.inbound.p2pCredit)
          }
        }
      };
    }
  } catch (err) {
    console.warn('[upiLimit.service] Unable to load config from DB, using defaults:', err.message);
  }
  return DEFAULT_UPI_LIMITS;
}

/**
 * Determine outbound policy category
 */
function resolveOutboundCategory(payee = {}, explicitCategory) {
  if (
    explicitCategory === 'verifiedMerchant' ||
    explicitCategory === 'merchant' ||
    payee.category === 'verifiedMerchant' ||
    payee.category === 'merchant' ||
    payee.isMerchant === true
  ) {
    return 'verifiedMerchant';
  }
  return 'p2p';
}

/**
 * Query MongoDB for successful outgoing UPI payments in the rolling window
 */
async function getRolling24hOutgoingTotal({ customerId, userId, rollingWindowHours = 24 }) {
  const windowStart = new Date(Date.now() - rollingWindowHours * 60 * 60 * 1000);

  const query = {
    $and: [
      {
        $or: [
          ...(customerId ? [{ customerId }] : []),
          ...(userId ? [{ userId }] : [])
        ]
      },
      {
        $or: [{ type: 'upi' }, { channel: 'upi' }]
      },
      {
        type: { $ne: 'deposit' }
      },
      {
        // Successful payments only; blocked, rejected, failed, pending are excluded
        status: { $in: ['approved', 'completed'] }
      },
      {
        timestamp: { $gte: windowStart }
      }
    ]
  };

  const successfulTx = await Transaction.find(query).select('amount timestamp status');
  const amountUsed = successfulTx.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

  return {
    amountUsed,
    count: successfulTx.length,
    windowStart
  };
}

/**
 * Query MongoDB for successful inbound UPI credits in the rolling window
 */
async function getRolling24hIncomingTotal({ customerId, userId, rollingWindowHours = 24 }) {
  const windowStart = new Date(Date.now() - rollingWindowHours * 60 * 60 * 1000);

  const query = {
    $and: [
      {
        $or: [
          ...(customerId ? [{ customerId }] : []),
          ...(userId ? [{ userId }] : [])
        ]
      },
      {
        type: 'deposit'
      },
      {
        $or: [{ type: 'upi' }, { channel: 'upi' }]
      },
      {
        status: { $in: ['approved', 'completed'] }
      },
      {
        timestamp: { $gte: windowStart }
      }
    ]
  };

  const successfulCredits = await Transaction.find(query).select('amount timestamp status');
  const amountReceived = successfulCredits.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

  return {
    amountReceived,
    count: successfulCredits.length,
    windowStart
  };
}

/**
 * Validate an outgoing UPI transaction against per-transaction and rolling cumulative limits
 */
async function validateOutgoingUpi({ customerId, userId, amount, payee, category }) {
  const numAmount = Number(amount);
  if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
    return {
      valid: false,
      code: 'INVALID_AMOUNT',
      message: 'Transaction amount must be a positive, valid number.'
    };
  }

  const configs = await getUpiConfig();
  const selectedCategory = resolveOutboundCategory(payee, category);
  const policy = configs[selectedCategory] || configs.p2p;

  // 1. Per-transaction limit check
  if (numAmount > policy.perTransactionLimit) {
    return {
      valid: false,
      code: 'UPI_PER_TRANSACTION_LIMIT_EXCEEDED',
      message: `UPI per-transaction limit exceeded. The maximum allowed per transaction for ${selectedCategory === 'verifiedMerchant' ? 'Verified Merchant payments' : 'Standard P2P UPI'} is ₹${policy.perTransactionLimit.toLocaleString('en-IN')}, but requested ₹${numAmount.toLocaleString('en-IN')}.`,
      details: {
        category: selectedCategory,
        requestedAmount: numAmount,
        perTransactionLimit: policy.perTransactionLimit,
        dailyCumulativeLimit: policy.dailyCumulativeLimit
      }
    };
  }

  // 2. Cumulative rolling 24-hour limit check
  const { amountUsed, count, windowStart } = await getRolling24hOutgoingTotal({
    customerId,
    userId,
    rollingWindowHours: policy.rollingWindowHours
  });

  const remainingDailyLimit = Math.max(0, policy.dailyCumulativeLimit - amountUsed);

  if (amountUsed + numAmount > policy.dailyCumulativeLimit) {
    return {
      valid: false,
      code: 'UPI_DAILY_LIMIT_EXCEEDED',
      message: `UPI daily cumulative limit exceeded. You have already used ₹${amountUsed.toLocaleString('en-IN')} of your ₹${policy.dailyCumulativeLimit.toLocaleString('en-IN')} rolling 24-hour limit across your linked account(s). Remaining limit is ₹${remainingDailyLimit.toLocaleString('en-IN')}, but requested ₹${numAmount.toLocaleString('en-IN')}.`,
      details: {
        category: selectedCategory,
        requestedAmount: numAmount,
        amountUsed24h: amountUsed,
        dailyCumulativeLimit: policy.dailyCumulativeLimit,
        remainingDailyLimit,
        windowStart
      }
    };
  }

  return {
    valid: true,
    category: selectedCategory,
    policy,
    amountUsed24h: amountUsed,
    remainingLimit: remainingDailyLimit - numAmount,
    windowStart
  };
}

/**
 * Validate an inbound UPI credit against category-specific configurable rules
 */
async function validateIncomingUpi({ customerId, userId, amount, category = 'standardCredit' }) {
  const numAmount = Number(amount);
  if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
    return {
      valid: false,
      code: 'INVALID_AMOUNT',
      message: 'Incoming credit amount must be a positive, valid number.'
    };
  }

  const configs = await getUpiConfig();
  const inboundPolicy = (configs.inbound && configs.inbound[category]) || configs.inbound.standardCredit;

  // 1. Inbound Per-Transaction Check
  if (numAmount > inboundPolicy.perTransactionLimit) {
    return {
      valid: false,
      code: 'UPI_INBOUND_PER_TRANSACTION_LIMIT_EXCEEDED',
      message: `Incoming UPI credit exceeds per-transaction inbound credit limit of ₹${inboundPolicy.perTransactionLimit.toLocaleString('en-IN')}. (Requested credit: ₹${numAmount.toLocaleString('en-IN')}).`,
      details: {
        category,
        requestedAmount: numAmount,
        perTransactionLimit: inboundPolicy.perTransactionLimit,
        dailyCumulativeLimit: inboundPolicy.dailyCumulativeLimit
      }
    };
  }

  // 2. Inbound Cumulative 24-hour Rolling Check
  const { amountReceived, count, windowStart } = await getRolling24hIncomingTotal({
    customerId,
    userId,
    rollingWindowHours: inboundPolicy.rollingWindowHours
  });

  const remainingInboundLimit = Math.max(0, inboundPolicy.dailyCumulativeLimit - amountReceived);

  if (amountReceived + numAmount > inboundPolicy.dailyCumulativeLimit) {
    return {
      valid: false,
      code: 'UPI_INBOUND_DAILY_LIMIT_EXCEEDED',
      message: `Incoming UPI credit exceeds rolling 24-hour inbound credit limit of ₹${inboundPolicy.dailyCumulativeLimit.toLocaleString('en-IN')}. Already received: ₹${amountReceived.toLocaleString('en-IN')}. Remaining allowed: ₹${remainingInboundLimit.toLocaleString('en-IN')}.`,
      details: {
        category,
        requestedAmount: numAmount,
        amountReceived24h: amountReceived,
        dailyCumulativeLimit: inboundPolicy.dailyCumulativeLimit,
        remainingInboundLimit,
        windowStart
      }
    };
  }

  return {
    valid: true,
    category,
    policy: inboundPolicy,
    amountReceived24h: amountReceived,
    remainingInboundLimit: remainingInboundLimit - numAmount,
    windowStart
  };
}

/**
 * Full summary of UPI limits for Customer UI
 */
async function getUpiLimitsSummary({ customerId, userId, category = 'p2p' }) {
  const configs = await getUpiConfig();
  const selectedCategory = resolveOutboundCategory({}, category);
  const outboundPolicy = configs[selectedCategory] || configs.p2p;

  const { amountUsed, count: outCount, windowStart } = await getRolling24hOutgoingTotal({
    customerId,
    userId,
    rollingWindowHours: outboundPolicy.rollingWindowHours
  });

  const inboundPolicy = configs.inbound.standardCredit;
  const { amountReceived, count: inCount } = await getRolling24hIncomingTotal({
    customerId,
    userId,
    rollingWindowHours: inboundPolicy.rollingWindowHours
  });

  return {
    category: selectedCategory,
    perTransactionLimit: outboundPolicy.perTransactionLimit,
    dailyCumulativeLimit: outboundPolicy.dailyCumulativeLimit,
    rollingWindowHours: outboundPolicy.rollingWindowHours,
    amountUsed24h: amountUsed,
    remainingLimit: Math.max(0, outboundPolicy.dailyCumulativeLimit - amountUsed),
    outgoingCount24h: outCount,
    windowStart,
    inboundLimits: {
      category: 'standardCredit',
      perTransactionLimit: inboundPolicy.perTransactionLimit,
      dailyCumulativeLimit: inboundPolicy.dailyCumulativeLimit,
      amountReceived24h: amountReceived,
      remainingInboundLimit: Math.max(0, inboundPolicy.dailyCumulativeLimit - amountReceived),
      inboundCount24h: inCount,
      policyNote: 'Project simulation inbound policy; configurable by bank rule.'
    }
  };
}

module.exports = {
  DEFAULT_UPI_LIMITS,
  userLockQueue,
  getUpiConfig,
  resolveOutboundCategory,
  getRolling24hOutgoingTotal,
  getRolling24hIncomingTotal,
  validateOutgoingUpi,
  validateIncomingUpi,
  getUpiLimitsSummary
};
