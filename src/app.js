const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const routes = require('./routes');
const { notFound } = require('./middleware/notFound.middleware');
const { errorHandler } = require('./middleware/error.middleware');

/**
 * Build and configure the Express application. Kept separate from server.js so
 * the app can be imported for testing without opening a network port.
 */
const app = express();

// Security & hardening.
app.use(helmet());

const corsOptions =
  env.corsOrigin === '*'
    ? { origin: true }
    : { origin: env.corsOrigin.split(',').map((o) => o.trim()) };
app.use(cors(corsOptions));

// Body parsing.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Strip keys containing prohibited characters ($ and .) to prevent NoSQL injection.
app.use(mongoSanitize());

// Request logging (skip in test environments).
if (env.nodeEnv !== 'test') {
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
}

// Rate limiting — strict in production, disabled in local development.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isProduction ? 2000 : 0,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !env.isProduction,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
    errors: [],
  },
});
app.use(env.apiPrefix, limiter);

// API routes.
app.use(env.apiPrefix, routes);

// Root welcome.
app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'CARE Accommodation Management System (CAMS) API',
    data: { version: '1.0', docs: `${env.apiPrefix}/health` },
  });
});

// 404 + centralised error handling (must be last).
app.use(notFound);
app.use(errorHandler);

module.exports = app;
