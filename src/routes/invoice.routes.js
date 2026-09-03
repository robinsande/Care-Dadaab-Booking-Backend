const express = require('express');
const invoiceController = require('../controllers/invoice.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { anyStaff } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { mongoIdParam } = require('../validators/common.validator');
const { listInvoicesRules, updatePaymentStatusRules } = require('../validators/invoice.validator');

const router = express.Router();

router.use(authenticate, anyStaff);

router.get('/', validate(listInvoicesRules), invoiceController.listInvoices);
router.get('/:id', validate([mongoIdParam('id')]), invoiceController.getInvoice);
router.patch(
  '/:id/payment-status',
  validate([mongoIdParam('id'), ...updatePaymentStatusRules]),
  invoiceController.updatePaymentStatus
);

module.exports = router;
