const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { sendError } = require('../utils/ApiResponse');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Centralised error handler. Translates known error shapes (ApiError, Mongoose
 * validation/cast/duplicate-key, JWT) into the consistent JSON error envelope.
 * Must be registered last, after all routes.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  let statusCode = 500;
  let message = 'Something went wrong.';
  let errors = [];

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Validation failed.';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid value for "${err.path}".`;
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `A record with this ${field} already exists.`;
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Invalid or expired authentication token.';
  }

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${err.stack || err.message}`);
  }

  const body = {
    statusCode,
    message,
    errors,
  };

  // Expose stack traces only outside production to aid debugging.
  if (!env.isProduction && statusCode >= 500) {
    body.errors = [...errors, { stack: err.stack }];
  }

  return sendError(res, body);
};

module.exports = { errorHandler };
