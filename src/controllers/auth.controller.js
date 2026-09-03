const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const authService = require('../services/auth.service');

/**
 * Controllers are intentionally thin: they translate HTTP <-> service calls.
 * All business logic lives in the service layer.
 */

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  sendSuccess(res, { message: 'Login successful.', data: result });
});

const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user._id);
  sendSuccess(res, { message: 'Profile retrieved.', data: user });
});

const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user._id, req.body);
  sendSuccess(res, { message: 'Password changed successfully.' });
});

module.exports = { login, getMe, changePassword };
