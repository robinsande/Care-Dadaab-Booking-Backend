const { body } = require('express-validator');

const registrationRules = [
  body('firstName').trim().notEmpty().withMessage('First name is required.'),
  body('lastName').trim().notEmpty().withMessage('Last name is required.'),
  body('email').isEmail().normalizeEmail().withMessage('A valid email is required.'),
  body('phone').optional().trim(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.'),
];
const loginRules = [
  body('email').isEmail().normalizeEmail().withMessage('A valid email is required.'),
  body('password').notEmpty().withMessage('Password is required.'),
];
const resetRequestRules = [body('email').isEmail().normalizeEmail().withMessage('A valid email is required.')];
const resetRules = [
  body('token').trim().notEmpty().withMessage('Recovery token is required.'),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.'),
];

module.exports = { registrationRules, loginRules, resetRequestRules, resetRules };
