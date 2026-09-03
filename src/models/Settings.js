const mongoose = require('mongoose');

const paymentSettingsSchema = new mongoose.Schema(
  {
    mpesaPaybillNumber: { type: String, trim: true, default: '' },
    bankName: { type: String, trim: true, default: '' },
    bankAccountName: { type: String, trim: true, default: '' },
    bankAccountNumber: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const notificationSettingsSchema = new mongoose.Schema(
  {
    sendBookingConfirmation: { type: Boolean, default: true },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    facilityName: {
      type: String,
      trim: true,
      default: 'CARE Accommodation Management System',
    },
    supportEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    supportPhone: {
      type: String,
      trim: true,
      default: '',
    },
    payment: {
      type: paymentSettingsSchema,
      default: () => ({}),
    },
    notifications: {
      type: notificationSettingsSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

settingsSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Settings', settingsSchema);
