const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/users.model');
const Customer = require('../src/models/customers.model');
const Transaction = require('../src/models/transactions.model');
const Report = require('../src/models/reports.model');
const { connectDB, disconnectDB } = require('../src/config/db');
const { generateAccessToken, hashPassword } = require('../src/utils/crypto.utils');
const { DecisionTreeForecaster } = require('../src/engine/decisionTreeForecaster');

jest.setTimeout(45000);

let analystToken = null;
let analystUser = null;
let customerUser = null;
let customerProfile = null;

beforeAll(async () => {
  await connectDB();
  await User.deleteMany({});
  await Customer.deleteMany({});
  await Transaction.deleteMany({});
  await Report.deleteMany({});

  const passwordHash = await hashPassword('Password@123');

  analystUser = await User.create({
    fullName: 'Rohan Sharma',
    email: 'rohan.analyst@deepshield.ai',
    phone: '+919876543210',
    passwordHash,
    role: 'fraudAnalyst',
    status: 'active'
  });

  customerUser = await User.create({
    fullName: 'Jenica Samuel',
    email: 'jenicasamuel725@gmail.com',
    phone: '+919876543211',
    passwordHash,
    role: 'customer',
    status: 'active'
  });

  customerProfile = await Customer.create({
    userId: customerUser._id,
    accountNumber: '300943325256',
    balance: 500000,
    currency: 'INR'
  });

  analystToken = generateAccessToken({
    id: analystUser._id,
    email: analystUser.email,
    role: analystUser.role,
    fullName: analystUser.fullName
  });

  // Seed transactions across dates with diverse risk levels
  const now = new Date();
  const pastDates = [
    { daysAgo: 6, low: 4, med: 2, high: 1 },
    { daysAgo: 5, low: 5, med: 3, high: 0 },
    { daysAgo: 4, low: 3, med: 1, high: 2 },
    { daysAgo: 3, low: 6, med: 2, high: 1 },
    { daysAgo: 2, low: 4, med: 4, high: 3 },
    { daysAgo: 1, low: 2, med: 3, high: 4 },
    { daysAgo: 0, low: 3, med: 2, high: 5 } // Today
  ];

  for (const day of pastDates) {
    const d = new Date(now);
    d.setDate(d.getDate() - day.daysAgo);
    d.setHours(10, 0, 0, 0);

    for (let i = 0; i < day.low; i++) {
      await Transaction.create({
        customerId: customerProfile._id,
        userId: customerUser._id,
        type: 'transfer',
        amount: 2500,
        riskLevel: 'low',
        status: 'approved',
        timestamp: new Date(d.getTime() + i * 60000),
        createdAt: new Date(d.getTime() + i * 60000)
      });
    }

    for (let i = 0; i < day.med; i++) {
      await Transaction.create({
        customerId: customerProfile._id,
        userId: customerUser._id,
        type: 'transfer',
        amount: 15000,
        riskLevel: 'medium',
        status: 'pendingStepUp',
        timestamp: new Date(d.getTime() + (10 + i) * 60000),
        createdAt: new Date(d.getTime() + (10 + i) * 60000)
      });
    }

    for (let i = 0; i < day.high; i++) {
      await Transaction.create({
        customerId: customerProfile._id,
        userId: customerUser._id,
        type: 'transfer',
        amount: 150000,
        riskLevel: 'high',
        status: 'blocked',
        timestamp: new Date(d.getTime() + (20 + i) * 60000),
        createdAt: new Date(d.getTime() + (20 + i) * 60000)
      });
    }
  }
});

afterAll(async () => {
  await disconnectDB();
});

describe('Daily Risk Timeline & Decision Tree Forecaster Suite', () => {

  test('Test 1: Decision Tree aggregates continuous daily time-series with risk breakdown', async () => {
    const txs = await Transaction.find({}).lean();
    expect(txs.length).toBeGreaterThan(20);

    const series = DecisionTreeForecaster.aggregateDailyRiskSeries(txs);
    expect(series.length).toBeGreaterThanOrEqual(7);

    // Each day should have low, medium, high counts
    const today = series[series.length - 1];
    expect(today.high).toBe(5);
    expect(today.medium).toBe(2);
    expect(today.low).toBe(3);
    expect(today.displayDate).toBe('Today');
  });

  test('Test 2: CART Decision Tree regressor builds and predicts tomorrow with explainable decision rules', () => {
    const dummySeries = [
      { date: '2026-10-16', dayOfWeek: 5, isWeekend: 0, low: 5, medium: 2, high: 1, total: 8, rolling3DayHigh: 1, rolling3DayTotal: 8 },
      { date: '2026-10-17', dayOfWeek: 6, isWeekend: 1, low: 2, medium: 4, high: 3, total: 9, rolling3DayHigh: 2, rolling3DayTotal: 8.5 },
      { date: '2026-10-18', dayOfWeek: 0, isWeekend: 1, low: 1, medium: 3, high: 4, total: 8, rolling3DayHigh: 2.7, rolling3DayTotal: 8.3 },
      { date: '2026-10-19', dayOfWeek: 1, isWeekend: 0, low: 8, medium: 2, high: 1, total: 11, rolling3DayHigh: 2.7, rolling3DayTotal: 9.3 },
      { date: '2026-10-20', dayOfWeek: 2, isWeekend: 0, low: 7, medium: 2, high: 1, total: 10, rolling3DayHigh: 2, rolling3DayTotal: 9.7 },
      { date: '2026-10-21', dayOfWeek: 3, isWeekend: 0, low: 6, medium: 3, high: 2, total: 11, rolling3DayHigh: 1.3, rolling3DayTotal: 10.7 },
      { date: '2026-10-22', dayOfWeek: 4, isWeekend: 0, low: 5, medium: 4, high: 3, total: 12, rolling3DayHigh: 2, rolling3DayTotal: 11 }
    ];

    const forecaster = new DecisionTreeForecaster({ maxDepth: 3 });
    const tree = forecaster.train(dummySeries);
    expect(tree).toBeDefined();

    const forecast = forecaster.predictTomorrow(dummySeries);
    expect(forecast).toBeDefined();
    expect(forecast.predicted).toBeDefined();
    expect(forecast.predicted.high).toBeGreaterThanOrEqual(0);
    expect(forecast.predicted.medium).toBeGreaterThanOrEqual(0);
    expect(forecast.predicted.low).toBeGreaterThanOrEqual(0);
    expect(forecast.predicted.total).toBeGreaterThanOrEqual(1);
    expect(forecast.decisionPath.length).toBeGreaterThan(0);
    expect(forecast.confidence).toBeGreaterThanOrEqual(70);
  });

  test('Test 3: API /api/v1/reports/transactions returns dailyRiskTrends, chartSeries, and tomorrowForecast', async () => {
    const res = await request(app)
      .get('/api/v1/reports/transactions')
      .set('Authorization', `Bearer ${analystToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reportType).toBe('transactionSummary');
    expect(res.body.data.dailyRiskTrends).toBeDefined();
    expect(Array.isArray(res.body.data.dailyRiskTrends)).toBe(true);
    expect(res.body.data.chartSeries).toBeDefined();
    expect(Array.isArray(res.body.data.chartSeries)).toBe(true);

    const tomorrowEntry = res.body.data.chartSeries.find(s => s.isPrediction === true);
    expect(tomorrowEntry).toBeDefined();
    expect(tomorrowEntry.predictedHigh).toBeDefined();
    expect(tomorrowEntry.predictedMedium).toBeDefined();
    expect(tomorrowEntry.predictedLow).toBeDefined();

    expect(res.body.data.tomorrowForecast).toBeDefined();
    expect(res.body.data.tomorrowForecast.predicted).toBeDefined();
    expect(res.body.data.tomorrowForecast.modelType).toContain('Decision Tree');
    expect(res.body.data.tomorrowForecast.recommendation).toBeDefined();
  });
});
