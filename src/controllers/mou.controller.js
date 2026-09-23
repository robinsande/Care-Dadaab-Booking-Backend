const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const mouService = require('../services/mou.service');

const list = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'MOUs retrieved.', data: await mouService.list(req.query) });
});

const publicList = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Active MOUs retrieved.', data: await mouService.list({ status: 'active', search: req.query.search }) });
});

const create = asyncHandler(async (req, res) => {
  sendSuccess(res, { statusCode: 201, message: 'MOU created.', data: await mouService.create(req.body) });
});

const active = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Active MOU retrieved.', data: await mouService.getActiveById(req.params.id) });
});

const payments = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'MOU payments retrieved.', data: await mouService.listPayments(req.params.id, req.query) });
});

const updatePayment = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'MOU payment updated.', data: await mouService.updatePayment(req.params.paymentId, req.body) });
});

module.exports = { list, publicList, create, active, payments, updatePayment };