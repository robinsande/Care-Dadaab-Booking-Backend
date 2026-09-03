const mongoose = require('mongoose');

const campSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Camp name is required'],
      trim: true,
      unique: true,
    },
    code: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

campSchema.index({ isActive: 1 });

campSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Camp', campSchema);
