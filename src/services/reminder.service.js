const { Booking, Invoice, ReminderLog, User } = require('../models');
const emailService = require('./email.service');
const logger = require('../utils/logger');
const { BOOKING_STATUS, INVOICE_PAYMENT_STATUS, ROLES } = require('../utils/constants');
const { startOfDay, endOfDay } = require('../utils/dates');

const getPendingInvoiceStaffRecipients = async (booking, invoice) => {
  const recipientOfficer = invoice?.recipientOfficer;
  let officerEmail = recipientOfficer && typeof recipientOfficer === 'object'
    ? recipientOfficer.email
    : null;
  const officerId = recipientOfficer?._id || recipientOfficer || booking.createdBy;
  if (!officerEmail && officerId) {
    officerEmail = (await User.findById(officerId).select('email').lean())?.email;
  }
  const [officer, superAdmins] = await Promise.all([
    Promise.resolve(officerEmail),
    User.find({
      isActive: true,
      role: ROLES.SUPER_ADMIN,
    }).select('email').lean(),
  ]);
  return [...new Set([
    officer,
    ...superAdmins.map((user) => user.email),
  ].filter((email) => email && email !== booking.guest?.email))];
};

const sendOnce = async (booking, type, key, invoice = null) => {
  let existing = await ReminderLog.findOne({ key }).select('_id').lean();
  const intervalMatch = type === 'payment' && key.match(/:payment-24h:(\d+)$/);
  if (!existing && intervalMatch) {
    existing = await ReminderLog.findOne({
      key: `${booking._id}:payment:${intervalMatch[1]}`,
    }).select('_id').lean();
  }
  if (existing) return false;
  let sent;
  if (type === 'payment') {
    const staffRecipients = await getPendingInvoiceStaffRecipients(booking, invoice);
    const [guestSent, staffSent] = await Promise.all([
      emailService.sendBookingReminder(booking, type, invoice, [booking.guest?.email].filter(Boolean)),
      emailService.sendPendingInvoiceStaffReminder(booking, invoice, staffRecipients),
    ]);
    sent = guestSent && staffSent;
  } else {
    sent = await emailService.sendBookingReminder(
      booking,
      type,
      invoice,
      [booking.guest?.email].filter(Boolean),
    );
  }
  if (!sent) return false;
  await ReminderLog.create({ key, booking: booking._id, type });
  return true;
};

const sendPendingInvoiceCatchUp = async (booking, invoice) => {
  const previousReminder = await ReminderLog.findOne({
    booking: booking._id,
    type: 'payment',
  }).select('_id').lean();
  if (previousReminder) return null;
  const hoursSinceBooking = Math.max(
    Math.floor((Date.now() - new Date(booking.createdAt || invoice.generatedAt).getTime()) / 3600000),
    0,
  );
  const reminderInterval = Math.floor(hoursSinceBooking / 24);
  return sendOnce(
    booking,
    'payment',
    `${booking._id}:payment-24h:${reminderInterval}`,
    invoice,
  );
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
    const catchUpSent = await sendPendingInvoiceCatchUp(invoice.booking, invoice);
    if (catchUpSent !== null) {
      if (catchUpSent) sentCount += 1;
      continue;
    }
    const bookingCreatedAt = invoice.booking.createdAt || invoice.generatedAt;
    const hoursSinceBooking = Math.floor((Date.now() - new Date(bookingCreatedAt).getTime()) / 3600000);
    if (hoursSinceBooking < 24) continue;
    const reminderInterval = Math.floor(hoursSinceBooking / 24);
    if (await sendOnce(
      invoice.booking,
      'payment',
      `${invoice.booking._id}:payment-24h:${reminderInterval}`,
      invoice,
    )) {
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

module.exports = {
  sendScheduledReminders,
  runReminderSweep,
  getPendingInvoiceStaffRecipients,
  sendPendingInvoiceCatchUp,
  sendOnce,
};
