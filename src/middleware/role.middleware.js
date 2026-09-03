const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/constants');

/**
 * Restrict a route to one or more roles. Must run after `authenticate`.
 *
 * @param {...string} allowedRoles Roles permitted to access the route.
 * @returns {Function} Express middleware.
 */
const authorize = (...allowedRoles) => (req, _res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized('Authentication required.'));
  }
  if (!allowedRoles.includes(req.user.role)) {
    return next(ApiError.forbidden('You do not have permission to perform this action.'));
  }
  return next();
};

// Convenience: any authenticated staff member (officer or super admin).
const anyStaff = authorize(ROLES.ACCOMMODATION_OFFICER, ROLES.SUPER_ADMIN);

// Convenience: super admin only.
const superAdminOnly = authorize(ROLES.SUPER_ADMIN);

module.exports = { authorize, anyStaff, superAdminOnly };
