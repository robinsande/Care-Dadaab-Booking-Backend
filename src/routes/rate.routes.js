const express = require('express');
const rateController = require('../controllers/rate.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { anyStaff, superAdminOnly } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { mongoIdParam } = require('../validators/common.validator');
const { createRateRules } = require('../validators/rate.validator');

const router = express.Router({ mergeParams: true });

router.use(authenticate);

router.get('/', anyStaff, validate([mongoIdParam('campId')]), rateController.getCampRates);
router.get(
  '/history',
  superAdminOnly,
  validate([mongoIdParam('campId')]),
  rateController.getRateHistory
);
router.post(
  '/',
  superAdminOnly,
  validate([mongoIdParam('campId'), ...createRateRules]),
  rateController.createRate
);

module.exports = router;
