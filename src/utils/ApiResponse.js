/**
 * Helpers that enforce the consistent JSON response envelope defined in
 * SYSTEM_CONTRACT.md.
 *
 *   Success: { success: true, message, data }
 *   Error:   { success: false, message, errors }
 */

const sendSuccess = (res, { statusCode = 200, message = 'Success', data = null } = {}) =>
  res.status(statusCode).json({
    success: true,
    message,
    data,
  });

const sendError = (res, { statusCode = 500, message = 'Something went wrong', errors = [] } = {}) =>
  res.status(statusCode).json({
    success: false,
    message,
    errors,
  });

module.exports = { sendSuccess, sendError };
