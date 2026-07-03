const rateLimit = require('express-rate-limit');
const { rateLimitConfig, authRateLimitConfig } = require('../config/security');

const globalRateLimit = rateLimit(rateLimitConfig);
const authRateLimit = rateLimit(authRateLimitConfig);

module.exports = { globalRateLimit, authRateLimit };
