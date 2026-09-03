const express = require('express');
const settingsController = require('../controllers/settings.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { superAdminOnly } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { updateSettingsRules } = require('../validators/settings.validator');

const router = express.Router();

router.use(authenticate, superAdminOnly);

router.get('/', settingsController.getSettings);
router.put('/', validate(updateSettingsRules), settingsController.updateSettings);

module.exports = router;
