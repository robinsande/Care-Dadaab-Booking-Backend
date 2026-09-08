const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const guestSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true, default: '' },
    organisation: { type: String, trim: true, default: '' },
    gender: { type: String, enum: ['', 'Male', 'Female'], default: '' },
    contractType: { type: String, trim: true, default: '' },
    departureCountry: { type: String, enum: ['', 'Local (Kenyan)', 'International'], default: '' },
    kenyaOffice: { type: String, trim: true, default: '' },
    internationalCountry: { type: String, trim: true, default: '' },
    password: { type: String, required: true, minlength: 8, select: false },
    isActive: { type: Boolean, default: true, index: true },
    lastLoginAt: { type: Date, default: null },
    resetTokenHash: { type: String, select: false, default: null },
    resetTokenExpiresAt: { type: Date, select: false, default: null },
  },
  { timestamps: true }
);

guestSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, await bcrypt.genSalt(10));
  return next();
});

guestSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

guestSchema.virtual('fullName').get(function fullName() {
  return `${this.firstName} ${this.lastName}`.trim();
});

guestSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.resetTokenHash;
    delete ret.resetTokenExpiresAt;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Guest', guestSchema);
