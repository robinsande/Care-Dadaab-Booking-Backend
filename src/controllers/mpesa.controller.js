const asyncHandler = require('../utils/asyncHandler');
const darajaService = require('../services/daraja.service');

const validate = asyncHandler(async (req, res) => {
  res.json(await darajaService.validatePayment(req.body));
});

const confirm = asyncHandler(async (req, res) => {
  await darajaService.processConfirmation(req.body);
  res.json({ ResultCode: '0', ResultDesc: 'Accepted' });
});

const stkCallback = asyncHandler(async (req, res) => {
  await darajaService.processStkCallback(req.body);
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

const initiateStkPush = asyncHandler(async (req, res) => {
  const data = await darajaService.initiateStkPush(req.params.invoiceId, req.body.phoneNumber);
  res.json({ success: true, data });
});

const register = asyncHandler(async (_req, res) => {
  const data = await darajaService.registerC2BUrls();
  res.json({ success: true, data });
});

module.exports = { validate, confirm, register, stkCallback, initiateStkPush };
