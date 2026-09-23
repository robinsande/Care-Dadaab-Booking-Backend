const mongoose = require('mongoose');

const mouPaymentSchema = new mongoose.Schema(
  {
    mou: { type: mongoose.Schema.Types.ObjectId, ref: 'Mou', required: true, index: true },
    periodLabel: { type: String, required: true, trim: true },
    dueDate: { type: Date, required: true, index: true },
    amountDue: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    paidDate: { type: Date, default: null },
    status: { type: String, enum: ['pending', 'paid', 'overdue', 'waived'], default: 'pending', index: true },
  },
  { timestamps: true }
);

mouPaymentSchema.index({ mou: 1, periodLabel: 1 }, { unique: true });
mouPaymentSchema.set('toJSON', { transform: (_doc, ret) => { delete ret.__v; return ret; } });

module.exports = mongoose.model('MouPayment', mouPaymentSchema);