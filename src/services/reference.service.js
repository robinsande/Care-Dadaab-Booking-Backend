const { Booking, Invoice } = require('../models');
const env = require('../config/env');

/**
 * Generate a unique, human-readable booking reference.
 * Format: <PREFIX>-<YYYYMMDD>-<6 digit daily sequence>
 */
const generateBookingReference = async () => {
  const prefix = env.bookingReferencePrefix;
  const now = new Date();

  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const countToday = await Booking.countDocuments({
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });

  let sequence = countToday + 1;

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const reference = `${prefix}-${datePart}-${String(sequence).padStart(6, '0')}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await Booking.exists({ bookingReference: reference });
    if (!exists) return reference;
    sequence += 1;
  }

  return `${prefix}-${datePart}-${String(sequence).padStart(6, '0')}-${now.getTime()}`;
};

/**
 * Generate a unique sequential invoice number.
 * Format: INV-<YYYY>-<6 digit sequence>
 */
const generateInvoiceNumber = async () => {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  const latest = await Invoice.findOne({
    invoiceNumber: new RegExp(`^${prefix}`),
  })
    .sort({ invoiceNumber: -1 })
    .select('invoiceNumber')
    .lean();

  let sequence = 1;
  if (latest) {
    const parts = latest.invoiceNumber.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(lastSeq)) sequence = lastSeq + 1;
  }

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const invoiceNumber = `${prefix}${String(sequence).padStart(6, '0')}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await Invoice.exists({ invoiceNumber });
    if (!exists) return invoiceNumber;
    sequence += 1;
  }

  return `${prefix}${String(sequence).padStart(6, '0')}-${Date.now()}`;
};

module.exports = { generateBookingReference, generateInvoiceNumber };
