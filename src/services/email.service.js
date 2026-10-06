const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

const defaultAdminPanelUrl = 'https://care-dadaab-booking.onrender.com/';
const configuredAdminPanelUrl = String(env.adminPanelUrl || defaultAdminPanelUrl).replace(/\/admin\/bookings\.html(?:\?.*)?$/, '/');
const adminPanelUrl = /^https?:\/\//i.test(configuredAdminPanelUrl)
  ? configuredAdminPanelUrl
  : new URL(configuredAdminPanelUrl, defaultAdminPanelUrl).toString();
const guestRequestsUrl = new URL('admin/guest-requests.html', adminPanelUrl).toString();

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  if (!env.smtp.host || !env.smtp.user || !env.smtp.pass) return null;

  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: { user: env.smtp.user, pass: env.smtp.pass.replace(/\s+/g, '') },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
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

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const sendEmail = async ({ to, subject, html, text, attachments = [] }) => {
  const from = `"${env.emailFrom.name}" <${env.emailFrom.address}>`;
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).filter(Boolean))];
  if (!recipients.length) {
    logger.warn(`Email not sent because it has no recipients. Subject: ${subject}`);
    return false;
  }
  if (recipients.length > 1) {
    const results = await Promise.all(
      recipients.map((recipient) => sendEmail({ to: recipient, subject, html, text, attachments }))
    );
    return results.every(Boolean);
  }
  const recipient = recipients[0];

  if (env.brevoApiKey) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': env.brevoApiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: env.emailFrom.name, email: env.emailFrom.address },
          replyTo: env.emailReplyTo ? { email: env.emailReplyTo } : undefined,
          to: [{ email: recipient }],
          subject,
          htmlContent: html,
          textContent: text,
          attachments: attachments.map((attachment) => ({
            name: attachment.filename,
            content: Buffer.isBuffer(attachment.content)
              ? attachment.content.toString('base64')
              : attachment.content,
          })),
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Brevo API ${response.status}: ${errorBody.slice(0, 300)}`);
      }

      logger.info(`Email sent via Brevo API to ${recipient} | Subject: ${subject}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send email via Brevo API to ${recipient}: ${error.message}`);
      return false;
    }
  }

  const activeTransporter = getTransporter();

  if (!activeTransporter) {
    logger.warn(`SMTP not configured. Email not sent. To: ${recipient} | Subject: ${subject}`);
    return false;
  }

  try {
    await activeTransporter.sendMail({
      from,
      replyTo: env.emailReplyTo || undefined,
      to: recipient,
      subject,
      html,
      text,
      attachments,
    });
    logger.info(`Email sent to ${recipient} | Subject: ${subject}`);
    return true;
  } catch (error) {
    logger.error(`Failed to send email to ${recipient}: ${error.message}`);
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
      <p style="font-size:12px;"><a href="${adminPanelUrl}">Open booking panel</a></p>
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
    <p><a href="${adminPanelUrl}">Open the booking panel</a></p>
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
      `Booking panel: ${adminPanelUrl}`,
    ].join('\n'),
  });
};

const sendBookingConfirmationWithInvoice = (booking, invoice, recipients = booking.guest.email, invoicePdf) => {
  const payment = invoice?.paymentInstructions || {};
  const body = `
    <p>Dear ${booking.guest.firstName},</p>
    <p>Your accommodation booking has been confirmed. Your invoice is included below.</p>
    ${detailRow('Booking Reference', booking.bookingReference)}
    ${detailRow('Camp', booking.campName)}
    ${detailRow('Room', `Block ${booking.blockName} Room ${booking.roomNumber}`)}
    ${detailRow('Arrival Date', formatDate(booking.arrivalDate))}
    ${detailRow('Departure Date', formatDate(booking.departureDate))}
    ${detailRow('Invoice Number', invoice?.invoiceNumber || 'Pending')}
    ${invoice ? detailRow('Rate', `${invoice.appliedRate.currency} ${invoice.appliedRate.amount} per ${invoice.appliedRate.ratePeriod === 'per_month' ? 'month' : 'night'}`) : ''}
    ${invoice ? detailRow('Total Amount', `${invoice.appliedRate.currency} ${invoice.totalAmount}`) : ''}
    ${payment.mpesaTillNumber || payment.mpesaPaybillNumber ? detailRow('M-Pesa Till', payment.mpesaTillNumber || payment.mpesaPaybillNumber) : ''}
  `;
  return sendEmail({
    to: recipients,
    subject: `Booking Confirmed and Invoice - ${booking.bookingReference}`,
    html: layout('Booking Confirmation and Invoice', body),
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
      invoice ? `Invoice Number: ${invoice.invoiceNumber}` : '',
      invoice ? `Total Amount: ${invoice.appliedRate.currency} ${invoice.totalAmount}` : '',
      '',
      invoicePdf ? 'Your invoice PDF is attached to this email.' : '',
    ].filter(Boolean).join('\n'),
    attachments: invoicePdf ? [invoicePdf] : [],
  });
};

const sendIntercompanyBookingConfirmation = (booking, recipients = booking.guest.email) => {
  const body = `
    <p>Dear ${booking.guest.firstName},</p>
    <p>Your long-stay accommodation booking has been confirmed. No guest invoice is required.</p>
    ${detailRow('Booking Reference', booking.bookingReference)}
    ${detailRow('Camp', booking.campName)}
    ${detailRow('Room', `Block ${booking.blockName} Room ${booking.roomNumber}`)}
    ${detailRow('Arrival Date', formatDate(booking.arrivalDate))}
    ${detailRow('Departure Date', formatDate(booking.departureDate))}
    ${detailRow('Billing', 'CARE Intercompany Building')}
  `;
  return sendEmail({
    to: recipients,
    subject: `Booking Confirmed - ${booking.bookingReference}`,
    html: layout('Booking Confirmation', body),
  });
};

const sendWaivedBookingConfirmation = (booking, recipients = booking.guest.email) => {
  const body = `
    <p>Dear ${booking.guest.firstName},</p>
    <p>Your accommodation booking has been confirmed. This CARE Staff booking is waived and no payment is due.</p>
    ${detailRow('Booking Reference', booking.bookingReference)}
    ${detailRow('Camp', booking.campName)}
    ${detailRow('Room', `Block ${booking.blockName} Room ${booking.roomNumber}`)}
    ${detailRow('Arrival Date', formatDate(booking.arrivalDate))}
    ${detailRow('Departure Date', formatDate(booking.departureDate))}
    ${detailRow('Billing', 'CARE Staff Waiver')}
  `;
  return sendEmail({
    to: recipients,
    subject: `Booking Confirmed - ${booking.bookingReference}`,
    html: layout('Booking Confirmation', body),
  });
};

const sendBookingUpdated = (booking, recipients = booking.guest.email) => {
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
    to: recipients,
    subject: `Booking Updated - ${booking.bookingReference}`,
    html: layout('Booking Updated', body),
  });
};

const sendBookingExtended = (booking, extension, recipients = [booking.guest.email, extension.extendedBy?.email]) => {
  const currency = booking.appliedRate?.currency || 'KES';
  const body = `
    <p>Dear ${booking.guest.firstName},</p>
    <p>Your accommodation booking has been <strong>extended</strong>.</p>
    ${detailRow('Booking Reference', booking.bookingReference)}
    ${detailRow('New Departure Date', formatDate(booking.departureDate))}
    ${detailRow('Additional Cost', `${currency} ${Number(extension.additionalCost).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`)}
    ${detailRow('Reason', extension.reason)}
    ${booking.billingType === 'intercompany'
      ? '<p>This booking is billed through CARE Intercompany Building. No guest invoice is required.</p>'
      : '<p>Your updated invoice reflects the extended stay and additional cost.</p>'}
  `;
  return sendEmail({
    to: recipients,
    subject: `Stay Extended - ${booking.bookingReference}`,
    html: layout('Accommodation Stay Extended', body),
    text: [
      `Dear ${booking.guest.firstName},`,
      '',
      'Your accommodation booking has been extended.',
      `Booking Reference: ${booking.bookingReference}`,
      `New Departure Date: ${formatDate(booking.departureDate)}`,
      `Additional Cost: ${currency} ${Number(extension.additionalCost).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
      `Reason: ${extension.reason}`,
      '',
      'Your updated invoice reflects the extended stay and additional cost.',
    ].join('\n'),
  });
};

const sendBookingCancelled = (booking, recipients = booking.guest.email) => {
  const body = `
    <p>Dear ${booking.guest.firstName},</p>
    <p>Your accommodation booking has been <strong>cancelled</strong>.</p>
    ${detailRow('Booking Reference', booking.bookingReference)}
    ${booking.cancellationReason ? detailRow('Reason', booking.cancellationReason) : ''}
    ${detailRow('Status', booking.status)}
  `;
  return sendEmail({
    to: recipients,
    subject: `Booking Cancelled - ${booking.bookingReference}`,
    html: layout('Booking Cancelled', body),
  });
};

const sendBookingCheckedIn = (booking, recipients = booking.guest.email) => {
  const body = `
    <p>Dear ${booking.guest.firstName},</p>
    <p>Your arrival has been <strong>checked in</strong>.</p>
    ${detailRow('Booking Reference', booking.bookingReference)}
    ${detailRow('Camp', booking.campName)}
    ${detailRow('Room', `Block ${booking.blockName} Room ${booking.roomNumber}`)}
    ${detailRow('Check-in Date', formatDate(booking.checkedInAt))}
    ${detailRow('Departure Date', formatDate(booking.departureDate))}
    ${detailRow('Status', booking.status)}
  `;
  return sendEmail({
    to: recipients,
    subject: `Checked In - ${booking.bookingReference}`,
    html: layout('Accommodation Check-in', body),
    text: [
      `Dear ${booking.guest.firstName},`,
      '',
      'Your arrival has been checked in.',
      `Booking Reference: ${booking.bookingReference}`,
      `Camp: ${booking.campName}`,
      `Room: Block ${booking.blockName} Room ${booking.roomNumber}`,
      `Check-in Date: ${formatDate(booking.checkedInAt)}`,
      `Departure Date: ${formatDate(booking.departureDate)}`,
      `Status: ${booking.status}`,
    ].join('\n'),
  });
};

const sendBookingCheckedOut = (booking, recipients = booking.guest.email) => {
  const body = `
    <p>Dear ${booking.guest.firstName},</p>
    <p>Your accommodation stay has been <strong>checked out</strong>.</p>
    ${detailRow('Booking Reference', booking.bookingReference)}
    ${detailRow('Camp', booking.campName)}
    ${detailRow('Room', `Block ${booking.blockName} Room ${booking.roomNumber}`)}
    ${detailRow('Check-out Date', formatDate(booking.checkedOutAt))}
    ${booking.checkoutReason ? detailRow('Reason', booking.checkoutReason) : ''}
    ${detailRow('Status', booking.status)}
    <h3>Thank You for Being Our Guest!</h3>
    <p>Your stay has come to an end, and we're grateful you chose CARE Accommodation. We hope we made your visit comfortable and memorable. We look forward to hosting you again soon. Safe travels, and thank you for staying with us!</p>
    <p>Warm regards,<br>CARE Accommodation</p>
  `;
  return sendEmail({
    to: recipients,
    subject: `Checked Out - ${booking.bookingReference}`,
    html: layout('Accommodation Check-out', body),
    text: [
      `Dear ${booking.guest.firstName},`,
      '',
      'Your accommodation stay has been checked out.',
      `Booking Reference: ${booking.bookingReference}`,
      `Camp: ${booking.campName}`,
      `Room: Block ${booking.blockName} Room ${booking.roomNumber}`,
      `Check-out Date: ${formatDate(booking.checkedOutAt)}`,
      booking.checkoutReason ? `Reason: ${booking.checkoutReason}` : '',
      `Status: ${booking.status}`,
      '',
      'Thank You for Being Our Guest!',
      "Your stay has come to an end, and we're grateful you chose CARE Accommodation. We hope we made your visit comfortable and memorable. We look forward to hosting you again soon. Safe travels, and thank you for staying with us!",
      '',
      'Warm regards,',
      'CARE Accommodation',
    ].filter(Boolean).join('\n'),
  });
};

const sendBookingReminder = (booking, type, invoice = null, recipients = booking.guest.email) => {
  const isArrival = type === 'arrival';
  const isDeparture = type === 'departure';
  const title = isArrival ? 'Arrival Reminder' : isDeparture ? 'Departure Reminder' : 'Payment Reminder';
  const message = isArrival
    ? `This is a reminder that your stay begins on ${formatDate(booking.arrivalDate)}.`
    : isDeparture
      ? `This is a reminder that your scheduled departure is on ${formatDate(booking.departureDate)}.`
      : `Your invoice ${invoice?.invoiceNumber || ''} has an outstanding balance of ${invoice?.appliedRate?.currency || 'KES'} ${Number(invoice?.totalAmount || 0).toFixed(2)}.`;
  const body = `
    <p>Dear ${booking.guest.firstName},</p>
    <p>${message}</p>
    ${detailRow('Booking Reference', booking.bookingReference)}
    ${detailRow('Camp', booking.campName)}
    ${detailRow('Room', `Block ${booking.blockName} Room ${booking.roomNumber}`)}
    ${detailRow('Arrival Date', formatDate(booking.arrivalDate))}
    ${detailRow('Departure Date', formatDate(booking.departureDate))}
    <p>Please contact CARE Accommodation if you need assistance.</p>
  `;
  return sendEmail({
    to: recipients,
    subject: `${title} - ${booking.bookingReference}`,
    html: layout(title, body),
    text: [
      `Dear ${booking.guest.firstName},`,
      '',
      message,
      `Booking Reference: ${booking.bookingReference}`,
      `Camp: ${booking.campName}`,
      `Room: Block ${booking.blockName} Room ${booking.roomNumber}`,
      `Arrival Date: ${formatDate(booking.arrivalDate)}`,
      `Departure Date: ${formatDate(booking.departureDate)}`,
    ].join('\n'),
  });
};

const sendPendingInvoiceStaffReminder = (booking, invoice, recipients = []) => {
  const currency = invoice?.appliedRate?.currency || 'KES';
  const amount = Number(invoice?.totalAmount || 0).toFixed(2);
  const body = `
    <p>This booking has an unpaid accommodation invoice requiring follow-up.</p>
    ${detailRow('Invoice Number', escapeHtml(invoice?.invoiceNumber || 'Pending'))}
    ${detailRow('Booking Reference', escapeHtml(booking.bookingReference))}
    ${detailRow('Guest', escapeHtml(`${booking.guest?.firstName || ''} ${booking.guest?.lastName || ''}`.trim()))}
    ${detailRow('Guest Email', escapeHtml(booking.guest?.email || ''))}
    ${detailRow('Camp', escapeHtml(booking.campName))}
    ${detailRow('Outstanding Amount', `${escapeHtml(currency)} ${escapeHtml(amount)}`)}
    ${detailRow('Invoice Generated', escapeHtml(formatDate(invoice?.generatedAt)))}
    <p><a href="${adminPanelUrl}admin/invoices.html">Review outstanding invoices</a></p>
  `;
  return sendEmail({
    to: recipients,
    subject: `Pending invoice ${invoice?.invoiceNumber || ''} - ${booking.bookingReference}`.trim(),
    html: layout('Pending Invoice Follow-up', body),
    text: [
      'This booking has an unpaid accommodation invoice requiring follow-up.',
      `Invoice Number: ${invoice?.invoiceNumber || 'Pending'}`,
      `Booking Reference: ${booking.bookingReference}`,
      `Guest: ${`${booking.guest?.firstName || ''} ${booking.guest?.lastName || ''}`.trim()}`,
      `Guest Email: ${booking.guest?.email || ''}`,
      `Camp: ${booking.campName}`,
      `Outstanding Amount: ${currency} ${amount}`,
      `Invoice Generated: ${formatDate(invoice?.generatedAt)}`,
      `Review outstanding invoices: ${adminPanelUrl}admin/invoices.html`,
    ].join('\n'),
  });
};

const sendInvoiceGenerated = async (booking, invoice, invoicePdf, recipients = invoice.guest.email) => {
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
    ${detailRow('Rate', `${invoice.appliedRate.currency} ${invoice.appliedRate.amount} per ${invoice.appliedRate.ratePeriod === 'per_month' ? 'month' : 'night'}`)}
    ${detailRow('Total Amount', `${invoice.appliedRate.currency} ${invoice.totalAmount}`)}
    <h4>Payment Instructions</h4>
    ${payment.mpesaTillNumber || payment.mpesaPaybillNumber ? detailRow('M-Pesa Till', payment.mpesaTillNumber || payment.mpesaPaybillNumber) : ''}
    ${payment.mpesaTillNumber || payment.mpesaPaybillNumber ? detailRow('Till Account / Reference', invoice.bookingReference) : ''}
    <p><em>Payments are not processed through this system. Please use the details above to make payment.</em></p>
  `;

  const html = layout('Invoice', body);
  const subject = `Invoice ${invoice.invoiceNumber} - ${invoice.bookingReference}`;

  return sendEmail({
    to: recipients || invoice.guest.email || booking.guest.email,
    subject,
    html,
    attachments: invoicePdf ? [invoicePdf] : [],
  });
};

const sendInvoicePaid = (invoice) => {
  const guest = invoice.guest || {};
  const currency = invoice.appliedRate?.currency || 'KES';
  const paidAt = invoice.paidAt || new Date();
  const body = `
    <p>Dear ${guest.firstName || 'Guest'},</p>
    <p>Your pending accommodation invoice has been <strong>paid</strong>.</p>
    ${detailRow('Invoice Number', invoice.invoiceNumber)}
    ${detailRow('Booking Reference', invoice.bookingReference)}
    ${detailRow('Amount Paid', `${currency} ${invoice.totalAmount}`)}
    ${detailRow('Payment Status', invoice.paymentStatus)}
    ${detailRow('Payment Date', formatDate(paidAt))}
    <p>Thank you. Please keep this confirmation for your records.</p>
  `;

  return sendEmail({
    to: guest.email,
    subject: `Payment Confirmed - Invoice ${invoice.invoiceNumber}`,
    html: layout('Invoice Payment Confirmed', body),
    text: [
      `Dear ${guest.firstName || 'Guest'},`,
      '',
      'Your pending accommodation invoice has been paid.',
      `Invoice Number: ${invoice.invoiceNumber}`,
      `Booking Reference: ${invoice.bookingReference}`,
      `Amount Paid: ${currency} ${invoice.totalAmount}`,
      `Payment Status: ${invoice.paymentStatus}`,
      `Payment Date: ${formatDate(paidAt)}`,
      '',
      'Thank you. Please keep this confirmation for your records.',
    ].join('\n'),
  });
};

const sendGuestPasswordReset = (guest, token) => {
  const base = env.adminPanelUrl.replace(/\/admin\/bookings\.html.*$/, '');
  const link = `${base}/guest/index.html?resetToken=${encodeURIComponent(token)}`;
  const body = `
    <p>Dear ${guest.firstName},</p>
    <p>Use the link below to set a new password for your CARE guest account. This link expires in 30 minutes.</p>
    <p><a href="${link}">${link}</a></p>
  `;
  return sendEmail({
    to: guest.email,
    subject: 'CARE guest account password recovery',
    html: layout('Password Recovery', body),
    text: `Use this link to reset your CARE guest account password (expires in 30 minutes): ${link}`,
  });
};

const sendGuestBookingRequestConfirmation = (request, guest) => {
  const guestName = guest?.firstName || request.guest?.firstName || 'Guest';
  const body = `
    <p>Dear ${escapeHtml(guestName)},</p>
    <p>We have received your accommodation booking request. The booking team will review it and email you once your booking is confirmed.</p>
    ${detailRow('Camp', escapeHtml(request.camp?.name || request.campName || 'CARE Dadaab accommodation'))}
    ${detailRow('Stay Type', escapeHtml(request.stayType))}
    ${detailRow('Arrival Date', escapeHtml(formatDate(request.arrivalDate)))}
    ${detailRow('Departure Date', escapeHtml(formatDate(request.departureDate)))}
    <p>Please note that your stay is not confirmed until you receive a booking confirmation.</p>
  `;
  return sendEmail({
    to: guest?.email || request.guest?.email,
    subject: 'CARE accommodation booking request received',
    html: layout('Booking Request Received', body),
    text: [
      `Dear ${guestName},`,
      '',
      'We have received your accommodation booking request.',
      `Camp: ${request.camp?.name || request.campName || 'CARE Dadaab accommodation'}`,
      `Stay Type: ${request.stayType}`,
      `Arrival Date: ${formatDate(request.arrivalDate)}`,
      `Departure Date: ${formatDate(request.departureDate)}`,
      '',
      'The booking team will review your request. Your stay is not confirmed until you receive a booking confirmation.',
    ].join('\n'),
  });
};

const sendStaffGuestBookingRequestNotification = (request, guest, recipients = []) => {
  const guestName = `${guest?.firstName || ''} ${guest?.lastName || ''}`.trim() || 'Guest';
  const body = `
    <p>A guest booking request requires review and room assignment.</p>
    ${detailRow('Guest', escapeHtml(guestName))}
    ${detailRow('Guest Email', escapeHtml(guest?.email || ''))}
    ${detailRow('Phone', escapeHtml(request.requestedData?.phone || guest?.phone || ''))}
    ${detailRow('Camp', escapeHtml(request.camp?.name || request.campName || 'CARE Dadaab accommodation'))}
    ${detailRow('Stay Type', escapeHtml(request.stayType))}
    ${detailRow('Arrival Date', escapeHtml(formatDate(request.arrivalDate)))}
    ${detailRow('Departure Date', escapeHtml(formatDate(request.departureDate)))}
    ${request.reason ? detailRow('Request Notes', escapeHtml(request.reason)) : ''}
    ${request.requestedData?.remarks ? detailRow('Remarks', escapeHtml(request.requestedData.remarks)) : ''}
    <p><a href="${guestRequestsUrl}">Review and complete this booking request</a></p>
  `;
  return sendEmail({
    to: recipients,
    subject: 'Guest booking request requires room assignment',
    html: layout('Guest Booking Request', body),
    text: [
      'A guest booking request requires review and room assignment.',
      `Guest: ${guestName}`,
      `Email: ${guest?.email || ''}`,
      `Camp: ${request.camp?.name || request.campName || 'CARE Dadaab accommodation'}`,
      `Stay Type: ${request.stayType}`,
      `Arrival Date: ${formatDate(request.arrivalDate)}`,
      `Departure Date: ${formatDate(request.departureDate)}`,
      `Review request: ${guestRequestsUrl}`,
    ].join('\n'),
  });
};

const sendStaffGuestRequestNotification = (request, guest, recipients = []) => {
  const guestName = `${guest?.firstName || ''} ${guest?.lastName || ''}`.trim() || 'Guest';
  const reference = request.booking?.bookingReference || 'Guest portal request';
  const body = `
    <p>A guest portal request requires review.</p>
    ${detailRow('Request Type', escapeHtml(request.type))}
    ${detailRow('Guest', escapeHtml(guestName))}
    ${detailRow('Guest Email', escapeHtml(guest?.email || ''))}
    ${detailRow('Phone', escapeHtml(guest?.phone || ''))}
    ${detailRow('Booking Reference', escapeHtml(reference))}
    ${request.reason ? detailRow('Reason', escapeHtml(request.reason)) : ''}
    ${request.requestedData?.newDepartureDate ? detailRow('Requested Departure Date', escapeHtml(formatDate(request.requestedData.newDepartureDate))) : ''}
    <p><a href="${guestRequestsUrl}">Review guest portal requests</a></p>
  `;
  return sendEmail({
    to: recipients,
    subject: `Guest ${request.type} request requires review`,
    html: layout('Guest Portal Request', body),
    text: [
      'A guest portal request requires review.',
      `Request Type: ${request.type}`,
      `Guest: ${guestName}`,
      `Email: ${guest?.email || ''}`,
      `Booking Reference: ${reference}`,
      request.reason ? `Reason: ${request.reason}` : '',
      `Review requests: ${guestRequestsUrl}`,
    ].filter(Boolean).join('\n'),
  });
};

const sendStaffBookingCreatedNotification = (booking, recipients = []) => {
  const body = `
    <p>A booking has been created and requires no further room assignment.</p>
    ${detailRow('Guest', escapeHtml(`${booking.guest.firstName} ${booking.guest.lastName}`.trim()))}
    ${detailRow('Guest Email', escapeHtml(booking.guest.email))}
    ${detailRow('Booking Reference', escapeHtml(booking.bookingReference))}
    ${detailRow('Camp', escapeHtml(booking.campName))}
    ${detailRow('Room', `Block ${escapeHtml(booking.blockName)} Room ${escapeHtml(booking.roomNumber)}`)}
    ${detailRow('Arrival Date', escapeHtml(formatDate(booking.arrivalDate)))}
    ${detailRow('Departure Date', escapeHtml(formatDate(booking.departureDate)))}
    ${detailRow('Status', escapeHtml(booking.status))}
    <p><a href="${adminPanelUrl}admin/bookings.html">Open all bookings</a></p>
  `;
  return sendEmail({
    to: recipients,
    subject: `Booking created - ${booking.bookingReference}`,
    html: layout('Booking Created', body),
    text: [
      'A booking has been created.',
      `Guest: ${booking.guest.firstName} ${booking.guest.lastName}`,
      `Guest Email: ${booking.guest.email}`,
      `Booking Reference: ${booking.bookingReference}`,
      `Camp: ${booking.campName}`,
      `Room: Block ${booking.blockName} Room ${booking.roomNumber}`,
      `Arrival Date: ${formatDate(booking.arrivalDate)}`,
      `Departure Date: ${formatDate(booking.departureDate)}`,
      `Status: ${booking.status}`,
      `Open all bookings: ${adminPanelUrl}admin/bookings.html`,
    ].join('\n'),
  });
};

const sendGuestRequestNotification = (request, guest) => {
  const guestName = guest?.firstName || request.guest?.firstName || 'Guest';
  const reference = request.booking?.bookingReference || request.bookingReference || 'request';
  const body = `
    <p>Dear ${escapeHtml(guestName)},</p>
    <p>Your ${escapeHtml(request.type)} request has been <strong>${escapeHtml(request.status || 'submitted')}</strong>.</p>
    ${detailRow('Booking', escapeHtml(reference))}
    ${request.booking?.roomNumber ? detailRow('Room', `Block ${escapeHtml(request.booking.blockName)} Room ${escapeHtml(request.booking.roomNumber)}`) : ''}
    ${request.resolutionNote ? detailRow('Resolution Note', escapeHtml(request.resolutionNote)) : ''}
    <p>Contact the accommodation team if you have questions.</p>
  `;
  return sendEmail({
    to: guest?.email || request.guest?.email,
    subject: `Guest ${request.type} request - ${reference}`,
    html: layout('Guest Request Update', body),
    text: `Your ${request.type} request for ${reference} is ${request.status || 'submitted'}.`,
  });
};

module.exports = {
  sendEmail,
  sendBookingCreated,
  sendBookingConfirmationWithInvoice,
  sendIntercompanyBookingConfirmation,
  sendWaivedBookingConfirmation,
  sendBookingUpdated,
  sendBookingExtended,
  sendBookingCancelled,
  sendBookingCheckedIn,
  sendBookingCheckedOut,
  sendBookingReminder,
  sendPendingInvoiceStaffReminder,
  sendInvoiceGenerated,
  sendInvoicePaid,
  sendGuestPasswordReset,
  sendGuestBookingRequestConfirmation,
  sendStaffGuestBookingRequestNotification,
  sendStaffGuestRequestNotification,
  sendStaffBookingCreatedNotification,
  sendGuestRequestNotification,
};
