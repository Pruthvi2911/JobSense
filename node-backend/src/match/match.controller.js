const mongoose = require('mongoose');
const Resume = require('../db/models/Resume.model');
const aiClient = require('../aiClient/ai.client');
const { ApiError } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

/**
 * Turn the request's filters into what FastAPI expects. Only filters that were
 * actually given are sent.
 *   tags:        ["python", "react"] or "python, react"
 *   location:    "remote"
 *   postedAfter: "2026-10-01" (date) or 1790000000 (epoch seconds)
 */
const buildFilters = (filters = {}) => {
  const out = {};

  let tags = filters.tags;
  if (typeof tags === 'string') tags = tags.split(',');
  if (Array.isArray(tags)) {
    tags = tags.map((t) => String(t).trim()).filter(Boolean);
    if (tags.length) out.tags = tags;
  }

  if (typeof filters.location === 'string' && filters.location.trim()) {
    out.location = filters.location.trim();
  }

  const posted = filters.postedAfter;
  if (posted !== undefined && posted !== null && posted !== '') {
    const seconds = typeof posted === 'number' ? posted : Math.floor(Date.parse(posted) / 1000);
    if (!Number.isFinite(seconds)) throw new ApiError(400, 'filters.postedAfter must be a date or epoch seconds.');
    out.posted_after = seconds;
  }

  return Object.keys(out).length ? out : undefined;
};

// POST /api/v1/match/jobs  body: { resumeId } or { resumeText }, plus optional filters
const matchJobsController = async (req, res) => {
  const { resumeId, resumeText, filters } = req.body || {};

  let text = resumeText;
  if (resumeId) {
    if (!mongoose.isValidObjectId(resumeId)) throw new ApiError(400, 'resumeId is not a valid id.');
    const resume = await Resume.findById(resumeId).lean();
    if (!resume) throw new ApiError(404, 'Resume not found.');
    text = resume.text;
  }

  if (typeof text !== 'string' || text.trim().length < 10) {
    throw new ApiError(400, 'Provide a "resumeId" or a "resumeText" of at least 10 characters.');
  }

  const aiFilters = buildFilters(filters);
  logger.info(`Matching resume (${resumeId ? `id ${resumeId}` : 'raw text'}), filters: ${JSON.stringify(aiFilters || {})}`);

  let result;
  try {
    result = await aiClient.matchResume(text, aiFilters);
  } catch (err) {
    logger.error(`AI service /match failed: ${err.message}`);
    if (err.response) throw new ApiError(502, 'The AI service returned an error while matching.');
    throw new ApiError(503, 'The AI service is unavailable or timed out.');
  }

  const results = result.results || [];
  res.status(200).json({
    success: true,
    message: results.length ? `Found ${results.length} matched jobs.` : 'No matching jobs found for these filters.',
    llmStatus: result.llm_status,
    data: results,
  });
};

module.exports = { matchJobsController };
