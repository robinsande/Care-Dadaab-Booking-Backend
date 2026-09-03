const express = require('express');
const dashboardController = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { anyStaff } = require('../middleware/role.middleware');

const router = express.Router();

router.use(authenticate, anyStaff);
router.get('/', dashboardController.getDashboard);

module.exports = router;
