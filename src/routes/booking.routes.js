const express = require('express');
const bookingController = require('../controllers/booking.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { anyStaff, superAdminOnly } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');
const { mongoIdParam } = require('../validators/common.validator');
const {
  createBookingRules,
  updateBookingRules,
  listBookingsRules,
  cancelBookingRules,
} = require('../validators/booking.validator');

const router = express.Router();

router.use(authenticate, anyStaff);

router.get('/', validate(listBookingsRules), bookingController.listBookings);
router.post('/', validate(createBookingRules), bookingController.createBooking);
router.get('/:id', validate([mongoIdParam('id')]), bookingController.getBooking);
router.put('/:id', validate([mongoIdParam('id'), ...updateBookingRules]), bookingController.updateBooking);
router.post(
  '/:id/cancel',
  validate([mongoIdParam('id'), ...cancelBookingRules]),
  bookingController.cancelBooking
);
router.post('/:id/check-in', validate([mongoIdParam('id')]), bookingController.checkIn);
router.post('/:id/check-out', validate([mongoIdParam('id')]), bookingController.checkOut);
router.post('/:id/generate-invoice', validate([mongoIdParam('id')]), bookingController.generateInvoice);
router.post('/:id/resend-emails', validate([mongoIdParam('id')]), bookingController.resendEmails);
router.delete('/:id', validate([mongoIdParam('id')]), superAdminOnly, bookingController.deleteBooking);

module.exports = router;
