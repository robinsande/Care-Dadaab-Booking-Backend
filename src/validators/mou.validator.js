const { body, query } = require('express-validator');
const { MOU_CATEGORY_VALUES } = require('../utils/mou');

const createMouRules = [
  body('mouType').isIn(['guest_stay', 'revenue']),
  body('partyName').trim().notEmpty(),
  body('counterpartyCategory').isIn(MOU_CATEGORY_VALUES),
  body('startDate').isISO8601(),
  body('endDate').optional().isISO8601(),
  body('rateAmount').optional().isFloat({ min: 0 }),
  body('rateCurrency').optional().isLength({ min: 3, max: 3 }),
  body('status').optional().isIn(['draft', 'active', 'terminated', 'renewed']),
  body('documentRef').optional().trim(),
];

const mouQueryRules = [
  query('mouType').optional().isIn(['guest_stay', 'revenue']),
  query('counterpartyCategory').optional().isIn(MOU_CATEGORY_VALUES),
  query('status').optional().isIn(['draft', 'active', 'expiring_soon', 'expired', 'terminated', 'renewed']),
  query('search').optional().trim(),
];

const paymentRules = [
  body('amountPaid').optional().isFloat({ min: 0 }),
  body('paidDate').optional().isISO8601(),
  body('status').optional().isIn(['pending', 'paid', 'overdue', 'waived']),
];

module.exports = { createMouRules, mouQueryRules, paymentRules };