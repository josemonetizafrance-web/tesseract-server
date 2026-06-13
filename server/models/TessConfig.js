const mongoose = require('mongoose');

const tessConfigSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  configKey: { type: String, required: true },
  configData: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedAt: { type: Date, default: Date.now }
});

tessConfigSchema.index({ email: 1, configKey: 1 }, { unique: true });

module.exports = mongoose.model('TessConfig', tessConfigSchema);
