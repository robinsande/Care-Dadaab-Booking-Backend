const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const invoiceService = require('../services/invoice.service');

const listInvoices = asyncHandler(async (req, res) => {
  const data = await invoiceService.listInvoices(req.query);
  sendSuccess(res, { message: 'Invoices retrieved.', data });
});

const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getInvoiceById(req.params.id);

  if ((req.query.format || '').toLowerCase() === 'pdf') {
    const pdfBuffer = await invoiceService.getInvoicePdfBuffer(invoice);
    const paid = String(invoice.paymentStatus || '').toLowerCase() === 'paid';
    const filename = paid
      ? `RCPT-${invoice.invoiceNumber || invoice.bookingReference}.pdf`
      : `${invoice.invoiceNumber || 'invoice'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    return res.send(pdfBuffer);
  }

  sendSuccess(res, { message: 'Invoice retrieved.', data: invoice });
});

const updatePaymentStatus = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.updatePaymentStatus(
    req.params.id,
    req.body.paymentStatus,
    { paymentMethod: req.body.paymentMethod }
  );
  sendSuccess(res, { message: 'Invoice payment status updated.', data: invoice });
});

const confirmMpesaPayment = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.confirmMpesaPayment(
    req.params.id,
    req.body,
    req.user
  );
  sendSuccess(res, { message: 'M-Pesa payment confirmed.', data: invoice });
});

const confirmMpesaScreenshotPayment = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.confirmMpesaScreenshotPayment(
    req.params.id,
    req.file.buffer,
    req.user
  );
  sendSuccess(res, { message: 'M-Pesa screenshot verified and invoice marked as paid.', data: invoice });
});

const resendPaidReceiptEmail = asyncHandler(async (req, res) => {
  const result = await invoiceService.resendPaidReceiptEmail(req.params.id);
  const sent = result.emailStatus === 'sent';
  sendSuccess(res, {
    message: sent ? 'Payment receipt emailed to the guest.' : 'Receipt email could not be sent. Check the email configuration and try again.',
    data: result,
  });
});

module.exports = {
  listInvoices,
  getInvoice,
  updatePaymentStatus,
  confirmMpesaPayment,
  confirmMpesaScreenshotPayment,
  resendPaidReceiptEmail,
};
