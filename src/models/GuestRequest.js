const mongoose = require('mongoose');

const REQUEST_TYPES = ['booking', 'adjustment', 'early_checkout', 'extension'];
const REQUEST_STATUSES = ['pending', 'approved', 'rejected'];

const guestRequestSchema = new mongoose.Schema(
  {
    guest: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true, index: true },
    type: { type: String, enum: REQUEST_TYPES, required: true, index: true },
    status: { type: String, enum: REQUEST_STATUSES, default: 'pending', index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null, index: true },
    camp: { type: mongoose.Schema.Types.ObjectId, ref: 'Camp', default: null },
    arrivalDate: { type: Date, default: null },
    departureDate: { type: Date, default: null },
    stayType: { type: String, enum: ['Short Stay', 'Long Stay'], default: 'Short Stay' },
    reason: { type: String, trim: true, default: '' },
    requestedData: { type: mongoose.Schema.Types.Mixed, default: {} },
    resolutionNote: { type: String, trim: true, default: '' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

guestRequestSchema.index({ status: 1, createdAt: -1 });

guestRequestSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('GuestRequest', guestRequestSchema);
