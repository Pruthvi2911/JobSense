const mongoose = require('mongoose');
const logger = require('../../utils/logger'); // For potential logging during schema methods

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Job title is required.'],
      trim: true,
      index: true, // Index for faster searching on title
    },
    company: {
      type: String,
      required: [true, 'Company name is required.'],
      trim: true,
      index: true,
    },
    location: {
      type: String,
      trim: true,
      default: 'Remote', // Sensible default if location is often missing or if focusing on remote
    },
    description: { // Raw description from scraper
      type: String,
      required: [true, 'Job description is required.'],
    },
    parsedDescription: { // Cleaned/concatenated text used for embedding
      type: String,
      required: [true, 'Parsed job description for embedding is required.'],
    },
    url: {
      type: String,
      required: [true, 'Job URL is required.'],
      unique: true, // Ensures we don't store duplicate jobs based on URL
      trim: true,
    },
    source: { // e.g., 'NicheJobBoardA', 'LinkedInScraper'
      type: String,
      required: [true, 'Job source is required.'],
      trim: true,
      index: true,
    },
    isRemote: {
      type: Boolean,
      default: false,
      index: true,
    },
    experienceLevel: { // e.g., 'entry', 'mid-level', 'senior', 'lead'
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },
    tags: {
      type: [String], // Array of keywords/tags extracted or assigned
      index: true,
    },
    // Embeddings live in ChromaDB (same id as this document), not in Mongo.
    postedDate: { // Date when the job was posted (if available from scrape)
      type: Date,
    },
    scrapedAt: { // Date when the job was scraped by our system
      type: Date,
      default: Date.now,
    },
    // Potentially add other fields like: salaryRange, jobType (full-time, contract), etc.
  },
  {
    timestamps: true, // Adds createdAt and updatedAt timestamps automatically
    toJSON: { virtuals: true }, // Ensure virtuals are included when converting to JSON
    toObject: { virtuals: true },
  }
);

// Optional: Create a text index for more complex text searches directly in MongoDB
// This is different from semantic search with embeddings.
// jobSchema.index({ title: 'text', company: 'text', description: 'text', tags: 'text' });

const Job = mongoose.model('Job', jobSchema);

module.exports = Job;