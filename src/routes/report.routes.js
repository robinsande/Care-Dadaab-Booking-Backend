const express = require('express');
const reportController = require('../controllers/report.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { superAdminOnly } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { reportQueryRules, reportTypeParam } = require('../validators/report.validator');

const router = express.Router();

router.use(authenticate, superAdminOnly);

router.get(
  '/:type',
  reportTypeParam,
  validate(reportQueryRules),
  reportController.generateReport
);

module.exports = router;
