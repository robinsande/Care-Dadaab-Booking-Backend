const { Invoice, MpesaTransaction } = require('../models');
const invoiceService = require('./invoice.service');
const auditService = require('./audit.service');
const { ACTOR_TYPE, AUDIT_ACTIONS, INVOICE_PAYMENT_STATUS } = require('../utils/constants');
const env = require('../config/env');
const logger = require('../utils/logger');

const baseUrl = () =>
  env.daraja.environment === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

const isCareStaff = (contractType = '') =>
  /care\s*staff|^staff$/i.test(String(contractType).trim());

const parseTransactionDate = (value) => {
  if (!value) return new Date();
  const text = String(value);
  const parsed = new Date(
    `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}+03:00`
  );
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const getAccessToken = async () => {
  if (!env.daraja.consumerKey || !env.daraja.consumerSecret) {
    throw new Error('Daraja consumer credentials are not configured.');
  }
  const credentials = Buffer
    .from(`${env.daraja.consumerKey}:${env.daraja.consumerSecret}`)
    .toString('base64');
  const response = await fetch(`${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Daraja OAuth failed with status ${response.status}.`);
  const data = await response.json();
  if (!data.access_token) throw new Error('Daraja OAuth response did not include an access token.');
  return data.access_token;
};

const registerC2BUrls = async () => {
  if (!env.daraja.callbackBaseUrl) throw new Error('DARAJA_CALLBACK_BASE_URL is not configured.');
  const token = await getAccessToken();
  const response = await fetch(`${baseUrl()}/mpesa/c2b/v1/registerurl`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ShortCode: env.daraja.shortCode,
      ResponseType: 'Completed',
      ConfirmationURL: new URL(env.daraja.confirmationPath, env.daraja.callbackBaseUrl).toString(),
      ValidationURL: new URL(env.daraja.validationPath, env.daraja.callbackBaseUrl).toString(),
    }),
    signal: AbortSignal.timeout(15000),
  });
  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(
      `Daraja C2B registration failed with status ${response.status}: ${responseBody.slice(0, 500)}`
    );
  }
  return responseBody ? JSON.parse(responseBody) : { ResponseCode: '00' };
};

const validatePayment = async (payload) => {
  const reference = String(payload.BillRefNumber || '').trim();
  if (!reference || !payload.TransID) return { ResultCode: 'C2B00011', ResultDesc: 'Invalid payment reference.' };
  const invoice = await Invoice.findOne({ bookingReference: reference });
  if (!invoice) return { ResultCode: 'C2B00011', ResultDesc: 'Invoice not found.' };
  if (isCareStaff(invoice.guest?.contractType)) {
    return { ResultCode: 'C2B00011', ResultDesc: 'CARE staff payments are handled by the organisation.' };
  }
  if (Number(payload.TransAmount) !== Number(invoice.totalAmount)) {
    return { ResultCode: 'C2B00011', ResultDesc: 'Payment amount does not match the invoice.' };
  }
  return { ResultCode: '0', ResultDesc: 'Accepted' };
};

const processConfirmation = async (payload) => {
  const reference = String(payload.BillRefNumber || '').trim();
  const invoice = await Invoice.findOne({ bookingReference: reference });
  if (!invoice) throw new Error(`No invoice found for booking reference ${reference}.`);
  if (isCareStaff(invoice.guest?.contractType)) {
    logger.warn(`Ignored Daraja payment for CARE staff booking ${reference}.`);
    return invoice;
  }
  const existing = await MpesaTransaction.findOne({ transactionId: payload.TransID });
  if (existing) return invoice;
  if (Number(payload.TransAmount) !== Number(invoice.totalAmount)) {
    throw new Error(`Daraja payment amount mismatch for ${reference}.`);
  }

  await MpesaTransaction.create({
    transactionId: payload.TransID,
    invoice: invoice._id,
    bookingReference: reference,
    amount: Number(payload.TransAmount),
    phoneNumber: payload.MSISDN,
    transactionTime: parseTransactionDate(payload.TransTime),
    rawPayload: payload,
  });

  const updated = await invoiceService.updatePaymentStatus(invoice._id, INVOICE_PAYMENT_STATUS.PAID, {
    paymentMethod: 'M-Pesa Paybill',
    transactionId: payload.TransID,
    phoneNumber: payload.MSISDN,
    paidAt: parseTransactionDate(payload.TransTime),
  });
  await auditService.record({
    action: AUDIT_ACTIONS.INVOICE_UPDATED,
    bookingReference: reference,
    actorType: ACTOR_TYPE.SYSTEM,
    metadata: { invoiceNumber: updated.invoiceNumber, transactionId: payload.TransID, paymentMethod: 'M-Pesa Paybill' },
    message: `Invoice ${updated.invoiceNumber} paid through M-Pesa Paybill.`,
  });
  return updated;
};

module.exports = { registerC2BUrls, validatePayment, processConfirmation };
