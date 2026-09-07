const { body } = require('express-validator');

const loginRules = [
  body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

const mfaRules = [
  body('mfaToken').notEmpty().withMessage('Verification session is required.'),
  body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Enter the six-digit code from Microsoft Authenticator.'),
];

const changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required.'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long.'),
];

module.exports = { loginRules, mfaRules, changePasswordRules };
