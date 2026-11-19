const nodemailer = require('nodemailer');

/**
 * Creates and configures the Nodemailer transporter for Gmail SMTP
 */
function createTransporter() {
  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT, 10) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  if (!user || !pass) {
    throw new Error('SMTP credentials are not configured. Please set SMTP_USER and SMTP_PASS.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
      minVersion: 'TLSv1.2'
    }
  });
}

/**
 * Masks an email for safe operational logging and frontend display
 * e.g. customer1@deepshield.ai -> c******1@deepshield.ai
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return 'your registered email';
  }
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) {
    return `${localPart[0]}***@${domain}`;
  }
  const maskedLocal = `${localPart[0]}${'*'.repeat(Math.max(localPart.length - 2, 3))}${localPart[localPart.length - 1]}`;
  return `${maskedLocal}@${domain}`;
}

/**
 * Generates responsive, high-security HTML email for DeepShield AI OTP
 */
function generateOtpHtml({ otpCode, userFullName, purpose = 'login', expiryMinutes = 5 }) {
  const purposeTitle = purpose === 'registration'
    ? 'Account Registration Verification'
    : purpose === 'passwordReset'
    ? 'Password Reset Request'
    : purpose === 'transactionStepUp'
    ? 'Transaction Step-Up Verification'
    : 'Account Login Verification';

  const greeting = userFullName ? `Hello ${userFullName},` : 'Hello,';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DeepShield AI Security Passcode</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0F172A;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #E2E8F0;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #0F172A;
      padding: 32px 0;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #1E293B;
      border-radius: 16px;
      border: 1px solid #334155;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
    }
    .header {
      background: linear-gradient(135deg, #0F766E 0%, #0F172A 100%);
      padding: 32px 28px;
      text-align: center;
      border-bottom: 1px solid #334155;
    }
    .brand-title {
      color: #FFFFFF;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin: 0;
    }
    .brand-accent {
      color: #2DD4BF;
    }
    .brand-subtitle {
      color: #94A3B8;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      margin-top: 6px;
    }
    .content {
      padding: 36px 30px;
    }
    .heading {
      color: #FFFFFF;
      font-size: 20px;
      font-weight: 700;
      margin-top: 0;
      margin-bottom: 14px;
    }
    .paragraph {
      color: #CBD5E1;
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 22px;
    }
    .otp-container {
      text-align: center;
      margin: 28px 0;
    }
    .otp-code {
      display: inline-block;
      background-color: #0F172A;
      border: 2px dashed #0F766E;
      border-radius: 12px;
      padding: 16px 36px;
      letter-spacing: 10px;
      font-size: 36px;
      font-weight: 800;
      font-family: 'Courier New', Courier, monospace;
      color: #2DD4BF;
      box-shadow: 0 4px 14px rgba(15, 118, 110, 0.25);
    }
    .badge-expiry {
      display: inline-block;
      background-color: rgba(15, 118, 110, 0.15);
      border: 1px solid rgba(45, 212, 191, 0.3);
      color: #2DD4BF;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: 20px;
      margin-top: 14px;
    }
    .security-notice {
      background-color: rgba(239, 68, 68, 0.08);
      border-left: 4px solid #EF4444;
      border-radius: 8px;
      padding: 14px 18px;
      margin-top: 24px;
      margin-bottom: 24px;
    }
    .security-title {
      color: #F87171;
      font-size: 13px;
      font-weight: 700;
      margin: 0 0 4px 0;
    }
    .security-text {
      color: #FCA5A5;
      font-size: 12px;
      line-height: 1.5;
      margin: 0;
    }
    .footer {
      background-color: #0F172A;
      padding: 24px 30px;
      text-align: center;
      border-top: 1px solid #334155;
    }
    .footer-text {
      color: #64748B;
      font-size: 11px;
      line-height: 1.5;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1 class="brand-title">DeepShield <span class="brand-accent">AI</span></h1>
        <div class="brand-subtitle">Autonomous Banking Fraud Prevention &amp; Identity Protection</div>
      </div>
      <div class="content">
        <h2 class="heading">${purposeTitle}</h2>
        <p class="paragraph">${greeting}</p>
        <p class="paragraph">
          A request has been initiated to authenticate your DeepShield AI banking account.
          Use the one-time passcode below to complete your verification:
        </p>

        <div class="otp-container">
          <div class="otp-code">${otpCode}</div>
          <br>
          <div class="badge-expiry">&#x23F1; Valid for ${expiryMinutes} minutes</div>
        </div>

        <div class="security-notice">
          <p class="security-title">&#x1F512; Confidential Security Warning</p>
          <p class="security-text">
            Never share this OTP with anyone, including DeepShield AI support staff or banking representatives.
            DeepShield AI will never ask for your verification code.
            If you did not initiate this authentication request, someone may be attempting unauthorized access.
            Please change your security password and contact security support immediately.
          </p>
        </div>

        <p class="paragraph" style="font-size: 12px; color: #94A3B8; margin-bottom: 0;">
          This is an automated security transmission dispatched to your verified registered address.
        </p>
      </div>
      <div class="footer">
        <p class="footer-text">
          &copy; ${new Date().getFullYear()} DeepShield AI Security Architecture. All rights reserved.<br>
          TLS 1.3 &bull; SHA-256 Ledger &bull; Real-Time Fraud Shield
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generates plain-text alternative email
 */
function generateOtpPlainText({ otpCode, userFullName, purpose = 'login', expiryMinutes = 5 }) {
  const greeting = userFullName ? `Hello ${userFullName},` : 'Hello,';
  return `
DeepShield AI - Authentication Verification
Autonomous Banking Fraud Prevention & Identity Protection

${greeting}

A request has been initiated to authenticate your DeepShield AI banking account.
Your one-time verification passcode is:

==============================
    ${otpCode}
==============================

This code will expire in ${expiryMinutes} minutes.

SECURITY NOTICE:
Never share this one-time passcode with anyone, including bank representatives or DeepShield AI personnel. DeepShield AI will NEVER ask for your OTP.
If you did not request this login verification, please report this unauthorized access attempt immediately.

(c) ${new Date().getFullYear()} DeepShield AI Security Architecture.
  `.trim();
}

/**
 * Sends OTP email using Nodemailer with Gmail SMTP
 * Operational logs never reveal the OTP code itself.
 */
async function sendOtpEmail({ to, otpCode, purpose = 'login', userFullName, expiryMinutes = 5 }) {
  if (!to) {
    throw new Error('Destination email address is required.');
  }
  if (!otpCode) {
    throw new Error('OTP code is required.');
  }

  const transporter = createTransporter();
  const mailFrom = process.env.MAIL_FROM || `"DeepShield AI Security" <${process.env.SMTP_USER || 'no-reply@deepshield.ai'}>`;

  const subject = purpose === 'registration'
    ? 'DeepShield AI: Verify Your New Account'
    : purpose === 'passwordReset'
    ? 'DeepShield AI: Password Reset Passcode'
    : 'DeepShield AI: Your One-Time Login Verification Passcode';

  const mailOptions = {
    from: mailFrom,
    to,
    subject,
    text: generateOtpPlainText({ otpCode, userFullName, purpose, expiryMinutes }),
    html: generateOtpHtml({ otpCode, userFullName, purpose, expiryMinutes })
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    const masked = maskEmail(to);
    console.log(`[Email Service] OTP email dispatched successfully to ${masked} (Message ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId, maskedEmail: masked };
  } catch (error) {
    const masked = maskEmail(to);
    console.error(`[Email Service] Delivery failure to ${masked}: ${error.message}`);
    throw error;
  }
}

/**
 * Verify transporter SMTP connectivity without sending a message
 */
async function verifySmtpConnection() {
  const transporter = createTransporter();
  return await transporter.verify();
}

module.exports = {
  createTransporter,
  sendOtpEmail,
  generateOtpHtml,
  generateOtpPlainText,
  maskEmail,
  verifySmtpConnection
};
