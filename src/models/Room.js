const mongoose = require('mongoose');
const { ROOM_STATUS, ROOM_STATUS_VALUES } = require('../utils/constants');

const roomSchema = new mongoose.Schema(
  {
    camp: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Camp',
      required: true,
      index: true,
    },
    block: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Block',
      required: true,
      index: true,
    },
    blockName: {
      type: String,
      required: true,
      trim: true,
    },
    roomNumber: {
      type: String,
      required: [true, 'Room number is required'],
      trim: true,
    },
    capacity: {
      type: Number,
      required: [true, 'Capacity is required'],
      min: [1, 'Capacity must be at least 1'],
      default: 1,
    },
    status: {
      type: String,
      enum: ROOM_STATUS_VALUES,
      default: ROOM_STATUS.AVAILABLE,
      required: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

roomSchema.index({ camp: 1, blockName: 1, roomNumber: 1 }, { unique: true });

roomSchema.virtual('label').get(function label() {
  return `Block ${this.blockName} Room ${this.roomNumber}`;
});

roomSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Room', roomSchema);
