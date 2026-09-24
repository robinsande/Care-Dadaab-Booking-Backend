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
const anyStaff = (req, res, next) => {
  if (req.user?.role === ROLES.SYSTEM_VIEWER && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next(ApiError.forbidden('System Viewer accounts are read-only.'));
  }
  return authorize(ROLES.ACCOMMODATION_OFFICER, ROLES.SUPER_ADMIN, ROLES.SYSTEM_VIEWER)(req, res, next);
};

// Convenience: super admin only.
const superAdminOnly = authorize(ROLES.SUPER_ADMIN);

module.exports = { authorize, anyStaff, superAdminOnly };
