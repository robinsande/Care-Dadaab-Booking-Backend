const { body, query } = require('express-validator');
const { ROOM_STATUS_VALUES } = require('../utils/constants');

const createRoomRules = [
  body('campId').isMongoId().withMessage('A valid camp id is required.'),
  body('blockId').isMongoId().withMessage('A valid block id is required.'),
  body('roomNumber').trim().notEmpty().withMessage('Room number is required.'),
  body('capacity').isInt({ min: 1 }).withMessage('Capacity must be at least 1.'),
  body('status').optional().isIn(ROOM_STATUS_VALUES),
  body('notes').optional().trim(),
  body('isActive').optional().isBoolean(),
];

const updateRoomRules = [
  body('blockId').optional().isMongoId(),
  body('roomNumber').optional().trim().notEmpty(),
  body('capacity').optional().isInt({ min: 1 }),
  body('status').optional().isIn(ROOM_STATUS_VALUES),
  body('notes').optional().trim(),
  body('isActive').optional().isBoolean(),
];

const listAvailableRoomsRules = [
  query('campId').optional().isMongoId(),
  query('blockId').optional().isMongoId(),
  query('arrivalDate').optional().isISO8601(),
  query('departureDate').optional().isISO8601(),
];

module.exports = { createRoomRules, updateRoomRules, listAvailableRoomsRules };
