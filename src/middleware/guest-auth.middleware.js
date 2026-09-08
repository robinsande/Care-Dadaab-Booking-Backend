const jwt = require('jsonwebtoken');
const { Guest } = require('../models');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const authenticateGuest = asyncHandler(async (req, _res, next) => {
  const [scheme, token] = String(req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized('Guest authentication token is missing.');
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (_) {
    throw ApiError.unauthorized('Invalid or expired guest authentication token.');
  }
  if (payload.type !== 'guest') throw ApiError.unauthorized('This is not a guest session.');
  const guest = await Guest.findById(payload.sub);
  if (!guest || !guest.isActive) throw ApiError.unauthorized('Guest account is not available.');
  req.guest = guest;
  next();
});

module.exports = { authenticateGuest };
