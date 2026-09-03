const express = require('express');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { loginRules, changePasswordRules } = require('../validators/auth.validator');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isProduction ? 30 : 0,
  skip: () => !env.isProduction,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again later.',
    errors: [],
  },
});

router.post('/login', loginLimiter, validate(loginRules), authController.login);
router.get('/me', authenticate, authController.getMe);
router.patch(
  '/change-password',
  authenticate,
  validate(changePasswordRules),
  authController.changePassword
);

module.exports = router;
