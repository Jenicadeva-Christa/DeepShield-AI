const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/users.model');
const Customer = require('../src/models/customers.model');
const StaffProfile = require('../src/models/staffprofiles.model');
const FraudAlert = require('../src/models/fraudalerts.model');
const Investigation = require('../src/models/investigations.model');
const Notification = require('../src/models/notifications.model');
const SystemConfig = require('../src/models/systemconfigs.model');
const Blacklist = require('../src/models/blacklists.model');
const AIModel = require('../src/models/aimodels.model');
const { connectDB } = require('../src/config/db');
const { generateAccessToken, hashPassword } = require('../src/utils/crypto.utils');

jest.setTimeout(45000);

let adminToken = null;
let analystToken = null;
let customerToken = null;
let adminUser = null;
let analystUser = null;
let customerUser = null;

beforeAll(async () => {
  await connectDB();
  await User.deleteMany({});
  await Customer.deleteMany({});
  await StaffProfile.deleteMany({});
  await FraudAlert.deleteMany({});
  await Investigation.deleteMany({});
  await Notification.deleteMany({});
  await Blacklist.deleteMany({});

  const passwordHash = await hashPassword('Password@123');

  adminUser = await User.create({
    fullName: 'System Administrator',
    email: 'admin@deepshield.ai',
    phone: '+919900000001',
    passwordHash,
    role: 'administrator',
    status: 'active'
  });

  analystUser = await User.create({
    fullName: 'Fraud Analyst',
    email: 'analyst@deepshield.ai',
    phone: '+919900000002',
    passwordHash,
    role: 'analyst',
    status: 'active'
  });

  customerUser = await User.create({
    fullName: 'Priya Sharma',
    email: 'customer@deepshield.ai',
    phone: '+919900000003',
    passwordHash,
    role: 'customer',
    status: 'active'
  });

  adminToken = generateAccessToken({
    id: adminUser._id,
    email: adminUser.email,
    role: adminUser.role,
    fullName: adminUser.fullName
  });

  analystToken = generateAccessToken({
    id: analystUser._id,
    email: analystUser.email,
    role: analystUser.role,
    fullName: analystUser.fullName
  });

  customerToken = generateAccessToken({
    id: customerUser._id,
    email: customerUser.email,
    role: customerUser.role,
    fullName: customerUser.fullName
  });
});

afterAll(async () => {
  const mongoose = require('mongoose');
  await mongoose.disconnect();
});

describe('Agile Sprint 4: Admin Governance, Investigations, Reports & Notifications (User Stories US-4.1 - US-4.6)', () => {

  test('US-4.1: Administrative User Provisioning & Role-Based Access Control', async () => {
    const listRes = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.statusCode).toEqual(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(3);

    const createRes = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'New Junior Analyst',
        email: 'junior.analyst@deepshield.ai',
        phone: '+919900000099',
        password: 'Password@123',
        role: 'analyst',
        department: 'Fraud Operations',
        designation: 'L1 Analyst'
      });

    expect(createRes.statusCode).toEqual(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.email).toEqual('junior.analyst@deepshield.ai');
  });

  test('US-4.2: Blacklist Entity Lifecycle Management (Add, Filter, Delete)', async () => {
    const addRes = await request(app)
      .post('/api/v1/admin/blacklists')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'ipAddress',
        value: '198.51.100.42',
        reason: 'Known command & control proxy node',
        category: 'phishing',
        severity: 'critical'
      });

    expect(addRes.statusCode).toEqual(201);
    expect(addRes.body.success).toBe(true);
    const blacklistId = addRes.body.data._id;

    const listRes = await request(app)
      .get('/api/v1/admin/blacklists?type=ipAddress')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.statusCode).toEqual(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

    const delRes = await request(app)
      .delete(`/api/v1/admin/blacklists/${blacklistId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(delRes.statusCode).toEqual(200);
    expect(delRes.body.success).toBe(true);
  });

  test('US-4.3: Dynamic Configuration Registry Updates Without System Downtime', async () => {
    const updateRes = await request(app)
      .put('/api/v1/admin/configs/riskThresholds')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        value: { lowMax: 35, mediumMax: 65, highMin: 66 },
        description: 'Updated threshold limits for high vigilance mode'
      });

    expect(updateRes.statusCode).toEqual(200);
    expect(updateRes.body.success).toBe(true);
    expect(updateRes.body.data.key).toEqual('riskThresholds');
  });

  test('US-4.4: Fraud Analyst Case Resolution & Forensic Findings Documentation', async () => {
    const alert = await FraudAlert.create({
      alertNumber: 'FA-2026-999001',
      userId: customerUser._id,
      alertType: 'transactionFraud',
      severity: 'high',
      riskScore: 82,
      status: 'underInvestigation',
      summary: 'High-frequency overseas transfer attempt'
    });

    const investigation = await Investigation.create({
      alertId: alert._id,
      assignedTo: analystUser._id,
      status: 'inProgress',
      startedAt: new Date()
    });

    const noteRes = await request(app)
      .post(`/api/v1/investigations/${investigation._id}/notes`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ text: 'Customer contacted via verified phone; confirmed transaction was unauthorized.' });

    expect(noteRes.statusCode).toEqual(200);
    expect(noteRes.body.success).toBe(true);

    const outcomeRes = await request(app)
      .patch(`/api/v1/investigations/${investigation._id}/outcome`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        status: 'completed',
        outcome: 'confirmedFraud',
        recommendedAction: 'suspendAccount',
        findings: 'SIM swap attack confirmed by telecom carrier. Unauthorized session blocked.'
      });

    expect(outcomeRes.statusCode).toEqual(200);
    expect(outcomeRes.body.data.outcome).toEqual('confirmedFraud');
    expect(outcomeRes.body.data.status).toEqual('completed');
  });

  test('US-4.5: Compliance & Executive Reporting Engine (Transaction & Fraud Summaries)', async () => {
    const txReportRes = await request(app)
      .get('/api/v1/reports/transactions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(txReportRes.statusCode).toEqual(200);
    expect(txReportRes.body.success).toBe(true);
    expect(txReportRes.body.data.reportType).toEqual('transactionSummary');

    const fraudReportRes = await request(app)
      .get('/api/v1/reports/fraud')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(fraudReportRes.statusCode).toEqual(200);
    expect(fraudReportRes.body.success).toBe(true);
    expect(fraudReportRes.body.data.reportType).toEqual('fraudAlertSummary');
  });

  test('US-4.6: In-App User Security Notifications & Read Status Lifecycle', async () => {
    const notification = await Notification.create({
      userId: customerUser._id,
      type: 'fraudAlert',
      title: 'Suspicious Activity Detected',
      message: 'A transfer of INR 50,000 was blocked due to abnormal IP location.',
      status: 'queued'
    });

    const listRes = await request(app)
      .get('/api/v1/notifications/me')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(listRes.statusCode).toEqual(200);
    expect(listRes.body.data.notifications.length).toBeGreaterThanOrEqual(1);

    const readRes = await request(app)
      .patch(`/api/v1/notifications/${notification._id}/read`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(readRes.statusCode).toEqual(200);
    expect(readRes.body.data.status).toEqual('read');
  });

});
