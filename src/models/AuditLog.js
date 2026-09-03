const mongoose = require('mongoose');
const { ACTOR_TYPE } = require('../utils/constants');

/**
 * Append-only audit record. Documents are never updated or deleted;
 * they form an immutable history of important actions in the system.
 */
const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    // The booking this action relates to, when applicable.
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      index: true,
    },
    bookingReference: {
      type: String,
      trim: true,
      index: true,
    },
    actorType: {
      type: String,
      enum: Object.values(ACTOR_TYPE),
      default: ACTOR_TYPE.SYSTEM,
    },
    // Staff user who performed the action (null for guest/system actions).
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    actorLabel: {
      type: String,
      trim: true,
    },
    // Free-form contextual details (e.g. assigned room, previous status).
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    message: {
      type: String,
      trim: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Guard against mutation: enforce append-only semantics at the model level.
const blockMutation = function blockMutation(next) {
  next(new Error('Audit log entries are immutable and cannot be modified.'));
};

auditLogSchema.pre('findOneAndUpdate', blockMutation);
auditLogSchema.pre('updateOne', blockMutation);
auditLogSchema.pre('updateMany', blockMutation);
auditLogSchema.pre('findOneAndDelete', blockMutation);
auditLogSchema.pre('deleteOne', blockMutation);
auditLogSchema.pre('deleteMany', blockMutation);

auditLogSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
