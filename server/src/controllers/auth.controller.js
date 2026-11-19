const User = require('../models/users.model');
const Customer = require('../models/customers.model');
const StaffProfile = require('../models/staffprofiles.model');
const Authentication = require('../models/authentications.model');
const Otp = require('../models/otps.model');
const {
  hashPassword,
  comparePassword,
  generateOTPCode,
  hashSHA256,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  encryptText
} = require('../utils/crypto.utils');
const { createAuditEntry } = require('../middleware/audit.middleware');
const emailService = require('../services/email.service');
const {
  isPredefinedDemoEmail,
  isPredefinedDemoUser,
  normalizeEmail
} = require('../utils/demoAccounts.utils');

// 1. Register Account
exports.register = async (req, res, next) => {
  try {
    const { fullName, email, phone, password, address, dateOfBirth, gender, idProofType } = req.body;

    if (!fullName || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: 'All required fields must be provided.' });
    }

    const normalizedEmail = normalizeEmail(email);

    if (isPredefinedDemoEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Registration using predefined demo account addresses is prohibited. Please use a unique personal email.'
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email address is already registered.' });
    }

    const passwordHash = await hashPassword(password);
    const user = new User({
      fullName,
      email: normalizedEmail,
      phone,
      passwordHash,
      role: 'customer',
      status: 'active'
    });
    await user.save();

    // Create Customer profile
    const accountNumber = '3009' + Math.floor(10000000 + Math.random() * 90000000).toString();
    const customer = new Customer({
      userId: user._id,
      accountNumber,
      balance: 100000,
      currency: 'INR',
      address: encryptText(address || 'Mumbai, India'),
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : new Date('1995-05-15'),
      gender: gender || 'Other',
      idProofType: idProofType || 'Aadhaar'
    });
    await customer.save();

    // Generate Registration OTP
    const otpCode = generateOTPCode();
    const codeHash = hashSHA256(otpCode);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

    await Otp.create({
      userId: user._id,
      purpose: 'registration',
      channel: 'email',
      codeHash,
      expiresAt
    });

    try {
      await emailService.sendOtpEmail({
        to: user.email,
        otpCode,
        purpose: 'registration',
        userFullName: user.fullName,
        expiryMinutes: 5
      });
    } catch (mailErr) {
      console.error(`[Email Service] Registration email notice for ${emailService.maskEmail(user.email)}: ${mailErr.message}`);
    }

    await createAuditEntry({
      userId: user._id,
      action: 'USER_REGISTERED',
      entity: 'User',
      entityId: user._id.toString(),
      details: { email: user.email, accountNumber },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    const maskedEmail = emailService.maskEmail(user.email);

    return res.status(201).json({
      success: true,
      message: `Registration successful! Please verify the OTP sent to ${maskedEmail}.`,
      data: {
        userId: user._id,
        email: user.email,
        maskedEmail,
        accountNumber
      }
    });
  } catch (err) {
    next(err);
  }
};

// 2. Login Step 1 (Password validation & OTP Generation)
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // Check inactive or suspended account (TC-10)
    if (user.status === 'inactive' || user.status === 'suspended') {
      await createAuditEntry({
        userId: user._id,
        action: 'LOGIN_FAILED_INACTIVE',
        entity: 'User',
        entityId: user._id.toString(),
        details: { status: user.status },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'failure'
      });
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Access denied.'
      });
    }

    // Check account lockout
    if (user.status === 'locked' || (user.lockUntil && user.lockUntil > new Date())) {
      const minutesLeft = Math.ceil((user.lockUntil - new Date()) / (60 * 1000));
      return res.status(403).json({
        success: false,
        message: `Account is locked due to 5 consecutive failed login attempts. Please try again in ${minutesLeft > 0 ? minutesLeft : 15} minutes or contact an administrator.`
      });
    }

    // Reset lockout if lock expired
    if (user.lockUntil && user.lockUntil <= new Date()) {
      user.status = 'active';
      user.failedLoginAttempts = 0;
      user.lockUntil = undefined;
      await user.save();
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) {
        user.status = 'locked';
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins lock
        await user.save();

        await createAuditEntry({
          userId: user._id,
          action: 'ACCOUNT_LOCKED',
          entity: 'User',
          entityId: user._id.toString(),
          details: { attempts: user.failedLoginAttempts },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          outcome: 'failure'
        });

        return res.status(403).json({
          success: false,
          message: 'Account locked due to 5 consecutive wrong passwords. Try again in 15 minutes.'
        });
      }

      await user.save();

      await createAuditEntry({
        userId: user._id,
        action: 'LOGIN_FAILED',
        entity: 'User',
        entityId: user._id.toString(),
        details: { attempts: user.failedLoginAttempts },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'failure'
      });

      return res.status(401).json({
        success: false,
        message: `Invalid password. Attempt ${user.failedLoginAttempts} of 5 before account lockout.`
      });
    }

    // Success Password check -> Reset failed login attempts
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    // 1. Predefined Demo Accounts: Bypass email OTP during login
    if (isPredefinedDemoUser(user)) {
      user.lastLoginAt = new Date();
      await user.save();

      let customerProfile = null;
      let staffProfile = null;
      if (user.role === 'customer') {
        customerProfile = await Customer.findOne({ userId: user._id });
      } else {
        staffProfile = await StaffProfile.findOne({ userId: user._id });
      }

      const payload = {
        id: user._id,
        email: user.email,
        role: user.role,
        fullName: user.fullName
      };

      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);
      const sessionId = hashSHA256(user._id.toString() + Date.now().toString());

      await Authentication.create({
        userId: user._id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        loginStatus: 'success',
        otpStatus: 'notRequired',
        isVerified: true,
        sessionId,
        refreshTokenHash: hashSHA256(refreshToken)
      });

      await createAuditEntry({
        userId: user._id,
        action: 'LOGIN_SUCCESS',
        entity: 'User',
        entityId: user._id.toString(),
        details: { role: user.role, isDemoAccount: true },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      return res.status(200).json({
        success: true,
        message: 'Authentication successful (Demo Account).',
        data: {
          accessToken,
          refreshToken,
          otpRequired: false,
          user: {
            id: user._id,
            fullName: user.fullName,
            email: user.email,
            phone: user.phone,
            role: user.role,
            status: user.status,
            customerProfile,
            staffProfile
          }
        }
      });
    }

    // 2. Normal Accounts: Standard email OTP authentication
    await Otp.updateMany(
      { userId: user._id, purpose: 'login', consumed: false },
      { consumed: true }
    );

    const otpCode = generateOTPCode();
    const codeHash = hashSHA256(otpCode);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins
    const sessionId = hashSHA256(user._id.toString() + Date.now().toString());

    const otpDoc = await Otp.create({
      userId: user._id,
      purpose: 'login',
      channel: 'email',
      codeHash,
      expiresAt,
      sessionId
    });

    const authSession = await Authentication.create({
      userId: user._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      loginStatus: 'otpPending',
      otpStatus: 'sent',
      sessionId
    });

    try {
      await emailService.sendOtpEmail({
        to: user.email,
        otpCode,
        purpose: 'login',
        userFullName: user.fullName,
        expiryMinutes: 5
      });
    } catch (mailErr) {
      await Otp.deleteOne({ _id: otpDoc._id });
      await Authentication.findByIdAndUpdate(authSession._id, {
        loginStatus: 'failed',
        otpStatus: 'failed'
      });

      return res.status(500).json({
        success: false,
        message: 'Unable to deliver verification code to your registered email address. Please verify your SMTP configuration or contact administrator.'
      });
    }

    const maskedEmail = emailService.maskEmail(user.email);

    return res.status(200).json({
      success: true,
      message: `Password verified. A 6-digit verification code was sent to ${maskedEmail}.`,
      data: {
        userId: user._id,
        email: user.email,
        maskedEmail,
        sessionId
      }
    });
  } catch (err) {
    next(err);
  }
};

// 3. Verify OTP & Finalize Session
exports.verifyOTP = async (req, res, next) => {
  try {
    const { userId, otpCode, purpose = 'login', sessionId } = req.body;

    if (!userId || !otpCode) {
      return res.status(400).json({ success: false, message: 'User ID and OTP code are required.' });
    }

    const query = {
      userId,
      purpose,
      consumed: false,
      expiresAt: { $gt: new Date() }
    };
    if (sessionId) {
      query.sessionId = sessionId;
    }

    const otpRecord = await Otp.findOne(query).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'OTP has expired or does not exist. Request a new code.' });
    }

    if (otpRecord.attempts >= 3) {
      return res.status(400).json({ success: false, message: 'Maximum 3 invalid OTP attempts reached. Please request a new code.' });
    }

    const inputHash = hashSHA256(otpCode.toString().trim());
    if (inputHash !== otpRecord.codeHash) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      return res.status(400).json({
        success: false,
        message: `Invalid OTP code. Attempt ${otpRecord.attempts} of 3.`
      });
    }

    // OTP Verified successfully - mark consumed immediately to prevent replay
    otpRecord.consumed = true;
    await otpRecord.save();

    // Invalidate any other unconsumed OTPs for this user and purpose
    await Otp.updateMany(
      { userId, purpose, consumed: false },
      { consumed: true }
    );

    const user = await User.findById(userId);
    user.lastLoginAt = new Date();
    await user.save();

    let customerProfile = null;
    let staffProfile = null;
    if (user.role === 'customer') {
      customerProfile = await Customer.findOne({ userId: user._id });
    } else {
      staffProfile = await StaffProfile.findOne({ userId: user._id });
    }

    const payload = {
      id: user._id,
      email: user.email,
      role: user.role,
      fullName: user.fullName
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    if (sessionId) {
      await Authentication.findOneAndUpdate(
        { sessionId },
        {
          loginStatus: 'success',
          otpStatus: 'verified',
          isVerified: true,
          refreshTokenHash: hashSHA256(refreshToken)
        }
      );
    }

    await createAuditEntry({
      userId: user._id,
      action: 'LOGIN_SUCCESS',
      entity: 'User',
      entityId: user._id.toString(),
      details: { role: user.role },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
          customerProfile,
          staffProfile
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

// 4. Resend OTP
exports.resendOTP = async (req, res, next) => {
  try {
    const { userId, purpose = 'login', sessionId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required.' });
    }

    const user = await User.findById(userId);
    if (!user || user.status === 'locked') {
      return res.status(400).json({ success: false, message: 'User account unavailable.' });
    }

    // Rate limiting: enforce a 30-second cooldown between resends
    const recentOtp = await Otp.findOne({
      userId,
      purpose,
      createdAt: { $gt: new Date(Date.now() - 30 * 1000) }
    }).sort({ createdAt: -1 });

    if (recentOtp) {
      const waitSeconds = Math.ceil((recentOtp.createdAt.getTime() + 30 * 1000 - Date.now()) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitSeconds > 0 ? waitSeconds : 1} second(s) before requesting another verification code.`
      });
    }

    // Invalidate existing unconsumed OTPs for this user and purpose
    await Otp.updateMany(
      { userId, purpose, consumed: false },
      { consumed: true }
    );

    const otpCode = generateOTPCode();
    const codeHash = hashSHA256(otpCode);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const otpDoc = await Otp.create({
      userId,
      purpose,
      channel: 'email',
      codeHash,
      expiresAt,
      sessionId
    });

    try {
      await emailService.sendOtpEmail({
        to: user.email,
        otpCode,
        purpose,
        userFullName: user.fullName,
        expiryMinutes: 5
      });
    } catch (mailErr) {
      await Otp.deleteOne({ _id: otpDoc._id });
      return res.status(500).json({
        success: false,
        message: 'Unable to deliver verification code. Please check SMTP configuration.'
      });
    }

    const maskedEmail = emailService.maskEmail(user.email);

    return res.status(200).json({
      success: true,
      message: `A new verification code has been dispatched to ${maskedEmail}.`,
      data: {
        maskedEmail
      }
    });
  } catch (err) {
    next(err);
  }
};

// 5. Refresh Access Token
exports.refresh = async (req, res, next) => {
  try {
    const refreshToken = (req.cookies && req.cookies.refreshToken) || req.body?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token required.' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.id);
    if (!user || user.status !== 'active') {
      return res.status(401).json({ success: false, message: 'Invalid session.' });
    }

    const newAccessToken = generateAccessToken({
      id: user._id,
      email: user.email,
      role: user.role,
      fullName: user.fullName
    });

    return res.status(200).json({
      success: true,
      data: { accessToken: newAccessToken }
    });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
  }
};

// 6. Forgot Password
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ success: false, message: 'No account registered with this email.' });
    }

    // Invalidate existing unconsumed passwordReset OTPs
    await Otp.updateMany(
      { userId: user._id, purpose: 'passwordReset', consumed: false },
      { consumed: true }
    );

    const otpCode = generateOTPCode();
    const codeHash = hashSHA256(otpCode);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const otpDoc = await Otp.create({
      userId: user._id,
      purpose: 'passwordReset',
      channel: 'email',
      codeHash,
      expiresAt
    });

    try {
      await emailService.sendOtpEmail({
        to: user.email,
        otpCode,
        purpose: 'passwordReset',
        userFullName: user.fullName,
        expiryMinutes: 10
      });
    } catch (mailErr) {
      await Otp.deleteOne({ _id: otpDoc._id });
      return res.status(500).json({
        success: false,
        message: 'Unable to deliver password reset email. Please try again later.'
      });
    }

    const maskedEmail = emailService.maskEmail(user.email);

    return res.status(200).json({
      success: true,
      message: `Password reset OTP sent to ${maskedEmail}.`,
      data: {
        userId: user._id,
        maskedEmail
      }
    });
  } catch (err) {
    next(err);
  }
};

// 7. Reset Password
exports.resetPassword = async (req, res, next) => {
  try {
    const { userId, otpCode, newPassword } = req.body;
    const otpRecord = await Otp.findOne({
      userId,
      purpose: 'passwordReset',
      consumed: false,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'Password reset code has expired.' });
    }

    if (hashSHA256(otpCode) !== otpRecord.codeHash) {
      return res.status(400).json({ success: false, message: 'Invalid OTP code.' });
    }

    otpRecord.consumed = true;
    await otpRecord.save();

    const passwordHash = await hashPassword(newPassword);
    await User.findByIdAndUpdate(userId, {
      passwordHash,
      status: 'active',
      failedLoginAttempts: 0,
      lockUntil: undefined
    });

    await createAuditEntry({
      userId,
      action: 'PASSWORD_RESET_SUCCESS',
      entity: 'User',
      entityId: userId,
      details: {},
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now log in.'
    });
  } catch (err) {
    next(err);
  }
};

// 8. Logout
exports.logout = async (req, res, next) => {
  try {
    if (req.user) {
      await createAuditEntry({
        userId: req.user._id,
        action: 'LOGOUT',
        entity: 'User',
        entityId: req.user._id.toString(),
        details: {},
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
    }

    res.clearCookie('refreshToken');
    return res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
};

// 9. Get Current User (GET /auth/me)
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    let customerProfile = null;
    let staffProfile = null;
    if (user.role === 'customer') {
      customerProfile = await Customer.findOne({ userId: user._id });
    } else {
      staffProfile = await StaffProfile.findOne({ userId: user._id });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        notificationPreferences: user.notificationPreferences,
        customerProfile,
        staffProfile
      }
    });
  } catch (err) {
    next(err);
  }
};
