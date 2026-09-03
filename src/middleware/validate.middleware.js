const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * Run a set of express-validator chains, then collect and format any errors
 * into the standard error envelope. Use as: validate([...chains]).
 *
 * @param {Array} validations Array of express-validator validation chains.
 * @returns {Array<Function>} Express middleware chain.
 */
const validate = (validations) => [
  ...validations,
  (req, _res, next) => {
    const result = validationResult(req);
    if (result.isEmpty()) return next();

    const errors = result.array().map((err) => ({
      field: err.path || err.param,
      message: err.msg,
    }));

    return next(ApiError.badRequest('Validation failed.', errors));
  },
];

module.exports = { validate };
