const { body } = require('express-validator');
const { STAY_TYPE_VALUES } = require('../utils/constants');

const createRateRules = [
  body('stayType')
    .isIn(STAY_TYPE_VALUES)
    .withMessage(`Stay type must be one of: ${STAY_TYPE_VALUES.join(', ')}.`),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a non-negative number.'),
  body('currency').optional().trim().isLength({ min: 3, max: 3 }),
  body('notes').optional().trim(),
];

module.exports = { createRateRules };
