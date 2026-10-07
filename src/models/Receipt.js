const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true, immutable: true, trim: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, unique: true },
    invoiceNumber: { type: String, required: true, trim: true },
    bookingReference: { type: String, required: true, trim: true, index: true },
    guestEmail: { type: String, required: true, lowercase: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    paidAt: { type: Date, required: true },
    paymentMethod: { type: String, trim: true },
    transactionId: { type: String, trim: true },
    paymentPhoneNumber: { type: String, trim: true },
    invoiceSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    pdf: { type: Buffer, required: true },
    emailStatus: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
      index: true,
    },
    emailAttemptedAt: { type: Date, default: null },
    emailSentAt: { type: Date, default: null },
    emailError: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Receipt', receiptSchema);
