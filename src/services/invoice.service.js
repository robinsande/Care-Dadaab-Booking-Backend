const { Invoice, User } = require('../models');
const ApiError = require('../utils/ApiError');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const settingsService = require('./settings.service');
const referenceService = require('./reference.service');
const emailService = require('./email.service');
const auditService = require('./audit.service');
const { ACTOR_TYPE, AUDIT_ACTIONS, INVOICE_PAYMENT_STATUS_VALUES } = require('../utils/constants');
const { calculateNights } = require('../utils/dates');

const buildInvoiceSnapshot = async (booking) => {
  const settings = await settingsService.getSettings();
  const numberOfNights = calculateNights(booking.arrivalDate, booking.departureDate);
  const totalAmount = booking.appliedRate.amount * numberOfNights;
  const paymentInstructions = {
    mpesaPaybillNumber: settings.payment?.mpesaPaybillNumber || '',
    bankName: settings.payment?.bankName || '',
    bankAccountName: settings.payment?.bankAccountName || '',
    bankAccountNumber: settings.payment?.bankAccountNumber || '',
  };
  return {
    bookingReference: booking.bookingReference,
    guest: {
      firstName: booking.guest.firstName,
      lastName: booking.guest.lastName,
      email: booking.guest.email,
      phone: booking.guest.phone,
      organisation: booking.guest.organisation,
    },
    campName: booking.campName,
    blockName: booking.blockName,
    roomNumber: booking.roomNumber,
    arrivalDate: booking.arrivalDate,
    departureDate: booking.departureDate,
    numberOfNights,
    stayType: booking.stayType,
    appliedRate: {
      amount: booking.appliedRate.amount,
      currency: booking.appliedRate.currency,
      stayType: booking.appliedRate.stayType,
    },
    totalAmount,
    paymentInstructions,
    recipientOfficer: booking.createdBy,
  };
};

const generateInvoiceForBooking = async (booking, { mode = 'createIfMissing' } = {}) => {
  const snapshot = await buildInvoiceSnapshot(booking);

  if (mode === 'createIfMissing') {
    const existing = await Invoice.findOne({ booking: booking._id });
    if (existing) return existing;
  }

  if (mode === 'upsert') {
    const existing = await Invoice.findOne({ booking: booking._id });
    if (existing) {
      const changes = {};
      for (const [key, value] of Object.entries(snapshot)) {
        if (key === 'paymentStatus' || key === 'generatedAt' || key === 'invoiceNumber') continue;
        if (JSON.stringify(existing.get(key)) !== JSON.stringify(value)) {
          changes[key] = value;
        }
      }
      if (Object.keys(changes).length) {
        Object.assign(existing, changes);
        await existing.save();
        await auditService.record({
          action: AUDIT_ACTIONS.INVOICE_UPDATED,
          booking,
          actorType: ACTOR_TYPE.SYSTEM,
          metadata: { invoiceId: existing._id, invoiceNumber: existing.invoiceNumber, changes: Object.keys(changes) },
          message: `Invoice ${existing.invoiceNumber} updated for ${booking.bookingReference}.`,
        });
      }
      return existing;
    }
  }

  const invoiceNumber = await referenceService.generateInvoiceNumber();
  const invoice = await Invoice.create({
    invoiceNumber,
    booking: booking._id,
    ...snapshot,
    generatedAt: new Date(),
  });

  await auditService.record({
    action: AUDIT_ACTIONS.INVOICE_GENERATED,
    booking,
    actorType: ACTOR_TYPE.SYSTEM,
    metadata: { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber },
    message: `Invoice ${invoice.invoiceNumber} generated for ${booking.bookingReference}.`,
  });

  const officer = await User.findById(booking.createdBy).select('email firstName lastName');
  await emailService.sendInvoiceGenerated(booking, invoice, officer);
  await auditService.record({
    action: AUDIT_ACTIONS.EMAIL_SENT,
    booking,
    actorType: ACTOR_TYPE.SYSTEM,
    metadata: {
      emailType: 'Invoice Generated',
      to: [booking.guest.email, officer?.email].filter(Boolean),
    },
    message: `Invoice email dispatched for ${booking.bookingReference}.`,
  });

  return invoice;
};

const listInvoices = async (query = {}) => {
  const filter = {};

  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.campName) filter.campName = query.campName;
  if (query.search) {
    const term = query.search.trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { invoiceNumber: regex },
      { bookingReference: regex },
      { 'guest.email': regex },
      { 'guest.firstName': regex },
      { 'guest.lastName': regex },
    ];
  }

  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Invoice.find(filter)
      .populate('booking', 'bookingReference status')
      .populate('recipientOfficer', 'firstName lastName email')
      .sort({ generatedAt: -1 })
      .skip(skip)
      .limit(limit),
    Invoice.countDocuments(filter),
  ]);

  return {
    items,
    invoices: items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
};

const getInvoiceById = async (id) => {
  const invoice = await Invoice.findById(id)
    .populate('booking', 'bookingReference status')
    .populate('recipientOfficer', 'firstName lastName email');
  if (!invoice) throw ApiError.notFound('Invoice not found.');
  return invoice;
};

const updatePaymentStatus = async (id, paymentStatus) => {
  if (!INVOICE_PAYMENT_STATUS_VALUES.includes(paymentStatus)) {
    throw ApiError.badRequest('Invalid payment status.');
  }

  const invoice = await getInvoiceById(id);
  invoice.paymentStatus = paymentStatus;
  await invoice.save();
  return invoice;
};

const formatMoney = (amount, currency = 'KES') =>
  `${currency} ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const generateInvoicePdfBuffer = (invoice) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    const guest = invoice.guest || {};
    const payment = invoice.paymentInstructions || {};
    const logoPath = path.resolve(__dirname, '../../assets/care-logo.png');

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let logoFits = fs.existsSync(logoPath);
    const LOGO_WIDTH = 140;
    const LOGO_HEIGHT = 60;
    let currentY = doc.y;

    if (logoFits) {
      try {
        doc.image(logoPath, doc.x, currentY, { width: LOGO_WIDTH, height: LOGO_HEIGHT });
        currentY += LOGO_HEIGHT + 8;
      } catch (_) {
        logoFits = false;
      }
    }

    doc.save();
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#E87722');
    if (logoFits) {
      doc.text('CARE Accommodation Invoice', doc.x + LOGO_WIDTH + 16, doc.y + 8, { lineGap: 4 });
    } else {
      doc.text('CARE Accommodation Invoice', doc.x, currentY, { underline: true });
      currentY += 18;
    }
    doc.restore();
    doc.moveDown(1);

    doc.y = Math.max(currentY + 10, doc.y);
    doc.fontSize(11);
    doc.text(`Invoice Number: ${invoice.invoiceNumber}`);
    doc.text(`Booking Reference: ${invoice.bookingReference}`);
    doc.text(`Issue Date: ${new Date(invoice.generatedAt || invoice.createdAt).toLocaleDateString('en-GB')}`);
    doc.moveDown();

    doc.fontSize(13).text('Guest', { underline: true });
    doc.fontSize(11);
    doc.text(`${guest.firstName || ''} ${guest.lastName || ''}`.trim());
    if (guest.email) doc.text(`Email: ${guest.email}`);
    if (guest.phone) doc.text(`Phone: ${guest.phone}`);
    if (guest.organisation) doc.text(`Organisation: ${guest.organisation}`);
    doc.moveDown();

    doc.fontSize(13).text('Stay Details', { underline: true });
    doc.fontSize(11);
    doc.text(`Camp: ${invoice.campName}`);
    doc.text(`Block: ${invoice.blockName}`);
    doc.text(`Room: ${invoice.roomNumber}`);
    doc.text(`Stay Type: ${invoice.stayType}`);
    doc.text(`Arrival: ${new Date(invoice.arrivalDate).toLocaleDateString('en-GB')}`);
    doc.text(`Departure: ${new Date(invoice.departureDate).toLocaleDateString('en-GB')}`);
    doc.text(`Nights: ${invoice.numberOfNights}`);
    doc.moveDown();

    const currency = invoice.appliedRate?.currency || 'KES';
    doc.fontSize(13).text('Charges', { underline: true });
    doc.fontSize(11);
    doc.text(`Rate: ${formatMoney(invoice.appliedRate?.amount, currency)} per night`);
    doc.text(`Total: ${formatMoney(invoice.totalAmount, currency)}`);
    doc.moveDown();

    doc.fontSize(13).text('Payment Instructions', { underline: true });
    doc.fontSize(11);
    if (payment.mpesaPaybillNumber) doc.text(`M-Pesa Paybill: ${payment.mpesaPaybillNumber}`);
    if (payment.bankName) doc.text(`Bank: ${payment.bankName}`);
    if (payment.bankAccountName) doc.text(`Account Name: ${payment.bankAccountName}`);
    if (payment.bankAccountNumber) doc.text(`Account Number: ${payment.bankAccountNumber}`);

    doc.end();
  });

module.exports = {
  generateInvoiceForBooking,
  listInvoices,
  getInvoiceById,
  updatePaymentStatus,
  generateInvoicePdfBuffer,
};
