const { Invoice, Receipt, User } = require('../models');
const ApiError = require('../utils/ApiError');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const settingsService = require('./settings.service');
const referenceService = require('./reference.service');
const emailService = require('./email.service');
const auditService = require('./audit.service');
const {
  ACTOR_TYPE,
  AUDIT_ACTIONS,
  INVOICE_PAYMENT_STATUS,
  INVOICE_PAYMENT_STATUS_VALUES,
} = require('../utils/constants');
const { calculateNights, calculateBillableMonths } = require('../utils/dates');
const logger = require('../utils/logger');
const env = require('../config/env');

const RECEIPT_DOCUMENT_VERSION = 2;
const isNonBillableCareStaff = (guest = {}) =>
  /^(?:care\s*)?staff$/i.test(String(guest.contractType || '').trim());

const isIntercompanyCareStaffLongStay = (bookingOrGuest, stayType = '') => {
  const guest = bookingOrGuest?.guest || bookingOrGuest || {};
  const bookingStayType = bookingOrGuest?.stayType || stayType;
  return bookingStayType === 'Long Stay'
    && /^(?:care\s*)?staff$/i.test(String(guest.contractType || '').trim());
};

const buildInvoiceSnapshot = async (booking) => {
  const settings = await settingsService.getSettings();
  const numberOfNights = calculateNights(booking.arrivalDate, booking.departureDate);
  const extensionCost = (booking.extensions || [])
    .reduce((total, extension) => total + Number(extension.additionalCost || 0), 0);
  const durationMonths = booking.stayType === 'Long Stay'
    ? calculateBillableMonths(booking.arrivalDate, booking.departureDate) || booking.durationMonths
    : null;
  const totalAmount = booking.appliedRate.amount * (durationMonths || numberOfNights)
    + (durationMonths ? 0 : extensionCost);
  const paymentInstructions = {
    mpesaTillNumber: settings.payment?.mpesaTillNumber || settings.payment?.mpesaPaybillNumber || env.daraja.c2bShortCode || '',
    mpesaPaybillNumber: settings.payment?.mpesaPaybillNumber || env.daraja.c2bShortCode || '',
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
      contractType: booking.guest.contractType,
    },
    campName: booking.campName,
    blockName: booking.blockName,
    roomNumber: booking.roomNumber,
    arrivalDate: booking.arrivalDate,
    departureDate: booking.departureDate,
    numberOfNights,
    durationMonths,
    extensionCost,
    stayType: booking.stayType,
    appliedRate: {
      amount: booking.appliedRate.amount,
      currency: booking.appliedRate.currency,
      stayType: booking.appliedRate.stayType,
      ratePeriod: booking.stayType === 'Long Stay' ? 'per_month' : 'per_night',
    },
    totalAmount,
    paymentInstructions,
    recipientOfficer: booking.createdBy,
  };
};

const generateInvoiceForBooking = async (booking, { mode = 'createIfMissing', notify = true } = {}) => {
  if (isNonBillableCareStaff(booking.guest) || isIntercompanyCareStaffLongStay(booking)) return null;

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
  let invoice;
  try {
    invoice = await Invoice.create({
      invoiceNumber,
      booking: booking._id,
      ...snapshot,
      generatedAt: new Date(),
    });
  } catch (error) {
    if (error?.code !== 11000 || mode !== 'createIfMissing') throw error;
    invoice = await Invoice.findOne({ booking: booking._id });
    if (!invoice) throw error;
  }

  await auditService.record({
    action: AUDIT_ACTIONS.INVOICE_GENERATED,
    booking,
    actorType: ACTOR_TYPE.SYSTEM,
    metadata: { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber },
    message: `Invoice ${invoice.invoiceNumber} generated for ${booking.bookingReference}.`,
  });

  if (notify) {
    try {
      const sent = await sendInvoiceEmail(booking, invoice);
      if (sent) {
        const recipients = await getInvoiceRecipients(booking, invoice);
        await auditService.record({
          action: AUDIT_ACTIONS.EMAIL_SENT,
          booking,
          actorType: ACTOR_TYPE.SYSTEM,
          metadata: { emailType: 'Invoice Generated', to: recipients },
          message: `Invoice email dispatched for ${booking.bookingReference}.`,
        });
      } else {
        logger.warn(`Invoice email delivery failed for ${booking.bookingReference}.`);
      }
    } catch (error) {
      logger.error(`Invoice email failed for ${booking.bookingReference}: ${error.message}`);
    }
  }

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
      .limit(limit)
      .lean(),
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
    .populate('recipientOfficer', 'firstName lastName email')
    .lean();
  if (!invoice) throw ApiError.notFound('Invoice not found.');
  return invoice;
};

const updatePaymentStatus = async (id, paymentStatus, paymentDetails = {}) => {
  if (!INVOICE_PAYMENT_STATUS_VALUES.includes(paymentStatus)) {
    throw ApiError.badRequest('Invalid payment status.');
  }

  const invoice = await Invoice.findById(id);
  if (!invoice) throw ApiError.notFound('Invoice not found.');
  if (isNonBillableCareStaff(invoice.guest) || isIntercompanyCareStaffLongStay(invoice)) {
    throw ApiError.badRequest('CARE Kenya staff accommodation is billed through the organisation.');
  }
  invoice.paymentStatus = paymentStatus;
  invoice.paymentCheckoutRequestId =
    paymentDetails.checkoutRequestId || invoice.paymentCheckoutRequestId;
  if (paymentStatus === INVOICE_PAYMENT_STATUS.PAID) {
    invoice.paidAt = invoice.paidAt || paymentDetails.paidAt || new Date();
    invoice.paymentMethod = paymentDetails.paymentMethod || invoice.paymentMethod || 'Manual';
    invoice.paymentTransactionId = paymentDetails.transactionId || invoice.paymentTransactionId;
    invoice.paymentPhoneNumber = paymentDetails.phoneNumber || invoice.paymentPhoneNumber;
  }
  await invoice.save();

  if (paymentStatus === INVOICE_PAYMENT_STATUS.PAID) {
    await sendPaidReceipt(invoice);
  }

  return invoice;
};

const formatMoney = (amount, currency = 'KES') =>
  `${currency} ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDocumentDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

const drawPdfText = (doc, value, x, y, width, options = {}) => {
  doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(options.size || 10)
    .fillColor(options.color || '#333333')
    .text(String(value ?? '—'), x, y, {
      width,
      align: options.align || 'left',
      lineBreak: false,
      ellipsis: true,
    });
};

const drawPdfRule = (doc, x, y, width, color = '#b8b8b8') => {
  doc.moveTo(x, y).lineTo(x + width, y).lineWidth(0.6).strokeColor(color).stroke();
};

const generateInvoicePdfBuffer = (invoice) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    const chunks = [];
    const guest = invoice.guest || {};
    const payment = invoice.paymentInstructions || {};
    const logoPath = path.resolve(__dirname, '../../assets/care-logo.png');
    const stampPath = path.resolve(__dirname, '../../assets/care-dadaab-stamp.png');
    const pageWidth = doc.page.width;
    const left = 38;
    const right = pageWidth - left;
    const contentWidth = right - left;
    const isPaid = String(invoice.paymentStatus || '').toLowerCase() === 'paid';
    const currency = invoice.appliedRate?.currency || 'KES';
    const rate = Number(invoice.appliedRate?.amount || 0);
    const quantity = Number(invoice.durationMonths || invoice.numberOfNights || 0);
    const extensionCost = Number(invoice.extensionCost || 0);
    const total = Number(invoice.totalAmount ?? rate * quantity);
    const accommodationAmount = total - extensionCost;
    const receiptNumber = `RCPT-${invoice.invoiceNumber || invoice.bookingReference || '—'}`;
    const dateLabel = formatDocumentDate(
      isPaid ? invoice.paidAt || invoice.generatedAt : invoice.generatedAt || invoice.createdAt,
    );
    const lineDescription = [
      invoice.stayType || 'Accommodation',
      invoice.campName,
      invoice.blockName && `Block ${invoice.blockName}`,
      invoice.roomNumber && `Room ${invoice.roomNumber}`,
    ].filter(Boolean).join(' · ');
    const systemName = 'CARE Kenya Dadaab Accommodation Management System';
    const supportContact = [env.support.email, env.support.phone].filter(Boolean).join(' · ');

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const drawLogo = (x, y, maxWidth, maxHeight) => {
      if (!fs.existsSync(logoPath)) return;
      doc.image(logoPath, x, y, { fit: [maxWidth, maxHeight] });
    };
    const drawStamp = (x, y, maxWidth, maxHeight) => {
      if (!fs.existsSync(stampPath)) return;
      doc.image(stampPath, x, y, { fit: [maxWidth, maxHeight] });
    };
    const drawBand = (x, y, width, height, color, text) => {
      doc.rect(x, y, width, height).fill(color);
      drawPdfText(doc, text, x + 10, y + 7, width - 20, {
        bold: true, size: 10, color: '#ffffff', align: 'center',
      });
    };
    const drawTableHeader = (y) => {
      const columns = [left, left + 40, left + 40 + contentWidth * 0.53, right - 128, right];
      doc.rect(left, y, contentWidth, 27).fill(isPaid ? '#355b68' : '#145092');
      drawPdfText(doc, '#', columns[0] + 7, y + 8, 28, { bold: true, color: '#ffffff' });
      drawPdfText(doc, 'Items', columns[1] + 7, y + 8, columns[2] - columns[1] - 12, { bold: true, color: '#ffffff' });
      drawPdfText(doc, 'Quantity', columns[2] + 4, y + 8, columns[3] - columns[2] - 8, { bold: true, color: '#ffffff', align: 'right' });
      drawPdfText(doc, 'Rate', columns[3] + 4, y + 8, columns[4] - columns[3] - 58, { bold: true, color: '#ffffff', align: 'right' });
      drawPdfText(doc, 'Amount', columns[4] - 54, y + 8, 47, { bold: true, color: '#ffffff', align: 'right' });
      return columns;
    };
    const drawTableRow = (columns, y, number, description, qty, unitRate, amount, height = 34) => {
      doc.rect(left, y, contentWidth, height).lineWidth(0.6).strokeColor('#b8b8b8').stroke();
      [columns[1], columns[2], columns[3], columns[4]].forEach((x) => {
        doc.moveTo(x, y).lineTo(x, y + height).lineWidth(0.6).strokeColor('#b8b8b8').stroke();
      });
      drawPdfText(doc, number, columns[0] + 7, y + 9, 28, { size: 8 });
      drawPdfText(doc, description, columns[1] + 7, y + 8, columns[2] - columns[1] - 12, { bold: true, size: 8 });
      drawPdfText(doc, qty, columns[2] + 4, y + 9, columns[3] - columns[2] - 8, { size: 8, align: 'right' });
      drawPdfText(doc, unitRate, columns[3] + 4, y + 9, columns[4] - columns[3] - 58, { size: 8, align: 'right' });
      drawPdfText(doc, amount, columns[4] - 54, y + 9, 47, { size: 8, align: 'right' });
      return y + height;
    };

    if (isPaid) {
      doc.roundedRect(left, 0, contentWidth, 128, 12).fill('#355b68');
      drawLogo(left + 14, 14, 108, 44);
      drawPdfText(doc, systemName, left + 14, 68, contentWidth * 0.52, { bold: true, size: 11, color: '#ffffff' });
      drawPdfText(doc, 'Dadaab, Kenya', left + 14, 86, contentWidth * 0.52, { size: 9, color: '#ffffff' });
      drawPdfText(doc, 'PAYMENT RECEIPT', right - 230, 46, 210, { bold: true, size: 20, color: '#ffffff', align: 'right' });
      drawPdfText(doc, receiptNumber, right - 230, 76, 210, { bold: true, size: 10, color: '#ffffff', align: 'right' });

      drawBand(left, 144, contentWidth, 24, '#355b68', 'Payment Receipt Details');
      doc.rect(left, 168, contentWidth, 72).lineWidth(0.7).strokeColor('#b8b8b8').stroke();
      doc.moveTo(left + contentWidth * 0.55, 168).lineTo(left + contentWidth * 0.55, 240).strokeColor('#b8b8b8').stroke();
      drawPdfText(doc, 'Customer Name', left + 8, 181, contentWidth * 0.52, { bold: true, size: 9 });
      drawPdfText(doc, `${guest.firstName || ''} ${guest.lastName || ''}`.trim() || 'Guest', left + 8, 199, contentWidth * 0.52, { size: 10 });
      drawPdfText(doc, `Receipt #: ${receiptNumber}`, left + contentWidth * 0.55 + 8, 178, contentWidth * 0.43, { size: 8 });
      drawPdfText(doc, `Currency: ${currency}`, left + contentWidth * 0.55 + 8, 197, contentWidth * 0.2, { size: 8 });
      drawPdfText(doc, `Date: ${dateLabel}`, left + contentWidth * 0.76, 197, contentWidth * 0.22, { size: 8 });
      drawPdfText(doc, `Payment: ${invoice.paymentMethod || 'Recorded payment'}`, left + contentWidth * 0.55 + 8, 217, contentWidth * 0.43, { size: 8 });
      drawBand(left, 250, contentWidth, 23, '#355b68', 'Booking and Accommodation');
      doc.rect(left, 273, contentWidth, 48).lineWidth(0.7).strokeColor('#b8b8b8').stroke();
      drawPdfText(doc, `Booking Reference: ${invoice.bookingReference || '—'}`, left + 8, 284, contentWidth * 0.48, { size: 8 });
      drawPdfText(doc, `Camp: ${invoice.campName || '—'}  ·  Room: ${invoice.blockName || '—'} / ${invoice.roomNumber || '—'}`, left + 8, 301, contentWidth - 16, { size: 8 });
      drawPdfText(doc, `Stay: ${formatDocumentDate(invoice.arrivalDate)} — ${formatDocumentDate(invoice.departureDate)}`, left + contentWidth * 0.52, 284, contentWidth * 0.46, { size: 8 });
      let tableY = 337;
      const columns = drawTableHeader(tableY);
      tableY = drawTableRow(
        columns, tableY + 27, 1, lineDescription, `${quantity} ${invoice.durationMonths ? 'months' : 'nights'}`,
        formatMoney(rate, currency), formatMoney(accommodationAmount, currency), 40,
      );
      if (extensionCost > 0) {
        tableY = drawTableRow(columns, tableY, 2, 'Approved accommodation extensions', '—', '—', formatMoney(extensionCost, currency), 30);
      }
      tableY += 16;
      doc.rect(right - 218, tableY, 218, 29).lineWidth(0.6).strokeColor('#b8b8b8').stroke();
      drawPdfText(doc, 'Sub Total', right - 210, tableY + 9, 115, { bold: true, size: 8 });
      drawPdfText(doc, formatMoney(total, currency), right - 95, tableY + 9, 87, { size: 8, align: 'right' });
      doc.rect(right - 218, tableY + 29, 218, 38).fill('#355b68');
      drawPdfText(doc, 'Total Paid', right - 210, tableY + 42, 115, { bold: true, size: 9, color: '#ffffff' });
      drawPdfText(doc, formatMoney(total, currency), right - 95, tableY + 42, 87, { bold: true, size: 9, color: '#ffffff', align: 'right' });
      drawPdfRule(doc, left, tableY + 84, contentWidth);
      drawPdfText(doc, 'Notes', left, tableY + 96, contentWidth * 0.52, { bold: true, size: 9 });
      drawPdfText(doc, 'Payment received in full. Please retain this receipt for your records.', left, tableY + 113, contentWidth * 0.52, { size: 8 });
      drawPdfText(doc, 'Payment Reference', left, tableY + 139, contentWidth * 0.52, { bold: true, size: 9 });
      drawPdfText(doc, invoice.paymentTransactionId || invoice.bookingReference || '—', left, tableY + 156, contentWidth * 0.52, { size: 8 });
      drawStamp(right - 142, tableY + 88, 122, 92);
      drawPdfText(doc, 'Thank You!', right - 288, tableY + 174, 150, { size: 20, color: '#0e2540', align: 'right' });
      drawPdfText(doc, `CARE Kenya · ${supportContact}`, left, 802, contentWidth, { size: 7, color: '#666666', align: 'center' });
    } else {
      doc.moveTo(0, 0).lineTo(pageWidth, 0).lineTo(pageWidth, 122)
        .bezierCurveTo(pageWidth * 0.72, 174, pageWidth * 0.34, 112, 0, 180)
        .closePath().fill('#145092');
      drawLogo(left, 24, 112, 44);
      drawPdfText(doc, 'INVOICE', left, 91, 220, { bold: true, size: 27, color: '#ffffff' });
      drawPdfText(doc, `NO: ${invoice.invoiceNumber || '—'}`, right - 230, 103, 220, { bold: true, size: 13, color: '#ffffff', align: 'right' });
      drawPdfText(doc, 'CARE Kenya · Dadaab Accommodation Management System', left, 187, contentWidth, { bold: true, size: 9, color: '#145092' });

      const guestName = `${guest.firstName || ''} ${guest.lastName || ''}`.trim() || 'Guest';
      drawPdfText(doc, 'Bill To:', left, 215, contentWidth * 0.48, { bold: true, size: 14, color: '#555555' });
      drawPdfText(doc, guestName, left, 239, contentWidth * 0.48, { size: 11, color: '#666666' });
      drawPdfText(doc, guest.email || '', left, 257, contentWidth * 0.48, { size: 9, color: '#666666' });
      drawPdfText(doc, guest.phone || '', left, 274, contentWidth * 0.48, { size: 9, color: '#666666' });
      drawPdfText(doc, invoice.bookingReference || '—', left, 291, contentWidth * 0.48, { size: 9, color: '#666666' });
      drawPdfText(doc, 'From:', right - contentWidth * 0.48, 215, contentWidth * 0.48, { bold: true, size: 14, color: '#555555', align: 'right' });
      drawPdfText(doc, 'CARE Kenya — Dadaab', right - contentWidth * 0.48, 239, contentWidth * 0.48, { size: 11, color: '#666666', align: 'right' });
      drawPdfText(doc, systemName, right - contentWidth * 0.48, 257, contentWidth * 0.48, { size: 8, color: '#666666', align: 'right' });
      drawPdfText(doc, supportContact, right - contentWidth * 0.48, 274, contentWidth * 0.48, { size: 8, color: '#666666', align: 'right' });
      drawPdfText(doc, `Date: ${dateLabel}`, left, 322, contentWidth, { size: 10, color: '#666666' });
      drawPdfText(doc, `Stay: ${formatDocumentDate(invoice.arrivalDate)} — ${formatDocumentDate(invoice.departureDate)}  ·  ${invoice.campName || '—'}  ·  Block ${invoice.blockName || '—'} / Room ${invoice.roomNumber || '—'}`, left, 342, contentWidth, { size: 8, color: '#555555' });

      let tableY = 370;
      const columns = drawTableHeader(tableY);
      tableY = drawTableRow(
        columns, tableY + 27, 1, lineDescription, `${quantity} ${invoice.durationMonths ? 'months' : 'nights'}`,
        formatMoney(rate, currency), formatMoney(accommodationAmount, currency), 40,
      );
      if (extensionCost > 0) {
        tableY = drawTableRow(columns, tableY, 2, 'Approved accommodation extensions', '—', '—', formatMoney(extensionCost, currency), 30);
      }
      tableY += 16;
      doc.rect(right - 218, tableY, 218, 29).fill('#145092');
      drawPdfText(doc, 'Sub Total', right - 210, tableY + 9, 115, { size: 9, color: '#ffffff' });
      drawPdfText(doc, formatMoney(total, currency), right - 95, tableY + 9, 87, { size: 9, color: '#ffffff', align: 'right' });
      drawPdfRule(doc, left, tableY + 48, contentWidth);
      drawPdfText(doc, 'Note:', left, tableY + 62, contentWidth * 0.52, { bold: true, size: 10, color: '#555555' });
      drawPdfText(doc, 'Please quote the invoice number or booking reference when making payment.', left, tableY + 80, contentWidth * 0.52, { size: 8, color: '#666666' });
      drawPdfText(doc, 'Payment Information:', left, tableY + 119, contentWidth * 0.52, { bold: true, size: 10, color: '#555555' });
      const paymentDetails = [
        payment.mpesaTillNumber || payment.mpesaPaybillNumber ? `M-Pesa Till / Paybill: ${payment.mpesaTillNumber || payment.mpesaPaybillNumber}` : '',
        payment.bankName ? `Bank: ${payment.bankName}` : '',
        payment.bankAccountName ? `Account Name: ${payment.bankAccountName}` : '',
        payment.bankAccountNumber ? `Account Number: ${payment.bankAccountNumber}` : '',
        `Payment Reference: ${invoice.bookingReference || invoice.invoiceNumber || '—'}`,
      ].filter(Boolean);
      paymentDetails.forEach((line, index) => {
        drawPdfText(doc, line, left, tableY + 137 + index * 16, contentWidth * 0.58, { size: 8, color: '#666666' });
      });
      drawStamp(right - 142, tableY + 88, 122, 92);
      drawPdfText(doc, 'Thank You!', right - 288, tableY + 174, 150, { size: 20, color: '#0e2540', align: 'right' });
      drawPdfText(doc, supportContact, left, 802, contentWidth, { size: 7, color: '#666666', align: 'center' });
    }

    doc.end();
  });

const createOrGetReceipt = async (invoice) => {
  let existing = await Receipt.findOne({ invoice: invoice._id });
  if (existing) {
    if (existing.documentVersion !== RECEIPT_DOCUMENT_VERSION) {
      const snapshot = existing.invoiceSnapshot || (typeof invoice.toObject === 'function' ? invoice.toObject() : { ...invoice });
      existing.pdf = await generateInvoicePdfBuffer(snapshot);
      existing.invoiceSnapshot = snapshot;
      existing.documentVersion = RECEIPT_DOCUMENT_VERSION;
      await existing.save();
    }
    return existing;
  }

  const pdf = await generateInvoicePdfBuffer(invoice);
  const snapshot = typeof invoice.toObject === 'function' ? invoice.toObject() : { ...invoice };
  delete snapshot.__v;
  try {
    return await Receipt.create({
      receiptNumber: `RCPT-${invoice.invoiceNumber || invoice.bookingReference}`,
      invoice: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      bookingReference: invoice.bookingReference,
      guestEmail: invoice.guest?.email,
      amount: invoice.totalAmount,
      currency: invoice.appliedRate?.currency || 'KES',
      paidAt: invoice.paidAt || new Date(),
      paymentMethod: invoice.paymentMethod,
      transactionId: invoice.paymentTransactionId,
      paymentPhoneNumber: invoice.paymentPhoneNumber,
      invoiceSnapshot: snapshot,
      pdf,
      documentVersion: RECEIPT_DOCUMENT_VERSION,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const racedReceipt = await Receipt.findOne({ invoice: invoice._id });
    if (!racedReceipt) throw error;
    return racedReceipt;
  }
};

const sendPaidReceipt = async (invoice) => {
  const receipt = await createOrGetReceipt(invoice);
  if (receipt.emailStatus === 'sent') return receipt;

  receipt.emailAttemptedAt = new Date();
  receipt.emailError = '';
  try {
    const emailSent = await emailService.sendInvoicePaid(invoice, {
      filename: `${receipt.receiptNumber}.pdf`,
      content: receipt.pdf,
      contentType: 'application/pdf',
    });
    receipt.emailStatus = emailSent ? 'sent' : 'failed';
    receipt.emailSentAt = emailSent ? new Date() : null;
    if (!emailSent) {
      receipt.emailError = 'Receipt email delivery failed; retry by saving the invoice as paid again.';
      logger.warn(`Paid invoice receipt email was not sent for ${invoice.invoiceNumber}.`);
    }
    await receipt.save();
  } catch (error) {
    receipt.emailStatus = 'failed';
    receipt.emailSentAt = null;
    receipt.emailError = error.message;
    await receipt.save();
    logger.error(`Paid invoice receipt email failed for ${invoice.invoiceNumber}: ${error.message}`);
  }
  return receipt;
};

const getInvoicePdfBuffer = async (invoice) => {
  if (String(invoice.paymentStatus || '').toLowerCase() === 'paid' && invoice._id) {
    const receipt = await createOrGetReceipt(invoice);
    return Buffer.from(receipt.pdf);
  }
  return generateInvoicePdfBuffer(invoice);
};

const getInvoiceRecipients = async (booking, invoice) => {
  let creatorEmail = booking.createdBy?.email;
  if (!creatorEmail && booking.createdBy) {
    creatorEmail = (await User.findById(booking.createdBy).select('email').lean())?.email;
  }
  return [...new Set([invoice.guest?.email, booking.guest?.email, creatorEmail].filter(Boolean))];
};

const sendInvoiceEmail = async (booking, invoice) => {
  const content = await generateInvoicePdfBuffer(invoice);
  const recipients = await getInvoiceRecipients(booking, invoice);
  return emailService.sendInvoiceGenerated(booking, invoice, {
    filename: `${invoice.invoiceNumber || 'invoice'}.pdf`,
    content,
    contentType: 'application/pdf',
  }, recipients);
};

module.exports = {
  isNonBillableCareStaff,
  isIntercompanyCareStaffLongStay,
  generateInvoiceForBooking,
  listInvoices,
  getInvoiceById,
  resendInvoiceEmail: sendInvoiceEmail,
  sendInvoiceEmail,
  updatePaymentStatus,
  generateInvoicePdfBuffer,
  getInvoicePdfBuffer,
};
