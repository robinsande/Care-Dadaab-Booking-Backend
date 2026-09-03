const mongoose = require('mongoose');
const {
  STAY_TYPE_VALUES,
  INVOICE_PAYMENT_STATUS,
  INVOICE_PAYMENT_STATUS_VALUES,
} = require('../utils/constants');

const guestSnapshotSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    organisation: { type: String, trim: true },
  },
  { _id: false }
);

const appliedRateSnapshotSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'KES', trim: true, uppercase: true },
    stayType: { type: String, enum: STAY_TYPE_VALUES, required: true },
  },
  { _id: false }
);

const paymentInstructionsSchema = new mongoose.Schema(
  {
    mpesaPaybillNumber: { type: String, trim: true, default: '' },
    bankName: { type: String, trim: true, default: '' },
    bankAccountName: { type: String, trim: true, default: '' },
    bankAccountNumber: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      index: true,
    },

    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true,
    },
    bookingReference: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    guest: {
      type: guestSnapshotSchema,
      required: true,
    },

    campName: { type: String, required: true, trim: true },
    blockName: { type: String, required: true, trim: true },
    roomNumber: { type: String, required: true, trim: true },

    arrivalDate: { type: Date, required: true },
    departureDate: { type: Date, required: true },
    numberOfNights: { type: Number, required: true, min: 0 },

    stayType: { type: String, enum: STAY_TYPE_VALUES, required: true },
    appliedRate: { type: appliedRateSnapshotSchema, required: true },
    totalAmount: { type: Number, required: true, min: 0 },

    paymentInstructions: {
      type: paymentInstructionsSchema,
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: INVOICE_PAYMENT_STATUS_VALUES,
      default: INVOICE_PAYMENT_STATUS.UNPAID,
    },

    recipientOfficer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

invoiceSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Invoice', invoiceSchema);
