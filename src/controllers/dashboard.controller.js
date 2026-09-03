const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const dashboardService = require('../services/dashboard.service');

const getDashboard = asyncHandler(async (_req, res) => {
  const data = await dashboardService.getDashboard();
  sendSuccess(res, { message: 'Dashboard data retrieved.', data });
});

module.exports = { getDashboard };
