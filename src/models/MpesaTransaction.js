const mongoose = require('mongoose');

const mpesaTransactionSchema = new mongoose.Schema(
  {
    transactionId: { type: String, required: true, unique: true, trim: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    bookingReference: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    phoneNumber: { type: String, trim: true },
    transactionTime: { type: Date },
    rawPayload: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MpesaTransaction', mpesaTransactionSchema);
