const Idempotency = require('../models/idempotencies.model');

/**
 * Idempotency Middleware to prevent duplicate submissions
 */
async function idempotencyGuard(req, res, next) {
  const idempotencyKey =
    req.get('Idempotency-Key') ||
    req.get('X-Idempotency-Key') ||
    req.body?.idempotencyKey;

  if (!idempotencyKey || !req.user?._id) {
    return next();
  }

  const userId = req.user._id;

  try {
    const existing = await Idempotency.findOne({ key: idempotencyKey, userId });

    if (existing) {
      if (existing.status === 'completed') {
        return res.status(existing.responseCode || 200).json(existing.responseBody);
      }
      if (existing.status === 'pending') {
        return res.status(409).json({
          success: false,
          code: 'IDEMPOTENCY_IN_PROGRESS',
          message: 'A request with this idempotency key is currently being processed. Please wait.'
        });
      }
      // If previous status was 'failed', allow safe re-attempt by updating status to pending
      existing.status = 'pending';
      await existing.save();
    } else {
      await Idempotency.create({
        key: idempotencyKey,
        userId,
        endpoint: req.originalUrl || req.baseUrl,
        status: 'pending'
      });
    }

    // Intercept response to capture final outcome
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      const statusCode = res.statusCode || 200;
      const finalStatus = statusCode >= 200 && statusCode < 400 ? 'completed' : 'failed';

      Idempotency.findOneAndUpdate(
        { key: idempotencyKey, userId },
        {
          $set: {
            status: finalStatus,
            responseCode: statusCode,
            responseBody: body
          }
        }
      ).catch((err) => {
        console.error('[IdempotencyGuard] Error persisting response:', err.message);
      });

      return originalJson(body);
    };

    next();
  } catch (err) {
    // If unique constraint error (race condition on insert), catch and return 409
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'A duplicate request with this idempotency key was received simultaneously.'
      });
    }
    next(err);
  }
}

module.exports = { idempotencyGuard };
