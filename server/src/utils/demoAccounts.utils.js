/**
 * Predefined DeepShield AI Demo Accounts Utility
 * Manages detection and normalization for the six authorized demo profiles.
 */

const PREDEFINED_DEMO_EMAILS = Object.freeze([
  'customer1@deepshield.ai',
  'customer2@deepshield.ai',
  'customer3@deepshield.ai',
  'analyst1@deepshield.ai',
  'analyst2@deepshield.ai',
  'admin@deepshield.ai'
]);

const PREDEFINED_DEMO_SET = new Set(PREDEFINED_DEMO_EMAILS);

/**
 * Normalizes an email string by trimming whitespace and converting to lowercase
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Checks whether an email matches any of the six predefined demo accounts
 * @param {string} email
 * @returns {boolean}
 */
function isPredefinedDemoEmail(email) {
  return PREDEFINED_DEMO_SET.has(normalizeEmail(email));
}

/**
 * Checks whether a user document corresponds to one of the six predefined demo accounts
 * @param {Object} user
 * @returns {boolean}
 */
function isPredefinedDemoUser(user) {
  if (!user || !user.email) return false;
  return isPredefinedDemoEmail(user.email);
}

module.exports = {
  PREDEFINED_DEMO_EMAILS,
  normalizeEmail,
  isPredefinedDemoEmail,
  isPredefinedDemoUser
};
