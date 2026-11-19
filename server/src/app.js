const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const auditRoutes = require('./routes/audit.routes');
const transactionRoutes = require('./routes/transaction.routes');
const alertRoutes = require('./routes/alert.routes');
const detectionRoutes = require('./routes/detection.routes');
const identityRoutes = require('./routes/identity.routes');
const reportRoutes = require('./routes/report.routes');
const adminRoutes = require('./routes/admin.routes');
const investigationRoutes = require('./routes/investigation.routes');
const notificationRoutes = require('./routes/notification.routes');
const voiceRoutes = require('./routes/voice.routes');

const app = express();

// Security Middlewares
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_URL || true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(mongoSanitize());

// Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, message: 'Too many requests from this IP, please try again after 15 minutes.' }
});
app.use('/api/', apiLimiter);

// Root Welcome Endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'DeepShield AI Fraud Detection & Identity Verification Engine API Server is running.',
    version: '1.0.0',
    documentation: {
      health: '/api/v1/health',
      clientUI: 'http://localhost:5173',
      endpoints: {
        auth: '/api/v1/auth',
        transactions: '/api/v1/transactions',
        detection: '/api/v1/detect',
        identity: '/api/v1/identity',
        alerts: '/api/v1/alerts',
        investigations: '/api/v1/investigations',
        reports: '/api/v1/reports',
        admin: '/api/v1/admin',
        auditLogs: '/api/v1/audit-logs',
        notifications: '/api/v1/notifications',
        voice: '/api/v1/voice'
      }
    }
  });
});

// Health Endpoint
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    system: 'DeepShield AI Engine',
    uptime: process.uptime(),
    timestamp: new Date()
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/audit-logs', auditRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/detect', detectionRoutes);
app.use('/api/v1/voice', voiceRoutes);
app.use('/api/v1/identity', identityRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/investigations', investigationRoutes);
app.use('/api/v1/notifications', notificationRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
