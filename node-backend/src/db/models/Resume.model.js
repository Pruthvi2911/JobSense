const mongoose = require('mongoose');

// A parsed resume. We keep the text so /match can be called later with just the id.
const resumeSchema = new mongoose.Schema(
  {
    originalFilename: { type: String, required: true, trim: true },
    text: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('Resume', resumeSchema);
