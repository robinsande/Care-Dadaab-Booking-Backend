const express = require('express');
const authRoutes = require('./auth.routes');
const campRoutes = require('./camp.routes');
const bookingRoutes = require('./booking.routes');
const roomRoutes = require('./room.routes');
const rateRoutes = require('./rate.routes');
const invoiceRoutes = require('./invoice.routes');
const reportRoutes = require('./report.routes');
const userRoutes = require('./user.routes');
const settingsRoutes = require('./settings.routes');
const dashboardRoutes = require('./dashboard.routes');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, message: 'API is healthy.', data: { uptime: process.uptime() } });
});

router.use('/auth', authRoutes);
router.use('/camps', campRoutes);
router.use('/camps/:campId/rates', rateRoutes);
router.use('/bookings', bookingRoutes);
router.use('/rooms', roomRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/reports', reportRoutes);
router.use('/users', userRoutes);
router.use('/settings', settingsRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;
