const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Guest } = require('../models');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const emailService = require('./email.service');

const signToken = (guest) =>
  jwt.sign({ sub: guest._id.toString(), type: 'guest' }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

const publicGuest = (guest) => guest.toJSON();

const register = async ({ firstName, lastName, email, phone, password }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const existing = await Guest.findOne({ email: normalizedEmail });
  if (existing) throw ApiError.conflict('An account with this email already exists.');
  const guest = await Guest.create({ firstName, lastName, email: normalizedEmail, phone, password });
  return { token: signToken(guest), guest: publicGuest(guest) };
};

const login = async ({ email, password }) => {
  const guest = await Guest.findOne({ email: String(email || '').trim().toLowerCase() })
    .select('+password');
  if (!guest || !(await guest.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password.');
  }
  if (!guest.isActive) throw ApiError.forbidden('Your guest account has been deactivated.');
  guest.lastLoginAt = new Date();
  await guest.save();
  return { token: signToken(guest), guest: publicGuest(guest) };
};

const getProfile = async (guestId) => {
  const guest = await Guest.findById(guestId);
  if (!guest || !guest.isActive) throw ApiError.notFound('Guest account not found.');
  return publicGuest(guest);
};

const updateProfile = async (guestId, payload) => {
  const guest = await Guest.findByIdAndUpdate(
    guestId,
    { $set: {
      firstName: payload.firstName,
      lastName: payload.lastName,
      phone: payload.phone || '',
      organisation: payload.organisation || '',
      gender: payload.gender || '',
      contractType: payload.contractType || '',
      departureCountry: payload.departureCountry || '',
      kenyaOffice: payload.kenyaOffice || '',
      internationalCountry: payload.internationalCountry || '',
    } },
    { new: true, runValidators: true },
  );
  if (!guest || !guest.isActive) throw ApiError.notFound('Guest account not found.');
  return publicGuest(guest);
};

const requestPasswordReset = async (email) => {
  const guest = await Guest.findOne({ email: String(email || '').trim().toLowerCase() });
  // Do not disclose whether an account exists.
  if (!guest) return true;
  const token = crypto.randomBytes(32).toString('hex');
  guest.resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  guest.resetTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await guest.save();
  await emailService.sendGuestPasswordReset(guest, token);
  return true;
};

const resetPassword = async ({ token, newPassword }) => {
  const hash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
  const guest = await Guest.findOne({
    resetTokenHash: hash,
    resetTokenExpiresAt: { $gt: new Date() },
  }).select('+resetTokenHash +resetTokenExpiresAt');
  if (!guest) throw ApiError.badRequest('The recovery link is invalid or has expired.');
  guest.password = newPassword;
  guest.resetTokenHash = null;
  guest.resetTokenExpiresAt = null;
  await guest.save();
  return { token: signToken(guest), guest: publicGuest(guest) };
};

module.exports = { signToken, register, login, getProfile, updateProfile, requestPasswordReset, resetPassword };
