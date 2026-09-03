const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const campService = require('../services/camp.service');

const listCamps = asyncHandler(async (req, res) => {
  const filter = req.query.includeInactive === 'true' ? {} : { isActive: true };
  const camps = await campService.listCamps(filter);
  sendSuccess(res, { message: 'Camps retrieved.', data: camps });
});

const getCamp = asyncHandler(async (req, res) => {
  const camp = await campService.getCampById(req.params.id);
  sendSuccess(res, { message: 'Camp retrieved.', data: camp });
});

const createCamp = asyncHandler(async (req, res) => {
  const camp = await campService.createCamp(req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Camp created.', data: camp });
});

const updateCamp = asyncHandler(async (req, res) => {
  const camp = await campService.updateCamp(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Camp updated.', data: camp });
});

const deleteCamp = asyncHandler(async (req, res) => {
  const camp = await campService.deleteCamp(req.params.id, req.user);
  sendSuccess(res, { message: 'Camp deleted.', data: camp });
});

module.exports = { listCamps, getCamp, createCamp, updateCamp, deleteCamp };
