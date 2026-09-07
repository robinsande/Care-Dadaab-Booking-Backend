const { Booking, Invoice, ReminderLog } = require('../models');
const emailService = require('./email.service');
const logger = require('../utils/logger');
const { BOOKING_STATUS, INVOICE_PAYMENT_STATUS } = require('../utils/constants');
const { startOfDay, endOfDay } = require('../utils/dates');

const sendOnce = async (booking, type, key, invoice = null) => {
  const existing = await ReminderLog.findOne({ key }).select('_id').lean();
  if (existing) return false;
  const sent = await emailService.sendBookingReminder(booking, type, invoice);
  if (!sent) return false;
  await ReminderLog.create({ key, booking: booking._id, type });
  return true;
};

const sendScheduledReminders = async () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const from = startOfDay(tomorrow);
  const to = endOfDay(tomorrow);
  const bookings = await Booking.find({
    status: { $in: [BOOKING_STATUS.BOOKED, BOOKING_STATUS.CHECKED_IN] },
    $or: [
      { arrivalDate: { $gte: from, $lte: to } },
      { departureDate: { $gte: from, $lte: to } },
    ],
  }).lean();

  let sentCount = 0;
  for (const booking of bookings) {
    if (booking.arrivalDate >= from && booking.arrivalDate <= to
      && await sendOnce(booking, 'arrival', `${booking._id}:arrival:${from.toISOString().slice(0, 10)}`)) {
      sentCount += 1;
    }
    if (booking.departureDate >= from && booking.departureDate <= to
      && await sendOnce(booking, 'departure', `${booking._id}:departure:${from.toISOString().slice(0, 10)}`)) {
      sentCount += 1;
    }
  }

  const unpaid = await Invoice.find({ paymentStatus: INVOICE_PAYMENT_STATUS.UNPAID })
    .populate('booking')
    .lean();
  for (const invoice of unpaid) {
    if (!invoice.booking) continue;
    const ageDays = Math.floor((Date.now() - new Date(invoice.generatedAt).getTime()) / 86400000);
    if (ageDays < 3 || ageDays % 3 !== 0) continue;
    if (await sendOnce(invoice.booking, 'payment', `${invoice.booking._id}:payment:${ageDays}`, invoice)) {
      sentCount += 1;
    }
  }

  return sentCount;
};

const runReminderSweep = () => sendScheduledReminders()
  .catch((error) => {
    logger.error(`Reminder sweep failed: ${error.message}`);
    return 0;
  });

module.exports = { sendScheduledReminders, runReminderSweep };
