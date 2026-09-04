const mongoose = require('mongoose');
const {
  BOOKING_STATUS,
  BOOKING_STATUS_VALUES,
  GENDER_VALUES,
  STAY_TYPE_VALUES,
} = require('../utils/constants');

const guestSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    organisation: { type: String, trim: true },
    gender: { type: String, enum: GENDER_VALUES },
    contractType: { type: String, trim: true },
    kenyaOffice: { type: String, trim: true },
    departureCountry: { type: String, trim: true },
  },
  { _id: false }
);

const appliedRateSchema = new mongoose.Schema(
  {
    rateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rate' },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'KES', trim: true, uppercase: true },
    stayType: { type: String, enum: STAY_TYPE_VALUES, required: true },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingReference: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      index: true,
    },

    guest: {
      type: guestSchema,
      required: true,
    },

    reasonForVisit: { type: String, trim: true },
    remarks: { type: String, trim: true },
    driverPickup: { type: Boolean, default: false },

    arrivalDate: {
      type: Date,
      required: [true, 'Arrival date is required'],
      index: true,
    },
    departureDate: {
      type: Date,
      required: [true, 'Departure date is required'],
      index: true,
    },

    status: {
      type: String,
      enum: BOOKING_STATUS_VALUES,
      default: BOOKING_STATUS.BOOKED,
      required: true,
      index: true,
    },

    camp: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Camp',
      required: true,
      index: true,
    },
    campName: { type: String, required: true, trim: true },

    block: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Block',
      required: true,
    },
    blockName: { type: String, required: true, trim: true },

    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    roomNumber: { type: String, required: true, trim: true },

    stayType: {
      type: String,
      enum: STAY_TYPE_VALUES,
      required: true,
    },

    appliedRate: {
      type: appliedRateSchema,
      required: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, trim: true, default: null },

    checkedInAt: { type: Date, default: null },
    checkedOutAt: { type: Date, default: null },
  },
  { timestamps: true }
);

bookingSchema.index({ 'guest.email': 1 });
bookingSchema.index({ room: 1, status: 1 });
bookingSchema.index({ camp: 1, status: 1 });

bookingSchema.virtual('guestFullName').get(function guestFullName() {
  if (!this.guest) return '';
  return `${this.guest.firstName} ${this.guest.lastName}`.trim();
});

bookingSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    if (ret.guest) {
      ret.firstName = ret.guest.firstName;
      ret.lastName = ret.guest.lastName;
      ret.email = ret.guest.email;
      ret.phone = ret.guest.phone;
      ret.organisation = ret.guest.organisation;
      ret.gender = ret.guest.gender;
      ret.contractType = ret.guest.contractType;
      ret.departureCountry = ret.guest.departureCountry;
    }
    return ret;
  },
});

module.exports = mongoose.model('Booking', bookingSchema);
