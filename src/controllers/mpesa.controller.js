const asyncHandler = require('../utils/asyncHandler');
const darajaService = require('../services/daraja.service');

const validate = asyncHandler(async (req, res) => {
  res.json(await darajaService.validatePayment(req.body));
});

const confirm = asyncHandler(async (req, res) => {
  await darajaService.processConfirmation(req.body);
  res.json({ ResultCode: '0', ResultDesc: 'Accepted' });
});

const register = asyncHandler(async (_req, res) => {
  const data = await darajaService.registerC2BUrls();
  res.json({ success: true, data });
});

module.exports = { validate, confirm, register };
