const mongoose = require('mongoose');

const guestPushSubscriptionSchema = new mongoose.Schema(
  {
    guest: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GuestPushSubscription', guestPushSubscriptionSchema);
