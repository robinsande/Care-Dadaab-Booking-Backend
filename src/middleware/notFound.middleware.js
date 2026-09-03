const ApiError = require('../utils/ApiError');

/**
 * Catch-all for unmatched routes. Forwards a 404 to the error handler so all
 * responses use the same JSON envelope.
 */
const notFound = (req, _res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

module.exports = { notFound };
