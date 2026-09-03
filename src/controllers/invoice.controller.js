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
    const pdfBuffer = await invoiceService.generateInvoicePdfBuffer(invoice);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${invoice.invoiceNumber || 'invoice'}.pdf"`
    );
    return res.send(pdfBuffer);
  }

  sendSuccess(res, { message: 'Invoice retrieved.', data: invoice });
});

const updatePaymentStatus = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.updatePaymentStatus(
    req.params.id,
    req.body.paymentStatus,
    req.user
  );
  sendSuccess(res, { message: 'Invoice payment status updated.', data: invoice });
});

module.exports = { listInvoices, getInvoice, updatePaymentStatus };
