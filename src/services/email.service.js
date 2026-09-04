const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  if (!env.smtp.host || !env.smtp.user) return null;

  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  });
  return transporter;
};

const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

const sendEmail = async ({ to, subject, html, text }) => {
  const from = `"${env.emailFrom.name}" <${env.emailFrom.address}>`;
  const activeTransporter = getTransporter();

  if (!activeTransporter) {
    logger.warn(`SMTP not configured. Email not sent. To: ${to} | Subject: ${subject}`);
    return false;
  }

  try {
    await activeTransporter.sendMail({ from, to, subject, html, text });
    logger.info(`Email sent to ${to} | Subject: ${subject}`);
    return true;
  } catch (error) {
    logger.error(`Failed to send email to ${to}: ${error.message}`);
    return false;
  }
};

const layout = (title, bodyHtml) => `
  <div style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto;">
    <div style="background:#0b5394; color:#ffffff; padding:20px 24px; border-radius:8px 8px 0 0;">
      <h2 style="margin:0; font-size:18px;">CARE Accommodation Management System</h2>
    </div>
    <div style="border:1px solid #e5e7eb; border-top:none; padding:24px; border-radius:0 0 8px 8px;">
      <h3 style="margin-top:0;">${title}</h3>
      ${bodyHtml}
      <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
      <p style="font-size:12px; color:#6b7280;">
        Need help? Contact us at ${env.support.email}${env.support.phone ? ` or ${env.support.phone}` : ''}.
      </p>
    </div>
  </div>
`;

const detailRow = (label, value) =>
  `<p style="margin:4px 0;"><strong>${label}:</strong> ${value}</p>`;

const sendBookingCreated = (booking, recipients = booking.guest.email) => {
  const body = `
    <p>Dear ${booking.guest.firstName},</p>
    <p>Your accommodation booking has been confirmed.</p>
    ${detailRow('Booking Reference', booking.bookingReference)}
    ${detailRow('Camp', booking.campName)}
    ${detailRow('Room', `Block ${booking.blockName} Room ${booking.roomNumber}`)}
    ${detailRow('Stay Type', booking.stayType)}
    ${detailRow('Arrival Date', formatDate(booking.arrivalDate))}
    ${detailRow('Departure Date', formatDate(booking.departureDate))}
    ${detailRow('Status', booking.status)}
    <p style="background:#fef3c7; padding:12px; border-radius:6px;">
      <strong>Please save this Booking Reference</strong> for your records and when contacting CARE.
    </p>
  `;
  return sendEmail({
    to: recipients,
    subject: `Booking Confirmed - ${booking.bookingReference}`,
    html: layout('Booking Confirmation', body),
    text: [
      `Dear ${booking.guest.firstName},`,
      '',
      'Your accommodation booking has been confirmed.',
      `Booking Reference: ${booking.bookingReference}`,
      `Camp: ${booking.campName}`,
      `Room: Block ${booking.blockName} Room ${booking.roomNumber}`,
      `Stay Type: ${booking.stayType}`,
      `Arrival Date: ${formatDate(booking.arrivalDate)}`,
      `Departure Date: ${formatDate(booking.departureDate)}`,
      `Status: ${booking.status}`,
      '',
      'Please save this Booking Reference for your records and when contacting CARE.',
    ].join('\n'),
  });
};

const sendBookingUpdated = (booking) => {
  const body = `
    <p>Dear ${booking.guest.firstName},</p>
    <p>Your accommodation booking has been <strong>updated</strong>.</p>
    ${detailRow('Booking Reference', booking.bookingReference)}
    ${detailRow('Camp', booking.campName)}
    ${detailRow('Room', `Block ${booking.blockName} Room ${booking.roomNumber}`)}
    ${detailRow('Stay Type', booking.stayType)}
    ${detailRow('Arrival Date', formatDate(booking.arrivalDate))}
    ${detailRow('Departure Date', formatDate(booking.departureDate))}
    ${detailRow('Status', booking.status)}
  `;
  return sendEmail({
    to: booking.guest.email,
    subject: `Booking Updated - ${booking.bookingReference}`,
    html: layout('Booking Updated', body),
  });
};

const sendBookingCancelled = (booking) => {
  const body = `
    <p>Dear ${booking.guest.firstName},</p>
    <p>Your accommodation booking has been <strong>cancelled</strong>.</p>
    ${detailRow('Booking Reference', booking.bookingReference)}
    ${booking.cancellationReason ? detailRow('Reason', booking.cancellationReason) : ''}
    ${detailRow('Status', booking.status)}
  `;
  return sendEmail({
    to: booking.guest.email,
    subject: `Booking Cancelled - ${booking.bookingReference}`,
    html: layout('Booking Cancelled', body),
  });
};

const sendInvoiceGenerated = async (booking, invoice, officer) => {
  const payment = invoice.paymentInstructions || {};
  const body = `
    <p>Dear ${invoice.guest.firstName},</p>
    <p>Please find your accommodation invoice below.</p>
    ${detailRow('Invoice Number', invoice.invoiceNumber)}
    ${detailRow('Booking Reference', invoice.bookingReference)}
    ${detailRow('Camp', invoice.campName)}
    ${detailRow('Room', `Block ${invoice.blockName} Room ${invoice.roomNumber}`)}
    ${detailRow('Arrival Date', formatDate(invoice.arrivalDate))}
    ${detailRow('Departure Date', formatDate(invoice.departureDate))}
    ${detailRow('Number of Nights', invoice.numberOfNights)}
    ${detailRow('Stay Type', invoice.stayType)}
    ${detailRow('Rate', `${invoice.appliedRate.currency} ${invoice.appliedRate.amount} per night`)}
    ${detailRow('Total Amount', `${invoice.appliedRate.currency} ${invoice.totalAmount}`)}
    <h4>Payment Instructions</h4>
    ${payment.mpesaPaybillNumber ? detailRow('M-Pesa Paybill', payment.mpesaPaybillNumber) : ''}
    ${payment.bankName ? detailRow('Bank', payment.bankName) : ''}
    ${payment.bankAccountName ? detailRow('Account Name', payment.bankAccountName) : ''}
    ${payment.bankAccountNumber ? detailRow('Account Number', payment.bankAccountNumber) : ''}
    <p><em>Payments are not processed through this system. Please use the details above to make payment.</em></p>
  `;

  const html = layout('Invoice', body);
  const subject = `Invoice ${invoice.invoiceNumber} - ${invoice.bookingReference}`;

  await sendEmail({ to: booking.guest.email, subject, html });
  if (officer && officer.email) {
    await sendEmail({ to: officer.email, subject, html });
  }
};

module.exports = {
  sendEmail,
  sendBookingCreated,
  sendBookingUpdated,
  sendBookingCancelled,
  sendInvoiceGenerated,
};
