const { body, query } = require('express-validator');
const { INVOICE_PAYMENT_STATUS_VALUES } = require('../utils/constants');

const listInvoicesRules = [
  query('paymentStatus').optional().isIn(INVOICE_PAYMENT_STATUS_VALUES),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
];

const updatePaymentStatusRules = [
  body('paymentStatus')
    .isIn(INVOICE_PAYMENT_STATUS_VALUES)
    .withMessage('Invalid payment status.'),
];

module.exports = { listInvoicesRules, updatePaymentStatusRules };
