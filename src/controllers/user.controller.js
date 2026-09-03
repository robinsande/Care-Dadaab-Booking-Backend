const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const userService = require('../services/user.service');

const listUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  const users = await userService.listUsers(filter);
  sendSuccess(res, { message: 'Users retrieved.', data: users });
});

const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id);
  sendSuccess(res, { message: 'User retrieved.', data: user });
});

const createUser = asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'User created.', data: user });
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'User updated.', data: user });
});

const deactivateUser = asyncHandler(async (req, res) => {
  await userService.deactivateUser(req.params.id, req.user);
  sendSuccess(res, { message: 'User deactivated.' });
});

module.exports = { listUsers, getUser, createUser, updateUser, deactivateUser };
