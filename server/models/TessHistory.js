const mongoose = require('mongoose');

const tessHistorySchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  profileIds: [{ type: String }],
  updatedAt: { type: Date, default: Date.now }
});

tessHistorySchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('TessHistory', tessHistorySchema);
