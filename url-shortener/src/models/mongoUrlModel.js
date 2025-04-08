const mongoose = require('mongoose');

const urlSchema = new mongoose.Schema({
  shortUrlId: { type: String, required: true, unique: true },
  longUrl: { type: String, required: true },
  userId: { type: String }, // Optional
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Url', urlSchema);