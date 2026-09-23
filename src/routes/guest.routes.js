const express = require('express');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const controller = require('../controllers/guest-request.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { anyStaff } = require('../middleware/role.middleware');
const { authenticateGuest } = require('../middleware/guest-auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { mongoIdParam } = require('../validators/common.validator');
const { bookingRequestRules, resolveRules, listRules } = require('../validators/guest-request.validator');

const router = express.Router();
const publicRequestLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: env.isProduction ? 10 : 0,
	skip: () => !env.isProduction,
	standardHeaders: true,
	legacyHeaders: false,
});
router.get('/camps', controller.listCamps);
router.get('/camps/:campId/rates', validate([mongoIdParam('campId')]), controller.listCampRates);
router.post('/public-requests', publicRequestLimiter, validate([
	...bookingRequestRules,
	require('express-validator').body('email').isEmail().normalizeEmail(),
	require('express-validator').body('firstName').trim().notEmpty(),
	require('express-validator').body('lastName').trim().notEmpty(),
	require('express-validator').body('phone').trim().notEmpty(),
]), controller.createPublic);
router.post('/requests', authenticateGuest, validate(bookingRequestRules), controller.create);
router.get('/requests', authenticateGuest, controller.listMine);
router.get('/bookings', authenticateGuest, controller.listBookings);
router.get('/bookings/:id/invoice', authenticateGuest, validate([mongoIdParam('id')]), controller.getInvoice);
router.post('/bookings/:id/requests', authenticateGuest, validate([mongoIdParam('id'), ...bookingRequestRules]), controller.createForBooking);
router.use('/staff', authenticate, anyStaff);
router.get('/staff/requests', validate(listRules), controller.listStaff);
router.post('/staff/requests/:id/resolve', validate([mongoIdParam('id'), ...resolveRules]), controller.resolve);

module.exports = router;
