const mongoose = require('mongoose');

const reminderLogSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    type: { type: String, required: true },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReminderLog', reminderLogSchema);
