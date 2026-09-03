/**
 * Wraps an async Express handler so rejected promises are forwarded to the
 * centralised error middleware instead of crashing the process.
 *
 * @param {Function} fn async (req, res, next) => {}
 * @returns {Function} Express middleware.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
