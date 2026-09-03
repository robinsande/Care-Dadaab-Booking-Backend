const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const settingsService = require('../services/settings.service');

const getSettings = asyncHandler(async (_req, res) => {
  const settings = await settingsService.getSettings();
  sendSuccess(res, { message: 'Settings retrieved.', data: settings });
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.updateSettings(req.body, req.user);
  sendSuccess(res, { message: 'Settings updated.', data: settings });
});

module.exports = { getSettings, updateSettings };
