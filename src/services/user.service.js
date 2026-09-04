const { User } = require('../models');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const { ACTOR_TYPE, AUDIT_ACTIONS } = require('../utils/constants');

/**
 * User management is restricted to Super Admins (enforced at the route layer).
 * All mutations are audited.
 */

const listUsers = (filter = {}) => User.find(filter).sort({ createdAt: -1 });

const getUserById = async (id) => {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found.');
  return user;
};

/**
 * Create a new staff user.
 * @param {Object} data { firstName, lastName, email, phone, password, role }
 * @param {Object} actor The Super Admin performing the action.
 */
const createUser = async (data, actor) => {
  const existing = await User.findOne({ email: data.email.toLowerCase() });
  if (existing) throw ApiError.conflict('A user with this email already exists.');

  const user = await User.create(data);

  await auditService.record({
    action: AUDIT_ACTIONS.USER_CREATED,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor && actor.email,
    metadata: { userId: user._id, email: user.email, role: user.role },
    message: `User ${user.email} created with role ${user.role}.`,
  });

  return user;
};

/**
 * Update mutable fields of a user. Email uniqueness is enforced.
 */
const updateUser = async (id, data, actor) => {
  const user = await getUserById(id);

  if (data.email && data.email.toLowerCase() !== user.email) {
    const clash = await User.findOne({ email: data.email.toLowerCase() });
    if (clash) throw ApiError.conflict('A user with this email already exists.');
  }

  const fields = ['firstName', 'lastName', 'email', 'phone', 'role', 'isActive'];
  fields.forEach((field) => {
    if (data[field] !== undefined) user[field] = data[field];
  });

  if (data.password) user.password = data.password;

  await user.save();

  await auditService.record({
    action: AUDIT_ACTIONS.USER_UPDATED,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor && actor.email,
    metadata: { userId: user._id },
    message: `User ${user.email} updated.`,
  });

  return user;
};

const resetPassword = async (id, actor) => {
  if (actor && actor._id.toString() === id) {
    throw ApiError.badRequest('You cannot reset your own password from user management.');
  }
  const user = await getUserById(id);
  const temporaryPassword = `CARE-${crypto.randomBytes(5).toString('base64url')}`;
  user.password = temporaryPassword;
  user.mustChangePassword = true;
  await user.save();
  await auditService.record({
    action: AUDIT_ACTIONS.USER_UPDATED,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor && actor.email,
    metadata: { userId: user._id, passwordReset: true },
    message: `Password reset for ${user.email}.`,
  });
  return { user, temporaryPassword };
};

/**
 * Deactivate (soft delete) a user. Staff accounts are never hard-deleted so
 * historical audit references remain intact. Prevents self-deactivation.
 */
const deactivateUser = async (id, actor) => {
  if (actor && actor._id.toString() === id) {
    throw ApiError.badRequest('You cannot deactivate your own account.');
  }

  const user = await getUserById(id);
  user.isActive = false;
  await user.save();

  await auditService.record({
    action: AUDIT_ACTIONS.USER_UPDATED,
    actorType: ACTOR_TYPE.USER,
    actor,
    actorLabel: actor && actor.email,
    metadata: { userId: user._id, isActive: false },
    message: `User ${user.email} deactivated.`,
  });

  return user;
};

module.exports = { listUsers, getUserById, createUser, updateUser, resetPassword, deactivateUser };
