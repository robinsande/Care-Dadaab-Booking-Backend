const { body, query } = require('express-validator');
const { mongoIdParam } = require('./common.validator');

const bookingRequestRules = [
  body('type').isIn(['booking', 'adjustment', 'early_checkout', 'extension']).withMessage('Invalid request type.'),
  body('campId').optional().isMongoId(),
  body('bookingId').optional().isMongoId(),
  body('arrivalDate').optional().isISO8601(),
  body('departureDate').optional().isISO8601(),
  body('newDepartureDate').optional().isISO8601(),
  body('stayType').optional().isIn(['Short Stay', 'Long Stay']),
  body('reason').optional().trim(),
];
const resolveRules = [
  body('action').optional().isIn(['approve', 'reject']),
  body('campId').optional().isMongoId(),
  body('blockId').optional().isMongoId(),
  body('roomId').optional().isMongoId(),
  body('resolutionNote').optional().trim(),
];
const listRules = [query('status').optional().isIn(['pending', 'approved', 'rejected'])];
module.exports = { bookingRequestRules, resolveRules, listRules, mongoIdParam };
