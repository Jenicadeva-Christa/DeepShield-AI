const Transaction = require('../models/transactions.model');
const Customer = require('../models/customers.model');
const RiskAssessment = require('../models/riskassessments.model');
const FraudAlert = require('../models/fraudalerts.model');
const Notification = require('../models/notifications.model');
const Otp = require('../models/otps.model');
const Blacklist = require('../models/blacklists.model');
const User = require('../models/users.model');
const mockBankCore = require('../services/mockBankCore.service');
const emailService = require('../services/email.service');
const { isPredefinedDemoUser } = require('../utils/demoAccounts.utils');
const { evaluateTransactionRisk } = require('../engine/riskFusion.engine');
const { createAuditEntry } = require('../middleware/audit.middleware');
const { generateOTPCode, hashSHA256 } = require('../utils/crypto.utils');
const upiLimitService = require('../services/upiLimit.service');
const { userLockQueue } = upiLimitService;

// 1. Initiate & Process Outbound Transfer / Payment
exports.createTransaction = async (req, res, next) => {
  try {
    const userId = req.user._id;

    return await userLockQueue.runWithLock(userId, async () => {
      const customer = await Customer.findOne({ userId });
      if (!customer) {
        return res.status(404).json({ success: false, message: 'Customer profile not found.' });
      }

      const { type = 'transfer', amount, payee, location, device, channel = 'web', description, idempotencyKey } = req.body;

      const numAmount = Number(amount);
      if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ success: false, code: 'INVALID_AMOUNT', message: 'Valid transaction amount is required.' });
      }

      // 1. UPI Limit Validation (Strict NPCI P2P and category-specific rules)
      const isUpi = type === 'upi' || channel === 'upi';
      if (isUpi) {
        const limitCheck = await upiLimitService.validateOutgoingUpi({
          customerId: customer._id,
          userId,
          amount: numAmount,
          payee,
          category: req.body.category || payee?.category
        });

        if (!limitCheck.valid) {
          await createAuditEntry({
            userId,
            action: 'TRANSACTION_LIMIT_REJECTED',
            entity: 'Transaction',
            details: {
              amount: numAmount,
              payee: payee?.name,
              category: limitCheck.details?.category,
              code: limitCheck.code,
              reason: limitCheck.message
            },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
          });

          return res.status(400).json({
            success: false,
            code: limitCheck.code,
            message: limitCheck.message,
            data: limitCheck.details
          });
        }
      }

      // Check account balance
      if (customer.balance < numAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient funds. Current balance: ₹${customer.balance.toLocaleString('en-IN')}`
        });
      }

      // Velocity checks
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const count10m = await Transaction.countDocuments({ customerId: customer._id, timestamp: { $gte: tenMinsAgo } });
      const count1h = await Transaction.countDocuments({ customerId: customer._id, timestamp: { $gte: oneHourAgo } });
      const count24h = await Transaction.countDocuments({ customerId: customer._id, timestamp: { $gte: twentyFourHoursAgo } });

      // Initial Transaction record
      const transaction = new Transaction({
        customerId: customer._id,
        userId,
        type,
        amount: numAmount,
        currency: 'INR',
        channel,
        idempotencyKey,
        description: description || `Transfer to ${payee?.name || 'Recipient'}`,
        payee: payee || { name: 'Recipient', accountNumber: '3009999999', bank: 'HDFC', isNew: true },
        location: location || { city: 'Mumbai', country: 'India' },
        device: device || { deviceId: 'DEV-WEB-CHIP', ipAddress: req.ip, userAgent: req.get('User-Agent'), isKnown: true },
        timestamp: new Date(),
        status: 'initiated'
      });

      // 2. Evaluate Risk with AI Engine (Unified Risk Assessment Pipeline)
      const riskEval = await evaluateTransactionRisk({
        transaction: transaction.toObject(),
        customer,
        customerBaseline: customer.baseline,
        velocity: { count10m, count1h, count24h },
        velocityData: { count10m, count1h, count24h },
        direction: 'outbound',
        payee: transaction.payee
      });

      const evaluatedScore = riskEval.aiScore !== undefined ? riskEval.aiScore : (riskEval.riskScore || 0);

      // Create RiskAssessment Record matching schema
      const predictionResult = riskEval.predictionResult || (
        riskEval.riskLevel === 'low' ? 'approve' : riskEval.riskLevel === 'medium' ? 'stepUpAuth' : 'block'
      );

      const riskAssessment = await RiskAssessment.create({
        subjectType: 'transaction',
        transactionId: transaction._id,
        userId,
        aiScore: evaluatedScore,
        riskLevel: riskEval.riskLevel,
        predictionResult,
        componentScores: riskEval.componentScores,
        topFactors: riskEval.topFactors
      });

      transaction.riskAssessmentId = riskAssessment._id;
      transaction.riskLevel = riskEval.riskLevel;

      // --- ACTIVITY DIAGRAM DECISION BRANCH ---
      let fraudAlert = null;
      let devOtp = null;

      if (predictionResult === 'approve' || riskEval.riskLevel === 'low') {
        // 1. AUTO-APPROVE: Atomic balance debit
        const updatedCustomer = await Customer.findOneAndUpdate(
          { _id: customer._id, balance: { $gte: numAmount } },
          { $inc: { balance: -numAmount } },
          { new: true }
        );

        if (!updatedCustomer) {
          transaction.status = 'rejected';
          await transaction.save();
          return res.status(400).json({ success: false, message: 'Insufficient funds for transfer.' });
        }

        transaction.status = 'approved';
        await transaction.save();

        // Create Audit Log
        await createAuditEntry({
          userId,
          action: 'TRANSACTION_APPROVED',
          entity: 'Transaction',
          entityId: transaction._id.toString(),
          details: { amount: numAmount, payee: transaction.payee?.name, riskScore: evaluatedScore },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

      } else if (predictionResult === 'stepUpAuth' || riskEval.riskLevel === 'medium') {
        // 2. STEP-UP AUTHENTICATION (OTP)
        transaction.status = 'pendingStepUp';
        transaction.stepUp = { required: true, verified: false, attempts: 0 };
        await transaction.save();

        // Invalidate older unconsumed step-up OTPs for this transaction
        await Otp.updateMany(
          { userId, purpose: 'transactionStepUp', relatedTransactionId: transaction._id, consumed: false },
          { consumed: true }
        );

        // Generate 6-digit Step-Up OTP
        const rawOtp = generateOTPCode();
        const otpHash = hashSHA256(rawOtp);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

        await Otp.create({
          userId,
          purpose: 'transactionStepUp',
          relatedTransactionId: transaction._id,
          codeHash: otpHash,
          expiresAt
        });

        const currentUser = await User.findById(userId);
        const isDemo = isPredefinedDemoUser(currentUser);

        if (isDemo) {
          // Predefined Demo Accounts: Display generated OTP in terminal for demonstration purposes
          console.log(`\n======================================================`);
          console.log(`[DEMO ACCOUNT TRANSACTION STEP-UP] User: ${currentUser.email}`);
          console.log(`Transaction ID: #${transaction._id} | Amount: ₹${numAmount.toLocaleString('en-IN')}`);
          console.log(`[STEP-UP OTP CODE]: ${rawOtp} (Valid for 5 minutes)`);
          console.log(`======================================================\n`);
        } else {
          // Normal Users: Send transaction verification OTP via Gmail SMTP; do not log OTP
          console.log(`\n[STEP-UP OTP DISPATCHED] Transaction #${transaction._id} | Sent to ${emailService.maskEmail(currentUser.email)}\n`);
          try {
            await emailService.sendOtpEmail({
              to: currentUser.email,
              otpCode: rawOtp,
              purpose: 'transactionStepUp',
              userFullName: currentUser.fullName,
              expiryMinutes: 5
            });
          } catch (mailErr) {
            if (process.env.NODE_ENV === 'test') {
              console.warn(`[Email Service Notice in Test]: ${mailErr.message}`);
            } else {
              transaction.status = 'rejected';
              await transaction.save();
              return res.status(500).json({
                success: false,
                message: 'Failed to deliver transaction verification code to your email. Transfer halted.'
              });
            }
          }
        }

        if (process.env.NODE_ENV === 'test') {
          devOtp = rawOtp;
        }

        await createAuditEntry({
          userId,
          action: 'TRANSACTION_STEPUP_CHALLENGED',
          entity: 'Transaction',
          entityId: transaction._id.toString(),
          details: { riskScore: evaluatedScore, topFactors: riskEval.topFactors, isDemoAccount: isDemo },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

      } else {
        // 3. CRITICAL / HIGH THREAT -> AUTO-BLOCK & RAISE FRAUD ALERT
        transaction.status = 'blocked';
        await transaction.save();

        const countAlerts = await FraudAlert.countDocuments();
        const alertNumber = `FA-${new Date().getFullYear()}-${(countAlerts + 1).toString().padStart(6, '0')}`;

        fraudAlert = await FraudAlert.create({
          alertNumber,
          transactionId: transaction._id,
          riskAssessmentId: riskAssessment._id,
          userId,
          alertType: 'transactionFraud',
          severity: 'high',
          riskScore: evaluatedScore,
          status: 'open',
          summary: `High-risk transaction of ₹${numAmount.toLocaleString('en-IN')} auto-blocked. Factors: ${riskEval.topFactors.map(f => f.factor).join(', ')}`
        });

        await createAuditEntry({
          userId,
          action: 'TRANSACTION_BLOCKED_FRAUD',
          entity: 'Transaction',
          entityId: transaction._id.toString(),
          details: { riskScore: evaluatedScore, alertNumber, topFactors: riskEval.topFactors },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        // Notify customer
        await Notification.create({
          userId,
          alertId: fraudAlert._id,
          transactionId: transaction._id,
          type: 'fraudAlert',
          title: 'Transaction Blocked — Security Alert',
          message: `Your transfer of ₹${numAmount.toLocaleString('en-IN')} to ${transaction.payee?.name} was auto-blocked due to high risk indicators.`
        });
      }

      return res.status(200).json({
        success: true,
        message: transaction.status === 'approved'
          ? 'Transaction approved and processed successfully.'
          : transaction.status === 'pendingStepUp'
          ? 'Step-up two-factor verification required to complete transfer.'
          : 'Transaction was blocked by DeepShield AI risk engine.',
        data: {
          transaction,
          riskAssessment,
          stepUpRequired: transaction.status === 'pendingStepUp',
          devOtp,
          fraudAlert
        }
      });
    });

  } catch (err) {
    next(err);
  }
};

// 2. Simulate Inbound / Receive Money Monitoring
exports.receiveTransaction = async (req, res, next) => {
  try {
    const userId = req.user._id;

    return await userLockQueue.runWithLock(userId, async () => {
      const customer = await Customer.findOne({ userId });
      if (!customer) {
        return res.status(404).json({ success: false, message: 'Customer profile not found.' });
      }

      const { amount, sender, channel = 'upi', description, idempotencyKey, category = 'standardCredit' } = req.body;

      const numAmount = Number(amount);
      if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ success: false, code: 'INVALID_AMOUNT', message: 'Valid credit amount is required.' });
      }

      // Inbound UPI Limit Validation (Configurable inbound simulation rules)
      const isInboundUpi = channel === 'upi' || req.body.type === 'upi';
      if (isInboundUpi) {
        const inboundLimitCheck = await upiLimitService.validateIncomingUpi({
          customerId: customer._id,
          userId,
          amount: numAmount,
          category
        });

        if (!inboundLimitCheck.valid) {
          await createAuditEntry({
            userId,
            action: 'INBOUND_TRANSACTION_LIMIT_REJECTED',
            entity: 'Transaction',
            details: {
              amount: numAmount,
              sender: sender?.name,
              category,
              code: inboundLimitCheck.code,
              reason: inboundLimitCheck.message
            },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
          });

          return res.status(400).json({
            success: false,
            code: inboundLimitCheck.code,
            message: inboundLimitCheck.message,
            data: inboundLimitCheck.details
          });
        }
      }

      const senderAcc = sender?.accountNumber || '998877665544';
      const senderName = sender?.name || 'Unknown Remitter';

      // Gather velocity context for inbound assessment
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentDeposits = await Transaction.countDocuments({
        customerId: customer._id,
        type: 'deposit',
        timestamp: { $gte: oneHourAgo }
      });
      const count10m = await Transaction.countDocuments({
        customerId: customer._id,
        timestamp: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
      });
      const count1h = await Transaction.countDocuments({
        customerId: customer._id,
        timestamp: { $gte: oneHourAgo }
      });
      const count24h = await Transaction.countDocuments({
        customerId: customer._id,
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      // Unified Risk Engine Evaluation for Inbound Credits
      const riskEval = await evaluateTransactionRisk({
        transaction: {
          amount: numAmount,
          type: 'deposit',
          channel,
          sender: {
            name: senderName,
            accountNumber: senderAcc,
            bank: sender?.bank,
            isVerified: sender?.isVerified,
            isKnown: sender?.isKnown
          },
          payee: { name: senderName, accountNumber: senderAcc, bank: sender?.bank },
          timestamp: new Date()
        },
        customer,
        customerBaseline: customer.baseline,
        velocity: { count10m, count1h, count24h, recentDeposits },
        velocityData: { count10m, count1h, count24h, recentDeposits },
        direction: 'inbound',
        sender: {
          name: senderName,
          accountNumber: senderAcc,
          bank: sender?.bank,
          isVerified: sender?.isVerified,
          isKnown: sender?.isKnown
        }
      });

      const evaluatedScore = riskEval.aiScore !== undefined ? riskEval.aiScore : (riskEval.riskScore || 0);
      const finalRiskLevel = riskEval.riskLevel;

      // Determine initial transaction status based on unified decision policy
      let initialStatus = 'approved';
      if (riskEval.predictionResult === 'block' || riskEval.hardRuleOverride) {
        initialStatus = 'blocked';
      } else if (riskEval.predictionResult === 'review' || finalRiskLevel === 'high') {
        initialStatus = 'underReview';
      } else {
        initialStatus = 'approved';
      }

      // Create Transaction
      const transaction = new Transaction({
        customerId: customer._id,
        userId,
        type: 'deposit',
        amount: numAmount,
        currency: 'INR',
        channel,
        idempotencyKey,
        description: description || `Inbound transfer from ${senderName}`,
        payee: { name: senderName, accountNumber: senderAcc, bank: sender?.bank || 'External Bank', isNew: true },
        location: { city: 'Mumbai', country: 'India' },
        device: { deviceId: 'DEV-INBOUND-GATEWAY', ipAddress: req.ip, userAgent: 'Banking-Core-Switch', isKnown: true },
        timestamp: new Date(),
        status: initialStatus,
        riskLevel: finalRiskLevel
      });
      await transaction.save();

      // Create and persist RiskAssessment
      const predictionResult = riskEval.predictionResult || (
        initialStatus === 'blocked' ? 'block' : initialStatus === 'underReview' ? 'review' : 'approve'
      );
      const riskAssessment = await RiskAssessment.create({
        subjectType: 'transaction',
        transactionId: transaction._id,
        userId,
        aiScore: evaluatedScore,
        riskLevel: finalRiskLevel,
        predictionResult,
        componentScores: riskEval.componentScores,
        topFactors: riskEval.topFactors
      });

      transaction.riskAssessmentId = riskAssessment._id;
      await transaction.save();

      let fraudAlert = null;

      if (initialStatus === 'blocked' || initialStatus === 'underReview') {
        // High risk / Critical or held for review: FUNDS ARE NEVER CREDITED TO BALANCE!
        const countAlerts = await FraudAlert.countDocuments();
        const alertNumber = `FA-${new Date().getFullYear()}-${(countAlerts + 1).toString().padStart(6, '0')}`;

        fraudAlert = await FraudAlert.create({
          alertNumber,
          transactionId: transaction._id,
          riskAssessmentId: riskAssessment._id,
          userId,
          alertType: 'transactionFraud',
          severity: riskEval.hardRuleOverride ? 'critical' : initialStatus === 'blocked' ? 'high' : 'high',
          riskScore: evaluatedScore,
          status: 'open',
          summary: initialStatus === 'blocked'
            ? `Critical inbound threat blocked: ₹${numAmount.toLocaleString('en-IN')} from ${senderName} (${senderAcc}).`
            : `High-value inbound transfer of ₹${numAmount.toLocaleString('en-IN')} from ${senderName} (${senderAcc}) placed on compliance hold. Factors: ${riskEval.topFactors.map(f => f.factor).join(', ')}`
        });

        await Notification.create({
          userId,
          alertId: fraudAlert._id,
          transactionId: transaction._id,
          type: 'fraudAlert',
          title: initialStatus === 'blocked' ? 'Incoming Funds Blocked' : 'Incoming Funds Placed on Security Hold',
          message: initialStatus === 'blocked'
            ? `An incoming transfer of ₹${numAmount.toLocaleString('en-IN')} from ${senderName} was blocked due to active threat indicators.`
            : `An incoming credit of ₹${numAmount.toLocaleString('en-IN')} from ${senderName} has been temporarily held for AML/Fraud verification. Funds have not been credited.`
        });

      } else {
        // Low risk clean deposit: Atomic balance credit
        const updatedCustomer = await Customer.findByIdAndUpdate(
          customer._id,
          { $inc: { balance: numAmount } },
          { new: true }
        );

        await Notification.create({
          userId,
          transactionId: transaction._id,
          type: 'systemUpdate',
          title: 'Funds Received Successfully',
          message: `Your account was credited with ₹${numAmount.toLocaleString('en-IN')} from ${senderName}.`
        });

        customer.balance = updatedCustomer.balance;
      }

      return res.status(200).json({
        success: true,
        message: initialStatus === 'underReview'
          ? 'Incoming transfer flagged for security review. Funds held pending AML verification.'
          : initialStatus === 'blocked'
          ? 'Incoming transfer blocked due to active threat indicators.'
          : `Successfully received ₹${numAmount.toLocaleString('en-IN')}. New balance: ₹${customer.balance.toLocaleString('en-IN')}`,
        data: {
          transaction,
          riskAssessment,
          riskScore: evaluatedScore,
          riskLevel: finalRiskLevel,
          indicators: riskEval.topFactors,
          fraudAlert,
          newBalance: customer.balance
        }
      });
    });

  } catch (err) {
    next(err);
  }
};

// 3. Verify Step-Up OTP
exports.stepUpTransaction = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const { otpCode } = req.body;
    const userId = req.user._id;

    return await userLockQueue.runWithLock(userId, async () => {
      const transaction = await Transaction.findById(transactionId);
      if (!transaction) {
        return res.status(404).json({ success: false, message: 'Transaction record not found.' });
      }

      if (transaction.status !== 'pendingStepUp') {
        return res.status(400).json({ success: false, message: `Transaction cannot be verified in current status: ${transaction.status}` });
      }

      // 1. Locate the active, unconsumed step-up OTP for this transaction
      const activeOtpRecord = await Otp.findOne({
        userId,
        purpose: 'transactionStepUp',
        relatedTransactionId: transaction._id,
        consumed: false
      }).sort({ createdAt: -1 });

      if (!activeOtpRecord) {
        return res.status(400).json({
          success: false,
          message: 'No pending verification code found for this transaction or code has already been consumed.'
        });
      }

      // 2. Enforce expiration (5 minutes)
      if (activeOtpRecord.expiresAt <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Step-up verification code has expired. Please initiate the transaction again.'
        });
      }

      // 3. Enforce maximum attempts (3 attempts)
      if (transaction.stepUp.attempts >= 3 || activeOtpRecord.attempts >= 3) {
        transaction.status = 'blocked';
        await transaction.save();
        return res.status(400).json({
          success: false,
          message: 'Maximum OTP verification attempts exceeded. Transaction blocked.'
        });
      }

      // 4. Validate OTP Hash
      const inputHash = hashSHA256(otpCode ? otpCode.toString().trim() : '');
      if (inputHash !== activeOtpRecord.codeHash) {
        transaction.stepUp.attempts = (transaction.stepUp.attempts || 0) + 1;
        activeOtpRecord.attempts = (activeOtpRecord.attempts || 0) + 1;
        await activeOtpRecord.save();

        if (transaction.stepUp.attempts >= 3) {
          transaction.status = 'blocked';
          await transaction.save();

          const countAlerts = await FraudAlert.countDocuments();
          const alertNumber = `FA-${new Date().getFullYear()}-${(countAlerts + 1).toString().padStart(6, '0')}`;

          const fraudAlert = await FraudAlert.create({
            alertNumber,
            transactionId: transaction._id,
            userId,
            alertType: 'transactionFraud',
            severity: 'high',
            riskScore: 80,
            status: 'open',
            summary: `Transaction blocked after 3 consecutive failed step-up OTP authentication attempts.`
          });

          return res.status(400).json({
            success: false,
            message: 'Maximum OTP attempts exceeded. Transaction blocked and flagged for fraud investigation.',
            data: { transaction, fraudAlert }
          });
        }

        await transaction.save();
        return res.status(400).json({
          success: false,
          message: `Invalid OTP code. Remaining attempts: ${3 - transaction.stepUp.attempts}`
        });
      }

      const otpRecord = activeOtpRecord;

      const customer = await Customer.findOne({ userId });
      if (!customer) {
        return res.status(404).json({ success: false, message: 'Customer profile not found.' });
      }

      // Re-validate UPI limit before releasing funds
      const isUpi = transaction.type === 'upi' || transaction.channel === 'upi';
      if (isUpi) {
        const limitCheck = await upiLimitService.validateOutgoingUpi({
          customerId: customer._id,
          userId,
          amount: transaction.amount,
          payee: transaction.payee,
          category: transaction.payee?.category
        });

        if (!limitCheck.valid) {
          transaction.status = 'rejected';
          await transaction.save();
          return res.status(400).json({
            success: false,
            code: limitCheck.code,
            message: limitCheck.message,
            data: limitCheck.details
          });
        }
      }

      // Atomic Balance Debit
      const updatedCustomer = await Customer.findOneAndUpdate(
        { _id: customer._id, balance: { $gte: transaction.amount } },
        { $inc: { balance: -transaction.amount } },
        { new: true }
      );

      if (!updatedCustomer) {
        transaction.status = 'rejected';
        await transaction.save();
        return res.status(400).json({ success: false, message: 'Insufficient funds.' });
      }

      // OTP is valid and consumed
      otpRecord.consumed = true;
      await otpRecord.save();

      transaction.status = 'approved';
      transaction.stepUp.verified = true;
      await transaction.save();

      await createAuditEntry({
        userId,
        action: 'TRANSACTION_STEPUP_VERIFIED',
        entity: 'Transaction',
        entityId: transaction._id.toString(),
        details: { amount: transaction.amount, payee: transaction.payee?.name },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(200).json({
        success: true,
        message: 'Step-up OTP verified successfully. Transaction approved!',
        data: { transaction }
      });
    });

  } catch (err) {
    next(err);
  }
};

// 4. Get My Transactions (Customer)
exports.getMyTransactions = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ userId: req.user._id });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer profile not found.' });
    }

    const { status, type, riskLevel, page = 1, limit = 20 } = req.query;
    const query = {
      $or: [{ customerId: customer._id }, { userId: req.user._id }]
    };

    if (status) query.status = status;
    if (type) query.type = type;
    if (riskLevel) query.riskLevel = riskLevel;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const transactions = await Transaction.find(query)
      .sort({ timestamp: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('riskAssessmentId');

    const total = await Transaction.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: {
        transactions,
        balance: customer.balance,
        accountNumber: customer.accountNumber,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

// 5. Staff / Admin Transactions List
exports.getTransactions = async (req, res, next) => {
  try {
    const { status, riskLevel, search, page = 1, limit = 50 } = req.query;
    const query = {};

    if (status) query.status = status;
    if (riskLevel) query.riskLevel = riskLevel;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const transactions = await Transaction.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'fullName email')
      .populate('riskAssessmentId');

    const total = await Transaction.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
};

// 6. Get Transaction Details by ID
exports.getTransactionById = async (req, res, next) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('userId', 'fullName email phone')
      .populate('riskAssessmentId');

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found.' });
    }

    return res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (err) {
    next(err);
  }
};

// 7. Get Customer UPI Limits & Rolling 24-Hour Usage
exports.getUpiLimits = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const customer = await Customer.findOne({ userId });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer profile not found.' });
    }

    const { category = 'p2p' } = req.query;
    const limitsSummary = await upiLimitService.getUpiLimitsSummary({
      customerId: customer._id,
      userId,
      category
    });

    return res.status(200).json({
      success: true,
      data: limitsSummary
    });
  } catch (err) {
    next(err);
  }
};
