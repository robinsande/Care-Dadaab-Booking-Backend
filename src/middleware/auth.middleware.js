const jwt = require('jsonwebtoken');
const { User } = require('../models');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const USER_CACHE_TTL_MS = 60 * 1000;
const userCache = new Map();

function getCachedUser(userId) {
  const entry = userCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    userCache.delete(userId);
    return null;
  }
  return entry.user;
}

function setCachedUser(user) {
  const uid = user._id.toString();
  userCache.set(uid, {
    expiresAt: Date.now() + USER_CACHE_TTL_MS,
    user,
  });
  if (userCache.size > 200) {
    const keys = userCache.keys();
    for (let i = 0; i < 50; i++) {
      const k = keys.next().value;
      if (!k) break;
      userCache.delete(k);
    }
  }
}

const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw ApiError.unauthorized('Authentication token is missing.');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (error) {
    throw ApiError.unauthorized('Invalid or expired authentication token.');
  }

  const uid = String(payload.sub);
  let user = getCachedUser(uid);
  if (user) {
    if (!user.isActive) {
      throw ApiError.unauthorized('User no longer exists or is inactive.');
    }
    req.user = user;
    return next();
  }

  const found = await User.findById(uid);
  if (!found || !found.isActive) {
    throw ApiError.unauthorized('User no longer exists or is inactive.');
  }
  setCachedUser(found);
  req.user = found;
  next();
});

module.exports = { authenticate };
