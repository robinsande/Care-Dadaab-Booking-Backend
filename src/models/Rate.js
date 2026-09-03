const mongoose = require('mongoose');
const { STAY_TYPE_VALUES } = require('../utils/constants');

/**
 * Versioned accommodation rate per camp and stay type.
 * Only one active rate (effectiveTo = null) exists per camp + stayType at a time.
 */
const rateSchema = new mongoose.Schema(
  {
    camp: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Camp',
      required: true,
      index: true,
    },
    stayType: {
      type: String,
      enum: STAY_TYPE_VALUES,
      required: true,
    },
    amount: {
      type: Number,
      required: [true, 'Rate amount is required'],
      min: [0, 'Rate amount cannot be negative'],
    },
    currency: {
      type: String,
      default: 'KES',
      trim: true,
      uppercase: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },
    effectiveTo: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

rateSchema.index({ camp: 1, stayType: 1, effectiveTo: 1 });

rateSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Rate', rateSchema);
