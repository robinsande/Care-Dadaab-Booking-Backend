const mongoose = require('mongoose');
const { MOU_CATEGORY_VALUES } = require('../utils/mou');
const MOU_TYPES = ['partner', 'individual'];
const STATUSES = ['draft', 'active', 'expiring_soon', 'expired', 'terminated', 'renewed'];

const mouSchema = new mongoose.Schema(
  {
    mouType: { type: String, enum: MOU_TYPES, required: true, index: true },
    partyName: { type: String, required: true, trim: true },
    linkedPartnerOrgId: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerOrganization', default: null },
    counterpartyCategory: { type: String, enum: MOU_CATEGORY_VALUES, required: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    paymentFrequency: { type: String, enum: ['annual', 'monthly'], required: true },
    rateAmount: { type: Number, required: true, min: 0 },
    rateCurrency: { type: String, default: 'KES', trim: true, uppercase: true },
    ratePeriod: { type: String, enum: ['per_year', 'per_month'], required: true },
    status: { type: String, enum: STATUSES, default: 'draft', index: true },
    documentRef: { type: String, trim: true, default: '' },
    linkedGuests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Guest' }],
  },
  { timestamps: true }
);

mouSchema.index({ status: 1, endDate: 1 });
mouSchema.index({ partyName: 'text' });
mouSchema.set('toJSON', { transform: (_doc, ret) => { delete ret.__v; return ret; } });

module.exports = mongoose.model('Mou', mouSchema);