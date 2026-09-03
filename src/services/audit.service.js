const { AuditLog } = require('../models');
const { ACTOR_TYPE } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * Append an immutable audit log entry. Audit logging must never break the
 * primary workflow, so failures are logged but not re-thrown.
 *
 * @param {Object} params
 * @param {string} params.action One of AUDIT_ACTIONS.
 * @param {Object} [params.booking] The related booking document (optional).
 * @param {string} [params.bookingReference] Denormalised reference (optional).
 * @param {string} [params.actorType] One of ACTOR_TYPE.
 * @param {Object|string} [params.actor] Staff user document or id (optional).
 * @param {string} [params.actorLabel] Human readable actor label (optional).
 * @param {Object} [params.metadata] Contextual details (optional).
 * @param {string} [params.message] Human readable message (optional).
 * @returns {Promise<Object|null>} The created entry, or null on failure.
 */
const record = async ({
  action,
  booking,
  bookingReference,
  actorType = ACTOR_TYPE.SYSTEM,
  actor,
  actorLabel,
  metadata = {},
  message,
} = {}) => {
  try {
    const entry = await AuditLog.create({
      action,
      booking: booking ? booking._id || booking : undefined,
      bookingReference: bookingReference || (booking && booking.bookingReference),
      actorType,
      actor: actor ? actor._id || actor : undefined,
      actorLabel,
      metadata,
      message,
    });
    return entry;
  } catch (error) {
    logger.error(`Failed to write audit log (${action}): ${error.message}`);
    return null;
  }
};

/**
 * Fetch the append-only timeline for a booking, oldest first.
 * @param {string} bookingId
 * @returns {Promise<Array>}
 */
const getBookingTimeline = (bookingId) =>
  AuditLog.find({ booking: bookingId }).sort({ createdAt: 1 }).lean();

module.exports = { record, getBookingTimeline };
