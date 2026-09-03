/**
 * Barrel export for all Mongoose models.
 */
module.exports = {
  User: require('./User'),
  Camp: require('./Camp'),
  Block: require('./Block'),
  Room: require('./Room'),
  Booking: require('./Booking'),
  Rate: require('./Rate'),
  Invoice: require('./Invoice'),
  Settings: require('./Settings'),
  AuditLog: require('./AuditLog'),
};
