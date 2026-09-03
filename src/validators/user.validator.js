const { body } = require('express-validator');
const { ROLE_VALUES } = require('../utils/constants');

const createUserRules = [
  body('firstName').trim().notEmpty().withMessage('First name is required.'),
  body('lastName').trim().notEmpty().withMessage('Last name is required.'),
  body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('phone').optional().trim(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long.'),
  body('role')
    .optional()
    .isIn(ROLE_VALUES)
    .withMessage(`Role must be one of: ${ROLE_VALUES.join(', ')}.`),
];

const updateUserRules = [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty.'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty.'),
  body('email').optional().isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('phone').optional().trim(),
  body('password')
    .optional()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long.'),
  body('role')
    .optional()
    .isIn(ROLE_VALUES)
    .withMessage(`Role must be one of: ${ROLE_VALUES.join(', ')}.`),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean.'),
];

module.exports = { createUserRules, updateUserRules };
