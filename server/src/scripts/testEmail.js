require('dotenv').config();
const { sendOtpEmail, verifySmtpConnection, maskEmail } = require('../services/email.service');
const { generateOTPCode } = require('../utils/crypto.utils');

async function runEmailTest() {
  console.log('======================================================');
  console.log('DeepShield AI - SMTP Email Delivery Diagnostic Utility');
  console.log('======================================================\n');

  console.log('Current SMTP Configuration:');
  console.log(`- SMTP_HOST:   ${process.env.SMTP_HOST || '(not set)'}`);
  console.log(`- SMTP_PORT:   ${process.env.SMTP_PORT || '(not set)'}`);
  console.log(`- SMTP_SECURE: ${process.env.SMTP_SECURE || '(not set)'}`);
  console.log(`- SMTP_USER:   ${process.env.SMTP_USER ? maskEmail(process.env.SMTP_USER) : '(EMPTY - Please configure)'}`);
  console.log(`- SMTP_PASS:   ${process.env.SMTP_PASS ? '********' : '(EMPTY - Please configure)'}`);
  console.log(`- MAIL_FROM:   ${process.env.MAIL_FROM || '(not set)'}\n`);

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('❌ ERROR: SMTP_USER or SMTP_PASS is missing in server/.env.');
    console.error('To send real emails using Gmail:');
    console.error('1. Enable 2-Step Verification on your Google Account');
    console.error('2. Generate an App Password at https://myaccount.google.com/apppasswords');
    console.error('3. Set SMTP_USER=your_email@gmail.com');
    console.error('4. Set SMTP_PASS=your_16_char_app_password (without spaces)');
    process.exit(1);
  }

  const recipient = process.argv[2] || process.env.SMTP_USER;
  console.log(`Testing SMTP connectivity and dispatching test OTP email to: ${maskEmail(recipient)}...`);

  try {
    console.log('1. Verifying SMTP server handshake...');
    await verifySmtpConnection();
    console.log('   ✓ SMTP connection verified successfully!');

    console.log('2. Generating cryptographically secure OTP and dispatching email...');
    const testOtp = generateOTPCode();
    const result = await sendOtpEmail({
      to: recipient,
      otpCode: testOtp,
      purpose: 'login',
      userFullName: 'DeepShield Tester',
      expiryMinutes: 5
    });

    console.log('   ✓ Email dispatched successfully!');
    console.log(`   Message ID: ${result.messageId}`);
    console.log(`\n======================================================`);
    console.log('✅ Real email test PASSED! Please check the recipient inbox.');
    console.log('======================================================');
  } catch (err) {
    console.error('\n❌ SMTP Test FAILED:');
    console.error(err.message);
    if (err.code === 'EAUTH') {
      console.error('\nAuthentication failed. Ensure you are using a 16-character Google App Password (not your normal Gmail password), and that 2-Step Verification is enabled on your Google account.');
    }
    process.exit(1);
  }
}

runEmailTest();
