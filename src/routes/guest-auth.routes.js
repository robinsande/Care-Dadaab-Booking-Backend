const express = require('express');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const controller = require('../controllers/guest-auth.controller');
const { authenticateGuest } = require('../middleware/guest-auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  registrationRules, loginRules, resetRequestRules, resetRules, profileRules,
} = require('../validators/guest.validator');

const router = express.Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isProduction ? 30 : 0,
  skip: () => !env.isProduction,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', limiter, validate(registrationRules), controller.register);
router.post('/login', limiter, validate(loginRules), controller.login);
router.post('/request-reset', limiter, validate(resetRequestRules), controller.requestReset);
router.post('/reset', limiter, validate(resetRules), controller.reset);
router.get('/me', authenticateGuest, controller.me);
router.put('/me', authenticateGuest, validate(profileRules), controller.updateProfile);

module.exports = router;
