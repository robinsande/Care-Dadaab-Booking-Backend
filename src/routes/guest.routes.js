const express = require('express');
const controller = require('../controllers/guest-request.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { anyStaff } = require('../middleware/role.middleware');
const { authenticateGuest } = require('../middleware/guest-auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { mongoIdParam } = require('../validators/common.validator');
const { bookingRequestRules, resolveRules, listRules } = require('../validators/guest-request.validator');

const router = express.Router();
router.get('/camps', controller.listCamps);
router.post('/requests', authenticateGuest, validate(bookingRequestRules), controller.create);
router.get('/requests', authenticateGuest, controller.listMine);
router.get('/bookings', authenticateGuest, controller.listBookings);
router.post('/bookings/:id/requests', authenticateGuest, validate([mongoIdParam('id'), ...bookingRequestRules]), controller.createForBooking);
router.use('/staff', authenticate, anyStaff);
router.get('/staff/requests', validate(listRules), controller.listStaff);
router.post('/staff/requests/:id/resolve', validate([mongoIdParam('id'), ...resolveRules]), controller.resolve);

module.exports = router;
