const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/users.model');
const FraudAlert = require('../src/models/fraudalerts.model');
const Investigation = require('../src/models/investigations.model');
const { connectDB } = require('../src/config/db');
const { generateAccessToken, hashPassword } = require('../src/utils/crypto.utils');

jest.setTimeout(45000);

let analyst1 = null;
let analyst2 = null;
let adminUser = null;
let customerUser = null;

let analyst1Token = null;
let analyst2Token = null;
let adminToken = null;
let customerToken = null;

beforeAll(async () => {
  await connectDB();
  await User.deleteMany({});
  await FraudAlert.deleteMany({});
  await Investigation.deleteMany({});

  const passwordHash = await hashPassword('Password@123');

  analyst1 = await User.create({
    fullName: 'Aditi Sharma (Analyst 1)',
    email: 'aditi.analyst@deepshield.ai',
    phone: '+919900000010',
    passwordHash,
    role: 'fraudAnalyst',
    status: 'active'
  });

  analyst2 = await User.create({
    fullName: 'Vikram Mehta (Analyst 2)',
    email: 'vikram.analyst@deepshield.ai',
    phone: '+919900000011',
    passwordHash,
    role: 'fraudAnalyst',
    status: 'active'
  });

  adminUser = await User.create({
    fullName: 'System Administrator',
    email: 'admin.ops@deepshield.ai',
    phone: '+919900000012',
    passwordHash,
    role: 'administrator',
    status: 'active'
  });

  customerUser = await User.create({
    fullName: 'Rahul Verma',
    email: 'rahul.verma@deepshield.ai',
    phone: '+919900000013',
    passwordHash,
    role: 'customer',
    status: 'active'
  });

  analyst1Token = generateAccessToken({
    id: analyst1._id,
    email: analyst1.email,
    role: analyst1.role,
    fullName: analyst1.fullName
  });
  analyst2Token = generateAccessToken({
    id: analyst2._id,
    email: analyst2.email,
    role: analyst2.role,
    fullName: analyst2.fullName
  });
  adminToken = generateAccessToken({
    id: adminUser._id,
    email: adminUser.email,
    role: adminUser.role,
    fullName: adminUser.fullName
  });
  customerToken = generateAccessToken({
    id: customerUser._id,
    email: customerUser.email,
    role: customerUser.role,
    fullName: customerUser.fullName
  });
});

describe('Fraud Analyst "Assign to Me" and "My Status" Module', () => {
  let openAlert = null;

  beforeEach(async () => {
    await FraudAlert.deleteMany({});
    await Investigation.deleteMany({});

    openAlert = await FraudAlert.create({
      alertNumber: 'FA-2026-000101',
      userId: customerUser._id,
      alertType: 'transactionFraud',
      severity: 'high',
      riskScore: 86,
      status: 'open',
      summary: 'Suspicious multiple rapid transfers to high-risk offshore account'
    });
  });

  test('1. Empty state: Analyst sees zero assigned cases before assignment', async () => {
    const res = await request(app)
      .get('/api/v1/alerts/my')
      .set('Authorization', `Bearer ${analyst1Token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  test('2. "Assign to Me" assigns unassigned case and persists in MongoDB', async () => {
    const res = await request(app)
      .patch(`/api/v1/alerts/${openAlert._id}/assign`)
      .set('Authorization', `Bearer ${analyst1Token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.alert.assignedTo._id.toString()).toBe(analyst1._id.toString());
    expect(res.body.data.alert.status).toBe('underInvestigation');

    // Verify persistence in MongoDB FraudAlert collection
    const savedAlert = await FraudAlert.findById(openAlert._id);
    expect(savedAlert).not.toBeNull();
    expect(savedAlert.assignedTo.toString()).toBe(analyst1._id.toString());
    expect(savedAlert.status).toBe('underInvestigation');

    // Verify linked Investigation record in MongoDB
    const savedInvestigation = await Investigation.findOne({ alertId: openAlert._id });
    expect(savedInvestigation).not.toBeNull();
    expect(savedInvestigation.assignedTo.toString()).toBe(analyst1._id.toString());
    expect(['assigned', 'inProgress']).toContain(savedInvestigation.status);
    expect(savedInvestigation.assignedAt).toBeDefined();
  });

  test('3. "My Status" retrieves actual assigned cases from MongoDB for authenticated analyst', async () => {
    // First assign alert to analyst1
    await request(app)
      .patch(`/api/v1/alerts/${openAlert._id}/assign`)
      .set('Authorization', `Bearer ${analyst1Token}`);

    // Analyst 1 retrieves "My Status"
    const res = await request(app)
      .get('/api/v1/alerts/my')
      .set('Authorization', `Bearer ${analyst1Token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);

    const assignedCase = res.body.data[0];
    expect(assignedCase.alertNumber).toBe('FA-2026-000101');
    expect(assignedCase.summary).toBe('Suspicious multiple rapid transfers to high-risk offshore account');
    expect(assignedCase.severity).toBe('high');
    expect(assignedCase.riskScore).toBe(86);
    expect(assignedCase.assignedTo._id.toString()).toBe(analyst1._id.toString());
    expect(assignedCase.assignedTo.fullName).toBe('Aditi Sharma (Analyst 1)');
    expect(assignedCase.userId.fullName).toBe('Rahul Verma');
    expect(assignedCase.userId.email).toBe('rahul.verma@deepshield.ai');
    expect(assignedCase.investigation).not.toBeNull();
    expect(assignedCase.investigation.assignedTo._id.toString()).toBe(analyst1._id.toString());
  });

  test('4. Role and Analyst Isolation: Another analyst does NOT see cases assigned to analyst 1', async () => {
    // Assign to analyst 1
    await request(app)
      .patch(`/api/v1/alerts/${openAlert._id}/assign`)
      .set('Authorization', `Bearer ${analyst1Token}`);

    // Analyst 2 retrieves "My Status"
    const res2 = await request(app)
      .get('/api/v1/alerts/my')
      .set('Authorization', `Bearer ${analyst2Token}`);

    expect(res2.statusCode).toBe(200);
    expect(res2.body.success).toBe(true);
    // Analyst 2 has no cases assigned
    expect(res2.body.data).toEqual([]);
  });

  test('5. Repeated assignment by same analyst is idempotent and prevents duplicate errors', async () => {
    // First assignment
    const firstRes = await request(app)
      .patch(`/api/v1/alerts/${openAlert._id}/assign`)
      .set('Authorization', `Bearer ${analyst1Token}`);
    expect(firstRes.statusCode).toBe(200);

    // Repeated click
    const secondRes = await request(app)
      .patch(`/api/v1/alerts/${openAlert._id}/assign`)
      .set('Authorization', `Bearer ${analyst1Token}`);

    expect(secondRes.statusCode).toBe(200);
    expect(secondRes.body.success).toBe(true);
    expect(secondRes.body.message).toMatch(/already assigned to you/i);

    // Ensure only 1 investigation record was created
    const count = await Investigation.countDocuments({ alertId: openAlert._id });
    expect(count).toBe(1);
  });

  test('6. Prevents conflicting assignment: Another analyst cannot steal already assigned case', async () => {
    // Analyst 1 claims case
    await request(app)
      .patch(`/api/v1/alerts/${openAlert._id}/assign`)
      .set('Authorization', `Bearer ${analyst1Token}`);

    // Analyst 2 attempts to claim
    const conflictRes = await request(app)
      .patch(`/api/v1/alerts/${openAlert._id}/assign`)
      .set('Authorization', `Bearer ${analyst2Token}`);

    expect(conflictRes.statusCode).toBe(400);
    expect(conflictRes.body.success).toBe(false);
    expect(conflictRes.body.message).toMatch(/already assigned to another analyst/i);

    // Verify still belongs to Analyst 1
    const checkAlert = await FraudAlert.findById(openAlert._id);
    expect(checkAlert.assignedTo.toString()).toBe(analyst1._id.toString());
  });

  test('7. Returns 404 when attempting to assign a non-existent alert', async () => {
    const fakeId = '507f1f77bcf86cd799439011';
    const res = await request(app)
      .patch(`/api/v1/alerts/${fakeId}/assign`)
      .set('Authorization', `Bearer ${analyst1Token}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });

  test('8. Investigation Workspace API allows fraudAnalyst role and returns dossiers', async () => {
    // Assign to analyst 1
    await request(app)
      .patch(`/api/v1/alerts/${openAlert._id}/assign`)
      .set('Authorization', `Bearer ${analyst1Token}`);

    const res = await request(app)
      .get('/api/v1/investigations')
      .set('Authorization', `Bearer ${analyst1Token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].alertId._id.toString()).toBe(openAlert._id.toString());
  });

  test('9. Analyst Dashboard stats accurately reports activeAssigned count', async () => {
    // Initially 0 assigned
    let statsRes = await request(app)
      .get('/api/v1/alerts/stats')
      .set('Authorization', `Bearer ${analyst1Token}`);

    expect(statsRes.statusCode).toBe(200);
    expect(statsRes.body.data.activeAssigned).toBe(0);

    // Assign alert
    await request(app)
      .patch(`/api/v1/alerts/${openAlert._id}/assign`)
      .set('Authorization', `Bearer ${analyst1Token}`);

    statsRes = await request(app)
      .get('/api/v1/alerts/stats')
      .set('Authorization', `Bearer ${analyst1Token}`);

    expect(statsRes.statusCode).toBe(200);
    expect(statsRes.body.data.activeAssigned).toBe(1);
  });

  test('10. Persistence simulation: Repeated calls to My Status return persisted MongoDB data', async () => {
    await request(app)
      .patch(`/api/v1/alerts/${openAlert._id}/assign`)
      .set('Authorization', `Bearer ${analyst1Token}`);

    // Call 1
    const res1 = await request(app)
      .get('/api/v1/alerts/my')
      .set('Authorization', `Bearer ${analyst1Token}`);
    expect(res1.body.data.length).toBe(1);

    // Call 2 (simulating browser reload or page return)
    const res2 = await request(app)
      .get('/api/v1/alerts/my')
      .set('Authorization', `Bearer ${analyst1Token}`);
    expect(res2.body.data.length).toBe(1);
    expect(res2.body.data[0]._id.toString()).toBe(openAlert._id.toString());
  });

  test('11. Administrator can reassign an already assigned case to another analyst', async () => {
    // Assigned to analyst 1
    await request(app)
      .patch(`/api/v1/alerts/${openAlert._id}/assign`)
      .set('Authorization', `Bearer ${analyst1Token}`);

    // Administrator reassigns to analyst 2
    const reassignRes = await request(app)
      .patch(`/api/v1/alerts/${openAlert._id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ analystId: analyst2._id });

    expect(reassignRes.statusCode).toBe(200);
    expect(reassignRes.body.success).toBe(true);

    // Verify analyst 2 now sees it in My Status
    const analyst2Res = await request(app)
      .get('/api/v1/alerts/my')
      .set('Authorization', `Bearer ${analyst2Token}`);
    expect(analyst2Res.body.data.length).toBe(1);
    expect(analyst2Res.body.data[0]._id.toString()).toBe(openAlert._id.toString());

    // Verify analyst 1 no longer has it
    const analyst1Res = await request(app)
      .get('/api/v1/alerts/my')
      .set('Authorization', `Bearer ${analyst1Token}`);
    expect(analyst1Res.body.data.length).toBe(0);
  });

  test('12. Unauthenticated requests to assign or view My Status are rejected with 401', async () => {
    const assignRes = await request(app).patch(`/api/v1/alerts/${openAlert._id}/assign`);
    expect(assignRes.statusCode).toBe(401);

    const myRes = await request(app).get('/api/v1/alerts/my');
    expect(myRes.statusCode).toBe(401);
  });

  test('13. Customer calling /my receives only alerts where userId matches their ID', async () => {
    // Alert assigned to analyst1, userId is customerUser
    await request(app)
      .patch(`/api/v1/alerts/${openAlert._id}/assign`)
      .set('Authorization', `Bearer ${analyst1Token}`);

    const customerRes = await request(app)
      .get('/api/v1/alerts/my')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(customerRes.statusCode).toBe(200);
    expect(customerRes.body.success).toBe(true);
    expect(customerRes.body.data.length).toBe(1);
    expect(customerRes.body.data[0].userId._id.toString()).toBe(customerUser._id.toString());
  });
});
