const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const rateService = require('../services/rate.service');

const getCampRates = asyncHandler(async (req, res) => {
  const rates = await rateService.getCurrentRatesForCamp(req.params.campId);
  sendSuccess(res, { message: 'Rates retrieved.', data: rates });
});

const getRateHistory = asyncHandler(async (req, res) => {
  const history = await rateService.getRateHistory(req.params.campId, req.query);
  sendSuccess(res, { message: 'Rate history retrieved.', data: history });
});

const createRate = asyncHandler(async (req, res) => {
  const rate = await rateService.createRateVersion(req.params.campId, req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Rate updated.', data: rate });
});

module.exports = { getCampRates, getRateHistory, createRate };
