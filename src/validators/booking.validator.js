const { body, query } = require('express-validator');
const {
  GENDER_VALUES,
  BOOKING_STATUS_VALUES,
  STAY_TYPE_VALUES,
} = require('../utils/constants');
const { startOfToday } = require('../utils/dates');

const guestFieldRules = [
  body('firstName').trim().notEmpty().withMessage('First name is required.'),
  body('lastName').trim().notEmpty().withMessage('Last name is required.'),
  body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('phone').trim().notEmpty().withMessage('Phone number is required.'),
  body('organisation').optional().trim(),
  body('reasonForVisit').optional().trim(),
  body('gender')
    .optional()
    .isIn(GENDER_VALUES)
    .withMessage(`Gender must be one of: ${GENDER_VALUES.join(', ')}.`),
  body('contractType').optional().trim(),
  body('departureCountry').optional().trim(),
  body('remarks').optional().trim(),
  body('driverPickup').optional().isBoolean().withMessage('driverPickup must be a boolean.'),
];

const dateRules = [
  body('arrivalDate')
    .notEmpty()
    .withMessage('Arrival date is required.')
    .bail()
    .isISO8601()
    .withMessage('Arrival date must be a valid date.')
    .bail()
    .custom((value) => {
      if (new Date(value) < startOfToday()) {
        throw new Error('Arrival date must not be in the past.');
      }
      return true;
    }),
  body('departureDate')
    .notEmpty()
    .withMessage('Departure date is required.')
    .bail()
    .isISO8601()
    .withMessage('Departure date must be a valid date.')
    .bail()
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.arrivalDate)) {
        throw new Error('Departure date must be after the arrival date.');
      }
      return true;
    }),
];

const createBookingRules = [
  ...guestFieldRules,
  ...dateRules,
  body('campId').isMongoId().withMessage('A valid camp id is required.'),
  body('blockId').isMongoId().withMessage('A valid block id is required.'),
  body('roomId').isMongoId().withMessage('A valid room id is required.'),
  body('stayType')
    .isIn(STAY_TYPE_VALUES)
    .withMessage(`Stay type must be one of: ${STAY_TYPE_VALUES.join(', ')}.`),
];

const updateBookingRules = [
  body('firstName').optional().trim().notEmpty(),
  body('lastName').optional().trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().trim().notEmpty(),
  body('organisation').optional().trim(),
  body('reasonForVisit').optional().trim(),
  body('gender').optional().isIn(GENDER_VALUES),
  body('contractType').optional().trim(),
  body('departureCountry').optional().trim(),
  body('remarks').optional().trim(),
  body('driverPickup').optional().isBoolean(),
  body('arrivalDate').optional().isISO8601(),
  body('departureDate').optional().isISO8601(),
  body('campId').optional().isMongoId(),
  body('blockId').optional().isMongoId(),
  body('roomId').optional().isMongoId(),
  body('stayType').optional().isIn(STAY_TYPE_VALUES),
];

const listBookingsRules = [
  query('status').optional().isIn(BOOKING_STATUS_VALUES),
  query('campId').optional().isMongoId(),
  query('stayType').optional().isIn(STAY_TYPE_VALUES),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('sortBy').optional().isIn(['createdAt', 'arrivalDate', 'departureDate', 'status']),
  query('sortOrder').optional().isIn(['asc', 'desc']),
];

const cancelBookingRules = [
  body('reason').trim().notEmpty().withMessage('Cancellation reason is required.'),
];

module.exports = {
  createBookingRules,
  updateBookingRules,
  listBookingsRules,
  cancelBookingRules,
};
