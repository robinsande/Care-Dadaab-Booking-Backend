const { body, query } = require('express-validator');

const createMouRules = [
  body('mouType').isIn(['partner', 'individual']),
  body('partyName').trim().notEmpty(),
  body('counterpartyCategory').isIn(['implementing_partner', 'government', 'municipality', 'staff']),
  body('startDate').isISO8601(),
  body('endDate').optional().isISO8601(),
  body('rateAmount').optional().isFloat({ min: 0 }),
  body('rateCurrency').optional().isLength({ min: 3, max: 3 }),
  body('status').optional().isIn(['draft', 'active', 'terminated', 'renewed']),
  body('documentRef').optional().trim(),
];

const mouQueryRules = [
  query('mouType').optional().isIn(['partner', 'individual']),
  query('status').optional().isIn(['draft', 'active', 'expiring_soon', 'expired', 'terminated', 'renewed']),
  query('search').optional().trim(),
];

const paymentRules = [
  body('amountPaid').optional().isFloat({ min: 0 }),
  body('paidDate').optional().isISO8601(),
  body('status').optional().isIn(['pending', 'paid', 'overdue', 'waived']),
];

module.exports = { createMouRules, mouQueryRules, paymentRules };