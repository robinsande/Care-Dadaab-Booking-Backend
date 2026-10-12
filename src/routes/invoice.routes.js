const express = require('express');
const invoiceController = require('../controllers/invoice.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { anyStaff } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { mongoIdParam } = require('../validators/common.validator');
const { listInvoicesRules, updatePaymentStatusRules } = require('../validators/invoice.validator');
const { body } = require('express-validator');

const router = express.Router();

router.use(authenticate, anyStaff);

router.get('/', validate(listInvoicesRules), invoiceController.listInvoices);
router.get('/:id', validate([mongoIdParam('id')]), invoiceController.getInvoice);
router.patch(
  '/:id/payment-status',
  validate([mongoIdParam('id'), ...updatePaymentStatusRules]),
  invoiceController.updatePaymentStatus
);
router.post(
  '/:id/mpesa-confirmation',
  validate([
    mongoIdParam('id'),
    body('message').isString().trim().isLength({ min: 10, max: 2000 }),
    body('confirmed').isBoolean().toBoolean(),
  ]),
  invoiceController.confirmMpesaPayment
);

module.exports = router;
