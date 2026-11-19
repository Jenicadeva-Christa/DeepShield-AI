const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/users.model');
const DetectionResult = require('../src/models/detectionresults.model');
const MediaUpload = require('../src/models/mediauploads.model');
const { connectDB, disconnectDB } = require('../src/config/db');
const { generateAccessToken, hashPassword } = require('../src/utils/crypto.utils');
const { analyzeVideoDeepfake } = require('../src/engine/videoDeepfake.engine');

jest.setTimeout(45000);

let token = null;
let user = null;

beforeAll(async () => {
  process.env.USE_MEMORY_DB = 'true';
  await connectDB();
  await User.deleteMany({});
  await DetectionResult.deleteMany({});
  await MediaUpload.deleteMany({});

  const passwordHash = await hashPassword('Password@123');
  user = await User.create({
    fullName: 'Video Tester',
    email: 'videotester@deepshield.ai',
    phone: '+919988776655',
    passwordHash,
    role: 'customer',
    status: 'active'
  });

  token = generateAccessToken({
    id: user._id,
    email: user.email,
    role: user.role,
    fullName: user.fullName
  });
});

afterAll(async () => {
  await disconnectDB();
});

describe('Video Deepfake Detection & Temporal Analysis Suite', () => {
  test('Engine: analyzeVideoDeepfake executes and produces perFrame timeline and indicators', async () => {
    const mockBuffer = Buffer.from('mock video data test payload');
    const result = await analyzeVideoDeepfake(mockBuffer);

    expect(result).toBeDefined();
    expect(result.verdict).toBeDefined();
    expect(['authentic', 'inconclusive', 'manipulated']).toContain(result.verdict);
    expect(typeof result.score).toBe('number');
    expect(result.confidence).toBeLessThanOrEqual(0.90);
    expect(Array.isArray(result.perFrame)).toBe(true);
    expect(result.perFrame.length).toBeGreaterThan(0);
    expect(Array.isArray(result.indicators)).toBe(true);
  });

  test('API: POST /api/v1/detect/video analyzes uploaded MP4 file and saves records', async () => {
    const fakeMp4 = Buffer.from('test mp4 binary payload stream');

    const res = await request(app)
      .post('/api/v1/detect/video')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fakeMp4, 'surveillance_clip.mp4');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.detection).toBeDefined();
    expect(res.body.data.detection.module).toBe('videoDeepfake');
    expect(res.body.data.detection.perFrame.length).toBeGreaterThan(0);
    expect(res.body.data.mediaRecord.mediaType).toBe('video');
  });

  test('API: POST /api/v1/detect/video accepts WebM video files', async () => {
    const fakeWebm = Buffer.from('test webm binary payload');

    const res = await request(app)
      .post('/api/v1/detect/video')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fakeWebm, 'webcam_capture.webm');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.detection.verdict).toBeDefined();
  });

  test('API: Rejects empty or missing video uploads', async () => {
    const res = await request(app)
      .post('/api/v1/detect/video')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
