const mongoose = require('mongoose');

const tessActivityLogSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  entries: [{
    action: String,
    timestamp: Number,
    date: String,
    email: String
  }],
  updatedAt: { type: Date, default: Date.now }
});

tessActivityLogSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('TessActivityLog', tessActivityLogSchema);
