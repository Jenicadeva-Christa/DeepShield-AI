const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/users.model');
const Customer = require('../src/models/customers.model');
const VoiceRecord = require('../src/models/voicerecords.model');
const DetectionResult = require('../src/models/detectionresults.model');
const { connectDB } = require('../src/config/db');
const { generateAccessToken, hashPassword } = require('../src/utils/crypto.utils');
const {
  convertAudioToFloat32PCM,
  extractAcousticFeatures,
  processVoiceAudio
} = require('../src/services/voiceRecognition.service');

jest.setTimeout(45000);

let testUser = null;
let testToken = null;

// Helper to generate a clean synthetic WAV audio buffer in memory
function generateTestWavBuffer(durationSec = 2, freq = 300) {
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * durationSec);
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + numSamples * 2, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // Audio format 1 (PCM)
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(sampleRate, 24); // Sample rate 16000
  header.writeUInt32LE(sampleRate * 2, 28); // Byte rate
  header.writeUInt16LE(2, 32); // Block align
  header.writeUInt16LE(16, 34); // Bits per sample
  header.write('data', 36);
  header.writeUInt32LE(numSamples * 2, 40);

  const data = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * 12000;
    data.writeInt16LE(Math.round(sample), i * 2);
  }

  return Buffer.concat([header, data]);
}

beforeAll(async () => {
  await connectDB();
  await VoiceRecord.deleteMany({});
  await DetectionResult.deleteMany({ module: 'voiceFraud' });

  const passwordHash = await hashPassword('VoiceSecret@123');
  testUser = await User.create({
    fullName: 'Rahul Verma',
    email: 'rahul.voice@deepshield.ai',
    phone: '+919988776655',
    passwordHash,
    role: 'customer',
    status: 'active'
  });

  await Customer.create({
    userId: testUser._id,
    accountNumber: '998800112233',
    accountType: 'savings',
    balance: 50000,
    voiceProfile: {
      enrolled: true,
      enrolledAt: new Date(),
      mfccMean: [12.4, -4.2, 3.1, -1.8, 0.9, -0.4, 0.2, -0.1, 0.05, -0.02, 0.01, 0.005, -0.002]
    }
  });

  testToken = generateAccessToken({
    id: testUser._id,
    email: testUser.email,
    role: testUser.role,
    fullName: testUser.fullName
  });
});

describe('Local AI Speech Recognition & Voice Forensics Test Suite', () => {
  test('[VOICE-01] Local Model Status Endpoint reports Whisper ONNX with zero cloud dependencies', async () => {
    const res = await request(app)
      .get('/api/v1/voice/model/status')
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.modelName).toBe('Xenova/whisper-tiny.en');
    expect(res.body.data.externalCloudDependencies).toBe(false);
    expect(res.body.data.commercialApiKeysRequired).toBe(false);
    expect(res.body.data.status).toBe('active');
  });

  test('[VOICE-02] Audio conversion converts WAV buffer to Float32Array PCM at 16,000 Hz', async () => {
    const wavBuf = generateTestWavBuffer(1.5, 440);
    const float32 = await convertAudioToFloat32PCM(wavBuf);

    expect(float32).toBeInstanceOf(Float32Array);
    expect(float32.length).toBeGreaterThan(1000);
    expect(float32.length).toBeCloseTo(16000 * 1.5, -2);
  });

  test('[VOICE-03] Acoustic feature extractor computes spectral flatness and liveness score', async () => {
    const wavBuf = generateTestWavBuffer(2, 350);
    const float32 = await convertAudioToFloat32PCM(wavBuf);
    const features = extractAcousticFeatures(float32, 16000);

    expect(features).toHaveProperty('spectralFlatness');
    expect(features).toHaveProperty('spectralCentroid');
    expect(features).toHaveProperty('livenessScore');
    expect(features.livenessScore).toBeGreaterThanOrEqual(0);
    expect(features.livenessScore).toBeLessThanOrEqual(100);
  });

  test('[VOICE-04] Full voice pipeline executes local transcription, forensic scoring and returns clean structure', async () => {
    const wavBuf = generateTestWavBuffer(3, 400);
    const result = await processVoiceAudio({
      audioBuffer: wavBuf,
      fileName: 'test_voice.wav',
      durationSec: 3
    });

    expect(result).toHaveProperty('transcript');
    expect(typeof result.transcript).toBe('string');
    expect(result).toHaveProperty('wordCount');
    expect(result).toHaveProperty('speechConfidence');
    expect(result.speechConfidence).toBeLessThanOrEqual(0.90); // Section 9.1 Mandate
    expect(result).toHaveProperty('combinedVerdict');
    expect(['authentic', 'safe', 'suspicious', 'malicious', 'inconclusive']).toContain(result.combinedVerdict);
    expect(result.speechModel).toContain('whisper-tiny.en');
  });

  test('[VOICE-05] POST /api/v1/voice/recognize performs upload, recognition, and MongoDB persistence', async () => {
    const wavBuf = generateTestWavBuffer(3.2, 500);

    const res = await request(app)
      .post('/api/v1/voice/recognize')
      .set('Authorization', `Bearer ${testToken}`)
      .attach('file', wavBuf, 'test_recording.wav');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('voiceRecord');
    expect(res.body.data).toHaveProperty('detection');

    const voiceRecord = res.body.data.voiceRecord;
    expect(voiceRecord.transcript).toBeDefined();
    expect(voiceRecord.userId.toString()).toBe(testUser._id.toString());
    expect(voiceRecord.speechConfidence).toBeLessThanOrEqual(0.90);
    expect(voiceRecord.status).toBe('completed');

    // Verify record is saved in MongoDB
    const dbRecord = await VoiceRecord.findById(voiceRecord._id);
    expect(dbRecord).not.toBeNull();
    expect(dbRecord.transcript).toBe(voiceRecord.transcript);
  });

  test('[VOICE-06] GET /api/v1/voice/history returns recorded speech sessions for user', async () => {
    const res = await request(app)
      .get('/api/v1/voice/history')
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0]).toHaveProperty('transcript');
  });

  test('[VOICE-07] GET /api/v1/voice/:id retrieves a specific voice analysis record', async () => {
    const historyRes = await request(app)
      .get('/api/v1/voice/history')
      .set('Authorization', `Bearer ${testToken}`);

    const targetId = historyRes.body.data[0]._id;

    const res = await request(app)
      .get(`/api/v1/voice/${targetId}`)
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id.toString()).toBe(targetId.toString());
  });
});
