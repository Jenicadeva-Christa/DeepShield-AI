const User = require('../models/users.model');
const { verifyAccessToken } = require('../utils/crypto.utils');

async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token required. Please log in.'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid session user.'
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Account is currently ${user.status}. Please contact an administrator.`
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired access token.'
    });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized.'
      });
    }

    const rawAllowedRoles = Array.isArray(roles[0]) ? roles[0] : roles;
    const allowedRoles = new Set(rawAllowedRoles);
    // If analyst or fraudAnalyst is allowed, permit both aliases seamlessly
    if (allowedRoles.has('analyst') || allowedRoles.has('fraudAnalyst')) {
      allowedRoles.add('analyst');
      allowedRoles.add('fraudAnalyst');
    }

    if (!allowedRoles.has(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Requires one of these roles: ${Array.from(allowedRoles).join(', ')}`
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole
};
