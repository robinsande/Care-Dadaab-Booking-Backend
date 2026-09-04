const dotenv = require('dotenv');

dotenv.config();

/**
 * Centralised, validated access to environment variables.
 * Fail fast at boot time if a required variable is missing.
 */
const required = ['MONGODB_URI', 'JWT_SECRET'];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  // eslint-disable-next-line no-console
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const toBool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === 'true';
};

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  port: parseInt(process.env.PORT, 10) || 5000,
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  mongoUri: process.env.MONGODB_URI,

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',

  corsOrigin: process.env.CORS_ORIGIN || '*',

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: toBool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : undefined,
  },
  brevoApiKey: process.env.BREVO_API_KEY,

  emailFrom: {
    name: process.env.EMAIL_FROM_NAME || 'CARE Kenya Dadaab Accommodation',
    address: process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER || 'no-reply@example.com',
  },

  support: {
    email: process.env.SUPPORT_EMAIL || 'accommodation.dadaab@care.org',
    phone: process.env.SUPPORT_PHONE || '',
  },

  bookingReferencePrefix: process.env.BOOKING_REFERENCE_PREFIX || 'CARE',
};

module.exports = env;
