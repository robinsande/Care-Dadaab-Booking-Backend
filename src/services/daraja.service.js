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
      ShortCode: env.daraja.c2bShortCode,
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

const normalizePhoneNumber = (phoneNumber) => {
  const digits = String(phoneNumber || '').replace(/\D/g, '');
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.startsWith('7') || digits.startsWith('1')) return `254${digits}`;
  if (digits.startsWith('254')) return digits;
  throw new Error('Enter a valid Kenyan phone number.');
};

const buildTimestamp = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
};

const initiateStkPush = async (invoiceId, phoneNumber) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new Error('Invoice not found.');
  if (invoice.paymentStatus === INVOICE_PAYMENT_STATUS.PAID) {
    throw new Error('This invoice is already paid.');
  }
  if (isCareStaff(invoice.guest?.contractType)) {
    throw new Error('CARE staff payments are handled by the organisation.');
  }
  if (!env.daraja.callbackBaseUrl || !env.daraja.passkey || !env.daraja.stkShortCode) {
    throw new Error('Daraja STK Push settings are not fully configured.');
  }

  const timestamp = buildTimestamp();
  const password = Buffer
    .from(`${env.daraja.stkShortCode}${env.daraja.passkey}${timestamp}`)
    .toString('base64');
  const token = await getAccessToken();
  const response = await fetch(`${baseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: env.daraja.stkShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(invoice.totalAmount),
      PartyA: normalizePhoneNumber(phoneNumber),
      PartyB: env.daraja.stkShortCode,
      PhoneNumber: normalizePhoneNumber(phoneNumber),
      CallBackURL: new URL(env.daraja.stkCallbackPath, env.daraja.callbackBaseUrl).toString(),
      AccountReference: invoice.bookingReference,
      TransactionDesc: `Accommodation invoice ${invoice.invoiceNumber}`.slice(0, 20),
    }),
    signal: AbortSignal.timeout(15000),
  });
  const responseBody = await response.text();
  const data = responseBody ? JSON.parse(responseBody) : {};
  if (!response.ok || data.ResponseCode !== '0') {
    throw new Error(`Daraja STK Push failed: ${data.errorMessage || data.ResponseDescription || responseBody}`);
  }

  await invoiceService.updatePaymentStatus(invoice._id, invoice.paymentStatus, {
    paymentMethod: 'M-Pesa STK Push',
    phoneNumber: normalizePhoneNumber(phoneNumber),
    checkoutRequestId: data.CheckoutRequestID,
  });
  return {
    checkoutRequestId: data.CheckoutRequestID,
    customerMessage: data.CustomerMessage || 'Please check the guest phone for the M-Pesa prompt.',
  };
};

const processStkCallback = async (payload) => {
  const callback = payload?.Body?.stkCallback;
  if (!callback?.CheckoutRequestID) throw new Error('Invalid STK callback payload.');
  if (Number(callback.ResultCode) !== 0) return callback;
  const invoice = await Invoice.findOne({ paymentCheckoutRequestId: callback.CheckoutRequestID });
  if (!invoice || invoice.paymentStatus === INVOICE_PAYMENT_STATUS.PAID) return callback;
  const metadata = callback.CallbackMetadata?.Item || [];
  const getItem = (name) => metadata.find((item) => item.Name === name)?.Value;
  const transactionId = getItem('MpesaReceiptNumber');
  const amount = Number(getItem('Amount'));
  if (!transactionId || amount !== Number(invoice.totalAmount)) {
    throw new Error(`STK payment details do not match invoice ${invoice.invoiceNumber}.`);
  }
  await MpesaTransaction.create({
    transactionId,
    invoice: invoice._id,
    bookingReference: invoice.bookingReference,
    amount,
    phoneNumber: getItem('PhoneNumber'),
    transactionTime: new Date(),
    rawPayload: payload,
  });
  await invoiceService.updatePaymentStatus(invoice._id, INVOICE_PAYMENT_STATUS.PAID, {
    paymentMethod: 'M-Pesa STK Push',
    transactionId,
    phoneNumber: getItem('PhoneNumber'),
    checkoutRequestId: callback.CheckoutRequestID,
  });
  return callback;
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

module.exports = {
  registerC2BUrls,
  initiateStkPush,
  processStkCallback,
  validatePayment,
  processConfirmation,
};
