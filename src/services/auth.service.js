const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { User } = require('../models');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const auditService = require('./audit.service');
const { ACTOR_TYPE, AUDIT_ACTIONS } = require('../utils/constants');

/**
 * Sign a JWT for an authenticated staff user.
 * @param {Object} user User document.
 * @returns {string} Signed JWT.
 */
const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

const signMfaChallenge = (user, purpose, secret) =>
  jwt.sign({ sub: user._id.toString(), purpose, ...(secret ? { secret } : {}) }, env.jwtSecret, {
    expiresIn: '10m',
  });

const verifyCode = (secret, token) => speakeasy.totp.verify({
  secret,
  encoding: 'base32',
  token: String(token || '').replace(/\s/g, ''),
  window: 1,
});

/**
 * Authenticate a staff user with email + password and issue a JWT.
 *
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.password
 * @returns {Promise<{ token: string, user: Object }>}
 * @throws {ApiError} 401 on invalid credentials or inactive account.
 */
const login = async ({ email, password }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select('+password +mfaSecret');

  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  if (!user.isActive) {
    throw ApiError.forbidden('Your account has been deactivated. Contact a Super Admin.');
  }

  if (!user.mfaEnabled) {
    const secret = speakeasy.generateSecret({
      name: `${env.mfaIssuer}:${user.email}`,
      issuer: env.mfaIssuer,
      length: 20,
    });
    return {
      mfaRequired: true,
      mfaSetupRequired: true,
      mfaToken: signMfaChallenge(user, 'setup', secret.base32),
      qrCodeDataUrl: await QRCode.toDataURL(secret.otpauth_url),
      manualKey: secret.base32,
      user: user.toJSON(),
    };
  }

  return {
    mfaRequired: true,
    mfaSetupRequired: false,
    mfaToken: signMfaChallenge(user, 'verify'),
    user: user.toJSON(),
  };
};

const completeMfa = async ({ mfaToken, code }) => {
  let payload;
  try {
    payload = jwt.verify(mfaToken, env.jwtSecret);
  } catch (_) {
    throw ApiError.unauthorized('Your verification session expired. Please sign in again.');
  }

  if (!['setup', 'verify'].includes(payload.purpose)) {
    throw ApiError.unauthorized('Invalid verification session.');
  }

  const user = await User.findById(payload.sub).select('+mfaSecret');
  if (!user || !user.isActive) throw ApiError.unauthorized('This account is not available.');
  const secret = payload.purpose === 'setup' ? payload.secret : user.mfaSecret;
  if (!secret || !verifyCode(secret, code)) {
    throw ApiError.unauthorized('Invalid Microsoft Authenticator code.');
  }

  if (payload.purpose === 'setup') {
    user.mfaSecret = secret;
    user.mfaEnabled = true;
    await user.save();
  }

  const token = signToken(user);
  const userJson = user.toJSON();

  setImmediate(async () => {
    try {
      await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    } catch (_) { /* ignore background save errors */ }
    try {
      await auditService.record({
        action: AUDIT_ACTIONS.USER_LOGIN,
        actorType: ACTOR_TYPE.USER,
        actor: userJson,
        actorLabel: userJson.email,
        message: `${userJson.email} logged in.`,
      });
    } catch (_) { /* ignore background audit errors */ }
  });

  return { token, user: userJson };
};

/**
 * Fetch the current authenticated user's profile.
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const getProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found.');
  return user.toJSON();
};

/**
 * Change the current user's password after verifying the current one.
 * @param {string} userId
 * @param {Object} params
 * @param {string} params.currentPassword
 * @param {string} params.newPassword
 */
const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw ApiError.notFound('User not found.');

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.unauthorized('Current password is incorrect.');
  }

  user.password = newPassword;
  user.mustChangePassword = false;
  await user.save();
};

module.exports = { signToken, login, completeMfa, getProfile, changePassword };
