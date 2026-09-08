const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const authService = require('../services/guest-auth.service');

const register = asyncHandler(async (req, res) => {
  sendSuccess(res, { statusCode: 201, message: 'Guest account created.', data: await authService.register(req.body) });
});
const login = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Login successful.', data: await authService.login(req.body) });
});
const me = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Profile retrieved.', data: await authService.getProfile(req.guest._id) });
});
const requestReset = asyncHandler(async (req, res) => {
  await authService.requestPasswordReset(req.body.email);
  sendSuccess(res, { message: 'If an account exists, a recovery link has been sent.' });
});
const reset = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Password reset successful.', data: await authService.resetPassword(req.body) });
});

module.exports = { register, login, me, requestReset, reset };
