const express = require('express');
const controller = require('../controllers/mou.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { anyStaff, superAdminOnly } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { mongoIdParam } = require('../validators/common.validator');
const { createMouRules, mouQueryRules, paymentRules } = require('../validators/mou.validator');

const router = express.Router();
router.get('/public', controller.publicList);
router.use(authenticate, anyStaff);
router.get('/', validate(mouQueryRules), controller.list);
router.get('/:id/active', validate([mongoIdParam('id')]), controller.active);
router.get('/:id/payments', validate([mongoIdParam('id')]), controller.payments);
router.post('/', superAdminOnly, validate(createMouRules), controller.create);
router.patch('/payments/:paymentId', superAdminOnly, validate([mongoIdParam('paymentId'), ...paymentRules]), controller.updatePayment);

module.exports = router;